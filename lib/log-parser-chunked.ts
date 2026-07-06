import { ErrorCategory, LogEntry, LogErrorEntry, PerformanceIssue, SystemInfo } from './types';
import { ErrorCategoryDefinition } from './log-categorizer';
import { ErrorFingerprintSummary, createErrorFingerprint, normalizeErrorMessage, scoreErrorEvidence } from './ai-error-context';

const TIMESTAMP_REGEX = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(,\d{3})?/;
const ERROR_PATTERN = /\bERROR\b/;
const WARN_PATTERN = /\bWARN\b/;
const CAUSED_BY_PATTERN = /Caused by:/;
const MAX_ERROR_ENTRIES = 15000;
const MAX_WARNING_ENTRIES = 2000;
const MAX_PERFORMANCE_ISSUES = 2000;
// Reduced from 5 — matches what we send to the server anyway (truncated to 3 in upload-button)
const CONTEXT_LINES = 3;
const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024;
// Larger batches = fewer HTTP round-trips for high-error-count logs
const DEFAULT_BATCH_SIZE = 2000;

const PERFORMANCE_PATTERNS = {
  datasetSync: /DatasetMetaListServiceBean\.datasetSync executou por (\d+) segundos/,
  datasetExecution: /CustomizationManagerImpl\.invokeFunction\.(createDataset|servicetask64) (ja esta sendo executado|executou) por (\d+) segundos/,
  datasetBlocked: /invokeFunction\.\S+ ja esta sendo executado por (\d+) segundos/,
  jschronos: /JSChronos[^:]*:\s*\S+\s+executou por (\d+) segundos/i,
  fluigDsAntipattern: /\b(FluigDS|FluigDSRO)\b/,
  jvmOverLimit: /-Xmx\s*(\d+)[gG]/,
  poolOutOfRange: /<max-pool-size>\s*(\d+)\s*<\/max-pool-size>/,
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

function getPerformanceIssuesForEntry(entry: LogEntry, previousContext: string, seenOnceTypes: Set<string>): PerformanceIssue[] {
  const issues: PerformanceIssue[] = [];
  const { message, timestamp } = entry;

  if (message.includes('datasetSync') || message.includes('DatasetMetaListServiceBean')) {
    const datasetSyncMatch = message.match(PERFORMANCE_PATTERNS.datasetSync);
    if (datasetSyncMatch) {
      const duration = parseInt(datasetSyncMatch[1]);
      if (duration > 30) {
        issues.push({
          type: 'DATASET_SYNC',
          message: `Sincronização de dataset levando ${duration} segundos`,
          timestamp,
          duration,
          context: previousContext,
          suggestion: 'Sincronização de dataset com tempo elevado. Otimize as queries do dataset, revise o volume de dados e considere paginação. Verifique se o dataset usa AppDS (não FluigDS/FluigDSRO).',
        });
      }
    }
  }

  if (message.includes('invokeFunction')) {
    const datasetExecMatch = message.match(PERFORMANCE_PATTERNS.datasetExecution);
    if (datasetExecMatch) {
      const duration = parseInt(datasetExecMatch[3]);
      const isBlocked = datasetExecMatch[2]?.includes('ja esta sendo executado');
      if (duration > 30) {
        issues.push({
          type: 'DATASET_EXECUTION',
          message: isBlocked
            ? `Execução de customização bloqueada (concorrente) por ${duration} segundos`
            : `Execução de dataset/evento levando ${duration} segundos`,
          timestamp,
          duration,
          context: message,
          suggestion: isBlocked
            ? 'Execução concorrente bloqueada: a mesma customização está rodando em paralelo. Possível lock em banco ou chamada síncrona a serviço externo demorado.'
            : 'Dataset ou evento customizado com tempo elevado. Verifique se usa AppDS ao invés de FluigDS/FluigDSRO.',
        });
      }
    }

    if (!datasetExecMatch) {
      const blockedMatch = message.match(PERFORMANCE_PATTERNS.datasetBlocked);
      if (blockedMatch) {
        const duration = parseInt(blockedMatch[1]);
        if (duration > 10) {
          issues.push({
            type: 'DATASET_EXECUTION',
            message: `Customização bloqueada aguardando execução por ${duration} segundos`,
            timestamp,
            duration,
            context: message,
            suggestion: 'Customização aguardando execução concorrente. Verifique locks de banco de dados ou chamadas a serviços externos lentos.',
          });
        }
      }
    }
  }

  if (message.includes('JSChronos') || message.includes('jschronos')) {
    const jschronosMatch = message.match(PERFORMANCE_PATTERNS.jschronos);
    if (jschronosMatch) {
      const duration = parseInt(jschronosMatch[1]);
      if (duration > 30) {
        issues.push({
          type: 'DATASET_EXECUTION',
          message: `Ponto de customização (JSChronos) executou por ${duration} segundos`,
          timestamp,
          duration,
          context: message,
          suggestion: 'Customização com tempo de execução elevado. Revise queries, chamadas externas e uso de datasource.',
        });
      }
    }
  }

  // ONE-SHOT: only reported once per analysis
  if (!seenOnceTypes.has('FLUIG_DS') && (message.includes('FluigDS') || message.includes('FluigDSRO'))) {
    if (PERFORMANCE_PATTERNS.fluigDsAntipattern.test(message)) {
      seenOnceTypes.add('FLUIG_DS');
      issues.push({
        type: 'DATABASE',
        message: 'Anti-padrão detectado: uso de FluigDS/FluigDSRO em customização',
        timestamp,
        context: message,
        suggestion: 'CRÍTICO: FluigDS ou FluigDSRO está sendo usado em customização. Isso gera disputa de pool de conexão com o Fluig. Migre para AppDS.',
      });
    }
  }

  if (!seenOnceTypes.has('JVM_OVER_LIMIT') && message.includes('-Xmx')) {
    const jvmMatch = message.match(PERFORMANCE_PATTERNS.jvmOverLimit);
    if (jvmMatch) {
      const heapGb = parseInt(jvmMatch[1]);
      if (heapGb > 16) {
        seenOnceTypes.add('JVM_OVER_LIMIT');
        issues.push({
          type: 'MEMORY',
          message: `JVM configurada com -Xmx${heapGb}g (limite recomendado: 16 GB por instância)`,
          timestamp,
          context: message,
          suggestion: `Heap de ${heapGb}GB ultrapassa o limite por instância WildFly. Avalie cluster com múltiplas instâncias.`,
        });
      }
    }
  }

  if (!seenOnceTypes.has('POOL_OUT_OF_RANGE') && message.includes('max-pool-size')) {
    const poolMatch = message.match(PERFORMANCE_PATTERNS.poolOutOfRange);
    if (poolMatch) {
      const poolSize = parseInt(poolMatch[1]);
      if (poolSize < 50 || poolSize > 200) {
        seenOnceTypes.add('POOL_OUT_OF_RANGE');
        issues.push({
          type: 'DATABASE',
          message: `Pool de conexões com max-pool-size=${poolSize} (faixa recomendada: 50-200)`,
          timestamp,
          context: message,
          suggestion: poolSize < 50
            ? `Pool subdimensionado (${poolSize}). Aumente max-pool-size para 50-200 no standalone.xml.`
            : `Pool superdimensionado (${poolSize}). Reduza max-pool-size para 50-200 no standalone.xml.`,
        });
      }
    }
  }

  if (message.includes('OutOfMemoryError') || message.includes('heap space') || message.includes('GC overhead')) {
    if (PERFORMANCE_PATTERNS.memory.test(message)) {
      issues.push({
        type: 'MEMORY',
        message: 'Memory allocation issue detected',
        timestamp,
        context: message,
        suggestion: 'Revise as configurações de memória JVM no arquivo host.xml. Considere aumentar o heap size ou implementar clustering.',
      });
    }
  }

  if (message.includes('deadlock') || message.includes('timeout') || message.includes('connection pool') || message.includes('blocking-timeout')) {
    if (PERFORMANCE_PATTERNS.database.test(message)) {
      issues.push({
        type: 'DATABASE',
        message: 'Database performance issue detected',
        timestamp,
        context: message,
        suggestion: 'Revise as configurações do pool de conexões e otimização de queries. Verifique transações de longa duração.',
      });
    }
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

    // Snapshot the current accumulated fingerprint state for this batch.
    // Scores and sort order reflect all errors seen up to this point.
    const errorFingerprints = snapshotFingerprintMap(fingerprintMap);

    await onBatch({
      batchNumber: batchNumber++,
      errors,
      warnings,
      performanceIssues,
      errorFingerprints,
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
    parseDurationMs: Date.now() - startedAt,
  };
}
