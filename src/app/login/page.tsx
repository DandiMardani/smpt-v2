"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, type FormEvent } from "react";
import { KdmbBrandLogo } from "@/components/kdmb-brand-logo";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("access");
    if (!code) return;

    const messages: Record<string, string> = {
      profile_missing: "Profile akun belum terbentuk. Jalankan migration runtime hardening lalu login kembali.",
      profile_read_error: "Profile akun tidak dapat dibaca. Periksa koneksi dan policy Supabase.",
      account_inactive: "Akun ini sedang dinonaktifkan. Hubungi ADMIN.",
      role_rpc_error: "Role akun tidak dapat dibaca dari Supabase. Pastikan migration terbaru sudah diterapkan.",
      role_invalid: "Role akun tidak aktif atau belum dikonfigurasi. Hubungi ADMIN.",
      permission_read_error: "Permission akun tidak dapat dibaca. Pastikan migration terbaru sudah diterapkan.",
    };

    setError(messages[code] ?? "Akses akun tidak dapat diproses.");
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

    const rawInput = emailInput.trim();
    const password = passwordInput;

    if (!rawInput || !password) {
      setError("Email atau ID Pekerja dan password wajib diisi.");
      return;
    }

    const email = rawInput.includes("@") ? rawInput.toLowerCase() : `${rawInput.toLowerCase()}@smpt.id`;

    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) {
        setError("Email/ID Pekerja atau kata sandi salah. Silakan coba lagi.");
        return;
      }

      window.location.assign("/dashboard");
    } catch (loginFailure) {
      console.error("Login gagal:", loginFailure);
      setError("Login gagal diproses. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#eaf2ff] via-[#f7f9fc] to-white px-4 py-12 text-gray-900">
      <section className="w-full max-w-md rounded-2xl border border-gray-200/80 bg-white p-7 shadow-xl sm:p-9">
        <div className="mb-7 text-center sm:text-left">
          {/* Logo Vektor KDMB (Background Putih, Garis/Teks Hitam) */}
          <div className="mb-5 flex justify-center sm:justify-start">
            <KdmbBrandLogo className="h-14 w-32" />
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0d6efd]">
            Sistem Manajemen Produksi Terpadu
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">
            Kreasi Dinamika Maju Bersama
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Silakan masuk dengan akun perusahaan Anda.
          </p>
        </div>

        {error ? (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 shadow-xs">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs font-semibold text-gray-700"
            >
              Email atau ID Pekerja
            </label>
            <input
              id="email"
              name="email"
              type="text"
              autoComplete="username"
              required
              disabled={loading}
              value={emailInput}
              onChange={(e) => {
                setEmailInput(e.target.value);
                if (error) setError("");
              }}
              className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#0d6efd] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60 shadow-xs"
              placeholder="nama@email.com atau PKR-00012"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs font-semibold text-gray-700"
            >
              Kata Sandi
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                disabled={loading}
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  if (error) setError("");
                }}
                className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 pr-12 text-sm text-gray-900 outline-none transition focus:border-[#0d6efd] focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60 shadow-xs"
                placeholder="Masukkan kata sandi"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                disabled={loading}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-gray-400 transition hover:text-gray-700 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {showPassword ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d="M3 3l18 18" />
                    <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" />
                    <path d="M9.9 4.24A9.8 9.8 0 0 1 12 4c5 0 9 4 10 8a12.7 12.7 0 0 1-2.1 4.1" />
                    <path d="M6.61 6.61A12.2 12.2 0 0 0 2 12c1 4 5 8 10 8a9.8 9.8 0 0 0 3.1-.5" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                    aria-hidden="true"
                  >
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#0d6efd] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#0b5ed7] active:bg-[#0a58ca] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Memproses..." : "Masuk ke Sistem"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          Kreasi Dinamika Maju Bersama
        </p>
      </section>
    </main>
  );
}
