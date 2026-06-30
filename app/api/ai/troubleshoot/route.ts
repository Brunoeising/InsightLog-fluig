import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Voce e um especialista em instalacao, atualizacao e administracao do TOTVS Fluig.
Sua base de conhecimento inclui: matriz de portabilidade, modelo de dimensionamento, erros comuns de instalacao/atualizacao (conforme TDN), configuracao de standalone.xml, domain.xml, host.xml, bancos de dados (MySQL, Oracle, SQL Server), e topologias de servidor.
Analise o erro fornecido e retorne um diagnostico preciso com passos de solucao.
Responda SEMPRE em JSON valido, sem markdown code blocks.`;

export async function POST(request: NextRequest) {
  try {
    const { errorText, fluigVersion, osType, dbType, environmentContext } = await request.json();

    if (!errorText?.trim()) {
      return NextResponse.json({ error: 'Texto do erro nao fornecido' }, { status: 400 });
    }

    const contextParts = [];
    if (fluigVersion) contextParts.push(`Versao Fluig: ${fluigVersion}`);
    if (osType) contextParts.push(`SO: ${osType}`);
    if (dbType) contextParts.push(`Banco: ${dbType}`);
    if (environmentContext) contextParts.push(`Contexto adicional: ${environmentContext}`);

    const userPrompt = `Analise este erro de instalacao/atualizacao/inicializacao do Fluig:

${contextParts.length > 0 ? 'Contexto do ambiente:\n' + contextParts.join('\n') + '\n\n' : ''}Erro reportado:
${errorText.substring(0, 5000)}

Responda com este JSON exato:
{
  "diagnosis": "Diagnostico claro e objetivo do problema (2-3 frases)",
  "rootCause": "Causa raiz provavel",
  "solutionSteps": ["Passo 1 especifico", "Passo 2 especifico", "..."],
  "relatedArticles": ["Referencia TDN 1", "Referencia TDN 2"],
  "severity": "critical|medium|low",
  "category": "INSTALLATION|UPDATE|STARTUP|DATABASE|CONFIGURATION|NETWORK|PERMISSION"
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
        rootCause: 'Nao foi possivel estruturar a resposta',
        solutionSteps: ['Tente novamente com mais contexto sobre o erro'],
        relatedArticles: [],
        severity: 'medium',
        category: 'INSTALLATION',
      });
    }
  } catch (error: any) {
    console.error('Erro na API troubleshoot:', error?.message);
    return NextResponse.json(
      { error: 'Erro ao processar diagnostico' },
      { status: 500 }
    );
  }
}
