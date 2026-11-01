"use client";

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { toast } from "@/components/ui/toast";

interface CopyButtonProps {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  successMessage?: string;
  title?: string;
}

export function CopyButton({
  text,
  label = "Salin",
  copiedLabel = "Disalin!",
  className = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs active:scale-95 cursor-pointer",
  successMessage = "Teks berhasil disalin ke clipboard!",
  title = "Copy to Clipboard",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const isSuccess = await copyToClipboard(text);
      if (isSuccess) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        toast.success(successMessage);
      } else {
        alert(
          "⚠️ Gagal menyalin ke clipboard secara otomatis (karena keterbatasan izin browser saat diakses via HTTP non-localhost atau dev tunnel).\n\nSilakan salin teks berikut secara manual:\n\n" +
            text
        );
      }
    } catch (err: any) {
      console.error("Gagal menyalin ke clipboard:", err);
      alert("Terjadi kesalahan saat menyalin ke clipboard: " + (err?.message || "Izin dibatasi browser."));
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={title}
      aria-label={title}
      className={className}
    >
      <span>{copied ? "✅" : "📋"}</span>
      <span>{copied ? copiedLabel : label}</span>
    </button>
  );
}
