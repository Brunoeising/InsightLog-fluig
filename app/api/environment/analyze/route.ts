import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedContext } from '@/app/api/logs/shared';
import { normalizeHealthCheckUpload, normalizeInventoryUpload } from '@/lib/environment-normalizer';
import { runEnvironmentAnalysis } from '@/lib/environment-service';
import { SizingInput } from '@/lib/types';

const sizingSchema = z.object({
  registered_users: z.coerce.number().int().min(0).default(0),
  concurrent_users: z.coerce.number().int().min(0).default(0),
  process_count: z.coerce.number().int().min(0).default(0),
  doc_volume: z.coerce.number().int().min(0).default(0),
  dataset_count: z.coerce.number().int().min(0).default(0),
  integration_volume: z.coerce.number().int().min(0).default(0),
});

const requestSchema = z.object({
  environmentName: z.string().trim().min(1, 'Nome do ambiente e obrigatorio'),
  inventory: z.unknown(),
  sizing: sizingSchema,
  healthCheck: z.unknown().optional(),
});

export async function POST(request: NextRequest) {
  const context = await getAuthenticatedContext(request);
  if (context.error) return context.error;

  try {
    const body = await request.json();
    const payload = requestSchema.parse(body);
    const normalizedInventory = normalizeInventoryUpload(payload.inventory);
    const sizing = payload.sizing as SizingInput;
    const normalizedHealth = payload.healthCheck
      ? normalizeHealthCheckUpload(payload.healthCheck).healthCheck
      : undefined;

    const result = await runEnvironmentAnalysis(
      payload.environmentName,
      normalizedInventory.inventory,
      sizing,
      normalizedHealth,
      { supabaseClient: context.supabase!, userId: context.user!.id }
    );

    return NextResponse.json({
      analysisId: result.analysisId,
      compatibilityScore: result.analysis.compatibilityScore,
      riskCount: result.analysis.riskCount,
      nonHomologatedCount: result.analysis.nonHomologatedCount,
      attentionCount: result.analysis.attentionCount,
      sizingStatus: result.analysis.sizingStatus,
      importedFields: normalizedInventory.importedFields,
      ignoredFields: normalizedInventory.ignoredFields,
      source: normalizedInventory.source,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao executar analise de ambiente.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}