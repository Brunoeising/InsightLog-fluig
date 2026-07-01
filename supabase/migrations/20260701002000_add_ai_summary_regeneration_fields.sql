ALTER TABLE log_analyses
  ADD COLUMN IF NOT EXISTS ai_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_generation_in_progress boolean DEFAULT false;
