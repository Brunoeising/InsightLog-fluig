import { NextRequest, NextResponse } from 'next/server';
import { LogEntry, LogErrorEntry, LogErrorFingerprint, PerformanceIssue } from '@/lib/types';
import {
  assertAnalysisOwnership,
  getAuthenticatedContext,
  insertInChunks,
  sanitizeDatabaseText,
  sanitizeTextArray,
} from '../../shared';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

interface PersistBatchBody {
  analysisId?: string;
  batchNumber?: number;
  errors?: LogErrorEntry[];
  warnings?: LogEntry[];
  performanceIssues?: PerformanceIssue[];
  errorFingerprints?: LogErrorFingerprint[];
  totalEntries?: number;
  totalErrors?: number;
  totalWarnings?: number;
  totalPerformanceIssues?: number;
}

function mergeSamples(current?: string[] | null, next?: string[] | null, limit = 8) {
  const merged: string[] = [];
  for (const value of [...(current || []), ...(next || [])]) {
    const sanitized = sanitizeDatabaseText(value);
    if (!sanitized || merged.includes(sanitized)) continue;
    merged.push(sanitized);
    if (merged.length >= limit) break;
  }
  return merged;
}

async function persistErrorFingerprints(
  supabase: NonNullable<Awaited<ReturnType<typeof getAuthenticatedContext>>['supabase']>,
  analysisId: string,
  fingerprints: LogErrorFingerprint[]
) {
  if (fingerprints.length === 0) return;

  const uniqueFingerprints = Array.from(new Set(fingerprints.map((item) => item.fingerprint)));
  const { data: existingRows, error: existingError } = await supabase
    .from('log_error_fingerprints')
    .select('id, fingerprint, occurrence_count, first_seen_at, last_seen_at, caused_by_samples, context_samples, severity_score')
    .eq('analysis_id', analysisId)
    .in('fingerprint', uniqueFingerprints);

  if (existingError) throw existingError;

  const existingByFingerprint = new Map((existingRows || []).map((row) => [row.fingerprint, row]));
  const inserts: any[] = [];
  const updates: Array<{ id: string; values: any }> = [];

  for (const item of fingerprints) {
    const existing = existingByFingerprint.get(item.fingerprint);
    const values = {
      analysis_id: analysisId,
      fingerprint: item.fingerprint,
      category: sanitizeDatabaseText(item.category || 'OTHER') || 'OTHER',
      normalized_message: sanitizeDatabaseText(item.normalizedMessage) || '',
      message_sample: sanitizeDatabaseText(item.messageSample) || '',
      occurrence_count: item.occurrenceCount || 0,
      first_seen_at: sanitizeDatabaseText(item.firstSeenAt),
      last_seen_at: sanitizeDatabaseText(item.lastSeenAt),
      caused_by_samples: sanitizeTextArray(item.causedBySamples),
      context_samples: sanitizeTextArray(item.contextSamples),
      severity_score: item.severityScore || 0,
      updated_at: new Date().toISOString(),
    };

    if (!existing) {
      inserts.push(values);
      continue;
    }

    updates.push({
      id: existing.id,
      values: {
        category: values.category,
        normalized_message: values.normalized_message,
        message_sample: values.message_sample,
        occurrence_count: (existing.occurrence_count || 0) + values.occurrence_count,
        first_seen_at: existing.first_seen_at && values.first_seen_at
          ? (existing.first_seen_at < values.first_seen_at ? existing.first_seen_at : values.first_seen_at)
          : existing.first_seen_at || values.first_seen_at,
        last_seen_at: existing.last_seen_at && values.last_seen_at
          ? (existing.last_seen_at > values.last_seen_at ? existing.last_seen_at : values.last_seen_at)
          : existing.last_seen_at || values.last_seen_at,
        caused_by_samples: mergeSamples(existing.caused_by_samples, values.caused_by_samples, 8),
        context_samples: mergeSamples(existing.context_samples, values.context_samples, 10),
        severity_score: Math.max(existing.severity_score || 0, values.severity_score),
        updated_at: values.updated_at,
      },
    });
  }

  await insertInChunks(inserts, async (chunk) => {
    const { error: insertError } = await supabase.from('log_error_fingerprints').insert(chunk);
    if (insertError) throw insertError;
  });

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from('log_error_fingerprints')
      .update(update.values)
      .eq('id', update.id);
    if (updateError) throw updateError;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error, supabase, user } = await getAuthenticatedContext(request);
    if (error) return error;

    const body = (await request.json()) as PersistBatchBody;
    const analysisId = body.analysisId;
    const batchNumber = Number(body.batchNumber || 0);

    if (!analysisId || !batchNumber) {
      return NextResponse.json({ error: 'Lote inválido para persistência.' }, { status: 400 });
    }

    await assertAnalysisOwnership(supabase!, analysisId, user!.id);

    const { data: insertedBatch, error: batchError } = await supabase!
      .from('log_analysis_batches')
      .insert({
        analysis_id: analysisId,
        batch_number: batchNumber,
        error_count: body.errors?.length || 0,
        warning_count: body.warnings?.length || 0,
        performance_issue_count: body.performanceIssues?.length || 0,
      } as any)
      .select('id')
      .single();

    if (batchError) {
      if (batchError.code === '23505') {
        return NextResponse.json({ skipped: true, reason: 'batch_already_persisted' });
      }
      throw batchError;
    }

    const logEntries = [
      ...(body.errors || []).map((entry) => ({
        analysis_id: analysisId,
        level: 'ERROR',
        message: sanitizeDatabaseText(entry.message),
        timestamp: sanitizeDatabaseText(entry.timestamp),
        category: sanitizeDatabaseText(entry.category || 'OTHER'),
        context_before: sanitizeTextArray(entry.contextBefore),
        context_after: sanitizeTextArray(entry.contextAfter),
        caused_by: sanitizeTextArray(entry.causedBy),
        suggestion: sanitizeDatabaseText(entry.suggestion),
      })),
      ...(body.warnings || []).map((entry) => ({
        analysis_id: analysisId,
        level: 'WARN',
        message: sanitizeDatabaseText(entry.message),
        timestamp: sanitizeDatabaseText(entry.timestamp),
        category: 'OTHER',
        context_before: [],
        context_after: [],
        caused_by: sanitizeTextArray(entry.causedBy),
        suggestion: null,
      })),
    ];

    await insertInChunks(logEntries, async (chunk) => {
      const { error: insertError } = await supabase!.from('log_entries').insert(chunk as any);
      if (insertError) throw insertError;
    });

    await insertInChunks(body.performanceIssues || [], async (chunk) => {
      const { error: insertError } = await supabase!.from('log_performance_issues').insert(
        chunk.map((issue) => ({
          analysis_id: analysisId,
          type: issue.type,
          message: sanitizeDatabaseText(issue.message),
          timestamp: sanitizeDatabaseText(issue.timestamp),
          duration: issue.duration,
          context: sanitizeDatabaseText(issue.context),
          suggestion: sanitizeDatabaseText(issue.suggestion),
        })) as any
      );
      if (insertError) throw insertError;
    });

    await persistErrorFingerprints(supabase!, analysisId, body.errorFingerprints || []);

    const { error: updateError } = await supabase!
      .from('log_analyses')
      .update({
        processing_status: 'PERSISTING',
        parsed_entries_count: body.totalEntries || 0,
        total_errors_in_file: body.totalErrors || 0,
        total_warnings_in_file: body.totalWarnings || 0,
        total_performance_issues_in_file: body.totalPerformanceIssues || 0,
        error_count: body.totalErrors || 0,
        warning_count: body.totalWarnings || 0,
      } as any)
      .eq('id', analysisId)
      .eq('user_id', user!.id);

    if (updateError) throw updateError;

    return NextResponse.json({
      batchId: insertedBatch.id,
      persistedEntries: logEntries.length,
      persistedPerformanceIssues: body.performanceIssues?.length || 0,
    });
  } catch (error: any) {
    console.error('Erro ao persistir lote de log:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Não foi possível persistir o lote do log.' },
      { status: 500 }
    );
  }
}
