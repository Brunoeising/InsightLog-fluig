import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Voce e um especialista em monitoramento e performance do TOTVS Fluig.
Analise tendencias de metricas de saude (heap, CPU, memoria, disco) e faca predicoes sobre possiveis falhas futuras.
Considere os padroes tipicos do Fluig: memory leaks em datasets longos, crescimento de heap com sincronizacoes, acumulo de logs em disco.
Responda SEMPRE em JSON valido, sem markdown code blocks.`;

export async function POST(request: NextRequest) {
  try {
    const { trends, snapshots, environmentName } = await request.json();

    if (!trends || trends.length === 0) {
      return NextResponse.json({ error: 'Dados de tendencia nao fornecidos' }, { status: 400 });
    }

    const trendSummary = trends.map((t: any) =>
      `${t.metric}: ${t.direction} (atual: ${t.currentValue}%, media: ${t.averageValue}%, variacao: ${t.changePercent}%)`
    ).join('\n');

    const userPrompt = `Analise as tendencias de saude deste ambiente Fluig "${environmentName || 'Desconhecido'}":

${trendSummary}

Numero de snapshots analisados: ${snapshots?.length || 0}

Responda com este JSON exato:
{
  "prediction": "Predicao sobre o estado futuro do ambiente (2-3 frases)",
  "estimatedTimeToIssue": "Estimativa de quando problemas podem ocorrer (ex: '7-14 dias' ou 'Sem risco iminente')",
  "riskFactors": ["Fator de risco 1", "Fator de risco 2"],
  "preventiveActions": ["Acao preventiva 1 especifica", "Acao preventiva 2 especifica"],
  "overallRisk": "low|medium|high|critical"
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
        prediction: text,
        estimatedTimeToIssue: 'Indeterminado',
        riskFactors: [],
        preventiveActions: [],
        overallRisk: 'medium',
      });
    }
  } catch (error: any) {
    console.error('Erro na API health-predict:', error?.message);
    return NextResponse.json({ error: 'Erro ao gerar predicao' }, { status: 500 });
  }
}
