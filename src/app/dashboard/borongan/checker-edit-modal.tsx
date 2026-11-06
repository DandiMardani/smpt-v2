"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { qty } from "@/lib/final/final-utils";
import { buttonClass, secondaryClass } from "@/components/final/final-ui";
import type { ProductionCheck } from "./types";

interface CheckerEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  check: ProductionCheck | null;
  taskContext?: {
    spk_code?: string;
    work_item_name?: string;
    operator_name?: string;
    unit?: string;
  } | null;
  onSuccess?: () => void;
}

export function CheckerEditModal({
  isOpen,
  onClose,
  check,
  taskContext,
  onSuccess,
}: CheckerEditModalProps) {
  const router = useRouter();
  const [requestedQty, setRequestedQty] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !check) return null;

  const currentGoodQty = Number(check.good_qty) || 0;
  const unit = taskContext?.unit || "PCS";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numQty = parseFloat(requestedQty);
    if (isNaN(numQty) || numQty < 0) {
      setErrorMsg("Qty baru harus berupa angka dan minimal 0.");
      return;
    }

    if (!reason.trim()) {
      setErrorMsg("Alasan pengajuan perubahan wajib diisi.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Sesi login tidak valid. Silakan muat ulang halaman.");
      }

      // Simpan ke tabel checker_edit_requests
      const { error } = await supabase.from("checker_edit_requests").insert({
        setoran_id: check.id,
        checker_id: user.id,
        current_qty: currentGoodQty,
        requested_qty: numQty,
        reason: reason.trim(),
        status: "pending",
      });

      if (error) {
        if (error.code === "23505" || error.message.includes("idx_checker_edit_requests_single_pending")) {
          throw new Error("Pengajuan perubahan untuk setoran ini sudah ada dan sedang berstatus pending.");
        }
        throw error;
      }

      setRequestedQty("");
      setReason("");
      onClose();
      if (onSuccess) onSuccess();
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal mengirim pengajuan perubahan.";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800 text-base font-bold">
              ✏️
            </span>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Ajukan Perubahan Setoran
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                {check.check_code || `Setoran #${check.id}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            ✕
          </button>
        </div>

        {/* Info Card Ringkasan Setoran Saat Ini */}
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-3.5 text-xs text-slate-700 space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500">SPK & Pekerjaan:</span>
            <span className="font-bold text-slate-900">
              {taskContext?.spk_code || "-"} · {taskContext?.work_item_name || "-"}
            </span>
          </div>
          {taskContext?.operator_name && (
            <div className="flex justify-between">
              <span className="text-slate-500">Operator:</span>
              <span className="font-semibold text-slate-800">
                {taskContext.operator_name}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">Tanggal Pemeriksaan:</span>
            <span className="font-mono">{check.check_date || "-"}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200/70 pt-1.5 mt-1.5">
            <span className="text-slate-500 font-medium">Qty Sah Saat Ini (Terkunci):</span>
            <span className="font-extrabold text-emerald-700 text-sm">
              {qty(currentGoodQty)} {unit}
            </span>
          </div>
        </div>

        {/* Alert Error */}
        {errorMsg && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2 shadow-2xs">
            <span className="text-sm font-bold">⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Modal */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Qty Baru yang Diajukan <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.0001"
                required
                value={requestedQty}
                onChange={(e) => setRequestedQty(e.target.value)}
                placeholder={`Contoh: ${currentGoodQty}`}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-xs"
              />
              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-xs font-bold text-slate-400">
                {unit}
              </span>
            </div>
            {requestedQty !== "" && (
              <p className="mt-1 text-[11px] text-slate-500">
                Selisih:{" "}
                <b
                  className={
                    parseFloat(requestedQty) - currentGoodQty > 0
                      ? "text-emerald-600 font-bold"
                      : parseFloat(requestedQty) - currentGoodQty < 0
                      ? "text-rose-600 font-bold"
                      : "text-slate-600"
                  }
                >
                  {parseFloat(requestedQty) - currentGoodQty > 0 ? "+" : ""}
                  {qty(parseFloat(requestedQty) - currentGoodQty)} {unit}
                </b>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Alasan Pengajuan Perubahan <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tuliskan alasan jelas koreksi hasil pemeriksaan fisik..."
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className={secondaryClass}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`${buttonClass} ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {loading ? "Mengirim..." : "Kirim Pengajuan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

