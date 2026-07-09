import { NextRequest } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { callLynn, callLynnStreamChat, assertLynnConfigured } from '@/lib/lynn-service';

export const runtime = 'nodejs';
export const maxDuration = 180;

const CONTEXT_CHAR_LIMIT = 18_000;

function createAuthenticatedSupabase(token: string): SupabaseClient<Database> {
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

async function loadAnalysisMetadata(
  supabase: SupabaseClient<Database>,
  analysisId: string
) {
  const { data, error } = await supabase
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
    .maybeSingle();

  if (error || !data) throw new Error('Análise não encontrada.');
  return data;
}

function renderEnvironmentBlock(analysis: Awaited<ReturnType<typeof loadAnalysisMetadata>>) {
  return [
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
  ].join('\n');
}

function renderSummaryBlock(analysis: Awaited<ReturnType<typeof loadAnalysisMetadata>>) {
  return [
    `=== RESUMO IA ===`,
    analysis.summary || 'Sem resumo salvo.',
    `Sugestões gerais: ${(analysis.suggestions || []).join(' | ') || 'Nenhuma.'}`,
  ].join('\n');
}

interface FingerprintRow {
  id: string;
  category: string;
  message_sample: string;
  normalized_message: string;
  occurrence_count: number;
  severity_score: number;
  caused_by_samples: string[] | null;
  context_samples: string[] | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

function renderFingerprintsBlock(title: string, fingerprints: FingerprintRow[]) {
  if (fingerprints.length === 0) return '';
  const items = fingerprints.map((fp, index) => {
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
  return [`=== ${title} ===`, ...items].join('\n');
}

async function classifyQuestion(question: string, categoryNames: string[]): Promise<'especifica' | 'geral'> {
  try {
    const classifierPrompt = [
      'Voce e um classificador. Responda APENAS com uma unica palavra em minusculo:',
      '- "especifica" se a pergunta menciona um erro, exception, categoria, tabela, servico, timeout, memoria, ou qualquer sintoma tecnico especifico.',
      '- "geral" se a pergunta pede visao geral, resumo, prioridades, ou nao cita nada tecnico especifico.',
      '',
      `Categorias disponiveis: ${categoryNames.join(', ')}`,
      '',
      `Pergunta: ${question}`,
      '',
      'Sua resposta (uma unica palavra):',
    ].join('\n');

    const raw = await callLynn(classifierPrompt);
    const normalized = raw.toLowerCase();
    if (normalized.includes('especifica')) return 'especifica';
    if (normalized.includes('geral')) return 'geral';
    return 'especifica';
  } catch {
    return 'especifica';
  }
}

async function loadFingerprintByHash(
  supabase: SupabaseClient<Database>,
  analysisId: string,
  fingerprint: string
): Promise<FingerprintRow | null> {
  const { data } = await supabase
    .from('log_error_fingerprints')
    .select(
      'id, category, message_sample, normalized_message, occurrence_count, severity_score, caused_by_samples, context_samples, first_seen_at, last_seen_at'
    )
    .eq('fingerprint', fingerprint)
    .eq('analysis_id', analysisId)
    .maybeSingle();

  return (data as FingerprintRow | null) ?? null;
}

async function loadRelatedEntries(
  supabase: SupabaseClient<Database>,
  analysisId: string,
  normalizedMessage: string
) {
  const { data } = await supabase
    .from('log_entries')
    .select('level, message, timestamp, category, suggestion, context_before, context_after, caused_by')
    .eq('analysis_id', analysisId)
    .eq('level', 'ERROR')
    .ilike('message', `%${normalizedMessage.slice(0, 60)}%`)
    .limit(5);

  return data || [];
}

async function loadTopFingerprints(
  supabase: SupabaseClient<Database>,
  analysisId: string,
  limit: number
): Promise<FingerprintRow[]> {
  const { data } = await supabase
    .from('log_error_fingerprints')
    .select(
      'id, category, message_sample, normalized_message, occurrence_count, severity_score, caused_by_samples, context_samples, first_seen_at, last_seen_at'
    )
    .eq('analysis_id', analysisId)
    .order('severity_score', { ascending: false })
    .order('occurrence_count', { ascending: false })
    .limit(limit);

  return (data as FingerprintRow[] | null) ?? [];
}

async function searchFingerprints(
  supabase: SupabaseClient<Database>,
  analysisId: string,
  query: string,
  limit: number
): Promise<FingerprintRow[]> {
  const { data, error } = await (supabase as any).rpc('search_log_errors', {
    p_analysis_id: analysisId,
    p_query: query,
    p_limit: limit,
  });

  if (error) {
    console.warn('search_log_errors RPC falhou, caindo para top fingerprints:', error.message);
    return loadTopFingerprints(supabase, analysisId, limit);
  }

  return ((data as FingerprintRow[] | null) ?? []);
}

async function buildContext({
  supabase,
  analysisId,
  question,
  fingerprint,
}: {
  supabase: SupabaseClient<Database>;
  analysisId: string;
  question: string;
  fingerprint?: string;
}): Promise<string> {
  const analysis = await loadAnalysisMetadata(supabase, analysisId);
  const parts: string[] = [renderEnvironmentBlock(analysis)];

  if (fingerprint) {
    const fp = await loadFingerprintByHash(supabase, analysisId, fingerprint);
    if (fp) {
      parts.push('', renderFingerprintsBlock('ERRO SELECIONADO PELO USUÁRIO', [fp]));

      const related = await loadRelatedEntries(supabase, analysisId, fp.normalized_message);
      if (related.length > 0) {
        const rendered = related.map((entry, index) => {
          const detail = [
            `${index + 1}. [${entry.category || 'OTHER'}] ${entry.timestamp}: ${entry.message}`,
          ];
          if (entry.caused_by?.length) detail.push(`   Caused by: ${entry.caused_by.join(' | ')}`);
          if (entry.suggestion) detail.push(`   Sugestão: ${entry.suggestion}`);
          if (entry.context_before?.length) detail.push(`   Contexto anterior: ${entry.context_before.slice(-2).join(' | ')}`);
          if (entry.context_after?.length) detail.push(`   Contexto posterior: ${entry.context_after.slice(0, 2).join(' | ')}`);
          return detail.join('\n');
        });
        parts.push('', `=== OCORRÊNCIAS RELACIONADAS ===`, rendered.join('\n\n'));
      }

      return parts.join('\n');
    }
  }

  const { data: categoryRows } = await supabase
    .from('default_error_categories')
    .select('name');
  const categoryNames = (categoryRows || []).map((c) => c.name);

  const mode = await classifyQuestion(question, categoryNames);

  parts.push('', renderSummaryBlock(analysis));

  if (mode === 'geral') {
    const top = await loadTopFingerprints(supabase, analysisId, 5);
    const rendered = renderFingerprintsBlock('PRINCIPAIS PADRÕES DE ERRO', top);
    if (rendered) parts.push('', rendered);
    return parts.join('\n');
  }

  const found = await searchFingerprints(supabase, analysisId, question, 10);
  if (found.length > 0) {
    parts.push('', renderFingerprintsBlock('ERROS RELEVANTES PARA A PERGUNTA', found));
  } else {
    const top = await loadTopFingerprints(supabase, analysisId, 8);
    const rendered = renderFingerprintsBlock('PRINCIPAIS PADRÕES DE ERRO', top);
    if (rendered) parts.push('', rendered);
  }

  return parts.join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const { question, analysisId, fingerprint } = await request.json();

    if (!question?.trim()) {
      return new Response('Pergunta não fornecida', { status: 400 });
    }

    assertLynnConfigured();

    const authorization = request.headers.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

    let context = '';
    if (analysisId && token) {
      const supabase = createAuthenticatedSupabase(token);
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData.user) {
        return new Response('Sessão inválida.', { status: 401 });
      }

      try {
        context = await buildContext({
          supabase,
          analysisId,
          question,
          fingerprint: typeof fingerprint === 'string' ? fingerprint : undefined,
        });
      } catch (err: any) {
        console.warn('Falha ao montar contexto:', err?.message);
      }
    }

    const content = context
      ? `${context.substring(0, CONTEXT_CHAR_LIMIT)}\n\nPergunta do usuário: ${question}`
      : question;

    const stream = await callLynnStreamChat(content);

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
