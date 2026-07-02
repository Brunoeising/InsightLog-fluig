import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { AIAnalysisRequest, AIAnalysisResponse } from '@/lib/types';
import { selectRepresentativeErrors } from '@/lib/ai-error-context';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Você é um especialista em análise de logs do sistema Fluig da TOTVS.
Sua tarefa é analisar erros de log e fornecer diagnósticos precisos e soluções práticas.
Responda sempre em JSON válido, sem markdown code blocks, sem texto adicional fora do JSON.`;

export async function POST(request: NextRequest) {
  try {
    const body: AIAnalysisRequest = await request.json();

    const errorsToAnalyze = selectRepresentativeErrors(body.errorEntries, 20);

    const formattedErrors = errorsToAnalyze.map(({ error, index, count, score }) => {
      const lines = [
        `ERRO_ID: ${index}`,
        `Ocorrências similares estimadas: ${count}`,
        `Score de criticidade: ${score}`,
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

    const categories = Array.from(new Set(body.errorEntries.map(e => e.category)));

    const userPrompt = `Analise os seguintes erros do log do Fluig:

Resumo:
- Total de erros: ${body.errorEntries.length}
- Categorias encontradas: ${categories.join(', ')}

${formattedErrors}

Responda com este JSON exato:
{
  "summary": "Resumo conciso e direto de todos os problemas encontrados (2-4 frases)",
  "suggestions": ["Sugestão prática 1", "Sugestão prática 2", "..."],
  "errorAnalysis": [
    { "errorId": "0", "suggestion": "Sugestão específica para o ERRO_ID informado" }
  ]
}

Use sempre o ERRO_ID original enviado, não a posição da lista. Forneça no máximo 6 sugestões gerais. Foque nos problemas mais críticos, recorrentes e com maior evidência de causa raiz.`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let aiResponse: AIAnalysisResponse;
    try {
      aiResponse = JSON.parse(cleaned);
    } catch {
      aiResponse = {
        summary: 'Não foi possível processar a análise neste momento.',
        suggestions: ['Tente analisar o log novamente.'],
        errorAnalysis: [],
      };
    }

    return NextResponse.json(aiResponse);
  } catch (error: any) {
    console.error('Erro na API de análise Claude:', error?.message);
    return NextResponse.json(
      {
        summary: 'Ocorreu um erro durante a análise.',
        suggestions: ['Por favor, tente novamente mais tarde.'],
        errorAnalysis: [],
      } as AIAnalysisResponse,
      { status: 500 }
    );
  }
}
