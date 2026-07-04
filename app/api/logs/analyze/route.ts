import { NextRequest, NextResponse } from 'next/server';
import { analyzeLogContent } from '@/lib/log-parser';
import { loadErrorCategories } from '@/lib/log-categorizer';
import { AIAnalysisResponse, LogErrorEntry } from '@/lib/types';
import {
  createAuthenticatedSupabase,
  insertInChunks,
  sanitizeDatabaseText,
  sanitizeTextArray,
} from '../shared';
import { callLynn, parseLynnJsonResponse } from '@/lib/lynn-service';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_FILE_SIZE = 50 * 2048 * 2048;
const AI_ERROR_LIMIT = 20;
const LARGE_FILE_AI_THRESHOLD = 15 * 2048 * 2048;

interface AnalyzeLogRequestBody {
  fileName?: string;
  filePath?: string;
  fileUrl?: string;
  fileSize?: number;
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

async function analyzeErrorsWithAi(errorEntries: LogErrorEntry[]): Promise<AIAnalysisResponse> {
  const selectedErrors = selectErrorsForAi(errorEntries);

  const formattedErrors = selectedErrors.map(({ error, index, count }) => {
    const lines = [
      `ERRO_ID: ${index}`,
      `Ocorrências semelhantes: ${count}`,
      `Categoria: ${error.category}`,
      `Timestamp: ${error.timestamp}`,
      `Mensagem: ${error.message}`,
    ];
    if (error.causedBy?.length) {
      lines.push(`Caused by: ${error.causedBy.join(' | ')}`);
    }
    if (error.contextBefore?.length) {
      lines.push(`Contexto anterior:\n${error.contextBefore.join('\n')}`);
    }
    if (error.contextAfter?.length) {
      lines.push(`Contexto posterior:\n${error.contextAfter.join('\n')}`);
    }
    return lines.join('\n');
  }).join('\n\n---\n\n');

  const categories = Array.from(new Set(errorEntries.map((error) => error.category || 'OTHER')));

  const content = `Você é um especialista em análise de logs do sistema Fluig da TOTVS. Responda sempre em JSON válido, sem markdown code blocks e sem texto adicional fora do JSON.

Analise os seguintes erros representativos do log do Fluig:

Resumo:
- Total de erros: ${errorEntries.length}
- Categorias encontradas: ${categories.join(', ')}

${formattedErrors}

Responda com este JSON exato:
{
  "summary": "Resumo conciso e direto de todos os problemas encontrados (2-4 frases)",
  "suggestions": ["Sugestão prática 1", "Sugestão prática 2"],
  "errorAnalysis": [
    { "errorId": "0", "suggestion": "Sugestão específica para o ERRO_ID informado" }
  ]
}

Use sempre o ERRO_ID original enviado. Forneça no máximo 6 sugestões gerais.`;

  try {
    const text = await callLynn(content);
    return parseLynnJsonResponse<AIAnalysisResponse>(text);
  } catch (error) {
    console.error('Erro na análise IA de logs LYNN:', error);
    return {
      summary: 'Não foi possível processar a análise por IA neste momento.',
      suggestions: ['Revise os erros mais recorrentes e tente executar a análise novamente.'],
      errorAnalysis: [],
    };
  }
}

function createStructuralAnalysis(errorEntries: LogErrorEntry[], warningCount: number): AIAnalysisResponse {
  const categories = errorEntries.reduce<Record<string, number>>((acc, error) => {
    const category = error.category || 'OTHER';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  const topCategories = Object.entries(categories)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([category, count]) => `${category}: ${count}`);

  return {
    summary: `Análise estrutural concluída com ${errorEntries.length} erros persistidos e ${warningCount} alertas identificados. Categorias mais recorrentes: ${topCategories.join(', ') || 'não classificadas'}.`,
    suggestions: [
      'Abra as categorias mais recorrentes para priorizar a correção dos erros com maior volume.',
      'Use o chat da análise para investigar causas específicas a partir dos erros persistidos.',
    ],
    errorAnalysis: [],
  };
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const authorization = request.headers.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: 'Usuário não autenticado.' }, { status: 401 });
    }

    const supabase = createAuthenticatedSupabase(token);
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
    }

    const body = (await request.json()) as AnalyzeLogRequestBody;
    const { fileName, filePath, fileUrl, fileSize = 0 } = body;

    if (!fileName || !filePath) {
      return NextResponse.json({ error: 'Arquivo não informado para processamento.' }, { status: 400 });
    }

    if (!fileName.endsWith('.log')) {
      return NextResponse.json({ error: 'Por favor, envie um arquivo .log.' }, { status: 400 });
    }

    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'O tamanho máximo do arquivo é 50MB.' }, { status: 400 });
    }

    if (!filePath.startsWith(`${userData.user.id}/`)) {
      return NextResponse.json({ error: 'Arquivo inválido para o usuário autenticado.' }, { status: 403 });
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('logs')
      .download(filePath);

    if (downloadError || !fileData) {
      throw downloadError || new Error('Não foi possível baixar o arquivo para processamento.');
    }

    const content = sanitizeDatabaseText(await fileData.text()) || '';
    const downloadCompletedAt = Date.now();
    const categories = await loadErrorCategories(userData.user.id, supabase);
    const analysis = await analyzeLogContent(content, userData.user.id, categories);
    const parseCompletedAt = Date.now();
    const aiAnalysis = fileSize > LARGE_FILE_AI_THRESHOLD
      ? createStructuralAnalysis(analysis.errorEntries, analysis.warningCount)
      : await analyzeErrorsWithAi(analysis.errorEntries);
    const aiCompletedAt = Date.now();

    const resolvedFileUrl = fileUrl || supabase.storage.from('logs').getPublicUrl(filePath).data.publicUrl;

    const { data: analysisData, error: analysisError } = await supabase
      .from('log_analyses')
      .insert({
        file_name: sanitizeDatabaseText(fileName),
        file_path: filePath,
        file_url: resolvedFileUrl,
        uploaded_at: new Date().toISOString(),
        error_count: analysis.errorCount,
        warning_count: analysis.warningCount,
        summary: sanitizeDatabaseText(aiAnalysis.summary),
        suggestions: sanitizeTextArray(aiAnalysis.suggestions),
        user_id: userData.user.id,
        fluig_version: sanitizeDatabaseText(analysis.systemInfo?.fluig_version),
        os_name: sanitizeDatabaseText(analysis.systemInfo?.os_name),
        server_type: sanitizeDatabaseText(analysis.systemInfo?.server_type),
        database_name: sanitizeDatabaseText(analysis.systemInfo?.database_name),
        database_version: sanitizeDatabaseText(analysis.systemInfo?.database_version),
        server_url: sanitizeDatabaseText(analysis.systemInfo?.server_url),
        java_version: sanitizeDatabaseText(analysis.systemInfo?.java_version),
        solr_enabled: analysis.systemInfo?.solr_enabled,
        ls_enabled: analysis.systemInfo?.ls_enabled,
      })
      .select()
      .single();

    if (analysisError) throw analysisError;

    const suggestionByErrorIndex = new Map(
      aiAnalysis.errorAnalysis.map((item) => [Number(item.errorId), item.suggestion])
    );

    const logEntries = [
      ...analysis.errorEntries.map((error, index) => ({
        analysis_id: analysisData.id,
        level: 'ERROR',
        message: sanitizeDatabaseText(error.message),
        timestamp: sanitizeDatabaseText(error.timestamp),
        category: sanitizeDatabaseText(error.category || 'OTHER'),
        context_before: sanitizeTextArray(error.contextBefore),
        context_after: sanitizeTextArray(error.contextAfter),
        caused_by: sanitizeTextArray(error.causedBy),
        suggestion: sanitizeDatabaseText(suggestionByErrorIndex.get(index)),
      })),
      ...analysis.warningEntries.map((warning) => ({
        analysis_id: analysisData.id,
        level: 'WARN',
        message: sanitizeDatabaseText(warning.message),
        timestamp: sanitizeDatabaseText(warning.timestamp),
        category: 'OTHER',
        context_before: [],
        context_after: [],
        suggestion: null,
      })),
    ];

    await insertInChunks(logEntries, async (chunk) => {
      const { error } = await supabase.from('log_entries').insert(chunk);
      if (error) throw error;
    });

    await insertInChunks(analysis.performanceIssues, async (chunk) => {
      const { error } = await supabase.from('log_performance_issues').insert(
        chunk.map((issue) => ({
          analysis_id: analysisData.id,
          type: issue.type,
          message: sanitizeDatabaseText(issue.message),
          timestamp: sanitizeDatabaseText(issue.timestamp),
          duration: issue.duration,
          context: sanitizeDatabaseText(issue.context),
          suggestion: sanitizeDatabaseText(issue.suggestion),
        }))
      );
      if (error) throw error;
    });

    console.info('Log analysis timings', {
      fileName,
      fileSize,
      downloadMs: downloadCompletedAt - startedAt,
      parseMs: parseCompletedAt - downloadCompletedAt,
      aiMs: aiCompletedAt - parseCompletedAt,
      persistMs: Date.now() - aiCompletedAt,
      totalMs: Date.now() - startedAt,
      persistedEntries: logEntries.length,
      performanceIssues: analysis.performanceIssues.length,
      aiMode: fileSize > LARGE_FILE_AI_THRESHOLD ? 'structural' : 'lynn',
    });

    return NextResponse.json({
      analysisId: analysisData.id,
      hasMoreErrors: analysis.hasMoreErrors,
      hasMoreWarnings: analysis.hasMoreWarnings,
    });
  } catch (error: any) {
    console.error('Erro ao processar log:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Ocorreu um erro ao processar seu arquivo.' },
      { status: 500 }
    );
  }
}