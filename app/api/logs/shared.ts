import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/lib/database.types';

export const INSERT_CHUNK_SIZE = 1000;

export function sanitizeDatabaseText(value?: string | null) {
  if (!value) return value ?? null;
  // Remove literal \u0000 escape sequences (from JSON-encoded text)
  let result = value.includes('\\u0000') ? value.replace(/\\u0000/gi, '') : value;
  // Remove null bytes, control chars, and lone surrogates in a single pass
  return result.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uD800-\uDFFF]/g, '');
}

export function sanitizeTextArray(values?: string[] | null) {
  return (values || [])
    .map((value) => sanitizeDatabaseText(value))
    .filter((value): value is string => Boolean(value));
}

export async function insertInChunks<T>(items: T[], insert: (chunk: T[]) => Promise<void>, chunkSize = INSERT_CHUNK_SIZE) {
  for (let index = 0; index < items.length; index += chunkSize) {
    await insert(items.slice(index, index + chunkSize));
  }
}

export function createAuthenticatedSupabase(token: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

export async function getAuthenticatedContext(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!token) {
    return {
      error: NextResponse.json({ error: 'Usuário não autenticado.' }, { status: 401 }),
      token: null,
      supabase: null,
      user: null,
    };
  }

  const supabase = createAuthenticatedSupabase(token);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return {
      error: NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 }),
      token: null,
      supabase: null,
      user: null,
    };
  }

  return {
    error: null,
    token,
    supabase,
    user: userData.user,
  };
}

export async function assertAnalysisOwnership(supabase: SupabaseClient<Database>, analysisId: string, userId: string) {
  const { data, error } = await supabase
    .from('log_analyses')
    .select('id')
    .eq('id', analysisId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    throw new Error('Análise não encontrada para o usuário autenticado.');
  }
}
