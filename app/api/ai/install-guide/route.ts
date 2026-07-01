import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import installationGuide from '@/lib/installation-kb/installation-guide.json';
import databaseConfig from '@/lib/installation-kb/database-config.json';
import commonErrors from '@/lib/installation-kb/common-errors.json';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Voce e um especialista em instalacao e configuracao do TOTVS Fluig.
Sua base de conhecimento inclui:
- Guia de instalacao oficial: ${JSON.stringify(installationGuide)}
- Configuracao de bancos de dados: ${JSON.stringify(databaseConfig)}
- Erros comuns e solucoes: ${JSON.stringify(commonErrors)}

Regras:
1. Responda SEMPRE em portugues brasileiro
2. Responda SEMPRE em JSON valido sem markdown code blocks
3. Seja preciso e pratico - forneca comandos e passos concretos
4. Quando mencionar caminhos, use {fluig_home} como placeholder do diretorio de instalacao
5. Para erros, sempre identifique causa raiz antes de dar solucao
6. Alerte sobre riscos criticos (ex: nao e possivel reverter update, sempre fazer backup)`;

export async function POST(request: NextRequest) {
  try {
    const { message, context, conversationHistory } = await request.json();

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Mensagem nao fornecida' }, { status: 400 });
    }

    const contextInfo = context
      ? `Contexto atual: OS=${context.os || 'nao informado'}, Banco=${context.db || 'nao informado'}, Fase=${context.phase || 'geral'}`
      : '';

    const history = (conversationHistory || []).slice(-10).map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const userMessage = contextInfo
      ? `${contextInfo}\n\nPergunta: ${message}`
      : message;

    const messages = [
      ...history,
      { role: 'user' as const, content: userMessage },
    ];

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages,
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {
        answer: text,
        steps: [],
        commands: [],
        warnings: [],
        nextTopics: [],
      };
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error('Erro na API install-guide:', error?.message);
    return NextResponse.json({ error: 'Erro ao processar pergunta' }, { status: 500 });
  }
}
