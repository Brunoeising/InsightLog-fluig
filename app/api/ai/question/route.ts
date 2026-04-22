import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Você é um especialista em análise de logs do sistema Fluig da TOTVS.
Responda de forma clara, objetiva e prática. Quando identificar problemas específicos,
indique a causa mais provável e os passos para resolução.`;

export async function POST(request: NextRequest) {
  try {
    const { question, logContent } = await request.json();

    if (!question?.trim()) {
      return new Response('Pergunta não fornecida', { status: 400 });
    }

    // Send up to 50000 chars of log context — Claude handles large contexts well
    const contextSnippet = (logContent as string)?.substring(0, 50000) ?? '';

    const userPrompt = contextSnippet
      ? `Aqui está uma parte do arquivo de log do Fluig:\n\n${contextSnippet}\n\nPergunta do usuário: ${question}`
      : question;

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
