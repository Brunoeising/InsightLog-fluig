import { ErrorCategory, LogEntry, LogErrorEntry, PerformanceIssue, SystemInfo } from './types';
import { ErrorCategoryDefinition } from './log-categorizer';
import { ErrorFingerprintSummary, createErrorFingerprint, normalizeErrorMessage, scoreErrorEvidence } from './ai-error-context';
import { getPerformanceIssuesForEntry } from './performance-detector';

const TIMESTAMP_REGEX = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(,\d{3})?/;
const ERROR_PATTERN = /\bERROR\b/;
const WARN_PATTERN = /\bWARN\b/;
const CAUSED_BY_PATTERN = /Caused by:/;
const MAX_ERROR_ENTRIES = 15000;
const MAX_WARNING_ENTRIES = 2000;
const MAX_PERFORMANCE_ISSUES = 5000;
// Reduced from 5 — matches what we send to the server anyway (truncated to 3 in upload-button)
const CONTEXT_LINES = 3;
const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024;
// Kept small to stay well under Vercel's 4.5 MB request body limit per batch
const DEFAULT_BATCH_SIZE = 400;

interface PendingErrorContext {
  error: LogErrorEntry;
  remaining: number;
}

export interface ChunkedLogBatch {
  batchNumber: number;
  errors: LogErrorEntry[];
  warnings: LogEntry[];
  performanceIssues: PerformanceIssue[];
  parsedBytes: number;
  totalBytes: number;
  totalErrors: number;
  totalWarnings: number;
  totalPerformanceIssues: number;
  totalEntries: number;
  systemInfo: SystemInfo;
}

export interface ChunkedLogSummary {
  fileSize: number;
  totalEntries: number;
  totalErrors: number;
  totalWarnings: number;
  totalPerformanceIssues: number;
  persistedErrors: number;
  persistedWarnings: number;
  persistedPerformanceIssues: number;
  hasMoreErrors: boolean;
  hasMoreWarnings: boolean;
  hasMorePerformanceIssues: boolean;
  systemInfo: SystemInfo;
  errorSampleForAi: LogErrorEntry[];
  errorFingerprints: ErrorFingerprintSummary[];
  parseDurationMs: number;
}

export interface ParseLargeLogOptions {
  file: File;
  categories: ErrorCategoryDefinition[];
  chunkSize?: number;
  batchSize?: number;
  onBatch: (batch: ChunkedLogBatch) => Promise<void> | void;
  onProgress?: (progress: { parsedBytes: number; totalBytes: number; percent: number }) => void;
}

function sanitizeText(value: string) {
  let result = value.includes('\\u0000') ? value.replace(/\\u0000/gi, '') : value;
  return result.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uD800-\uDFFF]/g, '');
}

function getEntryContext(entry: LogEntry) {
  return `${entry.timestamp} ${entry.message}`;
}

function updateSystemInfoFromLine(systemInfo: SystemInfo, line: string) {
  const patterns: Array<[keyof SystemInfo, RegExp, number?]> = [
    ['fluig_version', /FLUIG_VERSION.*?=\s*(.+?)(?=\s*$)/],
    ['os_name', /OS_NAME.*?=\s*(.+?)(?=\s*$)/],
    ['server_type', /SERVER_TYPE.*?=\s*(.+?)(?=\s*$)/],
    ['database_name', /DATABASE_NAME.*?=\s*(.+?)(?=\s*$)/],
    ['database_version', /DATABASE_VERSION.*?=\s*(.+?)(?=\s*$)/],
    ['server_url', /SERVER_URL.*?=\s*(.+?)(?=\s*$)/],
    ['java_version', /(JAVA_HOME|JAVA_VERSION).*?=\s*(.+?)(?=\s*$)/, 2],
  ];

  for (const [key, pattern, group = 1] of patterns) {
    if (systemInfo[key] !== undefined) continue;
    const match = line.match(pattern);
    if (match) {
      (systemInfo as Record<string, unknown>)[key] = match[group].trim();
    }
  }

  if (systemInfo.ls_enabled === undefined) {
    const match = line.match(/LS_ENABLED.*?=\s*(.+?)(?=\s*$)/);
    if (match) systemInfo.ls_enabled = match[1].trim().toLowerCase() === 'true';
  }

  if (systemInfo.solr_enabled === undefined) {
    const match = line.match(/(SOLR_ENABLED|SOLR_CLOUD).*?=\s*(.+?)(?=\s*$)/);
    if (match) systemInfo.solr_enabled = match[2].trim().toLowerCase() === 'true';
  }
}

function categorizeMessage(message: string, categories: ErrorCategoryDefinition[]): ErrorCategory {
  const lowerMessage = message.toLowerCase();
  const category = categories.find((item) => item.terms?.some((term) => lowerMessage.includes(term.toLowerCase())));
  return (category?.name as ErrorCategory) || 'OTHER';
}

function createEntryFromTimestampLine(line: string, timestampMatch: RegExpMatchArray): LogEntry {
  const timestamp = timestampMatch[0];
  const messagePart = line.substring(line.indexOf(timestamp) + timestamp.length).trim();
  const level: LogEntry['level'] = ERROR_PATTERN.test(messagePart)
    ? 'ERROR'
    : WARN_PATTERN.test(messagePart)
      ? 'WARN'
      : 'INFO';

  return {
    timestamp,
    level,
    message: messagePart,
    causedBy: [],
  };
}

function selectErrorSample(currentSample: LogErrorEntry[], candidate: LogErrorEntry) {
  const maxSample = 20;
  if (currentSample.length < maxSample) {
    currentSample.push(candidate);
    return;
  }

  const hasCategory = currentSample.some((error) => error.category === candidate.category);
  if (!hasCategory) {
    currentSample[currentSample.length - 1] = candidate;
  }
}

// Update the incremental fingerprint Map with a new error entry.
// This replaces the old fingerprintQueue + createFingerprintSummaries-per-batch pattern:
// instead of accumulating full LogErrorEntry objects and reprocessing them at batch time,
// we maintain aggregated summaries inline — O(1) per error instead of O(n) per batch.
function updateFingerprintMap(
  fingerprintMap: Map<string, ErrorFingerprintSummary>,
  causedBySets: Map<string, Set<string>>,
  contextSets: Map<string, Set<string>>,
  entry: LogErrorEntry,
) {
  const fingerprint = createErrorFingerprint(entry);
  const existing = fingerprintMap.get(fingerprint);
  const causedBySamples = entry.causedBy || [];
  const contextSamples = [
    ...(entry.contextBefore || []).slice(-2),
    `${entry.timestamp} ${entry.message}`,
    ...(entry.contextAfter || []).slice(0, 2),
  ].filter(Boolean);

  if (!existing) {
    const cbSet = new Set(causedBySamples.slice(0, 3));
    const ctxSet = new Set(contextSamples.slice(0, 5));
    causedBySets.set(fingerprint, cbSet);
    contextSets.set(fingerprint, ctxSet);
    fingerprintMap.set(fingerprint, {
      fingerprint,
      category: entry.category || 'OTHER',
      normalizedMessage: normalizeErrorMessage(entry.message || ''),
      messageSample: entry.message || '',
      occurrenceCount: 1,
      firstSeenAt: entry.timestamp,
      lastSeenAt: entry.timestamp,
      causedBySamples: Array.from(cbSet),
      contextSamples: Array.from(ctxSet),
      severityScore: 0,
    });
    return;
  }

  existing.occurrenceCount += 1;
  if (entry.timestamp && (!existing.firstSeenAt || entry.timestamp < existing.firstSeenAt)) existing.firstSeenAt = entry.timestamp;
  if (entry.timestamp && (!existing.lastSeenAt || entry.timestamp > existing.lastSeenAt)) existing.lastSeenAt = entry.timestamp;

  const cbSet = causedBySets.get(fingerprint)!;
  for (const cause of causedBySamples) {
    if (cbSet.size >= 5) break;
    cbSet.add(cause);
  }

  const ctxSet = contextSets.get(fingerprint)!;
  for (const ctx of contextSamples) {
    if (ctxSet.size >= 8) break;
    ctxSet.add(ctx);
  }

  existing.causedBySamples = Array.from(cbSet);
  existing.contextSamples = Array.from(ctxSet);
}

// Compute final severity scores and return all summaries sorted by score.
function snapshotFingerprintMap(fingerprintMap: Map<string, ErrorFingerprintSummary>): ErrorFingerprintSummary[] {
  const summaries = Array.from(fingerprintMap.values());
  for (const s of summaries) {
    s.severityScore = scoreErrorEvidence({
      category: s.category,
      message: s.messageSample,
      causedBy: s.causedBySamples,
      count: s.occurrenceCount,
    });
  }
  return summaries.sort((a, b) => b.severityScore - a.severityScore || b.occurrenceCount - a.occurrenceCount);
}

export async function parseLargeLogFile({
  file,
  categories,
  chunkSize = DEFAULT_CHUNK_SIZE,
  batchSize = DEFAULT_BATCH_SIZE,
  onBatch,
  onProgress,
}: ParseLargeLogOptions): Promise<ChunkedLogSummary> {
  const startedAt = Date.now();
  const decoder = new TextDecoder('utf-8');
  const systemInfo: SystemInfo = {};
  const previousEntries: string[] = [];
  const pendingErrors: PendingErrorContext[] = [];
  const errorQueue: LogErrorEntry[] = [];
  const warningQueue: LogEntry[] = [];
  const performanceQueue: PerformanceIssue[] = [];
  // Incremental fingerprint state — updated on every error, never grows unboundedly
  const fingerprintMap = new Map<string, ErrorFingerprintSummary>();
  const causedBySets = new Map<string, Set<string>>();
  const contextSets = new Map<string, Set<string>>();
  const errorSampleForAi: LogErrorEntry[] = [];
  const seenOnceTypes = new Set<string>();
  let currentEntry: LogEntry | null = null;
  let causedByLines: string[] = [];
  let previousContext = '';
  let remainder = '';
  let batchNumber = 1;
  let totalEntries = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalPerformanceIssues = 0;
  let persistedErrors = 0;
  let persistedWarnings = 0;
  let persistedPerformanceIssues = 0;

  const completeCurrentEntryCauses = () => {
    if (currentEntry && causedByLines.length > 0) {
      currentEntry.causedBy = causedByLines;
      causedByLines = [];
    }
  };

  const queueCompletedPendingErrors = (force = false) => {
    for (let index = pendingErrors.length - 1; index >= 0; index--) {
      const pending = pendingErrors[index];
      if (force || pending.remaining <= 0) {
        if (persistedErrors + errorQueue.length < MAX_ERROR_ENTRIES) {
          errorQueue.push(pending.error);
        }
        pendingErrors.splice(index, 1);
      }
    }
  };

  const addEntryToPendingErrorContext = (entry: LogEntry) => {
    const context = getEntryContext(entry);
    for (const pending of pendingErrors) {
      if (pending.remaining <= 0) continue;
      pending.error.contextAfter.push(context);
      pending.remaining -= 1;
    }
    queueCompletedPendingErrors();
  };

  const emitBatchIfNeeded = async (force = false, parsedBytes = file.size) => {
    if (!force && errorQueue.length + warningQueue.length + performanceQueue.length < batchSize) {
      return;
    }

    if (errorQueue.length === 0 && warningQueue.length === 0 && performanceQueue.length === 0) {
      return;
    }

    const errors = errorQueue.splice(0, batchSize);
    const remainingSlots = Math.max(0, batchSize - errors.length);
    const warnings = warningQueue.splice(0, remainingSlots);
    const perfSlots = Math.max(0, batchSize - errors.length - warnings.length);
    const performanceIssues = performanceQueue.splice(0, perfSlots || batchSize);

    await onBatch({
      batchNumber: batchNumber++,
      errors,
      warnings,
      performanceIssues,
      parsedBytes,
      totalBytes: file.size,
      totalErrors,
      totalWarnings,
      totalPerformanceIssues,
      totalEntries,
      systemInfo,
    });

    persistedErrors += errors.length;
    persistedWarnings += warnings.length;
    persistedPerformanceIssues += performanceIssues.length;
  };

  const finalizeEntry = async (entry: LogEntry, parsedBytes: number) => {
    totalEntries += 1;
    addEntryToPendingErrorContext(entry);

    if (entry.level === 'ERROR') {
      totalErrors += 1;
      const errorEntry: LogErrorEntry = {
        ...entry,
        category: categorizeMessage(entry.message, categories),
        contextBefore: previousEntries.slice(),
        contextAfter: [],
        causedBy: entry.causedBy || [],
      };

      // Always update the fingerprint Map for accurate counts regardless of entry cap
      updateFingerprintMap(fingerprintMap, causedBySets, contextSets, errorEntry);

      if (persistedErrors + errorQueue.length + pendingErrors.length < MAX_ERROR_ENTRIES) {
        pendingErrors.push({ error: errorEntry, remaining: CONTEXT_LINES });
        selectErrorSample(errorSampleForAi, errorEntry);
      }
    } else if (entry.level === 'WARN') {
      totalWarnings += 1;
      if (persistedWarnings + warningQueue.length < MAX_WARNING_ENTRIES) {
        warningQueue.push(entry);
      }
    }

    if (persistedPerformanceIssues + performanceQueue.length < MAX_PERFORMANCE_ISSUES) {
      const issues = getPerformanceIssuesForEntry(entry, previousContext, seenOnceTypes);
      totalPerformanceIssues += issues.length;
      const availableSlots = MAX_PERFORMANCE_ISSUES - persistedPerformanceIssues - performanceQueue.length;
      performanceQueue.push(...issues.slice(0, availableSlots));
    }

    previousContext = entry.message;
    previousEntries.push(getEntryContext(entry));
    if (previousEntries.length > CONTEXT_LINES) {
      previousEntries.shift();
    }

    await emitBatchIfNeeded(false, parsedBytes);
  };

  const processLine = async (rawLine: string, parsedBytes: number) => {
    const line = sanitizeText(rawLine).trim();
    if (!line) return;

    updateSystemInfoFromLine(systemInfo, line);

    const timestampMatch = line.match(TIMESTAMP_REGEX);
    if (timestampMatch) {
      completeCurrentEntryCauses();
      if (currentEntry) {
        await finalizeEntry(currentEntry, parsedBytes);
      }
      currentEntry = createEntryFromTimestampLine(line, timestampMatch);
      return;
    }

    if (CAUSED_BY_PATTERN.test(line) && currentEntry) {
      causedByLines.push(line.replace('Caused by:', '').trim());
    }
  };

  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const chunk = file.slice(offset, Math.min(file.size, offset + chunkSize));
    const text = decoder.decode(await chunk.arrayBuffer(), { stream: offset + chunkSize < file.size });
    const combined = remainder + text;
    const lines = combined.split(/\r?\n/);
    remainder = lines.pop() || '';
    const parsedBytes = Math.min(file.size, offset + chunkSize);

    for (const line of lines) {
      await processLine(line, parsedBytes);
    }

    onProgress?.({
      parsedBytes,
      totalBytes: file.size,
      percent: Math.round((parsedBytes / file.size) * 100),
    });
  }

  if (remainder) {
    await processLine(remainder, file.size);
  }

  completeCurrentEntryCauses();
  if (currentEntry) {
    await finalizeEntry(currentEntry, file.size);
  }
  queueCompletedPendingErrors(true);
  await emitBatchIfNeeded(true, file.size);

  return {
    fileSize: file.size,
    totalEntries,
    totalErrors,
    totalWarnings,
    totalPerformanceIssues,
    persistedErrors,
    persistedWarnings,
    persistedPerformanceIssues,
    hasMoreErrors: totalErrors > persistedErrors,
    hasMoreWarnings: totalWarnings > persistedWarnings,
    hasMorePerformanceIssues: persistedPerformanceIssues >= MAX_PERFORMANCE_ISSUES,
    systemInfo,
    errorSampleForAi,
    errorFingerprints: snapshotFingerprintMap(fingerprintMap),
    parseDurationMs: Date.now() - startedAt,
  };
}
