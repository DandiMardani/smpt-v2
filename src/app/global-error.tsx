"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[SMPT Root Global Error Caught]:", error);
  }, [error]);

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          backgroundColor: "#f8fafc",
          color: "#0f172a",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            maxWidth: "480px",
            width: "100%",
            backgroundColor: "#ffffff",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            padding: "32px 24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              margin: "0 auto 16px auto",
              borderRadius: "16px",
              backgroundColor: "#fff1f2",
              border: "1px solid #ffe4e6",
              color: "#e11d48",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
            }}
          >
            ⚠️
          </div>

          <h1
            style={{
              margin: "0 0 8px 0",
              fontSize: "20px",
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            Terjadi Kesalahan Sistem
          </h1>
          <p
            style={{
              margin: "0 0 20px 0",
              fontSize: "13px",
              lineHeight: 1.6,
              color: "#64748b",
            }}
          >
            Aplikasi mengalami kendala fatal di tingkat root sistem. Silakan muat ulang atau coba lagi.
          </p>

          {error?.message && (
            <div
              style={{
                marginBottom: "20px",
                padding: "12px",
                borderRadius: "12px",
                backgroundColor: "#f1f5f9",
                border: "1px solid #e2e8f0",
                textAlign: "left",
                fontSize: "11px",
                fontFamily: "monospace",
                color: "#334155",
                wordBreak: "break-all",
              }}
            >
              {error.message}
              {error?.digest && (
                <div style={{ marginTop: "4px", fontSize: "10px", color: "#94a3b8" }}>
                  Digest: {error.digest}
                </div>
              )}
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                cursor: "pointer",
                padding: "10px 18px",
                fontSize: "12px",
                fontWeight: 700,
                color: "#ffffff",
                backgroundColor: "#2563eb",
                border: "none",
                borderRadius: "10px",
                outline: "none",
              }}
            >
              🔄 Coba Lagi
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/";
              }}
              style={{
                cursor: "pointer",
                padding: "10px 16px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#334155",
                backgroundColor: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: "10px",
                outline: "none",
              }}
            >
              🏠 Halaman Utama
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
