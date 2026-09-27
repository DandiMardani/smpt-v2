"use client";

import { useState } from "react";

type Props = {
  href: string;
  label?: string;
  variant?: "green" | "violet" | "slate" | "amber" | "blue";
  size?: "sm" | "md";
  icon?: string;
};

const VARIANTS: Record<string, string> = {
  green:  "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  violet: "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100",
  slate:  "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  amber:  "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
  blue:   "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100",
};

const SIZES: Record<string, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

/**
 * ExportButton — tombol download Excel dengan loading state.
 *
 * Cara pakai:
 * ```tsx
 * <ExportButton
 *   href="/api/export/xlsx?report=spk&from=2024-01-01&to=2024-12-31"
 *   label="Export SPK"
 *   variant="green"
 * />
 * ```
 */
export function ExportButton({
  href,
  label = "Export Excel",
  variant = "green",
  size = "sm",
  icon = "📥",
}: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    setLoading(true);
    // Reset loading setelah 4 detik (beri waktu cukup untuk download dimulai)
    setTimeout(() => setLoading(false), 4000);
  };

  return (
    <a
      href={loading ? undefined : href}
      onClick={handleClick}
      className={[
        "inline-flex cursor-pointer items-center gap-1.5 rounded-xl border font-semibold shadow-xs transition select-none",
        VARIANTS[variant] ?? VARIANTS.green,
        SIZES[size] ?? SIZES.sm,
        loading ? "opacity-70 pointer-events-none" : "",
      ].join(" ")}
      aria-disabled={loading}
    >
      {loading ? (
        <>
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Menyiapkan…
        </>
      ) : (
        <>
          {icon} {label}
        </>
      )}
    </a>
  );
}
