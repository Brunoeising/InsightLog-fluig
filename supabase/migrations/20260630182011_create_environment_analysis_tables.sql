/*
# Environment Analysis Tables for Fluig Portability & Sizing

1. Purpose
   This migration adds the data layer for the "Environment Analyzer" module of InsightLog.
   It stores inventories collected from Fluig servers, validates them against the
   portability matrix, runs sizing simulations, performs health checks, and keeps an
   audit trail of every execution.

2. New Tables
   - `environment_analyses` — top-level record for one environment assessment.
     Columns: id, user_id, environment_name, status, compatibility_score,
     risk_count, non_homologated_count, attention_count, sizing_status,
     executive_summary, recommendations, inventory_data (jsonb), created_at, updated_at.
   - `environment_items` — each collected item (OS, Java, DB, etc.) with its
     validation result against the portability matrix.
     Columns: id, analysis_id, category, field_name, collected_value,
     expected_value, compatibility_status, notes.
   - `sizing_results` — sizing simulation inputs and recommended vs. current
     infrastructure.
     Columns: id, analysis_id, registered_users, concurrent_users, process_count,
     doc_volume, dataset_count, integration_volume, recommended_cpu,
     recommended_ram, recommended_disk, current_cpu, current_ram, current_disk,
     sizing_status.
   - `health_check_results` — Fluig health check metrics and AI interpretation.
     Columns: id, analysis_id, heap_usage, cpu_usage, memory_usage, disk_usage,
     services_status (jsonb), ai_interpretation.
   - `audit_logs` — audit trail of every analysis execution.
     Columns: id, user_id, action, environment_name, result_summary, created_at.

3. Security
   - RLS enabled on all new tables.
   - Owner-scoped CRUD policies (user_id = auth.uid()) on environment_analyses
     and audit_logs.
   - Child tables (environment_items, sizing_results, health_check_results)
     scoped through the parent environment_analyses via EXISTS subquery.
   - user_id columns default to auth.uid() so inserts that omit user_id succeed.

4. Notes
   - All tables use gen_random_uuid() for primary keys.
   - Foreign keys cascade on delete so removing an analysis cleans up its children.
   - compatibility_status is a text enum: HOMOLOGADO, HOMOLOGADO_RESTRICOES,
     EM_VALIDACAO, NAO_HOMOLOGADO, NAO_IDENTIFICADO.
   - sizing_status is a text enum: ADEQUADO, SUBDIMENSIONADO, SUPERDIMENSIONADO.
*/

-- ============================================================
-- environment_analyses
-- ============================================================
CREATE TABLE IF NOT EXISTS environment_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  environment_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  compatibility_score numeric DEFAULT 0,
  risk_count integer DEFAULT 0,
  non_homologated_count integer DEFAULT 0,
  attention_count integer DEFAULT 0,
  sizing_status text,
  executive_summary text,
  recommendations text[],
  inventory_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE environment_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_env_analyses" ON environment_analyses;
CREATE POLICY "select_own_env_analyses" ON environment_analyses FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_env_analyses" ON environment_analyses;
CREATE POLICY "insert_own_env_analyses" ON environment_analyses FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_env_analyses" ON environment_analyses;
CREATE POLICY "update_own_env_analyses" ON environment_analyses FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_env_analyses" ON environment_analyses;
CREATE POLICY "delete_own_env_analyses" ON environment_analyses FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- environment_items
-- ============================================================
CREATE TABLE IF NOT EXISTS environment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES environment_analyses(id) ON DELETE CASCADE,
  category text NOT NULL,
  field_name text NOT NULL,
  collected_value text,
  expected_value text,
  compatibility_status text NOT NULL DEFAULT 'NAO_IDENTIFICADO',
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE environment_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_env_items" ON environment_items;
CREATE POLICY "select_own_env_items" ON environment_items FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM environment_analyses ea
            WHERE ea.id = environment_items.analysis_id AND ea.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_env_items" ON environment_items;
CREATE POLICY "insert_own_env_items" ON environment_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM environment_analyses ea
            WHERE ea.id = environment_items.analysis_id AND ea.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_env_items" ON environment_items;
CREATE POLICY "update_own_env_items" ON environment_items FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM environment_analyses ea
            WHERE ea.id = environment_items.analysis_id AND ea.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM environment_analyses ea
            WHERE ea.id = environment_items.analysis_id AND ea.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_env_items" ON environment_items;
CREATE POLICY "delete_own_env_items" ON environment_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM environment_analyses ea
            WHERE ea.id = environment_items.analysis_id AND ea.user_id = auth.uid())
  );

-- ============================================================
-- sizing_results
-- ============================================================
CREATE TABLE IF NOT EXISTS sizing_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES environment_analyses(id) ON DELETE CASCADE,
  registered_users integer DEFAULT 0,
  concurrent_users integer DEFAULT 0,
  process_count integer DEFAULT 0,
  doc_volume integer DEFAULT 0,
  dataset_count integer DEFAULT 0,
  integration_volume integer DEFAULT 0,
  recommended_cpu text,
  recommended_ram text,
  recommended_disk text,
  current_cpu text,
  current_ram text,
  current_disk text,
  sizing_status text NOT NULL DEFAULT 'ADEQUADO',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sizing_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sizing" ON sizing_results;
CREATE POLICY "select_own_sizing" ON sizing_results FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM environment_analyses ea
            WHERE ea.id = sizing_results.analysis_id AND ea.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_sizing" ON sizing_results;
CREATE POLICY "insert_own_sizing" ON sizing_results FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM environment_analyses ea
            WHERE ea.id = sizing_results.analysis_id AND ea.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_sizing" ON sizing_results;
CREATE POLICY "update_own_sizing" ON sizing_results FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM environment_analyses ea
            WHERE ea.id = sizing_results.analysis_id AND ea.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM environment_analyses ea
            WHERE ea.id = sizing_results.analysis_id AND ea.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_sizing" ON sizing_results;
CREATE POLICY "delete_own_sizing" ON sizing_results FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM environment_analyses ea
            WHERE ea.id = sizing_results.analysis_id AND ea.user_id = auth.uid())
  );

-- ============================================================
-- health_check_results
-- ============================================================
CREATE TABLE IF NOT EXISTS health_check_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES environment_analyses(id) ON DELETE CASCADE,
  heap_usage numeric,
  cpu_usage numeric,
  memory_usage numeric,
  disk_usage numeric,
  services_status jsonb,
  ai_interpretation text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE health_check_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_health" ON health_check_results;
CREATE POLICY "select_own_health" ON health_check_results FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM environment_analyses ea
            WHERE ea.id = health_check_results.analysis_id AND ea.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_health" ON health_check_results;
CREATE POLICY "insert_own_health" ON health_check_results FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM environment_analyses ea
            WHERE ea.id = health_check_results.analysis_id AND ea.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_health" ON health_check_results;
CREATE POLICY "update_own_health" ON health_check_results FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM environment_analyses ea
            WHERE ea.id = health_check_results.analysis_id AND ea.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM environment_analyses ea
            WHERE ea.id = health_check_results.analysis_id AND ea.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_health" ON health_check_results;
CREATE POLICY "delete_own_health" ON health_check_results FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM environment_analyses ea
            WHERE ea.id = health_check_results.analysis_id AND ea.user_id = auth.uid())
  );

-- ============================================================
-- audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  environment_name text,
  result_summary text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_audit" ON audit_logs;
CREATE POLICY "select_own_audit" ON audit_logs FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_audit" ON audit_logs;
CREATE POLICY "insert_own_audit" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_audit" ON audit_logs;
CREATE POLICY "delete_own_audit" ON audit_logs FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_env_analyses_user ON environment_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_env_items_analysis ON environment_items(analysis_id);
CREATE INDEX IF NOT EXISTS idx_sizing_analysis ON sizing_results(analysis_id);
CREATE INDEX IF NOT EXISTS idx_health_analysis ON health_check_results(analysis_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
