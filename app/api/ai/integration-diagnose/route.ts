import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Voce e um especialista em integracoes do TOTVS Fluig, incluindo webservices SOAP, APIs REST, integracoes com Protheus/Datasul/RM, e configuracao de endpoints.
Conhece os webservices nativos do Fluig (ECMCardService, ECMDocumentService, WorkflowEngineService, etc.) e as APIs REST (/api/public, /api-rest).
Diagnostique erros de integracao e sugira configuracoes corretas.
Responda SEMPRE em JSON valido, sem markdown code blocks.`;

export async function POST(request: NextRequest) {
  try {
    const { errorMessage, integrationType, endpointUrl, additionalContext } = await request.json();

    if (!errorMessage?.trim()) {
      return NextResponse.json({ error: 'Mensagem de erro nao fornecida' }, { status: 400 });
    }

    const userPrompt = `Diagnostique este erro de integracao no Fluig:

Tipo: ${integrationType || 'NAO_INFORMADO'}
Endpoint: ${endpointUrl || 'NAO_INFORMADO'}
${additionalContext ? `Contexto: ${additionalContext}\n` : ''}
Erro:
${errorMessage.substring(0, 5000)}

Responda com este JSON exato:
{
  "diagnosis": "Diagnostico claro do problema de integracao",
  "rootCause": "Causa raiz identificada",
  "solutionSteps": ["Passo 1", "Passo 2", "..."],
  "configSuggestion": "Snippet de configuracao sugerido (XML ou JSON, conforme o tipo)",
  "commonPitfalls": ["Armadilha comum 1 para este tipo de erro", "..."],
  "severity": "critical|medium|low"
}`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
      const result = JSON.parse(cleaned);
      return NextResponse.json(result);
    } catch {
      return NextResponse.json({
        diagnosis: text,
        rootCause: '',
        solutionSteps: [],
        configSuggestion: '',
        commonPitfalls: [],
        severity: 'medium',
      });
    }
  } catch (error: any) {
    console.error('Erro na API integration-diagnose:', error?.message);
    return NextResponse.json({ error: 'Erro ao diagnosticar integracao' }, { status: 500 });
  }
}
