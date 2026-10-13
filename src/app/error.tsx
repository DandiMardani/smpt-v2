"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Catat error ke console client agar tim teknis mudah melacak stack trace
    console.error("[SMPT Error Boundary Caught]:", error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 mb-4 border border-rose-100">
          <svg
            className="h-7 w-7"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        <h2 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
          Terjadi Kendala pada Halaman
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-slate-500 leading-relaxed">
          Sistem berhasil mengamankan tampilan agar tidak terjadi crash layar putih. Anda dapat mencoba memuat ulang data atau kembali ke dashboard.
        </p>

        {error?.message && (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-left border border-slate-200/80">
            <p className="text-[11px] font-mono font-medium text-slate-700 break-words line-clamp-3">
              {error.message}
            </p>
            {error?.digest && (
              <p className="mt-1 text-[10px] font-mono text-slate-400">
                Kode Digest: {error.digest}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 active:scale-95 transition"
          >
            🔄 Coba Lagi
          </button>
          <Link
            href="/dashboard"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 active:scale-95 transition"
          >
            🏠 Ke Dashboard
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
          >
            Muat Ulang Browser
          </button>
        </div>
      </div>
    </div>
  );
}
