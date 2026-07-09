-- Aggregated inventory + per-category listing RPCs for chat AI context
-- Both SECURITY INVOKER to respect existing RLS on log_error_fingerprints

CREATE OR REPLACE FUNCTION get_analysis_inventory(p_analysis_id uuid)
RETURNS TABLE (
  category text,
  fingerprint_count integer,
  total_occurrences bigint,
  max_severity integer,
  avg_severity numeric,
  top_message text,
  first_seen text,
  last_seen text
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  WITH per_category AS (
    SELECT
      f.category,
      count(*)::int AS fingerprint_count,
      sum(f.occurrence_count) AS total_occurrences,
      max(f.severity_score) AS max_severity,
      avg(f.severity_score)::numeric(10,2) AS avg_severity,
      min(f.first_seen_at) AS first_seen,
      max(f.last_seen_at) AS last_seen
    FROM log_error_fingerprints f
    WHERE f.analysis_id = p_analysis_id
    GROUP BY f.category
  ),
  ranked_top AS (
    SELECT
      f.category,
      f.message_sample,
      ROW_NUMBER() OVER (
        PARTITION BY f.category
        ORDER BY f.severity_score DESC, f.occurrence_count DESC
      ) AS rn
    FROM log_error_fingerprints f
    WHERE f.analysis_id = p_analysis_id
  )
  SELECT
    p.category,
    p.fingerprint_count,
    p.total_occurrences,
    p.max_severity,
    p.avg_severity,
    r.message_sample AS top_message,
    p.first_seen,
    p.last_seen
  FROM per_category p
  LEFT JOIN ranked_top r ON r.category = p.category AND r.rn = 1
  ORDER BY p.max_severity DESC, p.total_occurrences DESC;
$$;

GRANT EXECUTE ON FUNCTION get_analysis_inventory(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION list_category_fingerprints(
  p_analysis_id uuid,
  p_category text,
  p_limit int DEFAULT 50
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
  last_seen_at text
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
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
    f.last_seen_at
  FROM log_error_fingerprints f
  WHERE f.analysis_id = p_analysis_id
    AND upper(f.category) = upper(p_category)
  ORDER BY f.severity_score DESC, f.occurrence_count DESC
  LIMIT LEAST(GREATEST(coalesce(p_limit, 50), 1), 200);
$$;

GRANT EXECUTE ON FUNCTION list_category_fingerprints(uuid, text, int) TO authenticated;
