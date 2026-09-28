-- ============================================================
-- SMPT V2 — Resource Monitor: cek ukuran database
-- Jalankan di Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION smpt_db_resource_usage()
RETURNS TABLE (
  db_size_bytes  BIGINT,
  db_size_pretty TEXT,
  db_size_pct    NUMERIC,
  table_count    INTEGER,
  status         TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    pg_database_size(current_database()),
    pg_size_pretty(pg_database_size(current_database())),
    ROUND((pg_database_size(current_database())::numeric / (500 * 1024 * 1024)) * 100, 1),
    (SELECT COUNT(*)::integer FROM pg_tables WHERE schemaname = 'public'),
    CASE
      WHEN pg_database_size(current_database()) > 450 * 1024 * 1024 THEN 'CRITICAL'
      WHEN pg_database_size(current_database()) > 350 * 1024 * 1024 THEN 'WARNING'
      ELSE 'OK'
    END;
$$;
