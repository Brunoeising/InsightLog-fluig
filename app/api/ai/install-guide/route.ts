import { NextRequest, NextResponse } from 'next/server';
import installationGuide from '@/lib/installation-kb/installation-guide.json';
import databaseConfig from '@/lib/installation-kb/database-config.json';
import commonErrors from '@/lib/installation-kb/common-errors.json';
import { callLynn, parseLynnJsonResponse } from '@/lib/lynn-service';

function normalizeResponse(value: any) {
  return {
    answer: typeof value?.answer === 'string' ? value.answer : '',
    steps: Array.isArray(value?.steps) ? value.steps.filter((item: unknown) => typeof item === 'string') : [],
    commands: Array.isArray(value?.commands) ? value.commands.filter((item: unknown) => typeof item === 'string') : [],
    warnings: Array.isArray(value?.warnings) ? value.warnings.filter((item: unknown) => typeof item === 'string') : [],
    nextTopics: Array.isArray(value?.nextTopics) ? value.nextTopics.filter((item: unknown) => typeof item === 'string') : [],
  };
}

function parseAssistantResponse(text: string) {
  try {
    return normalizeResponse(parseLynnJsonResponse(text));
  } catch {
    return normalizeResponse({ answer: text });
  }
}

const KNOWLEDGE_BASE_CONTEXT = `Sua base de conhecimento inclui:
- Guia de instalacao oficial: ${JSON.stringify(installationGuide)}
- Configuracao de bancos de dados: ${JSON.stringify(databaseConfig)}
- Erros comuns e solucoes: ${JSON.stringify(commonErrors)}`;

export async function POST(request: NextRequest) {
  try {
    const { message, context, conversationHistory } = await request.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Mensagem nao fornecida' }, { status: 400 });
    }

    const contextInfo = context
      ? `Contexto atual: OS=${context.os || 'nao informado'}, Banco=${context.db || 'nao informado'}, Fase=${context.phase || 'geral'}`
      : '';

    const history = (conversationHistory || []).slice(-10).map((m: { role: string; content: string }) =>
      `[${m.role === 'assistant' ? 'Assistente' : 'Usuario'}]: ${m.content}`
    ).join('\n\n');

    const userMessage = contextInfo
      ? `${contextInfo}\n\nPergunta: ${message}`
      : message;

    const content = [
      `Voce e um especialista em instalacao e configuracao do TOTVS Fluig.`,
      KNOWLEDGE_BASE_CONTEXT,
      ``,
      `Regras:`,
      `1. Responda SEMPRE em portugues brasileiro`,
      `2. Responda SEMPRE em JSON valido sem markdown code blocks`,
      `3. Seja preciso e pratico - forneca comandos e passos concretos`,
      `4. Quando mencionar caminhos, use {fluig_home} como placeholder do diretorio de instalacao`,
      `5. Para erros, sempre identifique causa raiz antes de dar solucao`,
      `6. Alerte sobre riscos criticos (ex: nao e possivel reverter update, sempre fazer backup)`,
      ``,
      `Formato obrigatorio da resposta:`,
      `{`,
      `  "answer": "resposta principal em texto claro",`,
      `  "steps": ["passo 1", "passo 2"],`,
      `  "commands": ["comando completo quando houver"],`,
      `  "warnings": ["alerta importante quando houver"],`,
      `  "nextTopics": ["topico sugerido"]`,
      `}`,
      ``,
      `Sempre envie todas as chaves. Use arrays vazios quando nao houver itens.`,
      history ? `\nHistorico da conversa:\n${history}` : '',
      ``,
      userMessage,
    ].filter(Boolean).join('\n');

    const text = await callLynn(content);
    const parsed = parseAssistantResponse(text);

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error('Erro na API install-guide LYNN:', error?.message);
    return NextResponse.json({ error: 'Erro ao processar pergunta' }, { status: 500 });
  }
}
