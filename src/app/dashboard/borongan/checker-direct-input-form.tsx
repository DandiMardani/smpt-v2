"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { Field, buttonClass, inputClass } from "@/components/final/final-ui";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";
import type {
  ProjectOptionItem,
  ProductOptionItem,
  WorkItemOptionItem,
  WorkerOptionItem,
} from "./types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface WorkItemRow {
  /** Unique key untuk React list rendering */
  key: string;
  workItemId: string | number;
  qty: string;
}

type SubmitResultRow = {
  rowIndex: number;
  workItemName: string;
  status: "success" | "error";
  data?: {
    check_code?: string;
    spk_code?: string;
    qty?: number;
    sisa_kuota?: number;
  };
  errorMsg?: string;
};

interface CheckerDirectInputFormProps {
  projects: ProjectOptionItem[];
  products: ProductOptionItem[];
  workItems: WorkItemOptionItem[];
  workers: WorkerOptionItem[];
  canOperate: boolean;
  userEmail?: string;
  onSuccessSubmit?: (data: unknown) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _rowCounter = 0;
function newKey() {
  return `row_${++_rowCounter}`;
}

function emptyRow(): WorkItemRow {
  return { key: newKey(), workItemId: "", qty: "" };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CheckerDirectInputForm({
  projects = [],
  products = [],
  workItems = [],
  workers = [],
  canOperate = true,
  userEmail: _userEmail,
  onSuccessSubmit,
}: CheckerDirectInputFormProps) {
  const router = useRouter();

  // ── Shared state (berlaku untuk semua baris) ─────────────────────────────
  const [projectId, setProjectId] = useState<string | number>("");
  const [productId, setProductId] = useState<string | number>("");
  const [workerId, setWorkerId] = useState<string | number>("");
  const [notes, setNotes] = useState<string>("");

  // ── Dynamic rows state ───────────────────────────────────────────────────
  const [rows, setRows] = useState<WorkItemRow[]>([emptyRow()]);

  // ── Feedback state ───────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitResults, setSubmitResults] = useState<SubmitResultRow[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ── Opsi Proyek ──────────────────────────────────────────────────────────
  const projectOptions: SearchableSelectOption[] = useMemo(() => {
    return projects.map((p) => ({
      value: p.id,
      label: p.name,
      sublabel: p.project_code ? `Kode: ${p.project_code}` : undefined,
    }));
  }, [projects]);

  // ── Opsi Produk (filtered by project) ───────────────────────────────────
  const filteredProducts = useMemo(() => {
    if (!projectId) return [];
    return products.filter((pr) => pr.project_id === Number(projectId));
  }, [products, projectId]);

  const productOptions: SearchableSelectOption[] = useMemo(() => {
    return filteredProducts.map((pr) => ({
      value: pr.id,
      label: pr.name,
      sublabel: `Kode: ${pr.product_code || "-"} · Target: ${(
        pr.target_production || 0
      ).toLocaleString("id-ID")} pcs`,
    }));
  }, [filteredProducts]);

  // ── Opsi Item Pekerjaan (filtered by project + product + scope) ──────────
  const filteredWorkItems = useMemo(() => {
    if (!projectId || !productId) return [];
    return workItems.filter(
      (wi) =>
        wi.project_id === Number(projectId) &&
        (!wi.product_id || wi.product_id === Number(productId)) &&
        // Khusus setoran borongan: kecualikan item khusus pekerja harian
        wi.executor_scope !== "PEKERJA_HARIAN" &&
        !wi.name.toUpperCase().includes("PEKERJA HARIAN")
    );
  }, [workItems, projectId, productId]);

  const workItemOptions: SearchableSelectOption[] = useMemo(() => {
    return filteredWorkItems.map((wi) => ({
      value: wi.id,
      label: wi.name,
      sublabel: `Tarif: Rp ${(wi.operator_price || 0).toLocaleString("id-ID")} / ${wi.unit} · Qty/Produk: ${wi.qty_per_product}`,
    }));
  }, [filteredWorkItems]);

  // ── Opsi Pekerja/Operator ────────────────────────────────────────────────
  const workerOptions: SearchableSelectOption[] = useMemo(() => {
    return workers
      .filter((w) => w.status !== "NONAKTIF")
      .map((w) => ({
        value: w.id,
        label: w.name,
        sublabel: `${w.worker_code} · ${w.position || w.department || "Pekerja Borongan"}`,
      }));
  }, [workers]);

  // ── Produk yang dipilih (untuk info kuota) ───────────────────────────────
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === Number(productId)),
    [products, productId]
  );

  // ── Row manipulation helpers ─────────────────────────────────────────────
  const updateRow = useCallback(
    (key: string, patch: Partial<Omit<WorkItemRow, "key">>) => {
      setRows((prev) =>
        prev.map((r) => (r.key === key ? { ...r, ...patch } : r))
      );
    },
    []
  );

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow()]);
  }, []);

  const removeRow = useCallback((key: string) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev; // selalu ada minimal 1 baris
      return prev.filter((r) => r.key !== key);
    });
  }, []);

  // ── Reset seluruh form ───────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setProjectId("");
    setProductId("");
    setWorkerId("");
    setNotes("");
    setRows([emptyRow()]);
    setErrorMessage(null);
    setSubmitResults(null);
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitResults(null);

    // Validasi field shared
    if (!projectId) {
      setErrorMessage("Silakan pilih Proyek terlebih dahulu.");
      return;
    }
    if (!productId) {
      setErrorMessage("Silakan pilih Produk terlebih dahulu.");
      return;
    }
    if (!workerId) {
      setErrorMessage("Silakan pilih Nama Pekerja terlebih dahulu.");
      return;
    }

    // Validasi setiap baris
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.workItemId) {
        setErrorMessage(`Baris ${i + 1}: Item Pekerjaan belum dipilih.`);
        return;
      }
      const numQty = parseFloat(row.qty);
      if (isNaN(numQty) || numQty <= 0) {
        setErrorMessage(`Baris ${i + 1}: Qty harus berupa angka positif lebih dari 0.`);
        return;
      }
    }

    setIsSubmitting(true);

    const supabase = createClient();
    const results: SubmitResultRow[] = [];

    // Submit sekuensial per baris agar error per-baris bisa ditangkap
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const numQty = parseFloat(row.qty);
      const wiInfo = filteredWorkItems.find((wi) => wi.id === Number(row.workItemId));
      const workItemName = wiInfo?.name ?? `Item #${i + 1}`;

      try {
        const { data, error: rpcError } = await supabase.rpc(
          "submit_checker_direct_input",
          {
            p_project_id: Number(projectId),
            p_product_id: Number(productId),
            p_work_item_id: Number(row.workItemId),
            p_worker_id: Number(workerId),
            p_qty: numQty,
            p_notes: notes.trim() || null,
          }
        );

        if (rpcError) {
          console.error(`Gagal submit baris ${i + 1}:`, rpcError);
          results.push({
            rowIndex: i + 1,
            workItemName,
            status: "error",
            errorMsg: rpcError.message || "Gagal memproses setoran.",
          });
          toast.error(`Baris ${i + 1} (${workItemName}): ${rpcError.message}`);
        } else {
          results.push({
            rowIndex: i + 1,
            workItemName,
            status: "success",
            data: data as SubmitResultRow["data"],
          });
          toast.success(
            `Baris ${i + 1} (${workItemName}): Setoran disimpan! SPK ${data?.spk_code ?? "-"}`
          );
          onSuccessSubmit?.(data);
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Kesalahan internal tak terduga.";
        results.push({ rowIndex: i + 1, workItemName, status: "error", errorMsg: msg });
        toast.error(`Baris ${i + 1} (${workItemName}): ${msg}`);
      }
    }

    setSubmitResults(results);
    setIsSubmitting(false);

    // Reset hanya jika semua baris berhasil
    const allSuccess = results.every((r) => r.status === "success");
    if (allSuccess) {
      setProjectId("");
      setProductId("");
      setWorkerId("");
      setNotes("");
      setRows([emptyRow()]);
      router.refresh();
    } else {
      // Partial success: hanya reset baris yang berhasil
      const successKeys = results
        .map((r, idx) => (r.status === "success" ? rows[idx]?.key : null))
        .filter((k): k is string => k !== null);

      setRows((prev) => {
        const remaining = prev.filter((r) => !successKeys.includes(r.key));
        return remaining.length > 0 ? remaining : [emptyRow()];
      });
      router.refresh();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-blue-200/90 bg-white p-5 sm:p-6 shadow-sm space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-2xs text-sm">
              ⚡
            </span>
            <h2 className="text-base font-extrabold text-slate-900">
              Input Setoran Mandiri (Auto-SPK)
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Khusus Checker untuk mencatat hasil kerja operator borongan secara langsung. Satu submit bisa mencakup beberapa item pekerjaan sekaligus.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-200/60">
            Mode Mandiri Aktif
          </span>
        </div>
      </div>

      {/* ── Hasil Submit (per baris) ── */}
      {submitResults && (
        <div className="space-y-2">
          {submitResults.map((r) =>
            r.status === "success" ? (
              <div
                key={r.rowIndex}
                className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-3 text-xs text-emerald-950 animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="flex items-center gap-1.5 font-black text-emerald-900">
                    <span>✅</span>
                    <span>Baris {r.rowIndex} — {r.workItemName}</span>
                  </span>
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="rounded-md bg-white border border-emerald-200 px-2 py-0.5">
                      SPK: <b className="text-blue-700">{r.data?.spk_code ?? "-"}</b>
                    </span>
                    <span className="rounded-md bg-white border border-emerald-200 px-2 py-0.5">
                      Setoran: <b>{r.data?.check_code ?? "-"}</b>
                    </span>
                    <span className="rounded-md bg-white border border-emerald-200 px-2 py-0.5">
                      Qty: <b className="text-emerald-700">{r.data?.qty ?? "-"}</b>
                    </span>
                    <span className="rounded-md bg-white border border-emerald-200 px-2 py-0.5">
                      Sisa Kuota: <b className="text-indigo-700">
                        {Number(r.data?.sisa_kuota ?? 0).toLocaleString("id-ID")}
                      </b>
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div
                key={r.rowIndex}
                className="rounded-xl border border-rose-300 bg-rose-50/95 p-3 text-xs text-rose-950 animate-in fade-in duration-200"
              >
                <span className="flex items-center gap-1.5 font-black text-rose-900">
                  <span>⛔</span>
                  <span>
                    Baris {r.rowIndex} — {r.workItemName}:{" "}
                    <span className="font-normal">{r.errorMsg}</span>
                  </span>
                </span>
              </div>
            )
          )}
          <button
            type="button"
            onClick={() => setSubmitResults(null)}
            className="text-xs text-slate-400 hover:text-slate-600 underline cursor-pointer"
          >
            Tutup ringkasan
          </button>
        </div>
      )}

      {/* ── Error validasi ── */}
      {errorMessage && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50/95 p-4 text-xs text-rose-950 shadow-xs space-y-1.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-black text-sm text-rose-900">
              <span>⛔</span> Validasi Gagal
            </span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-700 hover:text-rose-900 text-xs font-bold cursor-pointer"
            >
              ✕ Tutup
            </button>
          </div>
          <p className="leading-relaxed font-medium pt-0.5">{errorMessage}</p>
          <div className="pt-1 text-[11px] text-rose-700">
            ℹ️ <b>Penyebab Umum:</b> Qty yang diinput melebihi akumulasi Target Produksi + Toleransi/Spare, atau pekerja/produk sedang nonaktif.
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ── Baris 1: Proyek & Produk (shared) ── */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <SearchableSelect
            label="1. Pilih Proyek *"
            name="project_id"
            value={projectId}
            onChange={(val) => {
              setProjectId(val);
              setProductId("");
              setRows([emptyRow()]);
              setErrorMessage(null);
            }}
            options={projectOptions}
            placeholder="-- Pilih Proyek --"
            searchPlaceholder="Cari nama atau kode proyek..."
            disabled={isSubmitting || !canOperate}
            required
          />

          <SearchableSelect
            label="2. Pilih Produk *"
            name="product_id"
            value={productId}
            onChange={(val) => {
              setProductId(val);
              setRows([emptyRow()]);
              setErrorMessage(null);
            }}
            options={productOptions}
            placeholder={
              projectId
                ? productOptions.length > 0
                  ? "-- Pilih Produk --"
                  : "Tidak ada produk aktif"
                : "-- Pilih proyek terlebih dahulu --"
            }
            searchPlaceholder="Cari nama atau kode produk..."
            disabled={isSubmitting || !projectId || !canOperate}
            required
          />
        </div>

        {/* ── Baris 2: Pekerja & Catatan (shared) ── */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          <SearchableSelect
            label="3. Pilih Nama Pekerja (Operator) *"
            name="worker_id"
            value={workerId}
            onChange={(val) => {
              setWorkerId(val);
              setErrorMessage(null);
            }}
            options={workerOptions}
            placeholder="-- Pilih Pekerja / Operator --"
            searchPlaceholder="Cari nama atau ID pekerja..."
            disabled={isSubmitting || !canOperate}
            required
          />

          <Field label="4. Catatan / Keterangan (Opsional, berlaku semua baris)">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Setoran darurat lot #12, selesai siang..."
              disabled={isSubmitting || !canOperate}
              className={inputClass}
            />
          </Field>
        </div>

        {/* ── Info produk yang dipilih ── */}
        {selectedProduct && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3.5 py-2.5 text-xs text-slate-700">
            <span className="font-bold text-blue-800">Produk aktif:</span>{" "}
            {selectedProduct.name}{" "}
            <span className="text-slate-500">
              — Target: {Number(selectedProduct.target_production || 0).toLocaleString("id-ID")} pcs
            </span>
          </div>
        )}

        {/* ── Dynamic rows: Item Pekerjaan + Qty ── */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-700">
            5. Komponen Item Pekerjaan &amp; Qty{" "}
            <span className="font-normal text-slate-400">
              ({rows.length} baris)
            </span>
          </p>

          {rows.map((row, idx) => {
            const selectedWi = filteredWorkItems.find(
              (wi) => wi.id === Number(row.workItemId)
            );

            return (
              <div
                key={row.key}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-3"
              >
                {/* Label baris + tombol hapus */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                    Baris {idx + 1}
                  </span>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      disabled={isSubmitting}
                      title="Hapus baris ini"
                      className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-100 transition cursor-pointer disabled:opacity-40"
                    >
                      <span>🗑</span> Hapus
                    </button>
                  )}
                </div>

                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                  {/* Item Pekerjaan */}
                  <SearchableSelect
                    label="Item Pekerjaan *"
                    name={`work_item_id_${row.key}`}
                    value={row.workItemId}
                    onChange={(val) => {
                      updateRow(row.key, { workItemId: val });
                      setErrorMessage(null);
                    }}
                    options={workItemOptions}
                    placeholder={
                      productId
                        ? workItemOptions.length > 0
                          ? "-- Pilih Item Pekerjaan --"
                          : "Tidak ada pekerjaan aktif"
                        : "-- Pilih produk terlebih dahulu --"
                    }
                    searchPlaceholder="Cari nama pekerjaan atau tarif..."
                    disabled={isSubmitting || !productId || !canOperate}
                    required
                  />

                  {/* Qty */}
                  <Field
                    label={`Qty Setoran${selectedWi ? ` (${selectedWi.unit})` : ""} *`}
                  >
                    <input
                      type="number"
                      min="0.0001"
                      step="any"
                      required
                      value={row.qty}
                      onChange={(e) =>
                        updateRow(row.key, { qty: e.target.value })
                      }
                      placeholder="Jumlah yang selesai dikerjakan..."
                      disabled={isSubmitting || !canOperate}
                      className={inputClass}
                    />
                  </Field>
                </div>

                {/* Info kuota per baris */}
                {selectedProduct && selectedWi && (
                  <div className="rounded-lg bg-white border border-slate-200 px-3 py-2 text-[11px] text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      Tarif:{" "}
                      <b className="text-blue-700 font-mono">
                        Rp {(selectedWi.operator_price || 0).toLocaleString("id-ID")} / {selectedWi.unit}
                      </b>
                    </span>
                    <span>
                      Rasio:{" "}
                      <b>{selectedWi.qty_per_product} {selectedWi.unit}/produk</b>
                    </span>
                    <span>
                      Kuota standar:{" "}
                      <b className="text-emerald-700">
                        {(
                          Number(selectedProduct.target_production || 0) *
                          Number(selectedWi.qty_per_product || 1)
                        ).toLocaleString("id-ID")}{" "}
                        {selectedWi.unit}
                      </b>
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Tombol tambah baris */}
          <button
            type="button"
            onClick={addRow}
            disabled={isSubmitting || !productId || !canOperate}
            className="flex items-center gap-1.5 rounded-xl border border-dashed border-blue-300 bg-blue-50/60 px-4 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed w-full justify-center"
          >
            <span>＋</span> Tambah Komponen Item Pekerjaan
          </button>
        </div>

        {/* ── Tombol Aksi ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <p className="text-[11px] text-slate-400">
            * SPK dan Item SPK dibuat otomatis. Setiap baris dikirim sebagai setoran terpisah dalam satu kali submit.
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetForm}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer disabled:opacity-40"
            >
              Reset Form
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !canOperate}
              className={`${buttonClass} ${isSubmitting ? "opacity-60 cursor-wait" : ""}`}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Memproses {rows.length} Setoran...</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <span>⚡</span>
                  <span>
                    Simpan {rows.length > 1 ? `${rows.length} Setoran` : "Setoran Mandiri"}
                  </span>
                </span>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
