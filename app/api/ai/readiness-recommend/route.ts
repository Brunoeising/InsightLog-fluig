import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Voce e um especialista em implantacao do TOTVS Fluig.
Analise os resultados de um checklist de pre-instalacao e forneca recomendacoes priorizadas para corrigir bloqueadores e preparar o ambiente.
Considere a ordem logica de resolucao (ex: primeiro SO, depois Java, depois banco, depois rede).
Responda SEMPRE em JSON valido, sem markdown code blocks.`;

export async function POST(request: NextRequest) {
  try {
    const { items, fluigVersion, environmentName } = await request.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Items do checklist nao fornecidos' }, { status: 400 });
    }

    const failedItems = items.filter((i: any) => i.status === 'fail');
    const passedItems = items.filter((i: any) => i.status === 'pass');

    const summary = `Ambiente: ${environmentName || 'Nao informado'}
Versao Fluig: ${fluigVersion || 'Nao informada'}
Items verificados: ${items.length}
Aprovados: ${passedItems.length}
Reprovados: ${failedItems.length}

Items reprovados:
${failedItems.map((i: any) => `- [${i.isMandatory ? 'OBRIGATORIO' : 'RECOMENDADO'}] ${i.requirement}${i.details ? ' (Detalhe: ' + i.details + ')' : ''}`).join('\n')}`;

    const userPrompt = `${summary}

Responda com este JSON exato:
{
  "recommendations": "Recomendacoes priorizadas em formato texto claro com passos numerados",
  "priority": ["Item prioritario 1 com comando/acao", "Item prioritario 2", "..."],
  "estimatedEffort": "Estimativa de esforco para resolver todos os bloqueadores",
  "readyToInstall": true/false
}`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
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
        recommendations: text,
        priority: [],
        estimatedEffort: 'Indeterminado',
        readyToInstall: false,
      });
    }
  } catch (error: any) {
    console.error('Erro na API readiness-recommend:', error?.message);
    return NextResponse.json({ error: 'Erro ao gerar recomendacoes' }, { status: 500 });
  }
}
