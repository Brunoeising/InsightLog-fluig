import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { callLynnStream, assertLynnConfigured } from '@/lib/lynn-service';

const FLUIG_SPECIALIST_SYSTEM_PROMPT = `Você é um especialista sênior em suporte e análise de logs da plataforma TOTVS Fluig (WildFly/JBoss). Responda de forma clara, objetiva e prática. Quando identificar problemas específicos, indique a causa mais provável e os passos concretos para resolução.

ASSINATURAS DE LOG CONHECIDAS (conhecimento base confiável):
- FluigDS/FluigDSRO em customização: ANTI-PADRÃO CRÍTICO — disputa de pool com o próprio Fluig. Solução: migrar para AppDS.
- JSChronos "executou por N segundos": customização lenta. N alto (milhares) = sincronização de dataset travada.
- JSChronos "ja esta sendo executado por N segundos": execução concorrente bloqueada; investigar lock de banco ou chamada externa lenta.
- invokeFunction.createDataset / servicetask64: dataset/evento customizado em execução.
- DatasetMetaListServiceBean.datasetSync demorado: dataset não otimizado ou volume excessivo.
- WorkflowEngine "Não existem colaboradores em comum": usuário não está no mecanismo de atribuição.
- CustomizationManager NullPointerException em evento: erro na linha #N do script — verificar o evento e adicionar tratamento de nulo.
- FDNAccessDeniedException / sem permissão de personificação: habilitar "Permitir impersonalização" no oAuth application.
- ClassNotFoundException em dataset/serviço: classe Java não disponível no servidor.
- HttpHostConnectException / Connection timed out: serviço externo inacessível a partir do servidor Fluig.
- UnsatisfiedLinkError jmscapi.dll: instalar Microsoft Visual C++ 2005 Redistributable no servidor.
- X11FontManager / FontConfiguration: instalar libfontconfig1 no servidor Linux.
- max-pool-size fora de 50-200: ajustar no standalone.xml.
- -Xmx acima de 16g: limite WildFly; usar cluster ao invés de aumentar mais.

CENÁRIOS DE LENTIDÃO CONHECIDOS:
- Lentidão na página inicial → widgets ou páginas customizadas lentas (verificar via F12 > Network no navegador).
- Lentidão na publicação/visualização de documentos → eventos personalizados before/after demorados.
- Lentidão na tela de inicialização de processos → mecanismos de atribuição sendo resolvidos para cada processo.
- Lentidão na abertura da tela de movimentação → eventos before, displayFields, enableFields, consultas a dataset ou chamadas externas.
- Lentidão no envio da movimentação → eventos after, validateForm ou integração síncrona com sistema externo (usar Atividade de Serviço assíncrona).
- Sincronização de dataset muito lenta → volume de dados excessivo ou dataset mal otimizado.`;

function createAuthenticatedSupabase(token: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

async function buildAnalysisContext(analysisId: string, token: string) {
  const supabase = createAuthenticatedSupabase(token);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    throw new Error('Sessão inválida.');
  }

  const { data: analysis, error: analysisError } = await supabase
    .from('log_analyses')
    .select(`
      file_name,
      uploaded_at,
      error_count,
      warning_count,
      summary,
      suggestions,
      fluig_version,
      os_name,
      server_type,
      database_name,
      database_version,
      java_version,
      solr_enabled,
      ls_enabled
    `)
    .eq('id', analysisId)
    .single();

  if (analysisError || !analysis) {
    throw new Error('Análise não encontrada.');
  }

  // Top errors from log_entries
  const { data: entries } = await supabase
    .from('log_entries')
    .select('level, message, timestamp, category, suggestion, context_before, context_after, caused_by')
    .eq('analysis_id', analysisId)
    .eq('level', 'ERROR')
    .limit(20);

  // Top fingerprints by severity (aggregated error patterns with counts)
  const { data: fingerprints } = await supabase
    .from('log_error_fingerprints')
    .select('category, message_sample, occurrence_count, severity_score, caused_by_samples, first_seen_at, last_seen_at')
    .eq('analysis_id', analysisId)
    .order('severity_score', { ascending: false })
    .order('occurrence_count', { ascending: false })
    .limit(15);

  const { data: performanceIssues } = await supabase
    .from('log_performance_issues')
    .select('type, message, timestamp, duration, context, suggestion')
    .eq('analysis_id', analysisId)
    .limit(15);

  const topErrors = (entries || []).map((entry, index) => {
    const details = [
      `${index + 1}. [${entry.category || 'OTHER'}] ${entry.timestamp}: ${entry.message}`,
    ];

    if (entry.caused_by?.length) details.push(`  Caused by: ${entry.caused_by.join(' | ')}`);
    if (entry.suggestion) details.push(`  Sugestão: ${entry.suggestion}`);
    if (entry.context_before?.length) details.push(`  Contexto anterior: ${entry.context_before.slice(-2).join(' | ')}`);
    if (entry.context_after?.length) details.push(`  Contexto posterior: ${entry.context_after.slice(0, 2).join(' | ')}`);

    return details.join('\n');
  });

  const topFingerprints = (fingerprints || []).map((fp, index) => {
    const parts = [
      `${index + 1}. [${fp.category}] Ocorrências: ${fp.occurrence_count} | Score: ${fp.severity_score}`,
      `   Mensagem: ${fp.message_sample}`,
    ];
    if (fp.caused_by_samples?.length) {
      parts.push(`   Causa raiz: ${fp.caused_by_samples.slice(0, 2).join(' | ')}`);
    }
    if (fp.first_seen_at && fp.last_seen_at && fp.first_seen_at !== fp.last_seen_at) {
      parts.push(`   Período: ${fp.first_seen_at} até ${fp.last_seen_at}`);
    }
    return parts.join('\n');
  });

  const perfSummary = (performanceIssues || []).map((issue, index) => (
    `${index + 1}. [${issue.type}] ${issue.timestamp}: ${issue.message}` +
    `${issue.duration ? ` (${issue.duration}s)` : ''}` +
    `${issue.suggestion ? `\n   Sugestão: ${issue.suggestion}` : ''}`
  ));

  const contextParts = [
    `=== CONTEXTO DA ANÁLISE ===`,
    `Arquivo: ${analysis.file_name}`,
    `Enviado em: ${analysis.uploaded_at}`,
    `Total de erros: ${analysis.error_count}`,
    `Total de avisos: ${analysis.warning_count}`,
    ``,
    `=== AMBIENTE ===`,
    `Fluig: ${analysis.fluig_version || 'N/I'}`,
    `SO: ${analysis.os_name || 'N/I'}`,
    `AppServer: ${analysis.server_type || 'N/I'}`,
    `Banco: ${analysis.database_name || 'N/I'} ${analysis.database_version || ''}`.trim(),
    `Java: ${analysis.java_version || 'N/I'}`,
    `Solr: ${analysis.solr_enabled === null ? 'N/I' : analysis.solr_enabled ? 'ativo' : 'inativo'}`,
    `LS (Learning Server): ${analysis.ls_enabled === null ? 'N/I' : analysis.ls_enabled ? 'ativo' : 'inativo'}`,
    ``,
    `=== RESUMO IA ===`,
    analysis.summary || 'Sem resumo salvo.',
    `Sugestões gerais: ${(analysis.suggestions || []).join(' | ') || 'Nenhuma.'}`,
  ];

  if (topFingerprints.length > 0) {
    contextParts.push('', '=== PADRÕES DE ERRO (AGREGADOS POR FINGERPRINT) ===');
    contextParts.push(...topFingerprints);
  }

  if (topErrors.length > 0) {
    contextParts.push('', '=== ERROS REPRESENTATIVOS ===');
    contextParts.push(topErrors.join('\n\n') || 'Nenhum erro persistido.');
  }

  if (perfSummary.length > 0) {
    contextParts.push('', '=== PROBLEMAS DE PERFORMANCE ===');
    contextParts.push(perfSummary.join('\n') || 'Nenhum problema de performance persistido.');
  }

  return contextParts.join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const { question, analysisId } = await request.json();

    if (!question?.trim()) {
      return new Response('Pergunta não fornecida', { status: 400 });
    }

    assertLynnConfigured();

    const authorization = request.headers.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

    const context = analysisId && token ? await buildAnalysisContext(analysisId, token) : '';

    const content = context
      ? `${FLUIG_SPECIALIST_SYSTEM_PROMPT}\n\nUse o contexto persistido da análise de log abaixo para responder. Se faltar evidência, diga isso claramente e sugira o que verificar.\n\n${context.substring(0, 45000)}\n\nPergunta do usuário: ${question}`
      : `${FLUIG_SPECIALIST_SYSTEM_PROMPT}\n\n${question}`;

    const stream = await callLynnStream(content);

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('Erro na API de pergunta LYNN:', error?.message);
    return new Response(
      'Desculpe, não foi possível processar sua pergunta neste momento.',
      { status: 500 }
    );
  }
}
