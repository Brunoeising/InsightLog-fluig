import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { analyzeLogContent } from '@/lib/log-parser';
import { loadErrorCategories } from '@/lib/log-categorizer';
import { AIAnalysisResponse, LogErrorEntry } from '@/lib/types';
import { Database } from '@/lib/database.types';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const AI_ERROR_LIMIT = 20;

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
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      summary: 'Análise por IA indisponível porque a chave da API não está configurada.',
      suggestions: ['Configure a variável ANTHROPIC_API_KEY para habilitar a análise automática.'],
      errorAnalysis: [],
    };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
  const userPrompt = `Analise os seguintes erros representativos do log do Fluig:

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
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: 'Você é um especialista em análise de logs do sistema Fluig da TOTVS. Responda sempre em JSON válido, sem markdown code blocks e sem texto adicional fora do JSON.',
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as AIAnalysisResponse;
  } catch (error) {
    console.error('Erro na análise IA de logs:', error);
    return {
      summary: 'Não foi possível processar a análise por IA neste momento.',
      suggestions: ['Revise os erros mais recorrentes e tente executar a análise novamente.'],
      errorAnalysis: [],
    };
  }
}

async function insertInChunks<T>(items: T[], insert: (chunk: T[]) => Promise<void>, chunkSize = 500) {
  for (let index = 0; index < items.length; index += chunkSize) {
    await insert(items.slice(index, index + chunkSize));
  }
}

export async function POST(request: NextRequest) {
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

    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 });
    }

    if (!file.name.endsWith('.log')) {
      return NextResponse.json({ error: 'Por favor, envie um arquivo .log.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'O tamanho máximo do arquivo é 50MB.' }, { status: 400 });
    }

    const content = await file.text();
    const categories = await loadErrorCategories(userData.user.id, supabase);
    const analysis = await analyzeLogContent(content, userData.user.id, categories);
    const aiAnalysis = await analyzeErrorsWithAi(analysis.errorEntries);

    const timestamp = Date.now();
    const fileExt = file.name.split('.').pop() || 'log';
    const filePath = `${userData.user.id}/${timestamp}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('logs')
      .upload(filePath, file, { cacheControl: '3600', upsert: false });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from('logs').getPublicUrl(filePath);

    const { data: analysisData, error: analysisError } = await supabase
      .from('log_analyses')
      .insert({
        file_name: file.name,
        file_path: filePath,
        file_url: publicUrlData.publicUrl,
        uploaded_at: new Date().toISOString(),
        error_count: analysis.errorCount,
        warning_count: analysis.warningCount,
        summary: aiAnalysis.summary,
        suggestions: aiAnalysis.suggestions,
        user_id: userData.user.id,
        fluig_version: analysis.systemInfo?.fluig_version,
        os_name: analysis.systemInfo?.os_name,
        server_type: analysis.systemInfo?.server_type,
        database_name: analysis.systemInfo?.database_name,
        database_version: analysis.systemInfo?.database_version,
        server_url: analysis.systemInfo?.server_url,
        java_version: analysis.systemInfo?.java_version,
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
        message: error.message,
        timestamp: error.timestamp,
        category: error.category || 'OTHER',
        context_before: error.contextBefore,
        context_after: error.contextAfter,
        suggestion: suggestionByErrorIndex.get(index) || null,
      })),
      ...analysis.warningEntries.map((warning) => ({
        analysis_id: analysisData.id,
        level: 'WARN',
        message: warning.message,
        timestamp: warning.timestamp,
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
          message: issue.message,
          timestamp: issue.timestamp,
          duration: issue.duration,
          context: issue.context,
          suggestion: issue.suggestion,
        }))
      );
      if (error) throw error;
    });

    const categoryNameMap = Object.fromEntries(
      categories.map((category) => [category.name.toUpperCase(), category.name])
    );

    return NextResponse.json({
      analysisId: analysisData.id,
      currentAnalysis: {
        ...analysisData,
        errors: analysis.errorEntries.map((error, index) => ({
          ...error,
          suggestion: suggestionByErrorIndex.get(index),
        })),
        warnings: analysis.warningEntries,
        performanceIssues: analysis.performanceIssues,
        fileName: analysisData.file_name,
        uploadedAt: analysisData.uploaded_at,
        errorCount: analysisData.error_count,
        warningCount: analysisData.warning_count,
        summary: aiAnalysis.summary,
        suggestions: aiAnalysis.suggestions,
        hasMoreErrors: analysis.hasMoreErrors,
        hasMoreWarnings: analysis.hasMoreWarnings,
        systemInfo: analysis.systemInfo,
        categories,
        categoryNameMap,
      },
    });
  } catch (error: any) {
    console.error('Erro ao processar log:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Ocorreu um erro ao processar seu arquivo.' },
      { status: 500 }
    );
  }
}