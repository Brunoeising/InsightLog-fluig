-- Performance indexes and missing table for log analysis pipeline.

ALTER TABLE IF EXISTS log_entries
  ADD COLUMN IF NOT EXISTS caused_by text[] DEFAULT '{}';

CREATE TABLE IF NOT EXISTS log_performance_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES log_analyses(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  timestamp text,
  duration integer,
  context text,
  suggestion text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE log_performance_issues ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'log_performance_issues'
      AND policyname = 'Users can view performance issues from own analyses'
  ) THEN
    CREATE POLICY "Users can view performance issues from own analyses"
      ON log_performance_issues
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM log_analyses
          WHERE log_analyses.id = log_performance_issues.analysis_id
          AND log_analyses.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'log_performance_issues'
      AND policyname = 'Users can insert performance issues for own analyses'
  ) THEN
    CREATE POLICY "Users can insert performance issues for own analyses"
      ON log_performance_issues
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM log_analyses
          WHERE log_analyses.id = log_performance_issues.analysis_id
          AND log_analyses.user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_log_analyses_user_uploaded
  ON log_analyses(user_id, uploaded_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_log_analyses_uploaded_at
  ON log_analyses(uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_log_entries_analysis_id
  ON log_entries(analysis_id);

CREATE INDEX IF NOT EXISTS idx_log_entries_analysis_level
  ON log_entries(analysis_id, level);

CREATE INDEX IF NOT EXISTS idx_log_entries_analysis_category
  ON log_entries(analysis_id, category);

CREATE INDEX IF NOT EXISTS idx_log_performance_issues_analysis_id
  ON log_performance_issues(analysis_id);