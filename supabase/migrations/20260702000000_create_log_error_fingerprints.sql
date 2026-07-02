CREATE TABLE IF NOT EXISTS log_error_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES log_analyses(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  category text NOT NULL DEFAULT 'OTHER',
  normalized_message text NOT NULL,
  message_sample text NOT NULL,
  occurrence_count integer NOT NULL DEFAULT 0,
  first_seen_at text,
  last_seen_at text,
  caused_by_samples text[] DEFAULT '{}',
  context_samples text[] DEFAULT '{}',
  severity_score integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (analysis_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_log_error_fingerprints_analysis_id
  ON log_error_fingerprints(analysis_id);

CREATE INDEX IF NOT EXISTS idx_log_error_fingerprints_analysis_score
  ON log_error_fingerprints(analysis_id, severity_score DESC, occurrence_count DESC);

CREATE INDEX IF NOT EXISTS idx_log_error_fingerprints_analysis_category
  ON log_error_fingerprints(analysis_id, category);

ALTER TABLE log_error_fingerprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own log error fingerprints" ON log_error_fingerprints;
CREATE POLICY "Users can view their own log error fingerprints"
  ON log_error_fingerprints FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = log_error_fingerprints.analysis_id
        AND log_analyses.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert their own log error fingerprints" ON log_error_fingerprints;
CREATE POLICY "Users can insert their own log error fingerprints"
  ON log_error_fingerprints FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = log_error_fingerprints.analysis_id
        AND log_analyses.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own log error fingerprints" ON log_error_fingerprints;
CREATE POLICY "Users can update their own log error fingerprints"
  ON log_error_fingerprints FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = log_error_fingerprints.analysis_id
        AND log_analyses.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM log_analyses
      WHERE log_analyses.id = log_error_fingerprints.analysis_id
        AND log_analyses.user_id = auth.uid()
    )
  );
