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
];

const CATEGORY_WEIGHT: Record<string, number> = {
  DATABASE: 18,
  PERFORMANCE: 16,
  INFRASTRUCTURE: 14,
  WORKFLOW: 12,
  PERMISSION: 10,
  NETWORK: 10,
  OTHER: 4,
};

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
}) {
  const category = params.category || 'OTHER';
  const message = `${params.message || ''} ${(params.causedBy || []).join(' ')}`.toLowerCase();
  const frequencyScore = Math.min(30, Math.log10(Math.max(1, params.count || 1)) * 12);
  const categoryScore = CATEGORY_WEIGHT[category] ?? CATEGORY_WEIGHT.OTHER;
  const causedByScore = Math.min(18, (params.causedBy?.length || 0) * 4);
  const criticalScore = CRITICAL_TERMS.reduce((score, term) => (
    message.includes(term) ? score + 10 : score
  ), 0);

  return Math.round(frequencyScore + categoryScore + causedByScore + criticalScore);
}

export function selectRepresentativeErrors(errors: LogErrorEntry[], limit = 24): RankedErrorContext[] {
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
      }),
    });
  });

  const representatives = Array.from(grouped.values()).sort((a, b) => b.score - a.score || b.count - a.count);
  const selected: RankedErrorContext[] = [];
  const usedCategories = new Set<string>();

  for (const item of representatives) {
    if (selected.length >= limit) break;
    const category = item.error.category || 'OTHER';
    if (!usedCategories.has(category)) {
      selected.push(item);
      usedCategories.add(category);
    }
  }

  for (const item of representatives) {
    if (selected.length >= limit) break;
    if (!selected.includes(item)) selected.push(item);
  }

  return selected;
}

export function createFingerprintSummaries(errors: LogErrorEntry[]) {
  const summaries = new Map<string, ErrorFingerprintSummary>();

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
      summaries.set(fingerprint, {
        fingerprint,
        category: error.category || 'OTHER',
        normalizedMessage,
        messageSample: error.message,
        occurrenceCount: 1,
        firstSeenAt: error.timestamp,
        lastSeenAt: error.timestamp,
        causedBySamples: causedBySamples.slice(0, 3),
        contextSamples: contextSamples.slice(0, 5),
        severityScore: scoreErrorEvidence({
          category: error.category,
          message: error.message,
          causedBy: error.causedBy,
          count: 1,
        }),
      });
      continue;
    }

    current.occurrenceCount += 1;
    if (error.timestamp && (!current.firstSeenAt || error.timestamp < current.firstSeenAt)) current.firstSeenAt = error.timestamp;
    if (error.timestamp && (!current.lastSeenAt || error.timestamp > current.lastSeenAt)) current.lastSeenAt = error.timestamp;
    for (const cause of causedBySamples) {
      if (current.causedBySamples.length >= 5) break;
      if (!current.causedBySamples.includes(cause)) current.causedBySamples.push(cause);
    }
    for (const context of contextSamples) {
      if (current.contextSamples.length >= 8) break;
      if (!current.contextSamples.includes(context)) current.contextSamples.push(context);
    }
    current.severityScore = scoreErrorEvidence({
      category: current.category,
      message: current.messageSample,
      causedBy: current.causedBySamples,
      count: current.occurrenceCount,
    });
  }

  return Array.from(summaries.values()).sort((a, b) => b.severityScore - a.severityScore || b.occurrenceCount - a.occurrenceCount);
}
