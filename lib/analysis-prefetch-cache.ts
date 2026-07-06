import { LogAnalysisResult } from '@/lib/types';

const PREFETCH_PREFIX = 'insightlog.analysis.prefetch.';
const FULL_PREFIX = 'insightlog.analysis.full.';
const PREFETCH_TTL_MS = 5 * 60 * 1000;
const FULL_TTL_MS = 10 * 60 * 1000;

type CachedPayload<T> = { cachedAt: number } & T;

function readCached<T>(key: string, ttl: number): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const payload = JSON.parse(raw) as CachedPayload<T>;
    if (!payload || Date.now() - payload.cachedAt > ttl) {
      sessionStorage.removeItem(key);
      return null;
    }
    return payload as T;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

// ─── Prefetch cache (metadata only, used by history hover prefetch) ───────────

export function writeAnalysisPrefetch(analysis: LogAnalysisResult) {
  if (typeof window === 'undefined' || !analysis.id) return;
  try {
    sessionStorage.setItem(
      `${PREFETCH_PREFIX}${analysis.id}`,
      JSON.stringify({ cachedAt: Date.now(), analysis: { ...analysis, errors: [], warnings: [], performanceIssues: [] } }),
    );
  } catch { /* quota non-fatal */ }
}

export function readAnalysisPrefetch(analysisId: string): LogAnalysisResult | null {
  const payload = readCached<{ analysis: LogAnalysisResult }>(`${PREFETCH_PREFIX}${analysisId}`, PREFETCH_TTL_MS);
  return payload?.analysis ?? null;
}

// ─── Full cache (complete analysis + categories, skips all Supabase queries) ──

export function writeFullAnalysisCache(
  analysis: LogAnalysisResult,
  categoryMap: Record<string, { name: string; color?: string }>,
) {
  if (typeof window === 'undefined' || !analysis.id) return;
  try {
    sessionStorage.setItem(
      `${FULL_PREFIX}${analysis.id}`,
      JSON.stringify({ cachedAt: Date.now(), analysis, categoryMap }),
    );
  } catch { /* large analyses may exceed quota — skip silently */ }
}

export function readFullAnalysisCache(analysisId: string): {
  analysis: LogAnalysisResult;
  categoryMap: Record<string, { name: string; color?: string }>;
} | null {
  const payload = readCached<{ analysis: LogAnalysisResult; categoryMap: Record<string, { name: string; color?: string }> }>(
    `${FULL_PREFIX}${analysisId}`,
    FULL_TTL_MS,
  );
  if (!payload?.analysis) return null;
  return { analysis: payload.analysis, categoryMap: payload.categoryMap ?? {} };
}

export function invalidateAnalysisCache(analysisId: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(`${PREFETCH_PREFIX}${analysisId}`);
  sessionStorage.removeItem(`${FULL_PREFIX}${analysisId}`);
}
