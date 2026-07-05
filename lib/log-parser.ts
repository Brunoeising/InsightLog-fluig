import { LogEntry, LogErrorEntry, ErrorCategory, PerformanceIssue, SystemInfo } from './types';
import { categorizeMessage, loadErrorCategories, ErrorCategoryDefinition } from './log-categorizer';

const TIMESTAMP_REGEX = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(,\d{3})?/;
const ERROR_PATTERN = /\bERROR\b/;
const WARN_PATTERN = /\bWARN\b/;
const CAUSED_BY_PATTERN = /Caused by:/;
const PERFORMANCE_PATTERNS = {
  datasetSync: /DatasetMetaListServiceBean\.datasetSync executou por (\d+) segundos/,
  datasetExecution: /CustomizationManagerImpl\.invokeFunction\.(createDataset|servicetask64) (ja esta sendo executado|executou) por (\d+) segundos/,
  // Blocked concurrent execution — same customization running simultaneously
  datasetBlocked: /invokeFunction\.\S+ ja esta sendo executado por (\d+) segundos/,
  // JSChronos generic execution timer (covers events and datasets)
  jschronos: /JSChronos[^:]*:\s*\S+\s+executou por (\d+) segundos/i,
  // Anti-pattern: FluigDS/FluigDSRO used in customization (causes pool contention)
  fluigDsAntipattern: /\b(FluigDS|FluigDSRO)\b/,
  // JVM over-allocation — limit per WildFly instance is 16 GB
  jvmOverLimit: /-Xmx\s*(\d+)[gG]/,
  // Connection pool out of range in standalone.xml
  poolOutOfRange: /<max-pool-size>\s*(\d+)\s*<\/max-pool-size>/,
  memory: /(OutOfMemoryError|heap space|GC overhead limit exceeded)/i,
  database: /(deadlock|timeout.*sql|connection pool|blocking-timeout-millis)/i,
};
const MAX_PERFORMANCE_ISSUES = 2000;

interface PendingErrorContext {
  error: LogErrorEntry;
  remaining: number;
}

function getEntryContext(entry: LogEntry) {
  return `${entry.timestamp} ${entry.message}`;
}

function updateSystemInfoFromLine(systemInfo: SystemInfo, line: string) {
  if (line.includes('FLUIG_VERSION')) {
    const match = line.match(/FLUIG_VERSION.*?=\s*(.+?)(?=\s*$)/);
    if (match) systemInfo.fluig_version = match[1].trim();
  }

  if (line.includes('OS_NAME')) {
    const match = line.match(/OS_NAME.*?=\s*(.+?)(?=\s*$)/);
    if (match) systemInfo.os_name = match[1].trim();
  }

  if (line.includes('SERVER_TYPE')) {
    const match = line.match(/SERVER_TYPE.*?=\s*(.+?)(?=\s*$)/);
    if (match) systemInfo.server_type = match[1].trim();
  }

  if (line.includes('DATABASE_NAME')) {
    const match = line.match(/DATABASE_NAME.*?=\s*(.+?)(?=\s*$)/);
    if (match) systemInfo.database_name = match[1].trim();
  }

  if (line.includes('DATABASE_VERSION')) {
    const match = line.match(/DATABASE_VERSION.*?=\s*(.+?)(?=\s*$)/);
    if (match) systemInfo.database_version = match[1].trim();
  }

  if (line.includes('SERVER_URL')) {
    const match = line.match(/SERVER_URL.*?=\s*(.+?)(?=\s*$)/);
    if (match) systemInfo.server_url = match[1].trim();
  }

  if (line.includes('JAVA_HOME') || line.includes('JAVA_VERSION')) {
    const match = line.match(/(JAVA_HOME|JAVA_VERSION).*?=\s*(.+?)(?=\s*$)/);
    if (match) systemInfo.java_version = match[2].trim();
  }

  if (line.includes('LS_ENABLED')) {
    const match = line.match(/LS_ENABLED.*?=\s*(.+?)(?=\s*$)/);
    if (match) systemInfo.ls_enabled = match[1].trim().toLowerCase() === 'true';
  }

  if (line.includes('SOLR_ENABLED') || line.includes('SOLR_CLOUD')) {
    const match = line.match(/(SOLR_ENABLED|SOLR_CLOUD).*?=\s*(.+?)(?=\s*$)/);
    if (match) systemInfo.solr_enabled = match[2].trim().toLowerCase() === 'true';
  }
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
        message: `Sincronização de dataset levando ${duration} segundos`,
        timestamp,
        duration,
        context: previousContext,
        suggestion: 'Sincronização de dataset com tempo elevado. Otimize as queries do dataset, revise o volume de dados e considere paginação. Verifique se o dataset usa AppDS (não FluigDS/FluigDSRO).',
      });
    }
  }

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
          ? 'Execução concorrente bloqueada: a mesma customização está rodando em paralelo e aguardando recurso. Possível lock em banco ou chamada síncrona a serviço externo demorado. Considere integração assíncrona.'
          : 'Dataset ou evento customizado com tempo elevado. Verifique se usa AppDS ao invés de FluigDS/FluigDSRO. Otimize queries e evite chamadas síncronas a serviços externos.',
      });
    }
  }

  // Blocked concurrent execution (broader JSChronos pattern)
  const blockedMatch = message.match(PERFORMANCE_PATTERNS.datasetBlocked);
  if (blockedMatch && !datasetExecMatch) {
    const duration = parseInt(blockedMatch[1]);
    if (duration > 10) {
      issues.push({
        type: 'DATASET_EXECUTION',
        message: `Customização bloqueada aguardando execução por ${duration} segundos`,
        timestamp,
        duration,
        context: message,
        suggestion: 'Customização aguardando execução concorrente. Verifique locks de banco de dados ou chamadas a serviços externos lentos nesta customização.',
      });
    }
  }

  // JSChronos generic slow execution
  const jschronosMatch = message.match(PERFORMANCE_PATTERNS.jschronos);
  if (jschronosMatch && !datasetSyncMatch && !datasetExecMatch) {
    const duration = parseInt(jschronosMatch[1]);
    if (duration > 30) {
      issues.push({
        type: 'DATASET_EXECUTION',
        message: `Ponto de customização (JSChronos) executou por ${duration} segundos`,
        timestamp,
        duration,
        context: message,
        suggestion: 'Customização com tempo de execução elevado detectada via JSChronos. Revise queries, chamadas externas e uso de datasource. Tempo acima de mil segundos sugere sincronização travada.',
      });
    }
  }

  // Anti-pattern: FluigDS/FluigDSRO in customization causes pool contention with Fluig itself
  if (PERFORMANCE_PATTERNS.fluigDsAntipattern.test(message)) {
    issues.push({
      type: 'DATABASE',
      message: 'Anti-padrão detectado: uso de FluigDS/FluigDSRO em customização',
      timestamp,
      context: message,
      suggestion: 'CRÍTICO: FluigDS ou FluigDSRO está sendo usado em dataset/evento customizado. Isso gera disputa de pool de conexão com o próprio Fluig e pode causar lentidão ou indisponibilidade. Migre o desenvolvimento para AppDS conforme orientação TOTVS ("Datasets acessando banco de dados externo").',
    });
  }

  // JVM heap over 16 GB (WildFly/JBoss limit)
  const jvmMatch = message.match(PERFORMANCE_PATTERNS.jvmOverLimit);
  if (jvmMatch) {
    const heapGb = parseInt(jvmMatch[1]);
    if (heapGb > 16) {
      issues.push({
        type: 'MEMORY',
        message: `JVM configurada com -Xmx${heapGb}g (limite recomendado: 16 GB por instância)`,
        timestamp,
        context: message,
        suggestion: `Heap de ${heapGb}GB ultrapassa o limite de 16 GB por instância JBoss/WildFly. Em vez de aumentar mais, avalie escalonamento horizontal com cluster de múltiplas instâncias.`,
      });
    }
  }

  // Connection pool out of range (50-200 is the TOTVS recommended range)
  const poolMatch = message.match(PERFORMANCE_PATTERNS.poolOutOfRange);
  if (poolMatch) {
    const poolSize = parseInt(poolMatch[1]);
    if (poolSize < 50 || poolSize > 200) {
      issues.push({
        type: 'DATABASE',
        message: `Pool de conexões com max-pool-size=${poolSize} (faixa recomendada: 50-200)`,
        timestamp,
        context: message,
        suggestion: poolSize < 50
          ? `Pool subdimensionado (${poolSize}). Considere aumentar max-pool-size para entre 50-200 no standalone.xml, ajustando conforme o número de bancos no servidor.`
          : `Pool superdimensionado (${poolSize}). Valores acima de 200 podem esgotar conexões no banco. Reduza max-pool-size para a faixa 50-200 no standalone.xml.`,
      });
    }
  }

  if (PERFORMANCE_PATTERNS.memory.test(message)) {
    issues.push({
      type: 'MEMORY',
      message: 'Problema de alocação de memória JVM detectado',
      timestamp,
      context: message,
      suggestion: 'OutOfMemoryError ou GC overhead detectado. Revise as configurações -Xms/-Xmx no standalone.conf (limite: 16 GB por instância WildFly). Monitore heap no WCMADMIN > Health. Verifique memory leaks em datasets/eventos customizados.',
    });
  }

  if (PERFORMANCE_PATTERNS.database.test(message)) {
    issues.push({
      type: 'DATABASE',
      message: 'Problema de performance no banco de dados detectado',
      timestamp,
      context: message,
      suggestion: 'Deadlock, timeout SQL ou esgotamento de pool de conexões. Revise o max-pool-size no standalone.xml (50-200), otimize queries lentas e verifique transações de longa duração.',
    });
  }

  return issues;
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

function iterateTrimmedLines(content: string, onLine: (line: string) => void) {
  let start = 0;

  for (let index = 0; index <= content.length; index++) {
    if (index !== content.length && content.charCodeAt(index) !== 10) {
      continue;
    }

    let end = index;
    if (end > start && content.charCodeAt(end - 1) === 13) {
      end -= 1;
    }

    const line = content.slice(start, end).trim();
    if (line) onLine(line);
    start = index + 1;
  }
}

/**
 * Extracts system information from log content
 */
export function extractSystemInfo(content: string): SystemInfo {
  const systemInfo: SystemInfo = {};
  
  // Procurar por linhas que contenham informações do sistema
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Procurar por padrões específicos do Fluig
    if (line.includes('FLUIG_VERSION')) {
      const match = line.match(/FLUIG_VERSION.*?=\s*(.+?)(?=\s*$)/);
      if (match) systemInfo.fluig_version = match[1].trim();
    }
    
    if (line.includes('OS_NAME')) {
      const match = line.match(/OS_NAME.*?=\s*(.+?)(?=\s*$)/);
      if (match) systemInfo.os_name = match[1].trim();
    }
    
    if (line.includes('SERVER_TYPE')) {
      const match = line.match(/SERVER_TYPE.*?=\s*(.+?)(?=\s*$)/);
      if (match) systemInfo.server_type = match[1].trim();
    }
    
    if (line.includes('DATABASE_NAME')) {
      const match = line.match(/DATABASE_NAME.*?=\s*(.+?)(?=\s*$)/);
      if (match) systemInfo.database_name = match[1].trim();
    }
    
    if (line.includes('DATABASE_VERSION')) {
      const match = line.match(/DATABASE_VERSION.*?=\s*(.+?)(?=\s*$)/);
      if (match) systemInfo.database_version = match[1].trim();
    }
    
    if (line.includes('SERVER_URL')) {
      const match = line.match(/SERVER_URL.*?=\s*(.+?)(?=\s*$)/);
      if (match) systemInfo.server_url = match[1].trim();
    }
    
    if (line.includes('JAVA_HOME') || line.includes('JAVA_VERSION')) {
      const match = line.match(/(JAVA_HOME|JAVA_VERSION).*?=\s*(.+?)(?=\s*$)/);
      if (match) systemInfo.java_version = match[2].trim();
    }
    
    if (line.includes('LS_ENABLED')) {
      const match = line.match(/LS_ENABLED.*?=\s*(.+?)(?=\s*$)/);
      if (match) systemInfo.ls_enabled = match[1].trim().toLowerCase() === 'true';
    }
    
    if (line.includes('SOLR_ENABLED') || line.includes('SOLR_CLOUD')) {
      const match = line.match(/(SOLR_ENABLED|SOLR_CLOUD).*?=\s*(.+?)(?=\s*$)/);
      if (match) systemInfo.solr_enabled = match[2].trim().toLowerCase() === 'true';
    }
  }
  
  return systemInfo;
}

/**
 * Parses a log file content and extracts log entries
 */
export function parseLogContent(content: string): LogEntry[] {
  // Split content into manageable chunks
  const chunkSize = 15000; // Process 2000 lines at a time
  const lines = content.split('\n');
  const logEntries: LogEntry[] = [];
  
  // Regex pattern for timestamp extraction
  const timestampRegex = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(,\d{3})?/;
  
  // Strict error pattern - only match ERROR keyword
  const errorPattern = /\bERROR\b/;
  const warnPattern = /\bWARN\b/;
  const causedByPattern = /Caused by:/;
  
  let currentEntry: LogEntry | null = null;
  let causedByLines: string[] = [];
  
  // Process in chunks
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Extract timestamp
    const timestampMatch = line.match(timestampRegex);
    
    if (timestampMatch) {
      // If we have a previous entry with causedBy lines, save it
      if (currentEntry && causedByLines.length > 0) {
        currentEntry.causedBy = causedByLines;
        causedByLines = [];
      }
      
      const timestamp = timestampMatch[0];
      const messagePart = line.substring(line.indexOf(timestamp) + timestamp.length).trim();
      
      // Strict level determination
      let level: LogEntry['level'];
      
      if (errorPattern.test(messagePart)) {
        level = 'ERROR';
      } else if (warnPattern.test(messagePart)) {
        level = 'WARN';
      } else {
        level = 'INFO';
      }
      
      currentEntry = {
        timestamp,
        level,
        message: messagePart,
        causedBy: []
      };
      
      logEntries.push(currentEntry);
    } else if (causedByPattern.test(line) && currentEntry) {
      // This is a "Caused by:" line
      causedByLines.push(line.replace('Caused by:', '').trim());
    } else if (currentEntry && line.startsWith('at ')) {
      // This is a stack trace line, we'll ignore it
      continue;
    }
  }
  
  // Don't forget to process the last entry's causedBy if it exists
  if (currentEntry && causedByLines.length > 0) {
    currentEntry.causedBy = causedByLines;
  }
  
  return logEntries;
}

/**
 * Analyzes performance issues in log entries
 */
export function analyzePerformanceIssues(logEntries: LogEntry[]): PerformanceIssue[] {
  const performanceIssues: PerformanceIssue[] = [];

  logEntries.forEach((entry) => {
    performanceIssues.push(...getPerformanceIssuesForEntry(entry, entry.message));
  });

  return performanceIssues;
}

/**
 * Extracts error entries with context before and after
 * Only includes actual ERROR level entries
 */
export function extractErrorEntries(
  logEntries: LogEntry[],
  categories: ErrorCategoryDefinition[] = [],
  contextLines: number = 5,
  maxEntries: number = 15000
): LogErrorEntry[] {
  const errorEntries: LogErrorEntry[] = [];
  
  for (let index = 0; index < logEntries.length && errorEntries.length < maxEntries; index++) {
    const entry = logEntries[index];
    if (entry.level !== 'ERROR') {
      continue;
    }

    const contextBefore: string[] = [];
    for (let i = Math.max(0, index - contextLines); i < index; i++) {
      contextBefore.push(`${logEntries[i].timestamp} ${logEntries[i].message}`);
    }

    const contextAfter: string[] = [];
    for (let i = index + 1; i < Math.min(logEntries.length, index + contextLines + 1); i++) {
      contextAfter.push(`${logEntries[i].timestamp} ${logEntries[i].message}`);
    }

    const category = categorizeMessage(entry.message, categories);
    errorEntries.push({
      ...entry,
      category: (category?.name as ErrorCategory) || 'OTHER',
      contextBefore,
      contextAfter,
      causedBy: entry.causedBy || []
    });
  }
  
  return errorEntries;
}

/**
 * Extracts warning entries
 * Only includes WARN level entries with a limit
 */
export function extractWarningEntries(
  logEntries: LogEntry[],
  maxEntries: number = 2000
): LogEntry[] {
  return logEntries
    .filter(entry => entry.level === 'WARN')
    .slice(0, maxEntries);
}

/**
 * Analyzes log content and returns a structured analysis result
 */
export async function analyzeLogContent(
  content: string,
  userId: string,
  preloadedCategories?: ErrorCategoryDefinition[]
) {
  const categories = preloadedCategories || await loadErrorCategories(userId);
  const systemInfo: SystemInfo = {};
  const errorEntries: LogErrorEntry[] = [];
  const warningEntries: LogEntry[] = [];
  const performanceIssues: PerformanceIssue[] = [];
  const previousEntries: string[] = [];
  const pendingErrors: PendingErrorContext[] = [];
  const contextLines = 5;
  const maxErrorEntries = 15000;
  const maxWarningEntries = 2000;
  let totalErrorCount = 0;
  let totalWarningCount = 0;
  let currentEntry: LogEntry | null = null;
  let causedByLines: string[] = [];
  let previousContext = '';

  const completeCurrentEntryCauses = () => {
    if (currentEntry && causedByLines.length > 0) {
      currentEntry.causedBy = causedByLines;
      causedByLines = [];
    }
  };

  const addEntryToPendingErrorContext = (entry: LogEntry) => {
    const context = getEntryContext(entry);
    for (let index = pendingErrors.length - 1; index >= 0; index--) {
      const pending = pendingErrors[index];
      if (pending.remaining <= 0) {
        pendingErrors.splice(index, 1);
        continue;
      }

      pending.error.contextAfter.push(context);
      pending.remaining -= 1;

      if (pending.remaining <= 0) {
        pendingErrors.splice(index, 1);
      }
    }
  };

  const finalizeEntry = (entry: LogEntry) => {
    addEntryToPendingErrorContext(entry);

    if (entry.level === 'ERROR') {
      totalErrorCount += 1;
      if (errorEntries.length < maxErrorEntries) {
        const category = categorizeMessage(entry.message, categories);
        const errorEntry: LogErrorEntry = {
          ...entry,
          category: (category?.name as ErrorCategory) || 'OTHER',
          contextBefore: [...previousEntries],
          contextAfter: [],
          causedBy: entry.causedBy || [],
        };
        errorEntries.push(errorEntry);
        pendingErrors.push({ error: errorEntry, remaining: contextLines });
      }
    } else if (entry.level === 'WARN') {
      totalWarningCount += 1;
      if (warningEntries.length < maxWarningEntries) {
        warningEntries.push(entry);
      }
    }

    if (performanceIssues.length < MAX_PERFORMANCE_ISSUES) {
      const availableSlots = MAX_PERFORMANCE_ISSUES - performanceIssues.length;
      performanceIssues.push(...getPerformanceIssuesForEntry(entry, previousContext).slice(0, availableSlots));
    }

    previousContext = entry.message;
    previousEntries.push(getEntryContext(entry));
    if (previousEntries.length > contextLines) {
      previousEntries.shift();
    }
  };

  iterateTrimmedLines(content, (line) => {
    updateSystemInfoFromLine(systemInfo, line);

    const timestampMatch = line.match(TIMESTAMP_REGEX);
    if (timestampMatch) {
      completeCurrentEntryCauses();
      if (currentEntry) {
        finalizeEntry(currentEntry);
      }
      currentEntry = createEntryFromTimestampLine(line, timestampMatch);
      return;
    }

    if (CAUSED_BY_PATTERN.test(line) && currentEntry) {
      causedByLines.push(line.replace('Caused by:', '').trim());
    }
  });

  completeCurrentEntryCauses();
  if (currentEntry) {
    finalizeEntry(currentEntry);
  }
  
  return {
    entries: [],
    errorEntries,
    warningEntries,
    performanceIssues,
    categories,
    errorCount: totalErrorCount,
    warningCount: totalWarningCount,
    hasMoreErrors: totalErrorCount > errorEntries.length,
    hasMoreWarnings: totalWarningCount > warningEntries.length,
    systemInfo
  };
}