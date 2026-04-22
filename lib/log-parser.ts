import { LogEntry, LogErrorEntry, ErrorCategory, PerformanceIssue, PerformanceIssueType, SystemInfo } from './types';
import { getErrorCategoryFromMessage } from './log-categorizer';

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
  
  // Patterns for different performance issues
  const patterns = {
    datasetSync: /DatasetMetaListServiceBean\.datasetSync executou por (\d+) segundos/,
    datasetExecution: /CustomizationManagerImpl\.invokeFunction\.(createDataset|servicetask64) (ja esta sendo executado|executou) por (\d+) segundos/,
    memory: /(OutOfMemoryError|heap space|GC overhead limit exceeded)/i,
    database: /(deadlock|timeout.*sql|connection pool|blocking-timeout-millis)/i
  };

  let currentContext = '';
  
  logEntries.forEach((entry, index) => {
    const { message, timestamp } = entry;
    
    // Dataset Synchronization Issues
    const datasetSyncMatch = message.match(patterns.datasetSync);
    if (datasetSyncMatch) {
      const duration = parseInt(datasetSyncMatch[1]);
      if (duration > 30) { // Changed from 300 to 30 seconds
        performanceIssues.push({
          type: 'DATASET_SYNC',
          message: `Dataset synchronization taking ${duration} seconds`,
          timestamp,
          duration,
          context: currentContext,
          suggestion: 'Considere otimizar as queries do dataset e implementar paginação. Revise o agendamento de sincronização do dataset.'
        });
      }
    }
    
    // Dataset Execution Issues
    const datasetExecMatch = message.match(patterns.datasetExecution);
    if (datasetExecMatch) {
      const duration = parseInt(datasetExecMatch[3]);
      if (duration > 30) { // Changed from 5 to 30 seconds
        performanceIssues.push({
          type: 'DATASET_EXECUTION',
          message: `Dataset execution taking ${duration} seconds`,
          timestamp,
          duration,
          context: message,
          suggestion: 'Revise a otimização da query do dataset. Considere usar AppDS ao invés de FluigDS para datasets customizados.'
        });
      }
    }
    
    // Memory Issues
    if (patterns.memory.test(message)) {
      performanceIssues.push({
        type: 'MEMORY',
        message: 'Memory allocation issue detected',
        timestamp,
        context: message,
        
        suggestion: 'Revise as configurações de memória JVM no arquivo host.xml. Considere aumentar o heap size ou implementar clustering.'
      });
    }
    
    // Database Issues
    if (patterns.database.test(message)) {
      performanceIssues.push({
        type: 'DATABASE',
        message: 'Database performance issue detected',
        timestamp,
        context: message,
        suggestion: 'Revise as configurações do pool de conexões e otimização de queries. Verifique transações de longa duração.'
      });
    }
    
    // Update context for next iteration
    currentContext = message;
  });
  
  return performanceIssues;
}

/**
 * Extracts error entries with context before and after
 * Only includes actual ERROR level entries
 */
export function extractErrorEntries(
  logEntries: LogEntry[],
  userId: string,
  contextLines: number = 5,
  maxEntries: number = 15000
): LogErrorEntry[] {
  // First, filter to only ERROR level entries
  const errorEntries: LogErrorEntry[] = [];
  const errors = logEntries.filter(entry => entry.level === 'ERROR');
  
  // Process only up to maxEntries
  const processErrors = errors.slice(0, maxEntries);
  
  processErrors.forEach(async (error, index) => {
    // Find the original index in logEntries
    const originalIndex = logEntries.findIndex(
      entry => entry.timestamp === error.timestamp && entry.message === error.message
    );
    
    if (originalIndex !== -1) {
      // Get context before the error
      const contextBefore: string[] = [];
      for (let i = Math.max(0, originalIndex - contextLines); i < originalIndex; i++) {
        contextBefore.push(`${logEntries[i].timestamp} ${logEntries[i].message}`);
      }
      
      // Get context after the error
      const contextAfter: string[] = [];
      for (let i = originalIndex + 1; i < Math.min(logEntries.length, originalIndex + contextLines + 1); i++) {
        contextAfter.push(`${logEntries[i].timestamp} ${logEntries[i].message}`);
      }

      const category = await getErrorCategoryFromMessage(error.message, userId);
      
      errorEntries.push({
        ...error,
        category: (category?.name as ErrorCategory) || 'OTHER',
        contextBefore,
        contextAfter,
        causedBy: error.causedBy || []
      });
    }
  });
  
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
export async function analyzeLogContent(content: string, userId: string) {
  const logEntries = parseLogContent(content);
  const systemInfo = extractSystemInfo(content);
  
  const performanceIssues = analyzePerformanceIssues(logEntries);
  const errorEntries = await extractErrorEntries(logEntries, userId, 5, 15000);
  const warningEntries = extractWarningEntries(logEntries, 2000);
  
  return {
    entries: logEntries,
    errorEntries,
    warningEntries,
    performanceIssues,
    errorCount: errorEntries.length,
    warningCount: warningEntries.length,
    content,
    hasMoreErrors: logEntries.filter(entry => entry.level === 'ERROR').length > errorEntries.length,
    hasMoreWarnings: logEntries.filter(entry => entry.level === 'WARN').length > warningEntries.length,
    systemInfo
  };
}