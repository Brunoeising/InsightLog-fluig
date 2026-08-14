import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedContext } from '@/app/api/logs/shared';
import { fetchEnvironmentAnalysis } from '@/lib/environment-service';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const context = await getAuthenticatedContext(request);
  if (context.error) return context.error;

  const analysis = await fetchEnvironmentAnalysis(params.id, context.supabase!);
  if (!analysis) {
    return NextResponse.json({ error: 'Analise nao encontrada.' }, { status: 404 });
  }

  return NextResponse.json({ analysis });
}