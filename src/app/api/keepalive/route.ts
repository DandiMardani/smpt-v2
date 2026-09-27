import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Konfigurasi ──────────────────────────────────────────────────────────────
// Cron secret untuk mencegah hit dari luar Vercel.
// Set env var CRON_SECRET di Vercel Dashboard → Settings → Environment Variables
const CRON_SECRET = process.env.CRON_SECRET ?? "";

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  // 1. Verifikasi bahwa request berasal dari Vercel Cron (atau manual dengan secret)
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-vercel-cron"); // otomatis ada jika dari Vercel Cron

  const isVercelCron = cronHeader === "1";
  const hasValidSecret =
    CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;

  if (!isVercelCron && !hasValidSecret) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Hanya bisa diakses oleh Vercel Cron." },
      { status: 401 }
    );
  }

  const startedAt = new Date().toISOString();
  const jakartaTime = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "full",
    timeStyle: "medium",
  }).format(new Date());

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { ok: false, error: "Env vars Supabase tidak ditemukan." },
      { status: 500 }
    );
  }

  const results: Record<string, unknown> = {
    started_at: startedAt,
    jakarta_time: jakartaTime,
  };

  // 2. Ping Supabase Auth endpoint
  try {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? supabaseKey;
    const authPing = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    results.auth_ping = { ok: authPing.ok, status: authPing.status };
  } catch (e) {
    results.auth_ping = { ok: false, error: String(e) };
  }

  // 3. Query sederhana ke database via Supabase REST (wake up koneksi DB)
  try {
    const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    // Query ringan: ambil 1 baris dari workers (tidak butuh auth)
    const { data, error } = await supabase
      .from("workers")
      .select("id")
      .limit(1)
      .maybeSingle();

    results.db_ping = {
      ok: !error,
      has_data: data !== null,
      error: error?.message ?? null,
    };
  } catch (e) {
    results.db_ping = { ok: false, error: String(e) };
  }

  // 4. Tulis log ke Supabase (tabel smpt_keepalive_log) jika ada
  //    Kalau tabel tidak ada, tidak masalah — skip saja
  try {
    const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    const allOk =
      (results.auth_ping as any)?.ok === true &&
      (results.db_ping as any)?.ok === true;

    await supabase.from("smpt_keepalive_log").insert({
      pinged_at: startedAt,
      auth_ok: (results.auth_ping as any)?.ok ?? false,
      db_ok: (results.db_ping as any)?.ok ?? false,
      all_ok: allOk,
      meta: results,
    });

    results.log_written = true;
  } catch {
    // Tabel belum ada — normal, tidak perlu error
    results.log_written = false;
  }

  const allOk =
    (results.auth_ping as any)?.ok === true &&
    (results.db_ping as any)?.ok === true;

  return NextResponse.json(
    {
      ok: allOk,
      message: allOk
        ? "✅ Supabase aktif — keepalive berhasil."
        : "⚠️ Ada masalah saat ping Supabase.",
      ...results,
    },
    { status: allOk ? 200 : 502 }
  );
}
