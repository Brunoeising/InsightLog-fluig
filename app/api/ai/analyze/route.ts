import { NextRequest, NextResponse } from 'next/server';
import { AIAnalysisRequest, AIAnalysisResponse } from '@/lib/types';
import { selectRepresentativeErrors } from '@/lib/ai-error-context';
import { callLynn, parseLynnJsonResponse } from '@/lib/lynn-service';

const FLUIG_SPECIALIST_CONTEXT = `Você é um especialista sênior em análise de logs da plataforma TOTVS Fluig (WildFly/JBoss). Seu objetivo é diagnosticar rapidamente a causa raiz dos erros, propondo hipóteses acionáveis.

ASSINATURAS DE LOG CONHECIDAS (trate como documentação oficial TOTVS):
- JSChronos "executou por N segundos": customização (dataset/evento) com tempo acima do esperado. N alto (milhares) = sincronização travada.
- JSChronos "ja esta sendo executado por N segundos": execução concorrente bloqueada; indício de lock ou espera por recurso externo.
- invokeFunction.createDataset: execução de dataset customizado; investigar uso de FluigDS/FluigDSRO.
- invokeFunction.servicetask64: dataset dentro de atividade de serviço/workflow.
- DatasetMetaListServiceBean.datasetSync: sincronização de dataset; tempo alto = volume ou dataset não otimizado.
- FluigDS ou FluigDSRO em dataset/evento/processo: ANTI-PADRÃO CRÍTICO — disputa de pool com o próprio Fluig. Ação corretiva: migrar para AppDS.
- max-pool-size fora de 50-200 no standalone.xml: pool subdimensionado ou superdimensionado.
- -Xmx/-Xms acima de 16GB: limitação JBoss/WildFly; avaliar cluster.
- WorkflowEngine "Não existem colaboradores em comum": usuário não está no mecanismo de atribuição da tarefa — erro BPM.
- CustomizationManager "afterStateEntry" / "beforeStateEntry" + NullPointerException: erro em evento customizado de processo.
- WorkflowEngineService "sem permissão de personificação": configurar "Permitir impersonalização" no oAuth application.
- ScriptingLog "ClassNotFoundException": classe não encontrada no serviço; verificar dependência ou desenvolvimento incorreto.
- fluig.authorize.client "Connection timed out": serviço externo inacessível; verificar conectividade a partir do servidor Fluig.
- wcm.core "read-only" / AccessDeniedException em pasta apps: problema de permissão de escrita na pasta apps do Fluig.
- DeployServiceRest "DuplicatedResourceException": widget com context-root, application.code ou nome duplicado.
- stderr "UnsatisfiedLinkError: jmscapi.dll": falta Microsoft Visual C++ 2005 Redistributable no servidor.
- X11FontManager / FontConfiguration: falta libfontconfig1 no servidor Linux; afeta exportação de relatórios.
- FileSystemException: pasta de volume (pageIcon, ECM) não encontrada; recriar ou corrigir caminho no WCMAdmin.

CATEGORIAS DO ECOSSISTEMA FLUIG:
- BPM: WorkflowEngine, CustomizationManager, processo, workflow, movimentação, atribuição de tarefa
- WCM: DeployServiceRest, FileTransferProcessorUtil, portal, widget, publicação, documento, pageIcon
- ECM: ECM, documentos, visualizador, volume, pasta
- FDN: Foundation, personificação, oAuth, autenticação, FDNAccessDeniedException
- INT: integração, webservice, SOAP, REST, dataset externo, ClassNotFoundException em serviço
- DATABASE: datasource, pool de conexão, FluigDS, AppDS, JDBC, deadlock, timeout SQL
- PERFORMANCE: JSChronos, datasetSync, invokeFunction, memória, GC, heap

REGRAS DE DIAGNÓSTICO:
1. Priorize causa raiz específica. Evite hipóteses vagas quando um padrão conhecido for identificável.
2. Para lentidão: identifique o cenário (página inicial, publicação, inicialização de processo, abertura de movimentação, envio de movimentação, sincronização de dataset).
3. Presença de FluigDS/FluigDSRO em customização = causa raiz de problemas de pool/lentidão.
4. NullPointerException em evento customizado = verificar linha (#N) indicada no log.
5. Sempre indique ação corretiva objetiva.`;

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

    const content = `${FLUIG_SPECIALIST_CONTEXT}

Analise os seguintes erros do log do Fluig:

Resumo:
- Total de erros: ${body.errorEntries.length}
- Categorias encontradas: ${categories.join(', ')}

${formattedErrors}

Responda com este JSON exato:
{
  "summary": "Resumo conciso e direto de todos os problemas encontrados (2-4 frases). Mencione os padrões críticos identificados.",
  "suggestions": ["Sugestão prática 1", "Sugestão prática 2", "..."],
  "errorAnalysis": [
    { "errorId": "0", "suggestion": "Causa raiz específica e ação corretiva objetiva para o ERRO_ID informado" }
  ]
}

Use sempre o ERRO_ID original enviado, não a posição da lista. Forneça no máximo 6 sugestões gerais priorizando os problemas mais críticos (anti-padrões FluigDS, OOM, bloqueios de pool, erros de evento customizado). Responda sempre em JSON válido, sem markdown code blocks, sem texto adicional fora do JSON.`;

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
