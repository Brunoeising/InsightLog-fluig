/*
# Create tables for 5 AI-powered automation modules

1. New Tables

- `installation_diagnostics`
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK to auth.users, defaults to auth.uid())
  - `environment_name` (text)
  - `error_input` (text) - the pasted error message/log
  - `error_type` (text) - category of error (INSTALLATION, UPDATE, STARTUP, etc.)
  - `fluig_version` (text)
  - `ai_diagnosis` (text) - AI-generated diagnosis
  - `solution_steps` (text[]) - ordered solution steps
  - `related_articles` (text[]) - TDN article references
  - `resolved` (boolean) - user feedback
  - `created_at` (timestamptz)

- `configuration_validations`
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK to auth.users, defaults to auth.uid())
  - `environment_name` (text)
  - `config_type` (text) - standalone.xml, host.xml, database-params
  - `config_content` (text) - original content
  - `validation_results` (jsonb) - per-parameter results
  - `ai_corrections` (text) - AI explanation of corrections
  - `corrected_content` (text) - fixed configuration
  - `score` (numeric) - validation score 0-100
  - `created_at` (timestamptz)

- `integration_diagnostics`
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK to auth.users, defaults to auth.uid())
  - `environment_name` (text)
  - `integration_type` (text) - SOAP or REST
  - `endpoint_url` (text)
  - `error_message` (text)
  - `ai_diagnosis` (text)
  - `solution_steps` (text[])
  - `config_suggestion` (text)
  - `created_at` (timestamptz)

- `health_monitoring_snapshots`
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK to auth.users, defaults to auth.uid())
  - `environment_name` (text)
  - `analysis_id` (uuid, FK to environment_analyses, nullable)
  - `snapshot_data` (jsonb) - heap, cpu, memory, disk, error_rate
  - `trend_direction` (text) - improving, degrading, stable
  - `ai_prediction` (text)
  - `alert_level` (text) - normal, warning, critical
  - `created_at` (timestamptz)

- `readiness_assessments`
  - `id` (uuid, primary key)
  - `user_id` (uuid, FK to auth.users, defaults to auth.uid())
  - `environment_name` (text)
  - `fluig_version` (text)
  - `assessment_data` (jsonb) - all checklist items and results
  - `overall_status` (text) - ready, not_ready, partial
  - `blockers` (text[])
  - `ai_recommendations` (text)
  - `score` (numeric)
  - `created_at` (timestamptz)

2. Security
  - RLS enabled on all tables.
  - Owner-scoped CRUD policies (user_id = auth.uid()) for authenticated users.

3. Indexes
  - user_id and created_at indexed on all tables for efficient queries.
*/

-- ============================================================
-- installation_diagnostics
-- ============================================================
CREATE TABLE IF NOT EXISTS installation_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  environment_name text NOT NULL DEFAULT '',
  error_input text NOT NULL,
  error_type text NOT NULL DEFAULT 'INSTALLATION',
  fluig_version text DEFAULT '',
  ai_diagnosis text,
  solution_steps text[],
  related_articles text[],
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE installation_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_diagnostics" ON installation_diagnostics;
CREATE POLICY "select_own_diagnostics" ON installation_diagnostics FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_diagnostics" ON installation_diagnostics;
CREATE POLICY "insert_own_diagnostics" ON installation_diagnostics FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_diagnostics" ON installation_diagnostics;
CREATE POLICY "update_own_diagnostics" ON installation_diagnostics FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_diagnostics" ON installation_diagnostics;
CREATE POLICY "delete_own_diagnostics" ON installation_diagnostics FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_install_diag_user ON installation_diagnostics(user_id);
CREATE INDEX IF NOT EXISTS idx_install_diag_created ON installation_diagnostics(created_at DESC);

-- ============================================================
-- configuration_validations
-- ============================================================
CREATE TABLE IF NOT EXISTS configuration_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  environment_name text NOT NULL DEFAULT '',
  config_type text NOT NULL,
  config_content text,
  validation_results jsonb,
  ai_corrections text,
  corrected_content text,
  score numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE configuration_validations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_config_val" ON configuration_validations;
CREATE POLICY "select_own_config_val" ON configuration_validations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_config_val" ON configuration_validations;
CREATE POLICY "insert_own_config_val" ON configuration_validations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_config_val" ON configuration_validations;
CREATE POLICY "update_own_config_val" ON configuration_validations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_config_val" ON configuration_validations;
CREATE POLICY "delete_own_config_val" ON configuration_validations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_config_val_user ON configuration_validations(user_id);
CREATE INDEX IF NOT EXISTS idx_config_val_created ON configuration_validations(created_at DESC);

-- ============================================================
-- integration_diagnostics
-- ============================================================
CREATE TABLE IF NOT EXISTS integration_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  environment_name text NOT NULL DEFAULT '',
  integration_type text NOT NULL DEFAULT 'REST',
  endpoint_url text DEFAULT '',
  error_message text NOT NULL,
  ai_diagnosis text,
  solution_steps text[],
  config_suggestion text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE integration_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_integ_diag" ON integration_diagnostics;
CREATE POLICY "select_own_integ_diag" ON integration_diagnostics FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_integ_diag" ON integration_diagnostics;
CREATE POLICY "insert_own_integ_diag" ON integration_diagnostics FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_integ_diag" ON integration_diagnostics;
CREATE POLICY "update_own_integ_diag" ON integration_diagnostics FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_integ_diag" ON integration_diagnostics;
CREATE POLICY "delete_own_integ_diag" ON integration_diagnostics FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_integ_diag_user ON integration_diagnostics(user_id);
CREATE INDEX IF NOT EXISTS idx_integ_diag_created ON integration_diagnostics(created_at DESC);

-- ============================================================
-- health_monitoring_snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS health_monitoring_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  environment_name text NOT NULL,
  analysis_id uuid REFERENCES environment_analyses(id) ON DELETE SET NULL,
  snapshot_data jsonb NOT NULL DEFAULT '{}',
  trend_direction text DEFAULT 'stable',
  ai_prediction text,
  alert_level text NOT NULL DEFAULT 'normal',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE health_monitoring_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_health_snap" ON health_monitoring_snapshots;
CREATE POLICY "select_own_health_snap" ON health_monitoring_snapshots FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_health_snap" ON health_monitoring_snapshots;
CREATE POLICY "insert_own_health_snap" ON health_monitoring_snapshots FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_health_snap" ON health_monitoring_snapshots;
CREATE POLICY "update_own_health_snap" ON health_monitoring_snapshots FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_health_snap" ON health_monitoring_snapshots;
CREATE POLICY "delete_own_health_snap" ON health_monitoring_snapshots FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_health_snap_user ON health_monitoring_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_health_snap_env ON health_monitoring_snapshots(environment_name);
CREATE INDEX IF NOT EXISTS idx_health_snap_created ON health_monitoring_snapshots(created_at DESC);

-- ============================================================
-- readiness_assessments
-- ============================================================
CREATE TABLE IF NOT EXISTS readiness_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  environment_name text NOT NULL DEFAULT '',
  fluig_version text DEFAULT '',
  assessment_data jsonb NOT NULL DEFAULT '{}',
  overall_status text NOT NULL DEFAULT 'not_ready',
  blockers text[],
  ai_recommendations text,
  score numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE readiness_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_readiness" ON readiness_assessments;
CREATE POLICY "select_own_readiness" ON readiness_assessments FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_readiness" ON readiness_assessments;
CREATE POLICY "insert_own_readiness" ON readiness_assessments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_readiness" ON readiness_assessments;
CREATE POLICY "update_own_readiness" ON readiness_assessments FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_readiness" ON readiness_assessments;
CREATE POLICY "delete_own_readiness" ON readiness_assessments FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_readiness_user ON readiness_assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_readiness_created ON readiness_assessments(created_at DESC);
