"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { qty } from "@/lib/final/final-utils";
import { Badge, Empty, buttonClass, dangerClass, inputClass } from "@/components/final/final-ui";
import { toast } from "@/components/ui/toast";
import type { CheckerEditRequest } from "./types";

interface AdminApprovalClientProps {
  requests: CheckerEditRequest[];
  isAdminOrManager: boolean;
}

export function AdminApprovalClient({
  requests,
  isAdminOrManager,
}: AdminApprovalClientProps) {
  const router = useRouter();
  const [filterStatus, setFilterStatus] = useState<"pending" | "all" | "approved" | "rejected">("pending");
  const [search, setSearch] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests]
  );

  const filteredRequests = useMemo(() => {
    let list = requests;
    if (filterStatus !== "all") {
      list = list.filter((r) => r.status === filterStatus);
    }

    const term = search.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (r) =>
          (r.spk_code || "").toLowerCase().includes(term) ||
          (r.work_item_name || "").toLowerCase().includes(term) ||
          (r.operator_name || "").toLowerCase().includes(term) ||
          (r.checker_name || "").toLowerCase().includes(term) ||
          (r.checker_email || "").toLowerCase().includes(term) ||
          (r.check_code || "").toLowerCase().includes(term) ||
          (r.reason || "").toLowerCase().includes(term)
      );
    }
    return list;
  }, [requests, filterStatus, search]);

  const handleReview = async (
    requestId: number,
    decision: "approved" | "rejected"
  ) => {
    setProcessingId(requestId);
    setNotice(null);

    try {
      const supabase = createClient();
      const notes = reviewNotes[requestId]?.trim() || null;

      // Parameter RPC harus bertipe kuat: p_request_id (Number murni), p_decision, p_review_notes (notes || null)
      const { data, error } = await supabase.rpc("review_checker_edit_request", {
        p_request_id: Number(requestId),
        p_decision: decision,
        p_review_notes: notes || null,
      });

      if (error) {
        console.error("RPC Error:", JSON.stringify(error, null, 2), error);
        // Jika error.message tidak ada, gunakan JSON.stringify(error) agar isi asli penolakan terlihat jelas
        const errorMsg =
          error.message ||
          (error.details ? String(error.details) : null) ||
          (error.hint ? String(error.hint) : null) ||
          JSON.stringify(error);

        setNotice({
          type: "error",
          message: errorMsg,
        });
        toast.error(errorMsg);
        return;
      }

      const res = data as { success?: boolean; message?: string } | null;
      const successMsg =
        res?.message ||
        `Pengajuan berhasil di-${decision === "approved" ? "setujui" : "tolak"}.`;

      setNotice({
        type: "success",
        message: successMsg,
      });
      toast.success(successMsg);

      // Bersihkan catatan review untuk baris ini
      setReviewNotes((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });

      router.refresh();
    } catch (err: unknown) {
      console.error("RPC Error:", JSON.stringify(err, null, 2), err);
      let errorMsg = "";

      if (err && typeof err === "object") {
        const obj = err as Record<string, unknown>;
        if (typeof obj.message === "string" && obj.message) {
          errorMsg = obj.message;
        } else if (typeof obj.details === "string" && obj.details) {
          errorMsg = obj.details;
        } else if (typeof obj.hint === "string" && obj.hint) {
          errorMsg = obj.hint;
        } else {
          errorMsg = JSON.stringify(err);
        }
      } else if (typeof err === "string" && err) {
        errorMsg = err;
      } else {
        errorMsg = JSON.stringify(err);
      }

      setNotice({
        type: "error",
        message: errorMsg,
      });
      toast.error(errorMsg);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Notice Feedback */}
      {notice && (
        <div
          className={`rounded-2xl border p-4 text-xs font-semibold shadow-xs flex items-center justify-between ${
            notice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{notice.type === "success" ? "✅" : "⚠️"}</span>
            <span>{notice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* Kontrol & Filter */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterStatus("pending")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition cursor-pointer ${
                filterStatus === "pending"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Menunggu Persetujuan ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("all")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition cursor-pointer ${
                filterStatus === "all"
                  ? "bg-slate-800 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Semua ({requests.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("approved")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition cursor-pointer ${
                filterStatus === "approved"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Disetujui ({requests.filter((r) => r.status === "approved").length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("rejected")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition cursor-pointer ${
                filterStatus === "rejected"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Ditolak ({requests.filter((r) => r.status === "rejected").length})
            </button>
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari SPK, Checker, atau Operator..."
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Role Alert jika bukan Admin/Manager */}
      {!isAdminOrManager && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900">
          ℹ️ Anda sedang melihat daftar pengajuan dalam mode Checker. Hanya Administrator atau Manager yang memiliki wewenang untuk Menyetujui atau Menolak pengajuan.
        </div>
      )}

      {/* List Permintaan */}
      <div className="space-y-3">
        {filteredRequests.length === 0 ? (
          <Empty>
            {filterStatus === "pending"
              ? "Tidak ada pengajuan perubahan setoran yang sedang menunggu persetujuan."
              : "Tidak ada data pengajuan yang cocok dengan filter saat ini."}
          </Empty>
        ) : (
          filteredRequests.map((r) => {
            const isProcessing = processingId === r.id;
            const diff = Number(r.requested_qty) - Number(r.current_qty);
            const unit = r.unit || "PCS";

            return (
              <div
                key={r.id}
                className="rounded-2xl border border-slate-200/90 bg-white p-4.5 shadow-2xs transition hover:border-slate-300 space-y-3"
              >
                {/* Header Card */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 pb-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="font-extrabold text-slate-900 text-sm">
                      {r.spk_code || "SPK"} · {r.work_item_name || "Pekerjaan"}
                    </b>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-bold text-slate-600">
                      {r.check_code || `Setoran #${r.setoran_id}`}
                    </span>
                    <span className="text-xs text-slate-400">
                      Tanggal: {r.check_date || "-"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {r.status === "pending" && (
                      <span className="rounded-full border border-amber-200 bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 animate-pulse">
                        ⏳ Menunggu Review
                      </span>
                    )}
                    {r.status === "approved" && (
                      <Badge>DISETUJUI</Badge>
                    )}
                    {r.status === "rejected" && (
                      <span className="rounded-full border border-rose-200 bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800">
                        DITOLAK
                      </span>
                    )}
                  </div>
                </div>

                {/* Konten Komparasi Qty & Alasan */}
                <div className="grid gap-4 sm:grid-cols-3 text-xs">
                  {/* Info Pihak Terkait */}
                  <div className="space-y-1">
                    <p className="text-slate-500 font-medium">Pengaju (Checker):</p>
                    <p className="font-bold text-slate-800">
                      {r.checker_name || r.checker_email || r.checker_id}
                    </p>
                    {r.operator_name && (
                      <>
                        <p className="text-slate-500 font-medium pt-1">Operator Pengerjaan:</p>
                        <p className="font-semibold text-slate-700">{r.operator_name}</p>
                      </>
                    )}
                    <p className="text-slate-400 text-[11px] pt-1">
                      Diajukan: {new Date(r.created_at).toLocaleString("id-ID")}
                    </p>
                  </div>

                  {/* Komparasi Qty */}
                  <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 space-y-1.5">
                    <p className="text-slate-500 font-medium">Perubahan Qty Sah:</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold line-through text-slate-400">
                        {qty(r.current_qty)}
                      </span>
                      <span className="text-slate-400">➔</span>
                      <span className="text-base font-extrabold text-blue-700">
                        {qty(r.requested_qty)}
                      </span>
                      <span className="font-bold text-slate-600 text-xs">{unit}</span>
                    </div>
                    <div className="pt-0.5">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-extrabold ${
                          diff > 0
                            ? "bg-emerald-100 text-emerald-800"
                            : diff < 0
                            ? "bg-rose-100 text-rose-800"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        Selisih: {diff > 0 ? `+${qty(diff)}` : qty(diff)} {unit}
                      </span>
                    </div>
                  </div>

                  {/* Alasan Checker */}
                  <div className="space-y-1">
                    <p className="text-slate-500 font-medium">Alasan Pengajuan:</p>
                    <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-2.5 text-slate-800 italic">
                      &ldquo;{r.reason}&rdquo;
                    </div>
                    {r.review_notes && (
                      <div className="mt-1.5 text-[11px] text-slate-600">
                        <b className="text-slate-700">Catatan Reviewer:</b> {r.review_notes}
                      </div>
                    )}
                  </div>
                </div>

                {/* Form Aksi Review (Hanya jika status pending & Admin/Manager) */}
                {r.status === "pending" && isAdminOrManager && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Tambahkan catatan review (opsional)..."
                        value={reviewNotes[r.id] || ""}
                        onChange={(e) =>
                          setReviewNotes((prev) => ({
                            ...prev,
                            [r.id]: e.target.value,
                          }))
                        }
                        disabled={isProcessing}
                        className={inputClass}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleReview(r.id, "approved")}
                        disabled={isProcessing}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                      >
                        <span>✓</span>
                        <span>{isProcessing ? "Memproses..." : "Terima"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReview(r.id, "rejected")}
                        disabled={isProcessing}
                        className={dangerClass}
                      >
                        <span>✕</span>
                        <span>{isProcessing ? "Memproses..." : "Tolak"}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

