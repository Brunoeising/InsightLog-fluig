import { LogAnalysisResult } from '@/lib/types';

const CACHE_PREFIX = 'insightlog.analysis.prefetch.';
const CACHE_TTL_MS = 5 * 60 * 1000;

type CachedAnalysis = {
  cachedAt: number;
  analysis: LogAnalysisResult;
};

function getCacheKey(analysisId: string) {
  return `${CACHE_PREFIX}${analysisId}`;
}

export function writeAnalysisPrefetch(analysis: LogAnalysisResult) {
  if (typeof window === 'undefined' || !analysis.id) return;

  const payload: CachedAnalysis = {
    cachedAt: Date.now(),
    analysis: {
      ...analysis,
      errors: [],
      warnings: [],
      performanceIssues: [],
    },
  };

  try {
    sessionStorage.setItem(getCacheKey(analysis.id), JSON.stringify(payload));
  } catch {
    // Ignore quota errors; this cache is only an opportunistic speed-up.
  }
}

export function readAnalysisPrefetch(analysisId: string) {
  if (typeof window === 'undefined') return null;

  try {
    const raw = sessionStorage.getItem(getCacheKey(analysisId));
    if (!raw) return null;

    const payload = JSON.parse(raw) as CachedAnalysis;
    if (!payload?.analysis || Date.now() - payload.cachedAt > CACHE_TTL_MS) {
      sessionStorage.removeItem(getCacheKey(analysisId));
      return null;
    }

    return payload.analysis;
  } catch {
    sessionStorage.removeItem(getCacheKey(analysisId));
    return null;
  }
}
