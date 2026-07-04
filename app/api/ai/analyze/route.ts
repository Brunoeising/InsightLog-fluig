import { NextRequest, NextResponse } from 'next/server';
import { AIAnalysisRequest, AIAnalysisResponse } from '@/lib/types';
import { selectRepresentativeErrors } from '@/lib/ai-error-context';
import { callLynn, parseLynnJsonResponse } from '@/lib/lynn-service';

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

    const content = `Analise os seguintes erros do log do Fluig:

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

Use sempre o ERRO_ID original enviado, não a posição da lista. Forneça no máximo 6 sugestões gerais. Foque nos problemas mais críticos, recorrentes e com maior evidência de causa raiz. Responda sempre em JSON válido, sem markdown code blocks, sem texto adicional fora do JSON.`;

    const text = await callLynn(content);

    let aiResponse: AIAnalysisResponse;
    try {
      aiResponse = parseLynnJsonResponse<AIAnalysisResponse>(text);
    } catch {
      aiResponse = {
        summary: 'Não foi possível processar a análise neste momento.',
        suggestions: ['Tente analisar o log novamente.'],
        errorAnalysis: [],
      };
    }

    return NextResponse.json(aiResponse);
  } catch (error: any) {
    console.error('Erro na API de análise LYNN:', error?.message);
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
