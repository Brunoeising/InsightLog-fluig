-- Status and bookkeeping for browser-side processing of large log files.

ALTER TABLE log_analyses
  ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'COMPLETED',
  ADD COLUMN IF NOT EXISTS processing_error text,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_entries_in_file integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_errors_in_file integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_warnings_in_file integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_performance_issues_in_file integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parsed_entries_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_status text DEFAULT 'SKIPPED',
  ADD COLUMN IF NOT EXISTS parse_duration_ms integer,
  ADD COLUMN IF NOT EXISTS ai_duration_ms integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'log_analyses_processing_status_check'
  ) THEN
    ALTER TABLE log_analyses
      ADD CONSTRAINT log_analyses_processing_status_check
      CHECK (processing_status IN ('CREATED', 'PARSING', 'PERSISTING', 'PARSED', 'PROCESSING_AI', 'COMPLETED', 'FAILED'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'log_analyses_ai_status_check'
  ) THEN
    ALTER TABLE log_analyses
      ADD CONSTRAINT log_analyses_ai_status_check
      CHECK (ai_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS log_analysis_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES log_analyses(id) ON DELETE CASCADE,
  batch_number integer NOT NULL,
  error_count integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  performance_issue_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (analysis_id, batch_number)
);

ALTER TABLE log_analysis_batches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'log_analysis_batches'
      AND policyname = 'Users can view batches from own analyses'
  ) THEN
    CREATE POLICY "Users can view batches from own analyses"
      ON log_analysis_batches
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM log_analyses
          WHERE log_analyses.id = log_analysis_batches.analysis_id
          AND log_analyses.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'log_analysis_batches'
      AND policyname = 'Users can insert batches for own analyses'
  ) THEN
    CREATE POLICY "Users can insert batches for own analyses"
      ON log_analysis_batches
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM log_analyses
          WHERE log_analyses.id = log_analysis_batches.analysis_id
          AND log_analyses.user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_log_analyses_user_status
  ON log_analyses(user_id, processing_status, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_log_analysis_batches_analysis
  ON log_analysis_batches(analysis_id);