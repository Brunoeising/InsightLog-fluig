import { SupabaseClient } from '@supabase/supabase-js';
import { supabase, getCurrentUser } from './supabase-client';
import { validateInventory, getCompatibilityScore, countByStatus, ValidationItem } from './rule-engine';
import { runSizingSimulation } from './sizing-engine';
import { EnvironmentInventory, EnvironmentItem, SizingInput, EnvironmentAnalysis, SizingResultData, HealthCheckData, EnvironmentComparison, EnvironmentComparisonChange, CompatibilityStatus } from './types';
import { Database } from './database.types';
import { toInventoryRecord } from './environment-normalizer';

interface RunEnvironmentAnalysisOptions {
  supabaseClient?: SupabaseClient<Database>;
  userId?: string;
}

export async function runEnvironmentAnalysis(
  environmentName: string,
  inventory: EnvironmentInventory,
  sizingInput: SizingInput,
  healthCheckRaw?: Partial<HealthCheckData>,
  options: RunEnvironmentAnalysisOptions = {}
): Promise<{ analysisId: string; analysis: EnvironmentAnalysis }> {
  const db = options.supabaseClient ?? supabase;
  let userId = options.userId;

  if (!userId) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Usuario nao autenticado');
    userId = user.id;
  }

  const inventoryRecord = toInventoryRecord(inventory);

  const validationItems = validateInventory(inventoryRecord);
  const score = getCompatibilityScore(validationItems);
  const counts = countByStatus(validationItems);

  const currentCpu = parseInt(inventory.cpu_cores) || 0;
  const currentRam = parseInt(inventory.ram_gb) || 0;
  const currentDisk = parseInt(inventory.disk_gb) || 0;

  const sizingResult = runSizingSimulation(sizingInput, {
    cpu: currentCpu,
    ram: currentRam,
    disk: currentDisk,
  });

  const riskCount = counts.notHomologated + counts.restricted;
  const attentionCount = counts.inAnalysis + counts.inValidation + counts.notIdentified;

  const { data: analysisRow, error: analysisError } = await db
    .from('environment_analyses')
    .insert({
      environment_name: environmentName,
      status: 'completed',
      compatibility_score: score,
      risk_count: riskCount,
      non_homologated_count: counts.notHomologated,
      attention_count: attentionCount,
      in_analysis_count: counts.inAnalysis,
      sizing_status: sizingResult.sizing_status,
      inventory_data: inventoryRecord,
    })
    .select()
    .single();

  if (analysisError) throw new Error(`Erro ao criar analise: ${analysisError.message}`);
  const analysisId = analysisRow.id;

  const itemInserts = validationItems.map((item: ValidationItem) => ({
    analysis_id: analysisId,
    category: item.category,
    field_name: item.field,
    collected_value: item.collectedValue,
    expected_value: item.expectedValue,
    compatibility_status: item.status,
    notes: item.notes,
  }));

  const { error: itemsError } = await db
    .from('environment_items')
    .insert(itemInserts);

  if (itemsError) console.error('Erro ao salvar itens:', itemsError.message);

  const { error: sizingError } = await db
    .from('sizing_results')
    .insert({
      analysis_id: analysisId,
      registered_users: sizingInput.registered_users,
      concurrent_users: sizingInput.concurrent_users,
      process_count: sizingInput.process_count,
      doc_volume: sizingInput.doc_volume,
      dataset_count: sizingInput.dataset_count,
      integration_volume: sizingInput.integration_volume,
      recommended_cpu: sizingResult.recommended_cpu,
      recommended_ram: sizingResult.recommended_ram,
      recommended_disk: sizingResult.recommended_disk,
      recommended_instances: sizingResult.recommended_instances,
      recommended_heap: sizingResult.recommended_heap,
      current_cpu: `${currentCpu} vCPU`,
      current_ram: `${currentRam} GB`,
      current_disk: `${currentDisk} GB`,
      sizing_status: sizingResult.sizing_status,
      profile: sizingResult.profile,
      over_limit: sizingResult.over_limit,
      over_limit_note: sizingResult.over_limit_note ?? null,
    });

  if (sizingError) console.error('Erro ao salvar sizing:', sizingError.message);

  let healthCheckData: HealthCheckData | undefined;
  if (healthCheckRaw) {
    const { data: healthRow, error: healthError } = await db
      .from('health_check_results')
      .insert({
        analysis_id: analysisId,
        heap_usage: healthCheckRaw.heapUsage ?? null,
        cpu_usage: healthCheckRaw.cpuUsage ?? null,
        memory_usage: healthCheckRaw.memoryUsage ?? null,
        disk_usage: healthCheckRaw.diskUsage ?? null,
        system_memory_usage: healthCheckRaw.systemMemoryUsage ?? null,
        host_xml_heap_max: healthCheckRaw.hostXmlHeapMax ?? null,
        host_xml_heap_init: healthCheckRaw.hostXmlHeapInit ?? null,
        fluig_pid: healthCheckRaw.fluigPid ?? null,
        services_status: healthCheckRaw.servicesStatus ?? null,
        ai_interpretation: healthCheckRaw.aiInterpretation ?? null,
      })
      .select()
      .single();

    if (healthError) {
      console.error('Erro ao salvar health check:', healthError.message);
    } else {
      healthCheckData = {
        id: healthRow.id,
        analysisId: healthRow.analysis_id,
        heapUsage: healthRow.heap_usage,
        cpuUsage: healthRow.cpu_usage,
        memoryUsage: healthRow.memory_usage,
        diskUsage: healthRow.disk_usage,
        systemMemoryUsage: healthRow.system_memory_usage,
        hostXmlHeapMax: healthRow.host_xml_heap_max,
        hostXmlHeapInit: healthRow.host_xml_heap_init,
        fluigPid: healthRow.fluig_pid,
        servicesStatus: healthRow.services_status,
        aiInterpretation: healthRow.ai_interpretation,
      };
    }
  }

  await db.from('audit_logs').insert({
    action: 'environment_analysis',
    environment_name: environmentName,
    result_summary: `Score: ${score}% | Riscos: ${riskCount} | Em Analise: ${counts.inAnalysis} | Sizing: ${sizingResult.sizing_status}`,
  });

  const analysis: EnvironmentAnalysis = {
    id: analysisId,
    userId,
    environmentName,
    status: 'completed',
    compatibilityScore: score,
    riskCount,
    nonHomologatedCount: counts.notHomologated,
    attentionCount,
    inAnalysisCount: counts.inAnalysis,
    sizingStatus: sizingResult.sizing_status as any,
    executiveSummary: null,
    recommendations: null,
    inventory,
    items: validationItems.map((item) => ({
      category: item.category,
      fieldName: item.field,
      label: item.label,
      collectedValue: item.collectedValue,
      expectedValue: item.expectedValue,
      status: item.status,
      notes: item.notes,
    })),
    sizing: {
      registeredUsers: sizingInput.registered_users,
      concurrentUsers: sizingInput.concurrent_users,
      processCount: sizingInput.process_count,
      docVolume: sizingInput.doc_volume,
      datasetCount: sizingInput.dataset_count,
      integrationVolume: sizingInput.integration_volume,
      recommendedCpu: sizingResult.recommended_cpu,
      recommendedRam: sizingResult.recommended_ram,
      recommendedDisk: sizingResult.recommended_disk,
      recommendedInstances: sizingResult.recommended_instances,
      recommendedHeap: sizingResult.recommended_heap,
      currentCpu: `${currentCpu} vCPU`,
      currentRam: `${currentRam} GB`,
      currentDisk: `${currentDisk} GB`,
      sizingStatus: sizingResult.sizing_status as any,
      profile: sizingResult.profile,
      overLimit: sizingResult.over_limit,
      overLimitNote: sizingResult.over_limit_note,
    },
    healthCheck: healthCheckData,
  };

  return { analysisId, analysis };
}

export async function fetchEnvironmentAnalysis(
  analysisId: string,
  supabaseClient: SupabaseClient<Database> = supabase
): Promise<EnvironmentAnalysis | null> {
  const { data: analysisRow, error } = await supabaseClient
    .from('environment_analyses')
    .select('*')
    .eq('id', analysisId)
    .maybeSingle();

  if (error || !analysisRow) return null;

  const { data: items } = await supabaseClient
    .from('environment_items')
    .select('*')
    .eq('analysis_id', analysisId);

  const { data: sizing } = await supabaseClient
    .from('sizing_results')
    .select('*')
    .eq('analysis_id', analysisId)
    .maybeSingle();

  const { data: health } = await supabaseClient
    .from('health_check_results')
    .select('*')
    .eq('analysis_id', analysisId)
    .maybeSingle();

  const inventory = (analysisRow.inventory_data || {}) as EnvironmentInventory;

  return {
    id: analysisRow.id,
    userId: analysisRow.user_id,
    environmentName: analysisRow.environment_name,
    status: analysisRow.status,
    compatibilityScore: analysisRow.compatibility_score || 0,
    riskCount: analysisRow.risk_count || 0,
    nonHomologatedCount: analysisRow.non_homologated_count || 0,
    attentionCount: analysisRow.attention_count || 0,
    inAnalysisCount: analysisRow.in_analysis_count || 0,
    sizingStatus: analysisRow.sizing_status,
    executiveSummary: analysisRow.executive_summary,
    recommendations: analysisRow.recommendations,
    inventory,
    items: (items || []).map((item: any) => ({
      id: item.id,
      analysisId: item.analysis_id,
      category: item.category,
      fieldName: item.field_name,
      label: item.field_name,
      collectedValue: item.collected_value || '',
      expectedValue: item.expected_value || '',
      status: item.compatibility_status,
      notes: item.notes || '',
    })),
    sizing: sizing ? {
      id: sizing.id,
      analysisId: sizing.analysis_id,
      registeredUsers: sizing.registered_users,
      concurrentUsers: sizing.concurrent_users,
      processCount: sizing.process_count,
      docVolume: sizing.doc_volume,
      datasetCount: sizing.dataset_count,
      integrationVolume: sizing.integration_volume,
      recommendedCpu: sizing.recommended_cpu,
      recommendedRam: sizing.recommended_ram,
      recommendedDisk: sizing.recommended_disk,
      recommendedInstances: sizing.recommended_instances || undefined,
      recommendedHeap: sizing.recommended_heap || undefined,
      currentCpu: sizing.current_cpu,
      currentRam: sizing.current_ram,
      currentDisk: sizing.current_disk,
      sizingStatus: sizing.sizing_status,
      profile: sizing.profile || '',
      overLimit: sizing.over_limit || false,
      overLimitNote: sizing.over_limit_note || undefined,
    } : undefined,
    healthCheck: health ? {
      id: health.id,
      analysisId: health.analysis_id,
      heapUsage: health.heap_usage,
      cpuUsage: health.cpu_usage,
      memoryUsage: health.memory_usage,
      diskUsage: health.disk_usage,
      systemMemoryUsage: health.system_memory_usage,
      hostXmlHeapMax: health.host_xml_heap_max,
      hostXmlHeapInit: health.host_xml_heap_init,
      fluigPid: health.fluig_pid,
      servicesStatus: health.services_status as Record<string, string> | null,
      aiInterpretation: health.ai_interpretation,
    } : undefined,
    createdAt: analysisRow.created_at,
    updatedAt: analysisRow.updated_at,
  };
}

export async function fetchEnvironmentAnalyses(page: number = 1, pageSize: number = 10) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('environment_analyses')
    .select('id, environment_name, status, compatibility_score, risk_count, non_homologated_count, in_analysis_count, sizing_status, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  return { analyses: data || [], total: count || 0 };
}

const compatibilityWeight: Record<CompatibilityStatus, number> = {
  HOMOLOGADO: 5,
  HOMOLOGADO_RESTRICOES: 4,
  EM_ANALISE: 3,
  EM_VALIDACAO: 2,
  NAO_IDENTIFICADO: 1,
  NAO_HOMOLOGADO: 0,
};

const inventoryLabels: Record<keyof EnvironmentInventory, string> = {
  os_name: 'Sistema Operacional',
  os_version: 'Versao do SO',
  os_build: 'Build do SO',
  architecture: 'Arquitetura',
  cpu_cores: 'CPU',
  cpu_vcpu: 'vCPU',
  ram_gb: 'Memoria RAM',
  disk_gb: 'Disco',
  java_version: 'Java',
  java_vendor: 'Vendor Java',
  java_home: 'JAVA_HOME',
  fluig_version: 'Versao Fluig',
  fluig_patch: 'Patch Fluig',
  fluig_directory: 'Diretorio Fluig',
  database_type: 'Banco de Dados',
  database_version: 'Versao do Banco',
  database_charset: 'Charset',
  database_collation: 'Collation',
  appserver_type: 'Servidor de Aplicacao',
  nginx_version: 'Nginx',
  apache_version: 'Apache',
};

function textValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Nao informado';
  return String(value);
}

function statusImpact(previousStatus: CompatibilityStatus, currentStatus: CompatibilityStatus): EnvironmentComparisonChange['impact'] {
  const delta = compatibilityWeight[currentStatus] - compatibilityWeight[previousStatus];
  if (delta > 0) return 'positive';
  if (delta < 0) return 'negative';
  return 'neutral';
}

export async function compareEnvironmentAnalyses(
  baselineId: string,
  targetId: string,
  supabaseClient: SupabaseClient<Database> = supabase
): Promise<EnvironmentComparison> {
  const [baseline, target] = await Promise.all([
    fetchEnvironmentAnalysis(baselineId, supabaseClient),
    fetchEnvironmentAnalysis(targetId, supabaseClient),
  ]);

  if (!baseline || !target) throw new Error('Analises selecionadas nao foram encontradas.');

  const changes: EnvironmentComparisonChange[] = [];

  for (const key of Object.keys(inventoryLabels) as Array<keyof EnvironmentInventory>) {
    const previousValue = textValue(baseline.inventory[key]);
    const currentValue = textValue(target.inventory[key]);
    if (previousValue !== currentValue) {
      changes.push({
        field: key,
        label: inventoryLabels[key],
        previousValue,
        currentValue,
        category: 'inventory',
        impact: 'neutral',
      });
    }
  }

  const baselineItems = new Map(baseline.items.map((item) => [`${item.category}:${item.fieldName}`, item]));
  for (const item of target.items) {
    const previous = baselineItems.get(`${item.category}:${item.fieldName}`);
    if (!previous) continue;
    if (previous.status !== item.status || previous.collectedValue !== item.collectedValue) {
      changes.push({
        field: item.fieldName,
        label: item.label || item.fieldName,
        previousValue: `${textValue(previous.collectedValue)} (${previous.status})`,
        currentValue: `${textValue(item.collectedValue)} (${item.status})`,
        category: 'compatibility',
        impact: statusImpact(previous.status, item.status),
      });
    }
  }

  if (baseline.sizing && target.sizing) {
    const sizingFields: Array<[keyof SizingResultData, string]> = [
      ['sizingStatus', 'Status de Dimensionamento'],
      ['recommendedCpu', 'CPU Recomendada'],
      ['recommendedRam', 'RAM Recomendada'],
      ['recommendedDisk', 'Disco Recomendado'],
      ['recommendedInstances', 'Instancias Recomendadas'],
      ['recommendedHeap', 'Heap Recomendado'],
      ['currentCpu', 'CPU Atual'],
      ['currentRam', 'RAM Atual'],
      ['currentDisk', 'Disco Atual'],
      ['profile', 'Perfil'],
    ];

    for (const [field, label] of sizingFields) {
      const previousValue = textValue(baseline.sizing[field]);
      const currentValue = textValue(target.sizing[field]);
      if (previousValue !== currentValue) {
        changes.push({
          field,
          label,
          previousValue,
          currentValue,
          category: 'sizing',
          impact: field === 'sizingStatus' && currentValue === 'SUBDIMENSIONADO' ? 'negative' : 'neutral',
        });
      }
    }
  }

  if (baseline.healthCheck && target.healthCheck) {
    const healthFields: Array<[keyof HealthCheckData, string]> = [
      ['heapUsage', 'Uso de Heap'],
      ['cpuUsage', 'Uso de CPU'],
      ['memoryUsage', 'Uso de Memoria'],
      ['diskUsage', 'Uso de Disco'],
      ['systemMemoryUsage', 'Uso de Memoria do Sistema'],
      ['hostXmlHeapMax', 'Heap Maximo host.xml'],
      ['hostXmlHeapInit', 'Heap Inicial host.xml'],
      ['fluigPid', 'PID Fluig'],
    ];

    for (const [field, label] of healthFields) {
      const previousValue = textValue(baseline.healthCheck[field]);
      const currentValue = textValue(target.healthCheck[field]);
      if (previousValue !== currentValue) {
        changes.push({
          field,
          label,
          previousValue,
          currentValue,
          category: 'health',
          impact: 'neutral',
        });
      }
    }
  }

  return {
    baselineId,
    targetId,
    scoreDelta: target.compatibilityScore - baseline.compatibilityScore,
    riskDelta: target.riskCount - baseline.riskCount,
    changes,
  };
}

export async function generateExecutiveSummary(analysis: EnvironmentAnalysis): Promise<{ summary: string; recommendations: string[] }> {
  const fluigVersion = analysis.inventory?.fluig_version || 'Nao informada';

  const itemsSummary = analysis.items.map(item =>
    `- ${item.label}: ${item.collectedValue || 'Nao informado'} -> ${item.status}${item.notes ? ` (${item.notes})` : ''}`
  ).join('\n');

  const sizingInfo = analysis.sizing
    ? `Perfil: ${analysis.sizing.profile} | Status: ${analysis.sizing.sizingStatus} | Recomendado: ${analysis.sizing.recommendedCpu}, ${analysis.sizing.recommendedRam}, ${analysis.sizing.recommendedDisk} | Atual: ${analysis.sizing.currentCpu}, ${analysis.sizing.currentRam}, ${analysis.sizing.currentDisk}${(analysis.sizing as any).overLimit ? ' | ATENCAO: Acima dos limites do modelo padrao - requer avaliacao customizada TOTVS' : ''}`
    : 'Sem dados de dimensionamento';

  const healthInfo = analysis.healthCheck
    ? `Health Check: Heap ${analysis.healthCheck.heapUsage}%, CPU ${analysis.healthCheck.cpuUsage}%, Memoria ${analysis.healthCheck.memoryUsage}%, Disco ${analysis.healthCheck.diskUsage}%`
    : 'Sem dados de health check';

  const prompt = `Voce e um especialista em infraestrutura e implantacao do TOTVS Fluig. Gere um resumo executivo e recomendacoes baseadas nos dados abaixo.

Ambiente: ${analysis.environmentName}
Versao do Fluig: ${fluigVersion}
Score de Compatibilidade: ${analysis.compatibilityScore}%
Riscos (nao homologados + restricoes): ${analysis.riskCount}
Itens nao homologados: ${analysis.nonHomologatedCount}
Itens em analise pela TOTVS: ${analysis.inAnalysisCount || 0}
Itens em atencao: ${analysis.attentionCount}

Resultados da validacao contra a Matriz de Portabilidade Fluig:
${itemsSummary}

${sizingInfo}
${healthInfo}

Responda com um objeto JSON neste formato exato:
{
  "summary": "Resumo executivo conciso do estado do ambiente (2-4 frases)",
  "recommendations": ["Recomendacao 1 com acao especifica", "Recomendacao 2 com acao especifica"]
}

Seja especifico e pratico. Priorize: (1) itens NAO_HOMOLOGADO, (2) sizing inadequado, (3) itens EM_ANALISE, (4) health check critico. Mencione a versao do Fluig quando relevante.`;

  try {
    const response = await fetch('/api/ai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorEntries: [{
          category: 'ENVIRONMENT',
          timestamp: new Date().toISOString(),
          message: prompt,
          causedBy: [],
          contextBefore: [],
          contextAfter: [],
        }],
      }),
    });

    if (!response.ok) throw new Error('API request failed');
    const data = await response.json();
    return {
      summary: data.summary || `Ambiente ${analysis.environmentName} com score de compatibilidade de ${analysis.compatibilityScore}%.`,
      recommendations: data.suggestions || ['Revise os itens nao homologados', 'Verifique o dimensionamento do ambiente'],
    };
  } catch (err) {
    console.error('Erro ao gerar resumo executivo:', err);
    return {
      summary: `Ambiente ${analysis.environmentName} com score de compatibilidade de ${analysis.compatibilityScore}%. ${analysis.riskCount} riscos identificados.`,
      recommendations: ['Revise os itens nao homologados', 'Verifique o dimensionamento do ambiente'],
    };
  }
}

export async function saveExecutiveSummary(analysisId: string, summary: string, recommendations: string[]) {
  const { error } = await supabase
    .from('environment_analyses')
    .update({ executive_summary: summary, recommendations, updated_at: new Date().toISOString() })
    .eq('id', analysisId);

  if (error) console.error('Erro ao salvar resumo:', error.message);
}
