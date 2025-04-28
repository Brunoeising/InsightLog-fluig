export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      log_analyses: {
        Row: {
          id: string
          file_name: string
          file_path: string | null
          file_url: string | null
          uploaded_at: string
          error_count: number
          warning_count: number
          summary: string | null
          suggestions: string[] | null
          user_id: string
          created_at: string
          fluig_version: string | null
          os_name: string | null
          server_type: string | null
          database_name: string | null
          database_version: string | null
          server_url: string | null
          java_version: string | null
          solr_enabled: boolean | null
          ls_enabled: boolean | null
        }
        Insert: {
          id?: string
          file_name: string
          file_path?: string | null
          file_url?: string | null
          uploaded_at: string
          error_count: number
          warning_count: number
          summary?: string | null
          suggestions?: string[] | null
          user_id: string
          created_at?: string
          fluig_version?: string | null
          os_name?: string | null
          server_type?: string | null
          database_name?: string | null
          database_version?: string | null
          server_url?: string | null
          java_version?: string | null
          solr_enabled?: boolean | null
          ls_enabled?: boolean | null
        }
        Update: {
          id?: string
          file_name?: string
          file_path?: string | null
          file_url?: string | null
          uploaded_at?: string
          error_count?: number
          warning_count?: number
          summary?: string | null
          suggestions?: string[] | null
          user_id?: string
          created_at?: string
          fluig_version?: string | null
          os_name?: string | null
          server_type?: string | null
          database_name?: string | null
          database_version?: string | null
          server_url?: string | null
          java_version?: string | null
          solr_enabled?: boolean | null
          ls_enabled?: boolean | null
        }
      }
      log_entries: {
        Row: {
          id: string
          analysis_id: string
          level: string
          message: string
          timestamp: string
          category: string
          context_before: string[]
          context_after: string[]
          suggestion: string | null
          created_at: string
        }
        Insert: {
          id?: string
          analysis_id: string
          level: string
          message: string
          timestamp: string
          category: string
          context_before: string[]
          context_after: string[]
          suggestion?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          analysis_id?: string
          level?: string
          message?: string
          timestamp?: string
          category?: string
          context_before?: string[]
          context_after?: string[]
          suggestion?: string | null
          created_at?: string
        }
      }
      log_performance_issues: {
        Row: {
          id: string
          analysis_id: string
          type: string
          message: string
          timestamp: string
          duration: number | null
          context: string | null
          suggestion: string | null
          created_at: string
        }
        Insert: {
          id?: string
          analysis_id: string
          type: string
          message: string
          timestamp: string
          duration?: number | null
          context?: string | null
          suggestion?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          analysis_id?: string
          type?: string
          message?: string
          timestamp?: string
          duration?: number | null
          context?: string | null
          suggestion?: string | null
          created_at?: string
        }
      }
      user_questions: {
        Row: {
          id: string
          analysis_id: string
          question: string
          answer: string | null
          created_at: string
        }
        Insert: {
          id?: string
          analysis_id: string
          question: string
          answer?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          analysis_id?: string
          question?: string
          answer?: string | null
          created_at?: string
        }
      }
    }
  }
}

// Log Analysis Types
export interface LogEntry {
  id?: string;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  message: string;
  timestamp: string;
  context?: string[];
}

export interface SystemInfo {
  fluig_version?: string;
  os_name?: string;
  server_type?: string;
  database_name?: string;
  database_version?: string;
  server_url?: string;
  java_version?: string;
  ls_enabled?: boolean;
  solr_enabled?: boolean;
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
  performanceIssues: PerformanceIssue[];
  summary: string;
  suggestions: string[];
  content?: string;
  systemInfo?: SystemInfo;
}

export interface LogErrorEntry extends LogEntry {
  category: ErrorCategory;
  contextBefore: string[];
  contextAfter: string[];
  suggestion?: string;
}

export interface PerformanceIssue {
  type: PerformanceIssueType;
  message: string;
  timestamp: string;
  duration?: number;
  context?: string;
  suggestion: string;
}

export type PerformanceIssueType = 
  | 'DATASET_SYNC'
  | 'DATASET_EXECUTION'
  | 'WORKFLOW'
  | 'MEMORY'
  | 'DATABASE'
  | 'OTHER';

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