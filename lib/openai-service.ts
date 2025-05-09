"use client";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIAnalysisRequest, AIAnalysisResponse } from './types';

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY!);

/**
 * Generates a summary and analysis for log errors using Google Gemini API
 */
export async function analyzeLogErrors(
  request: AIAnalysisRequest
): Promise<AIAnalysisResponse> {
  const prompt = createAnalysisPrompt(request);
  
  try {
    console.log('Iniciando análise de logs com Gemini...');
    
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
        topP: 0.8,
        topK: 40
      }
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('Resposta recebida do Gemini');
    
    // Clean the response text by removing markdown code blocks before parsing
    const cleanedText = text.replace(/```json\n/g, '').replace(/```/g, '').trim();
    
    try {
      const aiResponse = JSON.parse(cleanedText);
      
      return {
        summary: aiResponse.summary || "Análise em andamento...",
        suggestions: aiResponse.suggestions || [],
        errorAnalysis: aiResponse.errorAnalysis || []
      };
    } catch (parseError) {
      console.error('Erro ao fazer parse do JSON:', cleanedText);
      return {
        summary: "Não foi possível processar a análise neste momento.",
        suggestions: ["Tente analisar o log novamente."],
        errorAnalysis: []
      };
    }
  } catch (error: any) {
    console.error('Erro na análise do Gemini:', {
      message: error.message,
      status: error.status,
      response: error.response,
      stack: error.stack
    });
    
    return {
      summary: "Ocorreu um erro durante a análise.",
      suggestions: ["Por favor, tente novamente mais tarde."],
      errorAnalysis: []
    };
  }
}

/**
 * Creates a prompt for the Gemini API based on the analysis request
 */
function createAnalysisPrompt(request: AIAnalysisRequest): string {
  const significantErrors = request.errorEntries.slice(0, 5);
  
  const formattedErrors = significantErrors.map((error, index) => {
    return `
    ERROR #${index + 1} (Category: ${error.category})
    Timestamp: ${error.timestamp}
    Message: ${error.message}
    Context Before:
    ${error.contextBefore.join('\n')}
    Context After:
    ${error.contextAfter.join('\n')}
    `;
  }).join('\n\n');
  
  return `
  Você é um especialista em análise de logs do sistema Fluig.
  Por favor, analise os seguintes erros e forneça:
  
  1. Um resumo conciso dos principais problemas
  2. Uma lista de soluções práticas
  3. Sugestões específicas para cada erro
  
  Resumo do conteúdo do log:
  - Total de erros: ${request.errorEntries.length}
  - Categorias de erro: ${Array.from(new Set(request.errorEntries.map(e => e.category))).join(', ')}
  
  ${formattedErrors}
  
  Responda com um objeto JSON neste formato exato:
  {
    "summary": "Resumo conciso de todos os problemas encontrados nos logs",
    "suggestions": ["Sugestão 1", "Sugestão 2", "..."],
    "errorAnalysis": [
      {
        "errorId": "0",
        "suggestion": "Sugestão específica para o ERRO #1"
      },
      {
        "errorId": "1",
        "suggestion": "Sugestão específica para o ERRO #2"
      }
    ]
  }
  
  Faça sugestões concisas, específicas e práticas. Foque nos problemas mais críticos primeiro.
  `;
}

/**
 * Generates an answer to a user question about a log file using Gemini API
 */
export async function answerUserQuestion(
  question: string,
  logContent: string
): Promise<string> {
  try {
    console.log('Processando pergunta com Gemini...');
    
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
        topP: 0.8,
        topK: 40
      }
    });
    
    const prompt = `Você é um especialista em análise de logs do sistema Fluig.
                   Sua tarefa é responder perguntas sobre logs e fornecer insights úteis.
                   
                   Aqui está uma parte do arquivo de log do Fluig:
                   
                   ${logContent.substring(0, 2000)}
                   
                   O usuário perguntou: ${question}
                   
                   Por favor, forneça uma resposta útil e concisa focada na análise do log.`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    console.log('Resposta recebida do Gemini');
    
    return response.text().trim();
  } catch (error: any) {
    console.error('Erro ao processar pergunta:', {
      message: error.message,
      status: error.status,
      response: error.response,
      stack: error.stack
    });
    
    return "Desculpe, não foi possível processar sua pergunta neste momento. Por favor, tente novamente.";
  }
}