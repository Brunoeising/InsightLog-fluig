import { LogEntry, LogErrorEntry, ErrorCategory, PerformanceIssue, PerformanceIssueType, SystemInfo } from './types';

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
  const chunkSize = 2000; // Process 2000 lines at a time
  const lines = content.split('\n');
  const logEntries: LogEntry[] = [];
  
  // Regex pattern for timestamp extraction
  const timestampRegex = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(,\d{3})?/;
  
  // Strict error pattern - only match ERROR keyword
  const errorPattern = /\bERROR\b/;
  const warnPattern = /\bWARN\b/;
  
  // Process in chunks
  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize);
    
    for (const line of chunk) {
      // Extract timestamp
      const timestampMatch = line.match(timestampRegex);
      if (!timestampMatch) continue;
      
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
      
      logEntries.push({
        timestamp,
        level,
        message: messagePart
      });
    }
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
      if (duration > 300) { // More than 5 minutes
        performanceIssues.push({
          type: 'DATASET_SYNC',
          message: `Dataset synchronization taking ${duration} seconds`,
          timestamp,
          duration,
          context: currentContext,
          suggestion: 'Consider optimizing dataset queries and implementing pagination. Review dataset synchronization schedule.'
        });
      }
    }
    
    // Dataset Execution Issues
    const datasetExecMatch = message.match(patterns.datasetExecution);
    if (datasetExecMatch) {
      const duration = parseInt(datasetExecMatch[3]);
      if (duration > 5) { // More than 5 seconds
        performanceIssues.push({
          type: 'DATASET_EXECUTION',
          message: `Dataset execution taking ${duration} seconds`,
          timestamp,
          duration,
          context: message,
          suggestion: 'Review dataset query optimization. Consider using AppDS instead of FluigDS for custom datasets.'
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
        suggestion: 'Review JVM memory settings in host.xml. Consider increasing heap size or implementing clustering.'
      });
    }
    
    // Database Issues
    if (patterns.database.test(message)) {
      performanceIssues.push({
        type: 'DATABASE',
        message: 'Database performance issue detected',
        timestamp,
        context: message,
        suggestion: 'Review database connection pool settings and query optimization. Check for long-running transactions.'
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
  contextLines: number = 5,
  maxEntries: number = 2000
): LogErrorEntry[] {
  // First, filter to only ERROR level entries
  const errorEntries: LogErrorEntry[] = [];
  const errors = logEntries.filter(entry => entry.level === 'ERROR');
  
  // Process only up to maxEntries
  const processErrors = errors.slice(0, maxEntries);
  
  processErrors.forEach((error, index) => {
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
      
      errorEntries.push({
        ...error,
        category: categorizeError(error.message),
        contextBefore,
        contextAfter
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
 * Categorizes an error message into predefined categories
 */
export function categorizeError(errorMessage: string): ErrorCategory {
  const lowerMessage = errorMessage.toLowerCase();
  
  if (/(sql|database|db|jdbc|connection pool|deadlock|timeout.*sql|ora-\d+|pg_|mysql|mongodb|connection.*refused)/i.test(lowerMessage)) {
    return 'DATABASE';
  }
  
  if (/(permission|access|unauthorized|denied|forbidden|security|authentication|authorization|role|privilege|credential)/i.test(lowerMessage)) {
    return 'PERMISSION';
  }
  
  if (/(workflow|process|fluig|bpm|task|state|transition|approval|step|sequence|activity)/i.test(lowerMessage)) {
    return 'WORKFLOW';
  }
  
  if (/(timeout|slow|performance|memory|leak|heap|gc|garbage|delay|latency|throughput|cpu|load|capacity)/i.test(lowerMessage)) {
    return 'PERFORMANCE';
  }
  
  if (/(network|connection|http|url|uri|endpoint|api|rest|soap|request|response|socket|tcp|dns|timeout.*connect)/i.test(lowerMessage)) {
    return 'NETWORK';
  }
  
  if (/(disk|space|storage|filesystem|mount|volume|server|host|node|cluster|infrastructure|hardware)/i.test(lowerMessage)) {
    return 'INFRASTRUCTURE';
  }
  
  return 'OTHER';
}

/**
 * Analyzes log content and returns a structured analysis result
 */
export function analyzeLogContent(content: string) {
  const logEntries = parseLogContent(content);
  const systemInfo = extractSystemInfo(content);
  
  // Analyze performance issues
  const performanceIssues = analyzePerformanceIssues(logEntries);
  
  // Strictly filter for errors and warnings with increased limits
  const errorEntries = extractErrorEntries(logEntries, 5, 2000);
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