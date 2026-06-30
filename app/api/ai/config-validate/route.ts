import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Voce e um especialista em configuracao do TOTVS Fluig, com profundo conhecimento em standalone.xml, host.xml, domain.xml, configuracoes de banco de dados (MySQL, Oracle, SQL Server), e JVM tuning para JBoss/WildFly.
Analise a configuracao fornecida e identifique problemas, sugira correcoes e gere a versao corrigida.
Responda SEMPRE em JSON valido, sem markdown code blocks.`;

export async function POST(request: NextRequest) {
  try {
    const { configContent, configType, validationResults, sizingProfile } = await request.json();

    if (!configContent?.trim()) {
      return NextResponse.json({ error: 'Conteudo de configuracao nao fornecido' }, { status: 400 });
    }

    const problemParams = (validationResults || [])
      .filter((p: any) => p.status === 'error' || p.status === 'warning')
      .map((p: any) => `- ${p.label}: valor atual="${p.currentValue}", esperado="${p.expectedValue}" (${p.status})`)
      .join('\n');

    const userPrompt = `Analise esta configuracao do Fluig (tipo: ${configType || 'standalone.xml'}):

${configContent.substring(0, 10000)}

${problemParams ? `\nParametros com problemas identificados:\n${problemParams}\n` : ''}
${sizingProfile ? `Perfil de dimensionamento: ${sizingProfile}` : ''}

Responda com este JSON exato:
{
  "corrections": "Explicacao das correcoes necessarias em linguagem clara",
  "correctedContent": "O conteudo corrigido completo (ou trecho relevante com as correcoes aplicadas)",
  "criticalIssues": ["Issue critica 1", "Issue critica 2"],
  "recommendations": ["Recomendacao adicional 1", "Recomendacao adicional 2"]
}`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
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
        corrections: text,
        correctedContent: '',
        criticalIssues: [],
        recommendations: [],
      });
    }
  } catch (error: any) {
    console.error('Erro na API config-validate:', error?.message);
    return NextResponse.json({ error: 'Erro ao validar configuracao' }, { status: 500 });
  }
}
