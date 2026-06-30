import { supabase, getCurrentUser } from './supabase-client';
import { validateInventory, getCompatibilityScore, countByStatus, ValidationItem } from './rule-engine';
import { runSizingSimulation } from './sizing-engine';
import { EnvironmentInventory, EnvironmentItem, SizingInput, EnvironmentAnalysis, SizingResultData, HealthCheckData } from './types';

export async function runEnvironmentAnalysis(
  environmentName: string,
  inventory: EnvironmentInventory,
  sizingInput: SizingInput,
  healthCheckRaw?: Partial<HealthCheckData>
): Promise<{ analysisId: string; analysis: EnvironmentAnalysis }> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Usuario nao autenticado');

  const inventoryRecord: Record<string, string> = {};
  Object.entries(inventory).forEach(([key, value]) => {
    inventoryRecord[key] = String(value || '');
  });

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
  const attentionCount = counts.inValidation + counts.notIdentified;

  const { data: analysisRow, error: analysisError } = await supabase
    .from('environment_analyses')
    .insert({
      environment_name: environmentName,
      status: 'completed',
      compatibility_score: score,
      risk_count: riskCount,
      non_homologated_count: counts.notHomologated,
      attention_count: attentionCount,
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

  const { error: itemsError } = await supabase
    .from('environment_items')
    .insert(itemInserts);

  if (itemsError) console.error('Erro ao salvar itens:', itemsError.message);

  const { error: sizingError } = await supabase
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
      current_cpu: `${currentCpu} vCPU`,
      current_ram: `${currentRam} GB`,
      current_disk: `${currentDisk} GB`,
      sizing_status: sizingResult.sizing_status,
    });

  if (sizingError) console.error('Erro ao salvar sizing:', sizingError.message);

  let healthCheckData: HealthCheckData | undefined;
  if (healthCheckRaw) {
    const { data: healthRow, error: healthError } = await supabase
      .from('health_check_results')
      .insert({
        analysis_id: analysisId,
        heap_usage: healthCheckRaw.heapUsage ?? null,
        cpu_usage: healthCheckRaw.cpuUsage ?? null,
        memory_usage: healthCheckRaw.memoryUsage ?? null,
        disk_usage: healthCheckRaw.diskUsage ?? null,
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
        servicesStatus: healthRow.services_status,
        aiInterpretation: healthRow.ai_interpretation,
      };
    }
  }

  await supabase.from('audit_logs').insert({
    action: 'environment_analysis',
    environment_name: environmentName,
    result_summary: `Score: ${score}% | Riscos: ${riskCount} | Sizing: ${sizingResult.sizing_status}`,
  });

  const analysis: EnvironmentAnalysis = {
    id: analysisId,
    userId: user.id,
    environmentName,
    status: 'completed',
    compatibilityScore: score,
    riskCount,
    nonHomologatedCount: counts.notHomologated,
    attentionCount,
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
      currentCpu: `${currentCpu} vCPU`,
      currentRam: `${currentRam} GB`,
      currentDisk: `${currentDisk} GB`,
      sizingStatus: sizingResult.sizing_status as any,
      profile: sizingResult.profile,
    },
    healthCheck: healthCheckData,
  };

  return { analysisId, analysis };
}

export async function fetchEnvironmentAnalysis(analysisId: string): Promise<EnvironmentAnalysis | null> {
  const { data: analysisRow, error } = await supabase
    .from('environment_analyses')
    .select('*')
    .eq('id', analysisId)
    .maybeSingle();

  if (error || !analysisRow) return null;

  const { data: items } = await supabase
    .from('environment_items')
    .select('*')
    .eq('analysis_id', analysisId);

  const { data: sizing } = await supabase
    .from('sizing_results')
    .select('*')
    .eq('analysis_id', analysisId)
    .maybeSingle();

  const { data: health } = await supabase
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
      currentCpu: sizing.current_cpu,
      currentRam: sizing.current_ram,
      currentDisk: sizing.current_disk,
      sizingStatus: sizing.sizing_status,
      profile: '',
    } : undefined,
    healthCheck: health ? {
      id: health.id,
      analysisId: health.analysis_id,
      heapUsage: health.heap_usage,
      cpuUsage: health.cpu_usage,
      memoryUsage: health.memory_usage,
      diskUsage: health.disk_usage,
      servicesStatus: health.services_status,
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
    .select('id, environment_name, status, compatibility_score, risk_count, non_homologated_count, sizing_status, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  return { analyses: data || [], total: count || 0 };
}

export async function generateExecutiveSummary(analysis: EnvironmentAnalysis): Promise<{ summary: string; recommendations: string[] }> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY!);

  const itemsSummary = analysis.items.map(item =>
    `- ${item.label}: ${item.collectedValue || 'Nao informado'} -> ${item.status}${item.notes ? ` (${item.notes})` : ''}`
  ).join('\n');

  const sizingInfo = analysis.sizing
    ? `Dimensionamento: ${analysis.sizing.sizingStatus} | Recomendado: ${analysis.sizing.recommendedCpu}, ${analysis.sizing.recommendedRam}, ${analysis.sizing.recommendedDisk} | Atual: ${analysis.sizing.currentCpu}, ${analysis.sizing.currentRam}, ${analysis.sizing.currentDisk}`
    : 'Sem dados de dimensionamento';

  const healthInfo = analysis.healthCheck
    ? `Health Check: Heap ${analysis.healthCheck.heapUsage}%, CPU ${analysis.healthCheck.cpuUsage}%, Memoria ${analysis.healthCheck.memoryUsage}%, Disco ${analysis.healthCheck.diskUsage}%`
    : 'Sem dados de health check';

  const prompt = `Voce e um especialista em analise de ambientes Fluig. Gere um resumo executivo e recomendacoes baseadas nos dados abaixo.

Ambiente: ${analysis.environmentName}
Score de Compatibilidade: ${analysis.compatibilityScore}%
Riscos: ${analysis.riskCount}
Itens nao homologados: ${analysis.nonHomologatedCount}
Itens em atencao: ${analysis.attentionCount}

Resultados da validacao:
${itemsSummary}

${sizingInfo}
${healthInfo}

Responda com um objeto JSON neste formato exato:
{
  "summary": "Resumo executivo conciso do estado do ambiente",
  "recommendations": ["Recomendacao 1", "Recomendacao 2", "..."]
}

Seja especifico e pratico. Foque nos riscos mais criticos primeiro.`;

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { maxOutputTokens: 1000, temperature: 0.7 },
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json\n/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text);
    return { summary: parsed.summary || '', recommendations: parsed.recommendations || [] };
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
