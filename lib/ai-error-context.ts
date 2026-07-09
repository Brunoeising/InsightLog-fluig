import { ErrorCategory, LogErrorEntry } from '@/lib/types';

const CRITICAL_TERMS = [
  'outofmemory',
  'heap space',
  'gc overhead',
  'deadlock',
  'timeout',
  'connection pool',
  'blocking-timeout',
  'permission denied',
  'access denied',
  'rollback',
  'failed to start',
  // Fluig-specific critical patterns
  'fluigds',
  'fluigdsro',
  'ja esta sendo executado',
  'classnotfoundexception',
  'nullpointerexception',
  'fdnaccessdenied',
  'unsatisfiedlinkerror',
  'datasetSync',
  'datasetsync',
];

// Category weights tuned for Fluig platform severity — kept as fallback when the DB
// weights aren't provided (callers on the client that can't read the DB, etc.)
const CATEGORY_WEIGHT: Record<string, number> = {
  DATABASE: 20,
  PERFORMANCE: 18,
  BPM: 16,
  INT: 16,
  INFRASTRUCTURE: 14,
  WCM: 14,
  ECM: 12,
  FDN: 12,
  WORKFLOW: 12,
  PERMISSION: 10,
  NETWORK: 10,
  OTHER: 4,
};

// Patterns whose presence in message/causedBy should force inclusion in representative set
const PRIORITY_FINGERPRINT_PATTERNS = [
  /\b(FluigDS|FluigDSRO)\b/,
  /OutOfMemoryError|heap space|GC overhead/i,
  /blocking-timeout-millis/i,
  /DatasetMetaListServiceBean\.datasetSync/i,
  /ja esta sendo executado por/i,
  /ClassNotFoundException/i,
  /FDNAccessDeniedException/i,
  /UnsatisfiedLinkError/i,
  /X11FontManager|FontConfiguration/i,
];

export interface RankedErrorContext {
  error: LogErrorEntry;
  index: number;
  count: number;
  fingerprint: string;
  score: number;
}

export interface ErrorFingerprintSummary {
  fingerprint: string;
  category: ErrorCategory;
  normalizedMessage: string;
  messageSample: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  causedBySamples: string[];
  contextSamples: string[];
  severityScore: number;
}

function hashText(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function normalizeErrorMessage(message: string) {
  return message
    .toLowerCase()
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/g, '<uuid>')
    .replace(/\b\d{4}-\d{2}-\d{2}[t\s]\d{2}:\d{2}:\d{2}(?:[,\.]\d+)?\b/g, '<timestamp>')
    .replace(/\b\d+\b/g, '<number>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

export function createErrorFingerprint(error: Pick<LogErrorEntry, 'category' | 'message' | 'causedBy'>) {
  const category = error.category || 'OTHER';
  const normalizedMessage = normalizeErrorMessage(error.message || '');
  const causedByHead = normalizeErrorMessage(error.causedBy?.[0] || '');
  return `${category}:${hashText(`${normalizedMessage}:${causedByHead}`)}`;
}

export function scoreErrorEvidence(params: {
  category?: string | null;
  message?: string | null;
  causedBy?: string[] | null;
  count?: number;
  categoryWeights?: Record<string, number>;
}) {
  const category = (params.category || 'OTHER').toUpperCase();
  const message = `${params.message || ''} ${(params.causedBy || []).join(' ')}`.toLowerCase();
  const frequencyScore = Math.min(30, Math.log10(Math.max(1, params.count || 1)) * 12);
  const weights = params.categoryWeights;
  const categoryScore = weights
    ? (weights[category] ?? weights.OTHER ?? CATEGORY_WEIGHT.OTHER)
    : (CATEGORY_WEIGHT[category] ?? CATEGORY_WEIGHT.OTHER);
  const causedByScore = Math.min(18, (params.causedBy?.length || 0) * 4);
  const criticalScore = CRITICAL_TERMS.reduce((score, term) => (
    message.includes(term) ? score + 10 : score
  ), 0);

  return Math.round(frequencyScore + categoryScore + causedByScore + criticalScore);
}

function isPriorityError(error: LogErrorEntry): boolean {
  const combined = `${error.message || ''} ${(error.causedBy || []).join(' ')}`;
  return PRIORITY_FINGERPRINT_PATTERNS.some((pattern) => pattern.test(combined));
}

export function selectRepresentativeErrors(
  errors: LogErrorEntry[],
  limit = 24,
  categoryWeights?: Record<string, number>
): RankedErrorContext[] {
  const grouped = new Map<string, RankedErrorContext>();

  errors.forEach((error, index) => {
    const fingerprint = createErrorFingerprint(error);
    const current = grouped.get(fingerprint);
    if (current) {
      current.count += 1;
      current.score = scoreErrorEvidence({
        category: current.error.category,
        message: current.error.message,
        causedBy: current.error.causedBy,
        count: current.count,
        categoryWeights,
      });
      return;
    }

    grouped.set(fingerprint, {
      error,
      index,
      count: 1,
      fingerprint,
      score: scoreErrorEvidence({
        category: error.category,
        message: error.message,
        causedBy: error.causedBy,
        count: 1,
        categoryWeights,
      }),
    });
  });

  const representatives = Array.from(grouped.values()).sort((a, b) => b.score - a.score || b.count - a.count);

  // Priority errors always make the cut first (regardless of score)
  const priority: RankedErrorContext[] = [];
  const rest: RankedErrorContext[] = [];
  for (const item of representatives) {
    if (isPriorityError(item.error)) {
      priority.push(item);
    } else {
      rest.push(item);
    }
  }

  const selected: RankedErrorContext[] = [];
  const usedCategories = new Set<string>();

  // Fill with priority errors first, then category-diverse, then remaining
  for (const item of [...priority, ...rest]) {
    if (selected.length >= limit) break;
    const category = item.error.category || 'OTHER';
    if (!usedCategories.has(category)) {
      selected.push(item);
      usedCategories.add(category);
    }
  }

  for (const item of [...priority, ...rest]) {
    if (selected.length >= limit) break;
    if (!selected.includes(item)) selected.push(item);
  }

  return selected;
}

export function createFingerprintSummaries(
  errors: LogErrorEntry[],
  categoryWeights?: Record<string, number>
) {
  const summaries = new Map<string, ErrorFingerprintSummary>();
  // Track unique samples with Sets to avoid O(n²) .includes() on arrays
  const causedBySets = new Map<string, Set<string>>();
  const contextSets = new Map<string, Set<string>>();

  for (const error of errors) {
    const fingerprint = createErrorFingerprint(error);
    const normalizedMessage = normalizeErrorMessage(error.message);
    const current = summaries.get(fingerprint);
    const causedBySamples = error.causedBy || [];
    const contextSamples = [
      ...(error.contextBefore || []).slice(-2),
      `${error.timestamp} ${error.message}`,
      ...(error.contextAfter || []).slice(0, 2),
    ].filter(Boolean);

    if (!current) {
      const cbSet = new Set(causedBySamples.slice(0, 3));
      const ctxSet = new Set(contextSamples.slice(0, 5));
      causedBySets.set(fingerprint, cbSet);
      contextSets.set(fingerprint, ctxSet);
      summaries.set(fingerprint, {
        fingerprint,
        category: error.category || 'OTHER',
        normalizedMessage,
        messageSample: error.message,
        occurrenceCount: 1,
        firstSeenAt: error.timestamp,
        lastSeenAt: error.timestamp,
        causedBySamples: Array.from(cbSet),
        contextSamples: Array.from(ctxSet),
        severityScore: 0,
      });
      continue;
    }

    current.occurrenceCount += 1;
    if (error.timestamp && (!current.firstSeenAt || error.timestamp < current.firstSeenAt)) current.firstSeenAt = error.timestamp;
    if (error.timestamp && (!current.lastSeenAt || error.timestamp > current.lastSeenAt)) current.lastSeenAt = error.timestamp;

    const cbSet = causedBySets.get(fingerprint)!;
    for (const cause of causedBySamples) {
      if (cbSet.size >= 5) break;
      cbSet.add(cause);
    }

    const ctxSet = contextSets.get(fingerprint)!;
    for (const context of contextSamples) {
      if (ctxSet.size >= 8) break;
      ctxSet.add(context);
    }
  }

  // Sync array views and compute final scores after the loop (not on every update)
  for (const [fingerprint, summary] of summaries) {
    summary.causedBySamples = Array.from(causedBySets.get(fingerprint) || []);
    summary.contextSamples = Array.from(contextSets.get(fingerprint) || []);
    summary.severityScore = scoreErrorEvidence({
      category: summary.category,
      message: summary.messageSample,
      causedBy: summary.causedBySamples,
      count: summary.occurrenceCount,
      categoryWeights,
    });
  }

  return Array.from(summaries.values()).sort((a, b) => b.severityScore - a.severityScore || b.occurrenceCount - a.occurrenceCount);
}
