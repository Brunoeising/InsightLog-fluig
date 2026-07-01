import { NextRequest, NextResponse } from 'next/server';
import { loadErrorCategories } from '@/lib/log-categorizer';
import { getAuthenticatedContext } from '../shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error, supabase, user } = await getAuthenticatedContext(request);
    if (error) return error;

    const categories = await loadErrorCategories(user!.id, supabase!);
    return NextResponse.json({ categories });
  } catch (error: any) {
    console.error('Erro ao carregar categorias:', error?.message || error);
    return NextResponse.json(
      { error: error?.message || 'Não foi possível carregar categorias.' },
      { status: 500 }
    );
  }
}
