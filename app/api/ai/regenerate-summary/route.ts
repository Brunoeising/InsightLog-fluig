import { NextRequest, NextResponse } from 'next/server';
import { AIAnalysisResponse, LogErrorEntry } from '@/lib/types';
import {
  assertAnalysisOwnership,
  getAuthenticatedContext,
  sanitizeDatabaseText,
  sanitizeTextArray,
} from '@/app/api/logs/shared';
import { callLynn, parseLynnJsonResponse } from '@/lib/lynn-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

const AI_ERROR_LIMIT = 200;
const ERROR_FETCH_LIMIT = 15000;

interface RegenerateSummaryBody {
  analysisId?: string;
}

function selectErrorsForAi(errors: LogErrorEntry[]) {
  const grouped = new Map<string, { error: LogErrorEntry; index: number; count: number }>();

  errors.forEach((error, index) => {
    const key = `${error.category || 'OTHER'}:${error.message}`;
    const current = grouped.get(key);
    if (current) {
      current.count += 1;
    } else {
      grouped.set(key, { error, index, count: 1 });
    }
  });

  const representatives = Array.from(grouped.values()).sort((a, b) => b.count - a.count);
  const selected: typeof representatives = [];
  const usedCategories = new Set<string>();

  for (const item of representatives) {
    if (selected.length >= AI_ERROR_LIMIT) break;
    const category = item.error.category || 'OTHER';
    if (!usedCategories.has(category)) {
      selected.push(item);
      usedCategories.add(category);
    }
  }

  for (const item of representatives) {
    if (selected.length >= AI_ERROR_LIMIT) break;
    if (!selected.includes(item)) {
      selected.push(item);
    }
  }

  return selected;
}

async function generateSummaryWithAi(params: {
  analysis: any;
  errors: LogErrorEntry[];
  performanceIssues: any[];
}) {
  const selectedErrors = selectErrorsForAi(params.errors);
  const categories = Array.from(new Set(params.errors.map((error) => error.category || 'OTHER')));

  const formattedErrors = selectedErrors.map(({ error, index, count }) => {
    const lines = [
      `ERRO_ID: ${index}`,
      `Ocorrências semelhantes: ${count}`,
      `Categoria: ${error.category || 'OTHER'}`,
      `Timestamp: ${error.timestamp || 'N/I'}`,
      `Mensagem: ${error.message}`,
    ];

    if (error.causedBy?.length) lines.push(`Caused by: ${error.causedBy.join(' | ')}`);
    if (error.contextBefore?.length) lines.push(`Contexto anterior:\n${error.contextBefore.slice(-4).join('\n')}`);
    if (error.contextAfter?.length) lines.push(`Contexto posterior:\n${error.contextAfter.slice(0, 4).join('\n')}`);

    return lines.join('\n');
  }).join('\n\n---\n\n');

  const performanceSummary = params.performanceIssues.map((issue, index) => (
    `${index + 1}. [${issue.type}] ${issue.timestamp || 'N/I'}: ${issue.message}` +
    `${issue.duration ? ` (${issue.duration}s)` : ''}` +
    `${issue.context ? ` | Contexto: ${issue.context}` : ''}`
  )).join('\n');

  const analysis = params.analysis;
  const content = `Analise os seguintes dados de log da plataforma TOTVS Fluig e gere um diagnóstico técnico executivo.

Metadados do ambiente:
- Arquivo: ${analysis.file_name}
- Total de entradas lidas no arquivo: ${analysis.total_entries_in_file ?? 'N/I'}
- Erros persistidos: ${analysis.error_count}
- Erros totais no arquivo: ${analysis.total_errors_in_file ?? analysis.error_count}
- Avisos totais no arquivo: ${analysis.total_warnings_in_file ?? analysis.warning_count}
- Problemas de performance totais: ${analysis.total_performance_issues_in_file ?? 0}
- Categorias encontradas: ${categories.join(', ') || 'N/I'}
- Ambiente: Fluig ${analysis.fluig_version || 'N/I'}, SO ${analysis.os_name || 'N/I'}, AppServer ${analysis.server_type || 'N/I'}, Banco ${analysis.database_name || 'N/I'} ${analysis.database_version || ''}, Java ${analysis.java_version || 'N/I'}, Solr ${analysis.solr_enabled === null ? 'N/I' : analysis.solr_enabled ? 'ativo' : 'inativo'}, LS ${analysis.ls_enabled === null ? 'N/I' : analysis.ls_enabled ? 'ativo' : 'inativo'}

Erros representativos:
${formattedErrors}

Problemas de performance representativos:
${performanceSummary || 'Nenhum problema de performance persistido.'}`;

  const text = await callLynn(content);
  let result: AIAnalysisResponse;
  try {
    result = parseLynnJsonResponse<AIAnalysisResponse>(text);
  } catch {
    result = { summary: text, suggestions: [], errorAnalysis: [] };
  }
  return result;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let analysisId: string | undefined;
  let supabase: Awaited<ReturnType<typeof getAuthenticatedContext>>['supabase'] = null;

  try {
    const context = await getAuthenticatedContext(request);
    if (context.error) return context.error;

    supabase = context.supabase;
    const body = (await request.json()) as RegenerateSummaryBody;
    analysisId = body.analysisId;

    if (!analysisId) {
      return NextResponse.json({ error: 'Análise não informada.' }, { status: 400 });
    }

    await assertAnalysisOwnership(supabase, analysisId, context.user.id);

    const { data: analysis, error: analysisError } = await supabase
      .from('log_analyses')
      .select(`
        id,
        file_name,
        error_count,
        warning_count,
        processing_status,
        total_entries_in_file,
        total_errors_in_file,
        total_warnings_in_file,
        total_performance_issues_in_file,
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
      return NextResponse.json({ error: 'Análise não encontrada.' }, { status: 404 });
    }

    if (analysis.processing_status && !['COMPLETED', 'FAILED'].includes(analysis.processing_status)) {
      return NextResponse.json({ error: 'A análise ainda está em processamento.' }, { status: 409 });
    }

    if ((analysis.error_count || 0) === 0) {
      return NextResponse.json({ error: 'Não há erros persistidos para gerar um resumo com IA.' }, { status: 400 });
    }

    await supabase
      .from('log_analyses')
      .update({ ai_status: 'PROCESSING', ai_generation_in_progress: true })
      .eq('id', analysisId);

    const [{ data: entries, error: entriesError }, { data: performanceIssues, error: performanceError }] = await Promise.all([
      supabase
        .from('log_entries')
        .select('level, message, timestamp, category, context_before, context_after, caused_by, suggestion')
        .eq('analysis_id', analysisId)
        .eq('level', 'ERROR')
        .limit(ERROR_FETCH_LIMIT),
      supabase
        .from('log_performance_issues')
        .select('type, message, timestamp, duration, context, suggestion')
        .eq('analysis_id', analysisId)
        .limit(50),
    ]);

    if (entriesError) throw entriesError;
    if (performanceError) throw performanceError;

    const errors = (entries || []).map((entry) => ({
      level: 'ERROR' as const,
      message: entry.message,
      timestamp: entry.timestamp,
      category: (entry.category || 'OTHER') as LogErrorEntry['category'],
      contextBefore: entry.context_before || [],
      contextAfter: entry.context_after || [],
      causedBy: entry.caused_by || [],
      suggestion: entry.suggestion || undefined,
    }));

    if (errors.length === 0) {
      throw new Error('Não há erros persistidos para gerar um resumo com IA.');
    }

    const aiAnalysis = await generateSummaryWithAi({
      analysis,
      errors,
      performanceIssues: performanceIssues || [],
    });
    const generatedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('log_analyses')
      .update({
        summary: sanitizeDatabaseText(aiAnalysis.summary),
        suggestions: sanitizeTextArray(aiAnalysis.suggestions),
        ai_status: 'COMPLETED',
        ai_generated_at: generatedAt,
        ai_generation_in_progress: false,
        ai_duration_ms: Date.now() - startedAt,
      })
      .eq('id', analysisId);

    if (updateError) throw updateError;

    return NextResponse.json({
      summary: aiAnalysis.summary,
      suggestions: aiAnalysis.suggestions,
      aiStatus: 'COMPLETED',
      aiGeneratedAt: generatedAt,
      aiGenerationInProgress: false,
    });
  } catch (error: any) {
    console.error('Erro ao gerar resumo LYNN:', error);

    if (supabase && analysisId) {
      await supabase
        .from('log_analyses')
        .update({ ai_status: 'FAILED', ai_generation_in_progress: false })
        .eq('id', analysisId);
    }

    return NextResponse.json(
      { error: error?.message || 'Não foi possível gerar o resumo com IA.' },
      { status: 500 }
    );
  }
}
