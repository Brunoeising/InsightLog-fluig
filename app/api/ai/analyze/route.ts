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

    const content = `Analise os seguintes erros extraídos de log da plataforma TOTVS Fluig:

Resumo:
- Total de erros: ${body.errorEntries.length}
- Categorias encontradas: ${categories.join(', ')}

${formattedErrors}`;

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
