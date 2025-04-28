import { LogEntry, LogErrorEntry, ErrorCategory } from './types';

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
 * Extracts error entries with context before and after
 * Only includes actual ERROR level entries
 */
export function extractErrorEntries(
  logEntries: LogEntry[],
  contextLines: number = 5,
  maxEntries: number = 2000 // Increased limit to 2000 errors
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
  maxEntries: number = 2000 // Increased limit to 2000 warnings
): LogEntry[] {
  return logEntries
    .filter(entry => entry.level === 'WARN')
    .slice(0, maxEntries);
}

/**
 * Categorizes an error message into predefined categories
 * Only used for ERROR level entries
 */
export function categorizeError(errorMessage: string): ErrorCategory {
  const lowerMessage = errorMessage.toLowerCase();
  
  // Database related errors
  if (/(sql|database|db|jdbc|connection pool|deadlock|timeout.*sql|ora-\d+|pg_|mysql|mongodb|connection.*refused)/i.test(lowerMessage)) {
    return 'DATABASE';
  }
  
  // Permission related errors
  if (/(permission|access|unauthorized|denied|forbidden|security|authentication|authorization|role|privilege|credential)/i.test(lowerMessage)) {
    return 'PERMISSION';
  }
  
  // Workflow related errors
  if (/(workflow|process|fluig|bpm|task|state|transition|approval|step|sequence|activity)/i.test(lowerMessage)) {
    return 'WORKFLOW';
  }
  
  // Performance related errors
  if (/(timeout|slow|performance|memory|leak|heap|gc|garbage|delay|latency|throughput|cpu|load|capacity)/i.test(lowerMessage)) {
    return 'PERFORMANCE';
  }
  
  // Network related errors
  if (/(network|connection|http|url|uri|endpoint|api|rest|soap|request|response|socket|tcp|dns|timeout.*connect)/i.test(lowerMessage)) {
    return 'NETWORK';
  }
  
  // Infrastructure related errors
  if (/(disk|space|storage|filesystem|mount|volume|server|host|node|cluster|infrastructure|hardware)/i.test(lowerMessage)) {
    return 'INFRASTRUCTURE';
  }
  
  // Default category
  return 'OTHER';
}

/**
 * Analyzes log content and returns a structured analysis result
 */
export function analyzeLogContent(content: string) {
  const logEntries = parseLogContent(content);
  
  // Strictly filter for errors and warnings with increased limits
  const errorEntries = extractErrorEntries(logEntries, 5, 2000);
  const warningEntries = extractWarningEntries(logEntries, 2000);
  
  return {
    entries: logEntries,
    errorEntries,
    warningEntries,
    errorCount: errorEntries.length,
    warningCount: warningEntries.length,
    content, // Include content for AI analysis
    hasMoreErrors: logEntries.filter(entry => entry.level === 'ERROR').length > errorEntries.length,
    hasMoreWarnings: logEntries.filter(entry => entry.level === 'WARN').length > warningEntries.length
  };
}