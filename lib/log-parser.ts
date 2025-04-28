import { LogEntry, LogErrorEntry, ErrorCategory } from './types';

/**
 * Parses a log file content and extracts log entries
 */
export function parseLogContent(content: string): LogEntry[] {
  const lines = content.split('\n');
  const logEntries: LogEntry[] = [];
  
  // Regex pattern for timestamp extraction
  const timestampRegex = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(,\d{3})?/;
  
  // Strict error pattern - only match ERROR keyword
  const errorPattern = /\bERROR\b/;
  const warnPattern = /\bWARN\b/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
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
  
  return logEntries;
}

/**
 * Extracts error entries with context before and after
 * Only includes actual ERROR level entries
 */
export function extractErrorEntries(
  logEntries: LogEntry[],
  contextLines: number = 5
): LogErrorEntry[] {
  // First, filter to only ERROR level entries
  const errorEntries: LogErrorEntry[] = [];
  
  logEntries.forEach((entry, index) => {
    if (entry.level === 'ERROR') {
      // Get context before the error
      const contextBefore: string[] = [];
      for (let i = Math.max(0, index - contextLines); i < index; i++) {
        contextBefore.push(`${logEntries[i].timestamp} ${logEntries[i].message}`);
      }
      
      // Get context after the error
      const contextAfter: string[] = [];
      for (let i = index + 1; i < Math.min(logEntries.length, index + contextLines + 1); i++) {
        contextAfter.push(`${logEntries[i].timestamp} ${logEntries[i].message}`);
      }
      
      errorEntries.push({
        ...entry,
        category: categorizeError(entry.message),
        contextBefore,
        contextAfter
      });
    }
  });
  
  return errorEntries;
}

/**
 * Extracts warning entries
 * Only includes WARN level entries
 */
export function extractWarningEntries(logEntries: LogEntry[]): LogEntry[] {
  return logEntries.filter(entry => entry.level === 'WARN');
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
  
  // Strictly filter for errors and warnings
  const errorEntries = extractErrorEntries(logEntries);
  const warningEntries = extractWarningEntries(logEntries);
  
  return {
    entries: logEntries,
    errorEntries,
    warningEntries,
    errorCount: errorEntries.length,
    warningCount: warningEntries.length,
    content // Include content for AI analysis
  };
}