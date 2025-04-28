// Log Analysis Types
export interface LogEntry {
  id?: string;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  message: string;
  timestamp: string;
  context?: string[];
}

export interface LogAnalysisResult {
  id?: string;
  userId?: string;
  fileName: string;
  filePath?: string;
  fileUrl?: string;
  uploadedAt: string;
  errorCount: number;
  warningCount: number;
  errors: LogErrorEntry[];
  warnings?: LogEntry[];
  summary: string;
  suggestions: string[];
  content?: string;
}

export interface LogErrorEntry extends LogEntry {
  category: ErrorCategory;
  contextBefore: string[];
  contextAfter: string[];
  suggestion?: string;
}

export type ErrorCategory = 
  | 'DATABASE'
  | 'PERMISSION'
  | 'WORKFLOW'
  | 'PERFORMANCE'
  | 'NETWORK'
  | 'INFRASTRUCTURE'
  | 'OTHER';

export interface UserQuestion {
  id?: string;
  logAnalysisId: string;
  question: string;
  answer?: string;
  createdAt: string;
}

// API Related Types
export interface UploadResponse {
  success: boolean;
  message: string;
  analysisId?: string;
}

export interface AIAnalysisRequest {
  logContent: string;
  errorEntries: LogErrorEntry[];
}

export interface AIAnalysisResponse {
  summary: string;
  suggestions: string[];
  errorAnalysis: {
    errorId: string;
    suggestion: string;
  }[];
}