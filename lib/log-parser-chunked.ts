import { ErrorCategory, LogEntry, LogErrorEntry, PerformanceIssue, SystemInfo } from './types';
import { ErrorCategoryDefinition } from './log-categorizer';
import { ErrorFingerprintSummary, createFingerprintSummaries } from './ai-error-context';

const TIMESTAMP_REGEX = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(,\d{3})?/;
const ERROR_PATTERN = /\bERROR\b/;
const WARN_PATTERN = /\bWARN\b/;
const CAUSED_BY_PATTERN = /Caused by:/;
const MAX_ERROR_ENTRIES = 15000;
const MAX_WARNING_ENTRIES = 2000;
const MAX_PERFORMANCE_ISSUES = 2000;
const CONTEXT_LINES = 5;
const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024;
const DEFAULT_BATCH_SIZE = 500;

const PERFORMANCE_PATTERNS = {
  datasetSync: /DatasetMetaListServiceBean\.datasetSync executou por (\d+) segundos/,
  datasetExecution: /CustomizationManagerImpl\.invokeFunction\.(createDataset|servicetask64) (ja esta sendo executado|executou) por (\d+) segundos/,
  memory: /(OutOfMemoryError|heap space|GC overhead limit exceeded)/i,
  database: /(deadlock|timeout.*sql|connection pool|blocking-timeout-millis)/i,
};

interface PendingErrorContext {
  error: LogErrorEntry;
  remaining: number;
}

export interface ChunkedLogBatch {
  batchNumber: number;
  errors: LogErrorEntry[];
  warnings: LogEntry[];
  performanceIssues: PerformanceIssue[];
  errorFingerprints: ErrorFingerprintSummary[];
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
  return value
    .replace(/\\u0000/gi, '')
    .replace(/\u0000/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\uD800-\uDFFF]/g, '');
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

function getPerformanceIssuesForEntry(entry: LogEntry, previousContext: string): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];
  const { message, timestamp } = entry;

  const datasetSyncMatch = message.match(PERFORMANCE_PATTERNS.datasetSync);
  if (datasetSyncMatch) {
    const duration = parseInt(datasetSyncMatch[1]);
    if (duration > 30) {
      issues.push({
        type: 'DATASET_SYNC',
        message: `Dataset synchronization taking ${duration} seconds`,
        timestamp,
        duration,
        context: previousContext,
        suggestion: 'Considere otimizar as queries do dataset e implementar paginação. Revise o agendamento de sincronização do dataset.',
      });
    }
  }

  const datasetExecMatch = message.match(PERFORMANCE_PATTERNS.datasetExecution);
  if (datasetExecMatch) {
    const duration = parseInt(datasetExecMatch[3]);
    if (duration > 30) {
      issues.push({
        type: 'DATASET_EXECUTION',
        message: `Dataset execution taking ${duration} seconds`,
        timestamp,
        duration,
        context: message,
        suggestion: 'Revise a otimização da query do dataset. Considere usar AppDS ao invés de FluigDS para datasets customizados.',
      });
    }
  }

  if (PERFORMANCE_PATTERNS.memory.test(message)) {
    issues.push({
      type: 'MEMORY',
      message: 'Memory allocation issue detected',
      timestamp,
      context: message,
      suggestion: 'Revise as configurações de memória JVM no arquivo host.xml. Considere aumentar o heap size ou implementar clustering.',
    });
  }

  if (PERFORMANCE_PATTERNS.database.test(message)) {
    issues.push({
      type: 'DATABASE',
      message: 'Database performance issue detected',
      timestamp,
      context: message,
      suggestion: 'Revise as configurações do pool de conexões e otimização de queries. Verifique transações de longa duração.',
    });
  }

  return issues;
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
  const fingerprintQueue: LogErrorEntry[] = [];
  const errorSampleForAi: LogErrorEntry[] = [];
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
    if (!force && errorQueue.length + warningQueue.length + performanceQueue.length + fingerprintQueue.length < batchSize) {
      return;
    }

    if (errorQueue.length === 0 && warningQueue.length === 0 && performanceQueue.length === 0 && fingerprintQueue.length === 0) {
      return;
    }

    const errors = errorQueue.splice(0, batchSize);
    const remainingSlots = Math.max(0, batchSize - errors.length);
    const warnings = warningQueue.splice(0, remainingSlots);
    const perfSlots = Math.max(0, batchSize - errors.length - warnings.length);
    const performanceIssues = performanceQueue.splice(0, perfSlots || batchSize);
    const fingerprintEntries = fingerprintQueue.splice(0, batchSize);

    await onBatch({
      batchNumber: batchNumber++,
      errors,
      warnings,
      performanceIssues,
      errorFingerprints: createFingerprintSummaries(fingerprintEntries),
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
      if (persistedErrors + errorQueue.length + pendingErrors.length < MAX_ERROR_ENTRIES) {
        const errorEntry: LogErrorEntry = {
          ...entry,
          category: categorizeMessage(entry.message, categories),
          contextBefore: [...previousEntries],
          contextAfter: [],
          causedBy: entry.causedBy || [],
        };
        fingerprintQueue.push(errorEntry);
        pendingErrors.push({ error: errorEntry, remaining: CONTEXT_LINES });
        selectErrorSample(errorSampleForAi, errorEntry);
      } else {
        const fingerprintEntry: LogErrorEntry = {
          ...entry,
          category: categorizeMessage(entry.message, categories),
          contextBefore: [...previousEntries],
          contextAfter: [],
          causedBy: entry.causedBy || [],
        };
        fingerprintQueue.push(fingerprintEntry);
      }
    } else if (entry.level === 'WARN') {
      totalWarnings += 1;
      if (persistedWarnings + warningQueue.length < MAX_WARNING_ENTRIES) {
        warningQueue.push(entry);
      }
    }

    if (persistedPerformanceIssues + performanceQueue.length < MAX_PERFORMANCE_ISSUES) {
      const issues = getPerformanceIssuesForEntry(entry, previousContext);
      totalPerformanceIssues += issues.length;
      const availableSlots = MAX_PERFORMANCE_ISSUES - persistedPerformanceIssues - performanceQueue.length;
      performanceQueue.push(...issues.slice(0, availableSlots));
    } else {
      totalPerformanceIssues += getPerformanceIssuesForEntry(entry, previousContext).length;
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
    hasMorePerformanceIssues: totalPerformanceIssues > persistedPerformanceIssues,
    systemInfo,
    errorSampleForAi,
    parseDurationMs: Date.now() - startedAt,
  };
}
