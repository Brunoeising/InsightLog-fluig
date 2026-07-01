"use client";

import { AIAnalysisRequest, AIAnalysisResponse } from './types';
import { supabase } from './supabase-client';

export async function analyzeLogErrors(
  request: AIAnalysisRequest
): Promise<AIAnalysisResponse> {
  const response = await fetch('/api/ai/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    console.error('Erro na análise de logs:', response.status);
    return {
      summary: 'Ocorreu um erro durante a análise.',
      suggestions: ['Por favor, tente novamente mais tarde.'],
      errorAnalysis: [],
    };
  }

  return response.json();
}

export async function answerUserQuestion(
  question: string,
  analysisId: string,
  onChunk: (chunk: string) => void
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();

  const response = await fetch('/api/ai/question', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ question, analysisId }),
  });

  if (!response.ok || !response.body) {
    onChunk('Desculpe, não foi possível processar sua pergunta neste momento.');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}
