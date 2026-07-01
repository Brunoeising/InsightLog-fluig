import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';

const SYSTEM_PROMPT = `Você é um especialista em análise de logs do sistema Fluig da TOTVS.
Responda de forma clara, objetiva e prática. Quando identificar problemas específicos,
indique a causa mais provável e os passos para resolução.`;

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

  const { data: entries } = await supabase
    .from('log_entries')
    .select('level, message, timestamp, category, suggestion, context_before, context_after, caused_by')
    .eq('analysis_id', analysisId)
    .eq('level', 'ERROR')
    .limit(25);

  const { data: performanceIssues } = await supabase
    .from('log_performance_issues')
    .select('type, message, timestamp, duration, context, suggestion')
    .eq('analysis_id', analysisId)
    .limit(15);

  const topErrors = (entries || []).map((entry, index) => {
    const details = [
      `${index + 1}. [${entry.category || 'OTHER'}] ${entry.timestamp}: ${entry.message}`,
    ];

    if (entry.caused_by?.length) details.push(`Caused by: ${entry.caused_by.join(' | ')}`);
    if (entry.suggestion) details.push(`Sugestão registrada: ${entry.suggestion}`);
    if (entry.context_before?.length) details.push(`Contexto anterior: ${entry.context_before.slice(-2).join(' | ')}`);
    if (entry.context_after?.length) details.push(`Contexto posterior: ${entry.context_after.slice(0, 2).join(' | ')}`);

    return details.join('\n');
  });

  const perfSummary = (performanceIssues || []).map((issue, index) => (
    `${index + 1}. [${issue.type}] ${issue.timestamp}: ${issue.message}` +
    `${issue.duration ? ` (${issue.duration}s)` : ''}` +
    `${issue.suggestion ? ` | Sugestão: ${issue.suggestion}` : ''}`
  ));

  return [
    `Arquivo: ${analysis.file_name}`,
    `Enviado em: ${analysis.uploaded_at}`,
    `Total de erros: ${analysis.error_count}`,
    `Total de avisos: ${analysis.warning_count}`,
    `Resumo IA: ${analysis.summary || 'Sem resumo salvo.'}`,
    `Sugestões gerais: ${(analysis.suggestions || []).join(' | ') || 'Nenhuma.'}`,
    `Sistema: Fluig ${analysis.fluig_version || 'N/I'}, SO ${analysis.os_name || 'N/I'}, AppServer ${analysis.server_type || 'N/I'}, Banco ${analysis.database_name || 'N/I'} ${analysis.database_version || ''}, Java ${analysis.java_version || 'N/I'}, Solr ${analysis.solr_enabled === null ? 'N/I' : analysis.solr_enabled ? 'ativo' : 'inativo'}, LS ${analysis.ls_enabled === null ? 'N/I' : analysis.ls_enabled ? 'ativo' : 'inativo'}`,
    '',
    'Erros representativos:',
    topErrors.join('\n\n') || 'Nenhum erro persistido.',
    '',
    'Problemas de performance:',
    perfSummary.join('\n') || 'Nenhum problema de performance persistido.',
  ].join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const { question, analysisId } = await request.json();

    if (!question?.trim()) {
      return new Response('Pergunta não fornecida', { status: 400 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response('A análise por IA está indisponível porque a chave da API não está configurada.');
    }

    const authorization = request.headers.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

    const context = analysisId && token ? await buildAnalysisContext(analysisId, token) : '';

    const userPrompt = context
      ? `Use o contexto persistido da análise de log abaixo para responder. Se faltar evidência, diga isso claramente.\n\n${context.substring(0, 45000)}\n\nPergunta do usuário: ${question}`
      : question;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('Erro na API de pergunta Claude:', error?.message);
    return new Response(
      'Desculpe, não foi possível processar sua pergunta neste momento.',
      { status: 500 }
    );
  }
}
