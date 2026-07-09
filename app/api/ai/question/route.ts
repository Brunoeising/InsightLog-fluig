import { NextRequest } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';
import { callLynnStreamChat, assertLynnConfigured } from '@/lib/lynn-service';

export const runtime = 'nodejs';
export const maxDuration = 180;

const CONTEXT_CHAR_LIMIT = 60_000;

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

type AnalysisMetadata = Awaited<ReturnType<typeof loadAnalysisMetadata>>;

function renderEnvironmentBlock(analysis: AnalysisMetadata) {
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

function renderSummaryBlock(analysis: AnalysisMetadata) {
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

interface InventoryRow {
  category: string;
  fingerprint_count: number;
  total_occurrences: number;
  max_severity: number;
  avg_severity: number;
  top_message: string | null;
  first_seen: string | null;
  last_seen: string | null;
}

interface QuestionIntent {
  intent: 'visao_geral' | 'listar_categoria' | 'buscar_especifico' | 'explicar_erro' | 'acao_corretiva' | 'correlacao';
  category_hint: string | null;
  keywords: string[];
}

const PT_STOP_WORDS = new Set([
  'quais', 'qual', 'que', 'como', 'por', 'quando', 'onde', 'quem', 'me', 'meu', 'minha',
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'ao', 'aos',
  'a', 'o', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'e', 'ou', 'mas', 'se', 'para',
  'com', 'sem', 'sobre', 'todos', 'todas', 'todo', 'toda', 'mais', 'menos',
  'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas',
  'isso', 'isto', 'tem', 'são', 'foi', 'ele', 'ela', 'eles', 'elas',
  'log', 'existe', 'existem', 'encontrar', 'encontro', 'listar', 'liste',
  'mostre', 'mostrar', 'preciso', 'saber', 'diga', 'fala', 'relacionado',
  'erro', 'erros', 'aviso', 'avisos', 'problema', 'problemas',
]);

const CATEGORY_KEYWORD_MAP: Record<string, string> = {
  'banco': 'DATABASE', 'database': 'DATABASE', 'sql': 'DATABASE',
  'oracle': 'DATABASE', 'mysql': 'DATABASE', 'deadlock': 'DATABASE',
  'pool': 'DATABASE', 'conexão': 'DATABASE', 'conexao': 'DATABASE',
  'permissao': 'PERMISSION', 'permission': 'PERMISSION', 'acesso': 'PERMISSION',
  'workflow': 'WORKFLOW', 'bpm': 'BPM', 'processo': 'WORKFLOW',
  'rede': 'NETWORK', 'network': 'NETWORK',
  'infraestrutura': 'INFRASTRUCTURE', 'infrastructure': 'INFRASTRUCTURE',
  'wcm': 'WCM', 'conteudo': 'WCM',
  'ecm': 'ECM', 'documento': 'ECM', 'documentos': 'ECM',
  'fdn': 'FDN', 'foundation': 'FDN', 'autenticação': 'FDN', 'autenticacao': 'FDN',
  'integracao': 'INT', 'integração': 'INT', 'webservice': 'INT',
};

function extractKeywords(question: string): string[] {
  const terms: string[] = [];

  // Fully qualified Java names (com.xxx / org.xxx / br.xxx)
  const fqnMatches = question.match(/(?:com|org|br|net)\.[a-zA-Z0-9_.]+/g) || [];
  terms.push(...fqnMatches);

  // CamelCase class/exception names (at least two humps, > 4 chars)
  const classMatches = question.match(/\b[A-Z][a-z]+(?:[A-Z][a-zA-Z0-9]+)+\b/g) || [];
  terms.push(...classMatches.filter((t) => t.length > 4));

  // UPPERCASE identifiers (like DS_PRD003, WSCOL009)
  const upperMatches = question.match(/\b[A-Z_][A-Z0-9_]{3,}\b/g) || [];
  terms.push(...upperMatches);

  // Meaningful words > 4 chars not in stop list
  const words = question
    .toLowerCase()
    .split(/[\s,;:!?.()\[\]]+/)
    .filter((w) => w.length > 4 && !PT_STOP_WORDS.has(w) && /^[a-z]/i.test(w));
  terms.push(...words);

  return [...new Set(terms)].slice(0, 10);
}

function detectLocalIntent(question: string, categoryNames: string[]): QuestionIntent {
  const q = question.toLowerCase();
  const keywords = extractKeywords(question);

  if (
    q.includes('performance') || q.includes('lentidão') || q.includes('lentidao') ||
    q.includes('lento') || q.includes('dataset') || q.includes('jschronos') ||
    q.includes('demora') || q.includes('demorou') || q.includes('executou por') ||
    q.includes('segundos') || q.includes('customização') || q.includes('customizacao')
  ) {
    return { intent: 'listar_categoria', category_hint: 'PERFORMANCE', keywords };
  }

  if (
    q.includes('resumo') || q.includes('panorama') || q.includes('overview') ||
    q.includes('principais') || q.includes('visão geral') || q.includes('visao geral') ||
    q.includes('mais críticos') || q.includes('mais criticos') ||
    (q.includes('geral') && !q.includes('categoria'))
  ) {
    return { intent: 'visao_geral', category_hint: null, keywords: [] };
  }

  const listingTriggers = ['todos', 'todas', 'listar', 'liste', 'enumere', 'quais são', 'quais sao'];
  const hasListingTrigger = listingTriggers.some((t) => q.includes(t));

  if (hasListingTrigger) {
    for (const [kw, cat] of Object.entries(CATEGORY_KEYWORD_MAP)) {
      if (q.includes(kw)) {
        return { intent: 'listar_categoria', category_hint: cat, keywords: [] };
      }
    }
    for (const cat of categoryNames) {
      if (q.includes(cat.toLowerCase())) {
        return { intent: 'listar_categoria', category_hint: cat, keywords: [] };
      }
    }
  }

  return { intent: 'buscar_especifico', category_hint: null, keywords };
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

function renderInventoryBlock(inventory: InventoryRow[]) {
  if (inventory.length === 0) return '';
  const items = inventory.map((row) => {
    const parts = [
      `- ${row.category.toUpperCase()}: ${row.fingerprint_count} padrões distintos, ${row.total_occurrences} ocorrências totais (score máx: ${row.max_severity})`,
    ];
    if (row.top_message) parts.push(`  Padrão mais crítico: ${row.top_message.slice(0, 180)}`);
    if (row.first_seen && row.last_seen && row.first_seen !== row.last_seen) {
      parts.push(`  Janela: ${row.first_seen} até ${row.last_seen}`);
    }
    return parts.join('\n');
  });
  const totalFp = inventory.reduce((sum, r) => sum + r.fingerprint_count, 0);
  const totalOcc = inventory.reduce((sum, r) => sum + Number(r.total_occurrences), 0);
  return [
    `=== INVENTÁRIO COMPLETO POR CATEGORIA ===`,
    `Total: ${totalFp} padrões distintos, ${totalOcc} ocorrências totais em ${inventory.length} categoria(s)`,
    ``,
    ...items,
  ].join('\n');
}

async function loadAnalysisInventory(
  supabase: SupabaseClient<Database>,
  analysisId: string
): Promise<InventoryRow[]> {
  const { data, error } = await (supabase as any).rpc('get_analysis_inventory', {
    p_analysis_id: analysisId,
  });
  if (error) {
    console.warn('get_analysis_inventory RPC falhou:', error.message);
    return [];
  }
  return (data as InventoryRow[] | null) ?? [];
}

async function listCategoryFingerprints(
  supabase: SupabaseClient<Database>,
  analysisId: string,
  category: string,
  limit: number
): Promise<FingerprintRow[]> {
  const { data, error } = await (supabase as any).rpc('list_category_fingerprints', {
    p_analysis_id: analysisId,
    p_category: category,
    p_limit: limit,
  });
  if (error) {
    console.warn('list_category_fingerprints RPC falhou:', error.message);
    return [];
  }
  return (data as FingerprintRow[] | null) ?? [];
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

interface PerformanceIssueRow {
  type: string;
  message: string;
  timestamp: string;
  duration: number | null;
  context: string | null;
  suggestion: string | null;
}

async function loadPerformanceIssues(
  supabase: SupabaseClient<Database>,
  analysisId: string,
  limit = 200
): Promise<PerformanceIssueRow[]> {
  const { data, error } = await supabase
    .from('log_performance_issues')
    .select('type, message, timestamp, duration, context, suggestion')
    .eq('analysis_id', analysisId)
    .order('duration', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.warn('Falha ao carregar log_performance_issues:', error.message);
    return [];
  }
  return (data as PerformanceIssueRow[] | null) ?? [];
}

function renderPerformanceInventoryBlock(rows: PerformanceIssueRow[]): string {
  if (rows.length === 0) return '';
  const byType = new Map<string, { count: number; maxDuration: number; example: string }>();
  for (const row of rows) {
    const key = row.type || 'OTHER';
    const cur = byType.get(key) || { count: 0, maxDuration: 0, example: row.message };
    cur.count += 1;
    if ((row.duration ?? 0) > cur.maxDuration) cur.maxDuration = row.duration ?? 0;
    if (!cur.example) cur.example = row.message;
    byType.set(key, cur);
  }
  const lines = Array.from(byType.entries())
    .sort((a, b) => b[1].maxDuration - a[1].maxDuration)
    .map(([type, agg]) =>
      `- ${type}: ${agg.count} ocorrência(s), maior duração ${agg.maxDuration || 'N/I'}s. Exemplo: ${agg.example.slice(0, 160)}`
    );
  return [
    `=== INVENTÁRIO DE PERFORMANCE ===`,
    `Total de eventos: ${rows.length}`,
    '',
    ...lines,
  ].join('\n');
}

function renderPerformanceItemsBlock(rows: PerformanceIssueRow[], limit = 40): string {
  if (rows.length === 0) return '';
  const items = rows.slice(0, limit).map((row, index) => {
    const parts = [
      `${index + 1}. [${row.type}] ${row.timestamp} — duração ${row.duration ?? 'N/I'}s`,
      `   ${row.message}`,
    ];
    if (row.suggestion) parts.push(`   Sugestão: ${row.suggestion}`);
    return parts.join('\n');
  });
  return [
    `=== EVENTOS DE PERFORMANCE (top ${Math.min(rows.length, limit)} por duração) ===`,
    ...items,
  ].join('\n');
}

function isPerformanceIntent(question: string, intent: QuestionIntent): boolean {
  if (intent.category_hint === 'PERFORMANCE') return true;
  const q = question.toLowerCase();
  return (
    q.includes('performance') ||
    q.includes('lentidão') ||
    q.includes('lentidao') ||
    q.includes('lento') ||
    q.includes('dataset') ||
    q.includes('jschronos') ||
    q.includes('demora') ||
    q.includes('demorou') ||
    q.includes('customização') ||
    q.includes('customizacao')
  );
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

interface WarnEntryRow {
  message: string;
  timestamp: string;
}

async function loadMatchingWarnings(
  supabase: SupabaseClient<Database>,
  analysisId: string,
  keyword: string,
  limit = 20
): Promise<WarnEntryRow[]> {
  const { data } = await supabase
    .from('log_entries')
    .select('message, timestamp')
    .eq('analysis_id', analysisId)
    .eq('level', 'WARN')
    .ilike('message', `%${keyword.slice(0, 80)}%`)
    .limit(limit);
  return (data as WarnEntryRow[] | null) ?? [];
}

function renderWarningSampleBlock(rows: WarnEntryRow[], keyword: string): string {
  if (rows.length === 0) return '';
  const items = rows.map((row, i) =>
    `${i + 1}. [${row.timestamp}] ${row.message.slice(0, 200)}`
  );
  return [
    `=== AVISOS (WARN) CONTENDO "${keyword.slice(0, 50)}" — ${rows.length} amostras ===`,
    ...items,
  ].join('\n');
}

function selectPrimarySearchTerm(keywords: string[], question: string): string {
  if (keywords.length === 0) return question;
  const sorted = [...keywords].sort((a, b) => {
    const aFqn = /^(?:com|org|br|net)\./.test(a);
    const bFqn = /^(?:com|org|br|net)\./.test(b);
    if (aFqn && !bFqn) return -1;
    if (!aFqn && bFqn) return 1;
    return b.length - a.length;
  });
  return sorted[0];
}

interface BuildContextArgs {
  supabase: SupabaseClient<Database>;
  analysisId: string;
  question: string;
  fingerprint?: string;
  categoryFilter?: string;
}

async function buildContext({
  supabase,
  analysisId,
  question,
  fingerprint,
  categoryFilter,
}: BuildContextArgs): Promise<string> {
  const analysis = await loadAnalysisMetadata(supabase, analysisId);
  const parts: string[] = [renderEnvironmentBlock(analysis), '', renderSummaryBlock(analysis)];

  const [inventory, categoryRowsResult, performanceRows] = await Promise.all([
    loadAnalysisInventory(supabase, analysisId),
    supabase.from('default_error_categories').select('name'),
    loadPerformanceIssues(supabase, analysisId, 200),
  ]);

  const inventoryBlock = renderInventoryBlock(inventory);
  if (inventoryBlock) parts.push('', inventoryBlock);

  const performanceInventoryBlock = renderPerformanceInventoryBlock(performanceRows);
  if (performanceInventoryBlock) parts.push('', performanceInventoryBlock);

  const categoryNames = Array.from(
    new Set([
      ...(categoryRowsResult.data || []).map((c) => c.name.toUpperCase()),
      ...inventory.map((row) => row.category.toUpperCase()),
      ...(performanceRows.length > 0 ? ['PERFORMANCE'] : []),
    ])
  );

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

  if (categoryFilter) {
    const catFps = await listCategoryFingerprints(supabase, analysisId, categoryFilter, 100);
    if (catFps.length > 0) {
      parts.push(
        '',
        renderFingerprintsBlock(`TODOS OS PADRÕES DA CATEGORIA "${categoryFilter.toUpperCase()}" (${catFps.length})`, catFps)
      );
      return parts.join('\n');
    }
  }

  const intent = detectLocalIntent(question, categoryNames);
  parts.push(
    '',
    `=== INTENÇÃO DETECTADA ===`,
    `Tipo: ${intent.intent}`,
    `Categoria alvo: ${intent.category_hint || 'nenhuma'}`,
    `Palavras-chave: ${intent.keywords.join(', ') || 'nenhuma'}`
  );

  if (performanceRows.length > 0 && isPerformanceIntent(question, intent)) {
    const itemsBlock = renderPerformanceItemsBlock(performanceRows, 60);
    if (itemsBlock) parts.push('', itemsBlock);
  }

  if (intent.intent === 'listar_categoria' && intent.category_hint) {
    const catFps = await listCategoryFingerprints(supabase, analysisId, intent.category_hint, 100);
    if (catFps.length > 0) {
      parts.push(
        '',
        renderFingerprintsBlock(`TODOS OS PADRÕES DA CATEGORIA "${intent.category_hint}" (${catFps.length})`, catFps)
      );
      return parts.join('\n');
    }
  }

  if (intent.intent === 'visao_geral') {
    const top = await loadTopFingerprints(supabase, analysisId, 10);
    const rendered = renderFingerprintsBlock('TOP 10 PADRÕES POR SEVERIDADE', top);
    if (rendered) parts.push('', rendered);
    return parts.join('\n');
  }

  const primaryTerm = selectPrimarySearchTerm(intent.keywords, question);
  const found = await searchFingerprints(supabase, analysisId, primaryTerm, 15);
  if (found.length > 0) {
    parts.push('', renderFingerprintsBlock('ERROS RELEVANTES PARA A PERGUNTA', found));

    if (intent.category_hint) {
      const catFps = await listCategoryFingerprints(supabase, analysisId, intent.category_hint, 30);
      const extras = catFps.filter((c) => !found.some((f) => f.id === c.id));
      if (extras.length > 0) {
        parts.push(
          '',
          renderFingerprintsBlock(`OUTROS PADRÕES DA CATEGORIA "${intent.category_hint}"`, extras)
        );
      }
    }
  } else {
    const top = await loadTopFingerprints(supabase, analysisId, 10);
    const rendered = renderFingerprintsBlock(
      'TOP 10 PADRÕES POR SEVERIDADE (fallback — nenhum match direto)',
      top
    );
    if (rendered) parts.push('', rendered);
  }

  // Add WARN entries when user asks about warnings or when no error fingerprints matched
  const warnIntent = /warn|aviso|warning/i.test(question);
  if ((warnIntent || found.length === 0) && intent.keywords.length > 0) {
    const warnRows = await loadMatchingWarnings(supabase, analysisId, primaryTerm);
    const warnBlock = renderWarningSampleBlock(warnRows, primaryTerm);
    if (warnBlock) parts.push('', warnBlock);
  }

  return parts.join('\n');
}

function buildFinalPrompt(context: string, question: string): string {
  const trimmedContext = context.substring(0, CONTEXT_CHAR_LIMIT);
  return [
    trimmedContext,
    '',
    '=== INSTRUÇÕES DE RESPOSTA ===',
    '1. Use o INVENTÁRIO COMPLETO POR CATEGORIA e o INVENTÁRIO DE PERFORMANCE como fonte da verdade sobre o que existe no log.',
    '2. Quando o usuário perguntar sobre performance/datasets/lentidão, ENUMERE cada evento presente em EVENTOS DE PERFORMANCE (mensagem, timestamp, duração).',
    '3. Se o usuário perguntar sobre uma categoria listada no inventário, enumere todos os padrões relevantes recebidos.',
    '4. Nunca responda "não encontrei" se a categoria ou evento aparecer nos inventários — descreva-os mesmo que resumidamente.',
    '5. Cite evidência textual do log (mensagem/exception/timestamp) sempre que possível.',
    '6. Sugira ações concretas e verificáveis, não referências genéricas a documentação.',
    '',
    '=== REGRAS DE FORMATAÇÃO DO JSON DE RESPOSTA ===',
    '- Use SOMENTE aspas duplas (") para chaves e strings. Nunca aspas simples (\').',
    '- Não coloque aspas simples envolvendo valores como low, medium, null, true, false — esses são literais JSON.',
    '- Em suggested_actions, cada item é uma string entre aspas duplas, sem aspas simples externas ou internas.',
    '- Não emita nenhum texto fora do JSON.',
    '',
    `Pergunta do usuário: ${question}`,
  ].join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const { question, analysisId, fingerprint, categoryFilter } = await request.json();

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
          categoryFilter: typeof categoryFilter === 'string' ? categoryFilter : undefined,
        });
      } catch (err: any) {
        console.warn('Falha ao montar contexto:', err?.message);
      }
    }

    const content = context ? buildFinalPrompt(context, question) : question;

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
