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

-- RLS: tabel ini hanya bisa ditulis oleh service role (via SUPABASE_SECRET_KEY)
-- User biasa tidak bisa akses
ALTER TABLE smpt_keepalive_log ENABLE ROW LEVEL SECURITY;

-- Tidak ada policy public → hanya service role yang bisa akses
-- (service role bypass RLS secara default)

-- Auto-hapus log lama (>30 hari) agar tidak tumbuh terus
-- Jalankan via pg_cron kalau tersedia, atau biarkan manual cleanup
-- Di free tier, 30 baris/bulan = ~1 KB, aman.

-- View untuk mudah cek status terakhir
CREATE OR REPLACE VIEW smpt_keepalive_status AS
SELECT
  id,
  pinged_at,
  TO_CHAR(pinged_at AT TIME ZONE 'Asia/Jakarta', 'DD Mon YYYY HH24:MI WIB') AS waktu_wib,
  auth_ok,
  db_ok,
  all_ok,
  CASE
    WHEN all_ok THEN '✅ OK'
    WHEN NOT auth_ok THEN '❌ Auth Gagal'
    WHEN NOT db_ok  THEN '❌ DB Gagal'
    ELSE '⚠️ Partial'
  END AS status_label,
  EXTRACT(EPOCH FROM (NOW() - pinged_at)) / 3600 AS jam_sejak_ping
FROM smpt_keepalive_log
ORDER BY pinged_at DESC
LIMIT 20;

-- Fungsi untuk ambil status keepalive terakhir (bisa dipanggil dari RPC)
CREATE OR REPLACE FUNCTION smpt_last_keepalive()
RETURNS TABLE (
  last_ping     TIMESTAMPTZ,
  last_ping_wib TEXT,
  all_ok        BOOLEAN,
  jam_sejak     NUMERIC,
  status        TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    pinged_at,
    TO_CHAR(pinged_at AT TIME ZONE 'Asia/Jakarta', 'DD Mon YYYY HH24:MI WIB'),
    all_ok,
    ROUND(EXTRACT(EPOCH FROM (NOW() - pinged_at)) / 3600, 1),
    CASE
      WHEN all_ok THEN '✅ Aktif'
      ELSE '⚠️ Perlu Cek'
    END
  FROM smpt_keepalive_log
  ORDER BY pinged_at DESC
  LIMIT 1;
$$;
