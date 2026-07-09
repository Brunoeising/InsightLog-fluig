-- Add full-text search capabilities to log_error_fingerprints
-- Uses trigger-maintained tsvector column (to_tsvector is STABLE, not IMMUTABLE, so
-- generated columns don't work — trigger is the standard workaround)

ALTER TABLE log_error_fingerprints
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION log_error_fingerprints_update_search_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('portuguese', coalesce(NEW.normalized_message, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(array_to_string(NEW.caused_by_samples, ' '), '')), 'B') ||
    setweight(to_tsvector('portuguese', coalesce(NEW.category, '')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_error_fingerprints_search_vector ON log_error_fingerprints;
CREATE TRIGGER trg_log_error_fingerprints_search_vector
  BEFORE INSERT OR UPDATE OF normalized_message, caused_by_samples, category
  ON log_error_fingerprints
  FOR EACH ROW
  EXECUTE FUNCTION log_error_fingerprints_update_search_vector();

CREATE INDEX IF NOT EXISTS idx_log_error_fingerprints_search_vector
  ON log_error_fingerprints USING GIN (search_vector);

-- Backfill existing rows
UPDATE log_error_fingerprints
SET search_vector =
  setweight(to_tsvector('portuguese', coalesce(normalized_message, '')), 'A') ||
  setweight(to_tsvector('portuguese', coalesce(array_to_string(caused_by_samples, ' '), '')), 'B') ||
  setweight(to_tsvector('portuguese', coalesce(category, '')), 'C')
WHERE search_vector IS NULL;

-- Search RPC — respects RLS via SECURITY INVOKER
CREATE OR REPLACE FUNCTION search_log_errors(
  p_analysis_id uuid,
  p_query text,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  fingerprint text,
  category text,
  normalized_message text,
  message_sample text,
  occurrence_count integer,
  severity_score integer,
  caused_by_samples text[],
  context_samples text[],
  first_seen_at text,
  last_seen_at text,
  rank real
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  v_query tsquery;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 10;
  END IF;
  IF p_limit > 50 THEN
    p_limit := 50;
  END IF;

  BEGIN
    v_query := websearch_to_tsquery('portuguese', coalesce(p_query, ''));
  EXCEPTION WHEN OTHERS THEN
    v_query := NULL;
  END;

  RETURN QUERY
    SELECT
      f.id,
      f.fingerprint,
      f.category,
      f.normalized_message,
      f.message_sample,
      f.occurrence_count,
      f.severity_score,
      f.caused_by_samples,
      f.context_samples,
      f.first_seen_at,
      f.last_seen_at,
      ts_rank_cd(f.search_vector, v_query) AS rank
    FROM log_error_fingerprints f
    WHERE f.analysis_id = p_analysis_id
      AND v_query IS NOT NULL
      AND f.search_vector @@ v_query
    ORDER BY rank DESC, f.severity_score DESC, f.occurrence_count DESC
    LIMIT p_limit;

  IF NOT FOUND THEN
    RETURN QUERY
      SELECT
        f.id,
        f.fingerprint,
        f.category,
        f.normalized_message,
        f.message_sample,
        f.occurrence_count,
        f.severity_score,
        f.caused_by_samples,
        f.context_samples,
        f.first_seen_at,
        f.last_seen_at,
        0::real AS rank
      FROM log_error_fingerprints f
      WHERE f.analysis_id = p_analysis_id
        AND (
          f.normalized_message ILIKE '%' || coalesce(p_query, '') || '%'
          OR f.message_sample ILIKE '%' || coalesce(p_query, '') || '%'
          OR array_to_string(f.caused_by_samples, ' ') ILIKE '%' || coalesce(p_query, '') || '%'
        )
      ORDER BY f.severity_score DESC, f.occurrence_count DESC
      LIMIT p_limit;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION search_log_errors(uuid, text, int) TO authenticated;
