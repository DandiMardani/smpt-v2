"use client";

import { useMemo, useState } from "react";
import { Badge, Empty, Field, buttonClass, inputClass } from "@/components/final/final-ui";
import { qty } from "@/lib/final/final-utils";
import { checkerResultAction } from "@/lib/final/actions";

export type CheckerTaskItem = {
  id: number;
  order_id: number;
  work_item_name_snapshot: string;
  unit_snapshot: string;
  assigned_qty: number;
  qty_per_product_snapshot: number;
  status: string;
  spk_code: string;
  product_name: string;
  product_code: string;
  operator_worker_id?: number | null;
  operator_name: string;
  operator_code: string;
  checker_email: string;
  due_date: string | null;
  notes: string | null;
  remain: number;
  isOrderEdited: boolean;
  has_dependencies: boolean;
  hard: boolean;
  availableEq: number | null;
  maxRaw: number | null;
};

interface CheckerTasksClientProps {
  tasks: CheckerTaskItem[];
  canOperate: boolean;
  isCheckerRole: boolean;
  userEmail?: string;
}

export function CheckerTasksClient({
  tasks,
  canOperate,
  isCheckerRole,
  userEmail,
}: CheckerTasksClientProps) {
  const [searchQuery, setSearchQuery] = useState("");

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

  return (
    <div className="space-y-4">
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
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-bold text-slate-400 transition hover:text-slate-600"
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
                className="text-xs font-semibold text-blue-600 underline hover:text-blue-800"
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Daftar Penugasan */}
      <div className="space-y-3">
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
              className="mt-3.5 inline-flex items-center justify-center rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-900"
            >
              Tampilkan Semua Tugas
            </button>
          </div>
        ) : (
          filteredTasks.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs transition hover:border-slate-300"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="font-bold text-slate-900 text-sm">
                      {t.spk_code} · {t.work_item_name_snapshot}
                    </b>
                    {t.product_name && (
                      <span className="rounded-md border border-blue-200/60 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                        📦 {t.product_name}
                      </span>
                    )}
                    {t.isOrderEdited && (
                      <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        ⚠️ Diperbarui SPV
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Operator: <b className="font-bold text-slate-800">{t.operator_name}</b> ·
                    Sisa penugasan{" "}
                    <b>
                      {qty(t.remain)} {t.unit_snapshot}
                    </b>{" "}
                    · Target/Produk {qty(t.qty_per_product_snapshot)}
                    {t.due_date ? ` · Target Selesai: ${t.due_date}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                    Checker: {t.checker_email || "-"}
                  </span>
                  <Badge>{t.status}</Badge>
                </div>
              </div>

              {t.has_dependencies ? (
                <div
                  className={`mt-3 rounded-xl border p-3 text-sm ${
                    t.hard
                      ? "border-rose-200 bg-rose-50 text-rose-900"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                >
                  <b className="font-bold">Routing {t.hard ? "HARD" : "WARNING"}</b>
                  <p className="mt-1 font-medium">
                    Available predecessor: <b>{qty(t.availableEq)} equivalent produk</b>
                    {t.maxRaw != null ? (
                      <>
                        {" "}
                        · kira-kira maksimum proses saat ini{" "}
                        <b>
                          {qty(t.maxRaw)} {t.unit_snapshot}
                        </b>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs opacity-75">
                    Jika predecessor lebih dari satu, kapasitas mengikuti available yang paling
                    kecil.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  Tidak ada predecessor wajib. Item ini dapat berjalan independen/parallel.
                </p>
              )}

              {canOperate && t.remain > 0 ? (
                <form action={checkerResultAction} className="mt-3 grid gap-3 md:grid-cols-5">
                  <input type="hidden" name="order_item_id" value={t.id} />
                  <Field label="Tanggal">
                    <input
                      name="check_date"
                      type="date"
                      required
                      className={inputClass}
                      defaultValue={new Date().toISOString().split("T")[0]}
                    />
                  </Field>
                  <Field label="Qty Sah">
                    <input
                      name="good_qty"
                      type="number"
                      min="0"
                      max={t.remain}
                      step="0.0001"
                      required
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Reject">
                    <input
                      name="reject_qty"
                      type="number"
                      min="0"
                      max={t.remain}
                      step="0.0001"
                      defaultValue="0"
                      required
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Catatan">
                    <input
                      name="notes"
                      placeholder="Kondisi pengerjaan"
                      className={inputClass}
                    />
                  </Field>
                  <div className="flex items-end">
                    <button className={buttonClass}>Simpan Checker</button>
                  </div>
                </form>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
