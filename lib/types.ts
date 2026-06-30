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
          caused_by: string[] | null
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
          caused_by?: string[] | null
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
          caused_by?: string[] | null
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

export interface LogEntry {
  id?: string;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  message: string;
  timestamp: string;
  context?: string[];
  causedBy?: string[];
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
  causedBy?: string[];
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

export interface LogChunk {
  id?: string;
  analysisId: string;
  chunkNumber: number;
  content: string;
  processed: boolean;
  createdAt?: string;
}

export interface ProcessingStatus {
  totalChunks: number;
  processedChunks: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

export interface ErrorCategoryConfig {
  id: string;
  name: string;
  description: string | null;
  terms: string[];
  color: string;
  isDefault: boolean;
}

// ============================================================
// Environment Analysis Types
// ============================================================

export type CompatibilityStatus =
  | 'HOMOLOGADO'
  | 'HOMOLOGADO_RESTRICOES'
  | 'EM_VALIDACAO'
  | 'NAO_HOMOLOGADO'
  | 'NAO_IDENTIFICADO';

export type SizingStatus = 'ADEQUADO' | 'SUBDIMENSIONADO' | 'SUPERDIMENSIONADO';

export interface EnvironmentInventory {
  os_name: string;
  os_version: string;
  os_build: string;
  architecture: string;
  cpu_cores: string;
  cpu_vcpu: string;
  ram_gb: string;
  disk_gb: string;
  java_version: string;
  java_vendor: string;
  java_home: string;
  fluig_version: string;
  fluig_patch: string;
  fluig_directory: string;
  database_type: string;
  database_version: string;
  database_charset: string;
  database_collation: string;
  appserver_type: string;
  nginx_version: string;
  apache_version: string;
}

export interface EnvironmentItem {
  id?: string;
  analysisId?: string;
  category: string;
  fieldName: string;
  label: string;
  collectedValue: string;
  expectedValue: string;
  status: CompatibilityStatus;
  notes: string;
}

export interface SizingInput {
  registered_users: number;
  concurrent_users: number;
  process_count: number;
  doc_volume: number;
  dataset_count: number;
  integration_volume: number;
}

export interface SizingResultData {
  id?: string;
  analysisId?: string;
  registeredUsers: number;
  concurrentUsers: number;
  processCount: number;
  docVolume: number;
  datasetCount: number;
  integrationVolume: number;
  recommendedCpu: string;
  recommendedRam: string;
  recommendedDisk: string;
  currentCpu: string;
  currentRam: string;
  currentDisk: string;
  sizingStatus: SizingStatus;
  profile: string;
}

export interface HealthCheckData {
  id?: string;
  analysisId?: string;
  heapUsage: number | null;
  cpuUsage: number | null;
  memoryUsage: number | null;
  diskUsage: number | null;
  servicesStatus: Record<string, string> | null;
  aiInterpretation: string | null;
}

export interface EnvironmentAnalysis {
  id?: string;
  userId?: string;
  environmentName: string;
  status: string;
  compatibilityScore: number;
  riskCount: number;
  nonHomologatedCount: number;
  attentionCount: number;
  sizingStatus: SizingStatus | null;
  executiveSummary: string | null;
  recommendations: string[] | null;
  inventory: EnvironmentInventory;
  items: EnvironmentItem[];
  sizing?: SizingResultData;
  healthCheck?: HealthCheckData;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuditLogEntry {
  id?: string;
  userId?: string;
  action: string;
  environmentName: string;
  resultSummary: string;
  createdAt: string;
}