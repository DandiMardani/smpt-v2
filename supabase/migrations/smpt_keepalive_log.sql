-- ============================================================
-- SMPT V2 — Tabel Log Keepalive Supabase Auto-Ping
-- Jalankan sekali di Supabase Dashboard → SQL Editor
-- ============================================================

-- Tabel log setiap kali cron keepalive jalan
CREATE TABLE IF NOT EXISTS smpt_keepalive_log (
  id          BIGSERIAL PRIMARY KEY,
  pinged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  auth_ok     BOOLEAN NOT NULL DEFAULT FALSE,
  db_ok       BOOLEAN NOT NULL DEFAULT FALSE,
  all_ok      BOOLEAN NOT NULL DEFAULT FALSE,
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk query cepat
CREATE INDEX IF NOT EXISTS smpt_keepalive_log_pinged_at_idx
  ON smpt_keepalive_log (pinged_at DESC);

-- RLS: hanya service role yang bisa tulis (bypass RLS secara default)
ALTER TABLE smpt_keepalive_log ENABLE ROW LEVEL SECURITY;

-- View untuk mudah cek status terakhir
CREATE OR REPLACE VIEW smpt_keepalive_status AS
SELECT
  k.id,
  k.pinged_at,
  TO_CHAR(k.pinged_at AT TIME ZONE 'Asia/Jakarta', 'DD Mon YYYY HH24:MI WIB') AS waktu_wib,
  k.auth_ok,
  k.db_ok,
  k.all_ok,
  CASE
    WHEN k.all_ok       THEN '✅ OK'
    WHEN NOT k.auth_ok  THEN '❌ Auth Gagal'
    WHEN NOT k.db_ok    THEN '❌ DB Gagal'
    ELSE '⚠️ Partial'
  END AS status_label,
  EXTRACT(EPOCH FROM (NOW() - k.pinged_at)) / 3600 AS jam_sejak_ping
FROM smpt_keepalive_log k
ORDER BY k.pinged_at DESC
LIMIT 20;

-- Fungsi RPC: ambil status ping terakhir
-- Pakai alias "k" agar kolom tidak konflik dengan nama RETURNS TABLE
CREATE OR REPLACE FUNCTION smpt_last_keepalive()
RETURNS TABLE (
  last_ping     TIMESTAMPTZ,
  last_ping_wib TEXT,
  is_ok         BOOLEAN,
  jam_sejak     NUMERIC,
  status        TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    k.pinged_at,
    TO_CHAR(k.pinged_at AT TIME ZONE 'Asia/Jakarta', 'DD Mon YYYY HH24:MI WIB'),
    k.all_ok,
    ROUND(EXTRACT(EPOCH FROM (NOW() - k.pinged_at)) / 3600, 1),
    CASE
      WHEN k.all_ok THEN '✅ Aktif'
      ELSE '⚠️ Perlu Cek'
    END
  FROM smpt_keepalive_log k
  ORDER BY k.pinged_at DESC
  LIMIT 1;
$$;
