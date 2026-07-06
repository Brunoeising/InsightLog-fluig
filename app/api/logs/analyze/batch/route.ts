import { NextRequest, NextResponse } from 'next/server';
import { LogEntry, LogErrorEntry, PerformanceIssue } from '@/lib/types';
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
  totalEntries?: number;
  totalErrors?: number;
  totalWarnings?: number;
  totalPerformanceIssues?: number;
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

    await Promise.all([
      insertInChunks(logEntries, async (chunk) => {
        const { error: insertError } = await supabase!.from('log_entries').insert(chunk as any);
        if (insertError) throw insertError;
      }),
      insertInChunks(body.performanceIssues || [], async (chunk) => {
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
      }),
    ]);

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
