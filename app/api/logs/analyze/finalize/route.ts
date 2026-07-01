import { NextRequest, NextResponse } from 'next/server';
import { LogErrorEntry, SystemInfo } from '@/lib/types';
import {
  assertAnalysisOwnership,
  getAuthenticatedContext,
  sanitizeDatabaseText,
  sanitizeTextArray,
} from '../../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface FinalizeAnalysisBody {
  analysisId?: string;
  totalEntries?: number;
  totalErrors?: number;
  totalWarnings?: number;
  totalPerformanceIssues?: number;
  persistedErrors?: number;
  persistedWarnings?: number;
  persistedPerformanceIssues?: number;
  hasMoreErrors?: boolean;
  hasMoreWarnings?: boolean;
  hasMorePerformanceIssues?: boolean;
  systemInfo?: SystemInfo;
  errorSampleForAi?: LogErrorEntry[];
  parseDurationMs?: number;
}

function createSummary(body: FinalizeAnalysisBody) {
  return `Análise local concluída. O arquivo foi lido integralmente no navegador: ${body.totalErrors || 0} erros, ${body.totalWarnings || 0} alertas e ${body.totalPerformanceIssues || 0} indícios de performance encontrados.`;
}

function createSuggestions(body: FinalizeAnalysisBody) {
  const suggestions = [
    'Priorize as categorias com maior volume de erros e valide os eventos mais recentes primeiro.',
    'Use o chat da análise para aprofundar a investigação com base nos erros persistidos.',
  ];

  if (body.hasMoreErrors || body.hasMoreWarnings || body.hasMorePerformanceIssues) {
    suggestions.push('A leitura foi integral, mas a persistência foi limitada para manter performance e custo sob controle. Use os contadores totais como referência de volume.');
  }

  return suggestions;
}

export async function POST(request: NextRequest) {
  try {
    const { error, supabase, user } = await getAuthenticatedContext(request);
    if (error) return error;

    const body = (await request.json()) as FinalizeAnalysisBody;
    const analysisId = body.analysisId;

    if (!analysisId) {
      return NextResponse.json({ error: 'Análise não informada para finalização.' }, { status: 400 });
    }

    await assertAnalysisOwnership(supabase!, analysisId, user!.id);

    const systemInfo = body.systemInfo || {};
    const { error: updateError } = await supabase!
      .from('log_analyses')
      .update({
        processing_status: 'COMPLETED',
        processing_completed_at: new Date().toISOString(),
        total_entries_in_file: body.totalEntries || 0,
        total_errors_in_file: body.totalErrors || 0,
        total_warnings_in_file: body.totalWarnings || 0,
        total_performance_issues_in_file: body.totalPerformanceIssues || 0,
        parsed_entries_count: body.totalEntries || 0,
        error_count: body.totalErrors || 0,
        warning_count: body.totalWarnings || 0,
        summary: sanitizeDatabaseText(createSummary(body)),
        suggestions: sanitizeTextArray(createSuggestions(body)),
        ai_status: 'SKIPPED',
        parse_duration_ms: body.parseDurationMs || null,
        fluig_version: sanitizeDatabaseText(systemInfo.fluig_version),
        os_name: sanitizeDatabaseText(systemInfo.os_name),
        server_type: sanitizeDatabaseText(systemInfo.server_type),
        database_name: sanitizeDatabaseText(systemInfo.database_name),
        database_version: sanitizeDatabaseText(systemInfo.database_version),
        server_url: sanitizeDatabaseText(systemInfo.server_url),
        java_version: sanitizeDatabaseText(systemInfo.java_version),
        solr_enabled: systemInfo.solr_enabled,
        ls_enabled: systemInfo.ls_enabled,
      } as any)
      .eq('id', analysisId)
      .eq('user_id', user!.id);

    if (updateError) throw updateError;

    return NextResponse.json({ analysisId, status: 'COMPLETED' });
  } catch (error: any) {
    console.error('Erro ao finalizar análise local:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Não foi possível finalizar a análise.' },
      { status: 500 }
    );
  }
}
