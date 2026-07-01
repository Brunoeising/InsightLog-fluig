import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext, sanitizeDatabaseText } from '../../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CreateAnalysisBody {
  fileName?: string;
  fileSize?: number;
}

export async function POST(request: NextRequest) {
  try {
    const { error, supabase, user } = await getAuthenticatedContext(request);
    if (error) return error;

    const body = (await request.json()) as CreateAnalysisBody;
    const fileName = sanitizeDatabaseText(body.fileName);
    const fileSize = Number(body.fileSize || 0);

    if (!fileName || !fileName.endsWith('.log')) {
      return NextResponse.json({ error: 'Por favor, envie um arquivo .log.' }, { status: 400 });
    }

    const { data, error: insertError } = await supabase!
      .from('log_analyses')
      .insert({
        file_name: fileName,
        file_path: null,
        file_url: null,
        uploaded_at: new Date().toISOString(),
        error_count: 0,
        warning_count: 0,
        summary: 'Análise iniciada. O arquivo está sendo lido no navegador e somente os diagnósticos serão persistidos.',
        suggestions: ['Aguarde a conclusão do processamento para consultar os detalhes.'],
        user_id: user!.id,
        processing_status: 'CREATED',
        processing_started_at: new Date().toISOString(),
        total_entries_in_file: 0,
        total_errors_in_file: 0,
        total_warnings_in_file: 0,
        total_performance_issues_in_file: 0,
        parsed_entries_count: 0,
        ai_status: 'SKIPPED',
      } as any)
      .select('id')
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ analysisId: data.id, fileSize });
  } catch (error: any) {
    console.error('Erro ao criar análise:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Não foi possível criar a análise.' },
      { status: 500 }
    );
  }
}
