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
      environment_analyses: {
        Row: {
          id: string
          user_id: string
          environment_name: string
          status: string
          compatibility_score: number | null
          risk_count: number | null
          non_homologated_count: number | null
          attention_count: number | null
          sizing_status: string | null
          executive_summary: string | null
          recommendations: string[] | null
          inventory_data: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          environment_name: string
          status?: string
          compatibility_score?: number | null
          risk_count?: number | null
          non_homologated_count?: number | null
          attention_count?: number | null
          sizing_status?: string | null
          executive_summary?: string | null
          recommendations?: string[] | null
          inventory_data?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          environment_name?: string
          status?: string
          compatibility_score?: number | null
          risk_count?: number | null
          non_homologated_count?: number | null
          attention_count?: number | null
          sizing_status?: string | null
          executive_summary?: string | null
          recommendations?: string[] | null
          inventory_data?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      environment_items: {
        Row: {
          id: string
          analysis_id: string
          category: string
          field_name: string
          collected_value: string | null
          expected_value: string | null
          compatibility_status: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          analysis_id: string
          category: string
          field_name: string
          collected_value?: string | null
          expected_value?: string | null
          compatibility_status?: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          analysis_id?: string
          category?: string
          field_name?: string
          collected_value?: string | null
          expected_value?: string | null
          compatibility_status?: string
          notes?: string | null
          created_at?: string
        }
      }
      sizing_results: {
        Row: {
          id: string
          analysis_id: string
          registered_users: number | null
          concurrent_users: number | null
          process_count: number | null
          doc_volume: number | null
          dataset_count: number | null
          integration_volume: number | null
          recommended_cpu: string | null
          recommended_ram: string | null
          recommended_disk: string | null
          current_cpu: string | null
          current_ram: string | null
          current_disk: string | null
          sizing_status: string
          created_at: string
        }
        Insert: {
          id?: string
          analysis_id: string
          registered_users?: number | null
          concurrent_users?: number | null
          process_count?: number | null
          doc_volume?: number | null
          dataset_count?: number | null
          integration_volume?: number | null
          recommended_cpu?: string | null
          recommended_ram?: string | null
          recommended_disk?: string | null
          current_cpu?: string | null
          current_ram?: string | null
          current_disk?: string | null
          sizing_status?: string
          created_at?: string
        }
        Update: {
          id?: string
          analysis_id?: string
          registered_users?: number | null
          concurrent_users?: number | null
          process_count?: number | null
          doc_volume?: number | null
          dataset_count?: number | null
          integration_volume?: number | null
          recommended_cpu?: string | null
          recommended_ram?: string | null
          recommended_disk?: string | null
          current_cpu?: string | null
          current_ram?: string | null
          current_disk?: string | null
          sizing_status?: string
          created_at?: string
        }
      }
      health_check_results: {
        Row: {
          id: string
          analysis_id: string
          heap_usage: number | null
          cpu_usage: number | null
          memory_usage: number | null
          disk_usage: number | null
          services_status: Json | null
          ai_interpretation: string | null
          created_at: string
        }
        Insert: {
          id?: string
          analysis_id: string
          heap_usage?: number | null
          cpu_usage?: number | null
          memory_usage?: number | null
          disk_usage?: number | null
          services_status?: Json | null
          ai_interpretation?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          analysis_id?: string
          heap_usage?: number | null
          cpu_usage?: number | null
          memory_usage?: number | null
          disk_usage?: number | null
          services_status?: Json | null
          ai_interpretation?: string | null
          created_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          user_id: string
          action: string
          environment_name: string | null
          result_summary: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          action: string
          environment_name?: string | null
          result_summary?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          action?: string
          environment_name?: string | null
          result_summary?: string | null
          created_at?: string
        }
      }
    }
  }
}