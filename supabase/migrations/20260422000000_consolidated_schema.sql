/*
  # Consolidated Schema - InsightLog Fluig

  Replaces all previous fragmented migrations with a single definitive schema.

  Tables:
    - log_analyses
    - log_entries  (renamed from log_errors)
    - log_performance_issues
    - user_questions
    - default_error_categories
    - error_categories

  Includes:
    - Full RLS policies with SELECT/INSERT/UPDATE/DELETE where applicable
    - Storage bucket 'logs' with CRUD policies
    - Auto-copy default categories trigger for new users
    - update_updated_at_column trigger on error_categories
*/

-- ============================================================
-- UTILITY FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABLE: log_analyses
-- ============================================================

CREATE TABLE IF NOT EXISTS log_analyses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name         text NOT NULL,
  file_path         text,
  file_url          text,
  uploaded_at       timestamptz NOT NULL,
  error_count       integer NOT NULL DEFAULT 0,
  warning_count     integer NOT NULL DEFAULT 0,
  summary           text,
  suggestions       text[],
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  fluig_version     text,
  os_name           text,
  server_type       text,
  database_name     text,
  database_version  text,
  server_url        text,
  java_version      text,
  solr_enabled      boolean,
  ls_enabled        boolean,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE log_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analyses"
  ON log_analyses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analyses"
  ON log_analyses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own analyses"
  ON log_analyses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own analyses"
  ON log_analyses FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- TABLE: log_entries  (was log_errors)
-- ============================================================

CREATE TABLE IF NOT EXISTS log_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id    uuid REFERENCES log_analyses(id) ON DELETE CASCADE,
  level          text NOT NULL DEFAULT 'ERROR',
  message        text NOT NULL,
  timestamp      text NOT NULL,
  category       text NOT NULL DEFAULT 'OTHER',
  category_id    uuid,
  context_before text[],
  context_after  text[],
  caused_by      text[],
  suggestion     text,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE log_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view entries from own analyses"
  ON log_entries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = log_entries.analysis_id
        AND log_analyses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert entries for own analyses"
  ON log_entries FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = log_entries.analysis_id
        AND log_analyses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete entries from own analyses"
  ON log_entries FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = log_entries.analysis_id
        AND log_analyses.user_id = auth.uid()
    )
  );

-- ============================================================
-- TABLE: log_performance_issues
-- ============================================================

CREATE TABLE IF NOT EXISTS log_performance_issues (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES log_analyses(id) ON DELETE CASCADE,
  type        text NOT NULL,
  message     text NOT NULL,
  timestamp   text NOT NULL,
  duration    integer,
  context     text,
  suggestion  text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE log_performance_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view performance issues from own analyses"
  ON log_performance_issues FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = log_performance_issues.analysis_id
        AND log_analyses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert performance issues for own analyses"
  ON log_performance_issues FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = log_performance_issues.analysis_id
        AND log_analyses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete performance issues from own analyses"
  ON log_performance_issues FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = log_performance_issues.analysis_id
        AND log_analyses.user_id = auth.uid()
    )
  );

-- ============================================================
-- TABLE: user_questions
-- ============================================================

CREATE TABLE IF NOT EXISTS user_questions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES log_analyses(id) ON DELETE CASCADE,
  question    text NOT NULL,
  answer      text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE user_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own questions"
  ON user_questions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = user_questions.analysis_id
        AND log_analyses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own questions"
  ON user_questions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = user_questions.analysis_id
        AND log_analyses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own questions"
  ON user_questions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = user_questions.analysis_id
        AND log_analyses.user_id = auth.uid()
    )
  );

-- ============================================================
-- TABLE: default_error_categories
-- ============================================================

CREATE TABLE IF NOT EXISTS default_error_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  terms       text[] NOT NULL DEFAULT '{}',
  color       text NOT NULL DEFAULT 'hsl(var(--muted))',
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE default_error_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read default categories"
  ON default_error_categories FOR SELECT TO authenticated
  USING (true);

-- Seed the 6 default categories
INSERT INTO default_error_categories (name, description, terms, color) VALUES
  (
    'DATABASE',
    'Problemas relacionados ao banco de dados',
    ARRAY['sql', 'database', 'db', 'jdbc', 'connection pool', 'deadlock', 'timeout sql', 'ora-', 'pg_', 'mysql', 'mongodb', 'connection refused'],
    'hsl(var(--chart-1))'
  ),
  (
    'PERMISSION',
    'Problemas de permissão e autorização',
    ARRAY['permission', 'access', 'unauthorized', 'denied', 'forbidden', 'security', 'authentication', 'authorization', 'role', 'privilege', 'credential'],
    'hsl(var(--chart-2))'
  ),
  (
    'WORKFLOW',
    'Problemas relacionados ao workflow do Fluig',
    ARRAY['workflow', 'process', 'fluig', 'bpm', 'task', 'state', 'transition', 'approval', 'step', 'sequence', 'activity'],
    'hsl(var(--chart-3))'
  ),
  (
    'PERFORMANCE',
    'Problemas de performance e recursos',
    ARRAY['timeout', 'slow', 'performance', 'memory', 'leak', 'heap', 'gc', 'garbage', 'delay', 'latency', 'throughput', 'cpu', 'load', 'capacity'],
    'hsl(var(--chart-4))'
  ),
  (
    'NETWORK',
    'Problemas de rede e conectividade',
    ARRAY['network', 'connection', 'http', 'url', 'uri', 'endpoint', 'api', 'rest', 'soap', 'request', 'response', 'socket', 'tcp', 'dns', 'timeout connect'],
    'hsl(var(--chart-5))'
  ),
  (
    'INFRASTRUCTURE',
    'Problemas de infraestrutura',
    ARRAY['disk', 'space', 'storage', 'filesystem', 'mount', 'volume', 'server', 'host', 'node', 'cluster', 'infrastructure', 'hardware'],
    'hsl(var(--chart-6))'
  )
ON CONFLICT DO NOTHING;

-- ============================================================
-- TABLE: error_categories
-- ============================================================

CREATE TABLE IF NOT EXISTS error_categories (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  description          text,
  terms                text[] NOT NULL DEFAULT '{}',
  color                text DEFAULT 'hsl(var(--muted))',
  is_default           boolean DEFAULT false,
  original_category_id uuid REFERENCES default_error_categories(id) ON DELETE SET NULL,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

ALTER TABLE error_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own categories"
  ON error_categories FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_error_categories_updated_at
  BEFORE UPDATE ON error_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- FUNCTION + TRIGGER: copy default categories for new users
-- ============================================================

CREATE OR REPLACE FUNCTION public.setup_user_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.error_categories (
    user_id,
    name,
    description,
    terms,
    color,
    is_default,
    original_category_id
  )
  SELECT
    NEW.id,
    name,
    description,
    terms,
    color,
    true,
    id
  FROM public.default_error_categories;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_user_create_categories ON auth.users;
CREATE TRIGGER on_new_user_create_categories
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.setup_user_categories();

-- Backfill categories for any existing users who don't have them yet
INSERT INTO error_categories (user_id, name, description, terms, color, is_default, original_category_id)
SELECT
  u.id,
  d.name,
  d.description,
  d.terms,
  d.color,
  true,
  d.id
FROM auth.users u
CROSS JOIN default_error_categories d
WHERE NOT EXISTS (
  SELECT 1 FROM error_categories e
  WHERE e.user_id = u.id AND e.original_category_id = d.id
);

-- ============================================================
-- STORAGE: bucket 'logs' with full CRUD policies
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('logs', 'logs', false)
ON CONFLICT (id) DO NOTHING;

-- Drop any old policies before recreating
DO $$
DECLARE
  pol text;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname ILIKE '%log%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol);
  END LOOP;
END $$;

CREATE POLICY "Users can upload own log files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'logs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read own log files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'logs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own log files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'logs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own log files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'logs' AND (storage.foldername(name))[1] = auth.uid()::text);
