-- Persist complete EnvironmentValidator sizing and health-check output.
-- These columns keep calculated values available after reload and in reports.

ALTER TABLE environment_analyses
  ADD COLUMN IF NOT EXISTS in_analysis_count integer DEFAULT 0;

ALTER TABLE sizing_results
  ADD COLUMN IF NOT EXISTS recommended_instances text,
  ADD COLUMN IF NOT EXISTS recommended_heap text,
  ADD COLUMN IF NOT EXISTS profile text,
  ADD COLUMN IF NOT EXISTS over_limit boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS over_limit_note text;

ALTER TABLE health_check_results
  ADD COLUMN IF NOT EXISTS system_memory_usage numeric,
  ADD COLUMN IF NOT EXISTS host_xml_heap_max text,
  ADD COLUMN IF NOT EXISTS host_xml_heap_init text,
  ADD COLUMN IF NOT EXISTS fluig_pid text;

CREATE INDEX IF NOT EXISTS idx_env_analyses_user_created ON environment_analyses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_env_analyses_sizing_status ON environment_analyses(sizing_status);