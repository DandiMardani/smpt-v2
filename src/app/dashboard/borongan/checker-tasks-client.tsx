"use client";

import { useMemo, useState, useEffect } from "react";
import { Badge, Empty, Field, buttonClass, inputClass } from "@/components/final/final-ui";
import { qty } from "@/lib/final/final-utils";
import { checkerResultAction } from "@/lib/final/actions";
import { createClient } from "@/lib/supabase/client";
import { CheckerEditModal } from "./checker-edit-modal";
import type { CheckerTaskItem, ProductionCheck, ValidationResult } from "./types";

interface CheckerTasksClientProps {
  tasks: CheckerTaskItem[];
  canOperate: boolean;
  isCheckerRole: boolean;
  userEmail?: string;
  onSelectCheckForEdit?: (check: ProductionCheck, taskContext: {
    spk_code?: string;
    work_item_name?: string;
    operator_name?: string;
    unit?: string;
  }) => void;
}

export function CheckerTasksClient({
  tasks,
  canOperate,
  isCheckerRole,
  userEmail,
  onSelectCheckForEdit,
}: CheckerTasksClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeModalCheck, setActiveModalCheck] = useState<ProductionCheck | null>(null);
  const [modalContext, setModalContext] = useState<{
    spk_code?: string;
    work_item_name?: string;
    operator_name?: string;
    unit?: string;
  } | null>(null);

  const filteredTasks = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return tasks;

    return tasks.filter((t) => {
      const matchSpk = (t.spk_code || "").toLowerCase().includes(term);
      const matchOperator =
        (t.operator_name || "").toLowerCase().includes(term) ||
        (t.operator_code || "").toLowerCase().includes(term);
      const matchProduct =
        (t.product_name || "").toLowerCase().includes(term) ||
        (t.product_code || "").toLowerCase().includes(term) ||
        (t.work_item_name_snapshot || "").toLowerCase().includes(term);

      return matchSpk || matchOperator || matchProduct;
    });
  }, [tasks, searchQuery]);

  const handleOpenEdit = (check: ProductionCheck, task: CheckerTaskItem) => {
    const ctx = {
      spk_code: task.spk_code,
      work_item_name: task.work_item_name_snapshot,
      operator_name: task.operator_name,
      unit: task.unit_snapshot,
    };

    if (onSelectCheckForEdit) {
      onSelectCheckForEdit(check, ctx);
    } else {
      setActiveModalCheck(check);
      setModalContext(ctx);
    }
  };

  return (
    <div className="space-y-4">
      {/* Modal Ajukan Perubahan */}
      <CheckerEditModal
        isOpen={Boolean(activeModalCheck)}
        onClose={() => {
          setActiveModalCheck(null);
          setModalContext(null);
        }}
        check={activeModalCheck}
        taskContext={modalContext}
      />

      {/* Search Bar - Real-time Search */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs sm:p-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari No SPK, Nama Operator, atau Produk..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10.5 pr-10 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-xs sm:text-base sm:py-2.5"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-bold text-slate-400 transition hover:text-slate-600 cursor-pointer"
                title="Hapus pencarian"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200">
                  ✕
                </span>
              </button>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-2 px-1 text-xs sm:px-0">
            <span className="text-slate-500">
              Ditemukan{" "}
              <b className="font-extrabold text-blue-700">{filteredTasks.length}</b> dari{" "}
              <b className="font-bold text-slate-700">{tasks.length}</b> tugas
            </span>
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-xs font-semibold text-blue-600 underline hover:text-blue-800 cursor-pointer"
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Daftar Penugasan */}
      <div className="space-y-4">
        {tasks.length === 0 ? (
          <Empty>
            {isCheckerRole
              ? `Tidak ada SPK aktif yang ditugaskan ke Checker (${userEmail}). Tunggu penugasan baru dari Supervisor.`
              : "Tidak ada SPK aktif yang sedang menunggu pemeriksaan Checker."}
          </Empty>
        ) : filteredTasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center text-sm text-slate-600 shadow-xs">
            <p className="font-semibold text-slate-800">
              Tidak ada tugas yang cocok dengan pencarian &ldquo;{searchQuery}&rdquo;
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Coba gunakan kata kunci lain seperti nomor SPK, nama operator, atau nama produk.
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="mt-3.5 inline-flex items-center justify-center rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-900 cursor-pointer"
            >
              Tampilkan Semua Tugas
            </button>
          </div>
        ) : (
          filteredTasks.map((t) => (
            <TaskItemCard
              key={t.id}
              task={t}
              canOperate={canOperate}
              onOpenEditModal={(check) => handleOpenEdit(check, t)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface TaskItemCardProps {
  task: CheckerTaskItem;
  canOperate: boolean;
  onOpenEditModal: (check: ProductionCheck) => void;
}

function TaskItemCard({
  task,
  canOperate,
  onOpenEditModal,
}: TaskItemCardProps) {
  const [goodQty, setGoodQty] = useState<string>("");
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  // Debounce validasi berantai via RPC validate_checker_max_qty
  useEffect(() => {
    const num = parseFloat(goodQty);
    if (isNaN(num) || num <= 0) {
      setValidation(null);
      setIsValidating(false);
      return;
    }

    setIsValidating(true);
    const timer = setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("validate_checker_max_qty", {
          p_order_item_id: task.id,
          p_input_qty: num,
        });

        if (error) {
          console.error("Gagal memanggil RPC validate_checker_max_qty:", error);
          setValidation({
            is_valid: false,
            message: "Error validasi: " + error.message,
          });
        } else if (data) {
          setValidation(data as ValidationResult);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal memvalidasi input.";
        setValidation({
          is_valid: false,
          message: msg,
        });
      } finally {
        setIsValidating(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [goodQty, task.id]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (isValidating) {
      e.preventDefault();
      alert("Sedang memvalidasi batas Qty ke sistem. Harap tunggu sebentar.");
      return;
    }
    if (validation && !validation.is_valid) {
      e.preventDefault();
      alert(`Validasi Gagal: ${validation.message}`);
      return;
    }
  };

  const isInvalid = validation !== null && !validation.is_valid;
  const isSubmitDisabled = isValidating || isInvalid || !goodQty;

  const submittedChecks = task.checks || [];

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs transition hover:border-slate-300 space-y-3.5">
      {/* Header Tugas */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <b className="font-bold text-slate-900 text-sm">
              {task.spk_code} · {task.work_item_name_snapshot}
            </b>
            {task.product_name && (
              <span className="rounded-md border border-blue-200/60 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                📦 {task.product_name}
              </span>
            )}
            {task.isOrderEdited && (
              <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                ⚠️ Diperbarui SPV
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Operator: <b className="font-bold text-slate-800">{task.operator_name}</b> ·
            Sisa penugasan{" "}
            <b>
              {qty(task.remain)} {task.unit_snapshot}
            </b>{" "}
            · Target/Produk {qty(task.qty_per_product_snapshot)}
            {task.due_date ? ` · Target Selesai: ${task.due_date}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            Checker: {task.checker_email || "-"}
          </span>
          <Badge>{task.status}</Badge>
        </div>
      </div>

      {/* Info Predecessor / Routing */}
      {task.has_dependencies ? (
        <div
          className={`rounded-xl border p-3 text-xs ${
            task.hard
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <b className="font-bold">Routing Validasi Berantai ({task.hard ? "KETAT / HARD" : "PERINGATAN / WARNING"}):</b>
          <p className="mt-0.5">
            Available predecessor: <b>{qty(task.availableEq)} equivalent produk</b>
            {task.maxRaw != null ? (
              <>
                {" "}
                · batas maksimal proses saat ini:{" "}
                <b className="underline">
                  {qty(task.maxRaw)} {task.unit_snapshot}
                </b>
              </>
            ) : null}
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          ℹ️ Tidak ada predecessor wajib. Item ini dapat diperiksa secara independen.
        </p>
      )}

      {/* SECTION 1: Setoran Sebelumnya (SUDAH DISUBMIT / TERKUNCI) */}
      {submittedChecks.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-1.5">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <span>🔒</span>
              <span>Hasil Setoran Sebelumnya (Read-Only / Terkunci)</span>
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              Total {submittedChecks.length} setoran tercatat
            </span>
          </div>

          <div className="space-y-2">
            {submittedChecks.map((sc) => {
              const hasPending = Boolean(sc.pending_request);

              return (
                <div
                  key={sc.id}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-2xs space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-800">
                        {sc.check_code || `Setoran #${sc.id}`}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        🔒 TERKUNCI
                      </span>
                      <span className="text-slate-400">· {sc.check_date}</span>
                    </div>

                    <div>
                      {hasPending ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 flex items-center gap-1">
                          <span>⏳</span>
                          <span>
                            Menunggu Persetujuan Admin (Permintaan:{" "}
                            {qty(sc.pending_request?.requested_qty)})
                          </span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenEditModal(sc)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50/80 px-2.5 py-1 text-xs font-extrabold text-amber-900 shadow-2xs transition hover:bg-amber-100 cursor-pointer"
                        >
                          <span>✏️</span>
                          <span>Ajukan Perubahan</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Form Fields dalam Mode Read-Only */}
                  <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 pt-1">
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">
                        Tanggal
                      </span>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={sc.check_date || "-"}
                        className="w-full rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-700 cursor-not-allowed font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">
                        Qty Sah
                      </span>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={`${qty(sc.good_qty)} ${task.unit_snapshot}`}
                        className="w-full rounded-lg border border-emerald-200 bg-emerald-50/60 px-2 py-1 text-xs font-extrabold text-emerald-800 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">
                        Reject
                      </span>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={`${qty(sc.reject_qty)} ${task.unit_snapshot}`}
                        className="w-full rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-600 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">
                        Catatan
                      </span>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={sc.notes || "-"}
                        className="w-full rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-600 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2: Form Input Setoran Baru (dengan Validasi Real-time) */}
      {canOperate && task.remain > 0 ? (
        <div className="rounded-xl border border-blue-200/80 bg-blue-50/20 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <span>📝</span>
              <span>Input Hasil Pemeriksaan Baru</span>
            </span>
            <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">
              Sisa Kuota: {qty(task.remain)} {task.unit_snapshot}
            </span>
          </div>

          <form action={checkerResultAction} onSubmit={handleSubmit} className="space-y-3">
            <input type="hidden" name="order_item_id" value={task.id} />

            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
              <Field label="Tanggal Pemeriksaan">
                <input
                  name="check_date"
                  type="date"
                  required
                  className={inputClass}
                  defaultValue={new Date().toISOString().split("T")[0]}
                />
              </Field>

              <Field label={`Qty Sah (${task.unit_snapshot})`}>
                <div className="relative">
                  <input
                    name="good_qty"
                    type="number"
                    min="0"
                    max={task.remain}
                    step="0.0001"
                    required
                    value={goodQty}
                    onChange={(e) => setGoodQty(e.target.value)}
                    placeholder={`Maks ${qty(task.remain)}`}
                    className={`${inputClass} ${
                      isInvalid
                        ? "border-rose-400 bg-rose-50/50 text-rose-900 focus:border-rose-500 focus:ring-rose-200"
                        : validation?.is_valid
                        ? "border-emerald-400 bg-emerald-50/30 text-emerald-900"
                        : ""
                    }`}
                  />
                  {isValidating && (
                    <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-blue-600 animate-spin">
                      ⏳
                    </span>
                  )}
                </div>
              </Field>

              <Field label={`Reject (${task.unit_snapshot})`}>
                <input
                  name="reject_qty"
                  type="number"
                  min="0"
                  max={task.remain}
                  step="0.0001"
                  defaultValue="0"
                  required
                  className={inputClass}
                />
              </Field>

              <Field label="Catatan Pemeriksaan">
                <input
                  name="notes"
                  placeholder="Kondisi pengerjaan fisik"
                  className={inputClass}
                />
              </Field>
            </div>

            {/* Validasi Feedback Real-time */}
            {isValidating && (
              <p className="flex items-center gap-1.5 text-xs text-blue-600 font-medium">
                <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
                Memvalidasi batas toleransi Qty ke sistem (RPC validate_checker_max_qty)...
              </p>
            )}

            {!isValidating && validation && !validation.is_valid && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-900 flex items-start gap-2 shadow-2xs">
                <span className="text-base leading-none font-bold">⚠️</span>
                <div>
                  <b className="font-extrabold text-rose-950">Validasi Qty Sah Ditolak:</b>
                  <p className="mt-0.5">{validation.message}</p>
                </div>
              </div>
            )}

            {!isValidating && validation && validation.is_valid && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-900 flex items-start gap-2 shadow-2xs">
                <span className="text-base leading-none font-bold">✓</span>
                <div>
                  <b className="font-bold text-emerald-950">Qty Sah Terverifikasi:</b>
                  <p className="mt-0.5">{validation.message}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end pt-1">
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className={`${buttonClass} ${
                  isSubmitDisabled
                    ? "opacity-50 cursor-not-allowed bg-slate-400 hover:bg-slate-400"
                    : ""
                }`}
              >
                {isValidating ? "Memvalidasi..." : "Simpan Checker"}
              </button>
            </div>
          </form>
        </div>
      ) : task.remain <= 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✅</span>
            <span className="font-bold">
              Seluruh penugasan SPK ({qty(task.assigned_qty)} {task.unit_snapshot}) telah selesai diperiksa dan berstatus terkunci.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
