"use client";

import { useState } from "react";
import { qty } from "@/lib/final/final-utils";
import { recordManualResultAction } from "./actions";

export type ProgressItem = {
  project_id: number;
  product_id: number;
  work_item_id: number;
  work_item_name: string;
  unit: string;
  qty_per_product: number | string;
  display_order: number;
  routing_validation_mode: string;
  target_production: number | string;
  qty_sah: number | string;
  qty_sah_today: number | string;
  target_raw_qty: number | string;
  equivalent_product: number | string;
  equivalent_today: number | string;
  remaining_equivalent: number | string;
  over_equivalent: number | string;
  progress_percent: number | string;
};

export type ProductionHistoryItem = {
  id: string;
  date: string;
  code: string;
  source: "MANUAL_HARIAN" | "CHECKER_SPK";
  workerName: string;
  qtyGood: number;
  qtyReject: number;
  status: string;
  notes: string;
};

export type WorkerOption = {
  id: number;
  code: string;
  name: string;
  department: string | null;
  position: string | null;
};

interface ItemAccordionListProps {
  items: ProgressItem[];
  historyByItem: Record<number, ProductionHistoryItem[]>;
  workers: WorkerOption[];
  canWrite: boolean;
}

export function ItemAccordionList({
  items,
  historyByItem,
  workers,
  canWrite,
}: ItemAccordionListProps) {
  // State untuk menyimpan ID item yang sedang dibuka (bisa multi-open)
  const [openItemIds, setOpenItemIds] = useState<Set<number>>(new Set());

  const toggleItem = (id: number) => {
    setOpenItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (openItemIds.size === items.length) {
      setOpenItemIds(new Set());
    } else {
      setOpenItemIds(new Set(items.map((i) => i.work_item_id)));
    }
  };

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-500">
        Belum ada item pekerjaan aktif untuk produk ini.
      </div>
    );
  }

  const allOpen = openItemIds.size === items.length;

  return (
    <div className="space-y-3">
      {/* Tombol aksi cepat Buka / Tutup Semua */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-slate-500">
          Daftar Item Pekerjaan ({items.length} Item)
        </span>
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
        >
          {allOpen ? "Tutup Semua Accordion" : "Buka Semua Accordion"}
        </button>
      </div>

      {/* List Item Accordion */}
      <div className="space-y-2.5">
        {items.map((item) => {
          const isOpen = openItemIds.has(item.work_item_id);
          const history = historyByItem[item.work_item_id] ?? [];
          const progressPct = Number(item.progress_percent || 0);

          return (
            <div
              key={item.work_item_id}
              className={`rounded-xl border transition-all duration-200 overflow-hidden shadow-2xs ${
                isOpen
                  ? "border-blue-400 bg-white ring-2 ring-blue-100/60"
                  : "border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-xs"
              }`}
            >
              {/* Accordion Header (Baris ITEM) */}
              <button
                type="button"
                onClick={() => toggleItem(item.work_item_id)}
                aria-expanded={isOpen}
                className="w-full text-left p-3.5 sm:p-4 transition hover:bg-slate-50/70 focus:outline-none flex flex-wrap items-center justify-between gap-3 min-h-[52px]"
              >
                {/* Info Utama Item */}
                <div className="flex-1 min-w-[240px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm font-bold text-slate-900">
                      {item.work_item_name}
                    </b>
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {item.routing_validation_mode}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold border ${
                        progressPct >= 100
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-blue-50 text-blue-700 border-blue-200/60"
                      }`}
                    >
                      {qty(item.progress_percent)}%
                    </span>
                  </div>

                  {/* Ringkasan Angka Produksi */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                    <span>
                      Target:{" "}
                      <b className="font-semibold text-slate-700">
                        {qty(item.target_raw_qty)} {item.unit}
                      </b>
                    </span>
                    <span>·</span>
                    <span>
                      Qty Sah:{" "}
                      <b className="font-bold text-emerald-700">
                        {qty(item.qty_sah)} {item.unit}
                      </b>
                    </span>
                    <span>·</span>
                    <span>
                      Equivalent:{" "}
                      <b className="font-bold text-slate-900">
                        {qty(item.equivalent_product)} eq
                      </b>
                    </span>
                    {Number(item.equivalent_today) > 0 && (
                      <>
                        <span>·</span>
                        <span className="font-bold text-blue-600">
                          Hari ini: +{qty(item.equivalent_today)}
                        </span>
                      </>
                    )}
                    <span>·</span>
                    <span>
                      Sisa:{" "}
                      <b className="font-semibold text-slate-600">
                        {qty(item.remaining_equivalent)} eq
                      </b>
                    </span>
                  </div>
                </div>

                {/* Indikator & Chevron Icon */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="hidden sm:inline-block text-[11px] font-medium text-slate-500">
                    {isOpen ? "Tutup" : "Riwayat & Input"}
                  </span>
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-200 ${
                      isOpen
                        ? "rotate-180 bg-blue-100 text-blue-700"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </span>
                </div>
              </button>

              {/* Accordion Content (Expanded) */}
              {isOpen && (
                <div className="border-t border-slate-200/80 bg-slate-50/60 p-4 sm:p-5 space-y-5 animate-in fade-in-50 duration-200">
                  {/* SUB-SECTION 1: Riwayat Setoran */}
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <span>📋</span> Riwayat Setoran ({history.length} Catatan)
                      </h4>
                      <span className="text-[11px] text-slate-500">
                        Total Qty Sah:{" "}
                        <b className="font-bold text-emerald-700">
                          {qty(item.qty_sah)} {item.unit}
                        </b>
                      </span>
                    </div>

                    {history.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-400">
                        Belum ada riwayat setoran (SPK atau Manual HARIAN) untuk item ini.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                        <table className="min-w-full divide-y divide-slate-200 text-xs">
                          <thead className="bg-slate-50/90">
                            <tr>
                              <th className="px-3 py-2 text-left font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                Tanggal
                              </th>
                              <th className="px-3 py-2 text-left font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                Kode
                              </th>
                              <th className="px-3 py-2 text-left font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                Sumber
                              </th>
                              <th className="px-3 py-2 text-left font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                Pekerja / Operator
                              </th>
                              <th className="px-3 py-2 text-right font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                Qty Sah
                              </th>
                              <th className="px-3 py-2 text-center font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                                Status
                              </th>
                              <th className="px-3 py-2 text-left font-bold text-slate-600 uppercase tracking-wider">
                                Catatan
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {history.map((h) => (
                              <tr key={h.id} className="hover:bg-slate-50/50">
                                <td className="px-3 py-2 whitespace-nowrap text-slate-600 font-medium">
                                  {h.date}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap font-mono font-bold text-slate-800">
                                  {h.code}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                      h.source === "MANUAL_HARIAN"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-blue-100 text-blue-800"
                                    }`}
                                  >
                                    {h.source === "MANUAL_HARIAN"
                                      ? "Manual Harian"
                                      : "Checker SPK"}
                                  </span>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800">
                                  {h.workerName}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-right font-bold text-emerald-700">
                                  +{qty(h.qtyGood)} {item.unit}
                                  {h.qtyReject > 0 && (
                                    <span className="text-rose-600 font-normal ml-1">
                                      (rej: {qty(h.qtyReject)})
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-center">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      h.status === "AKTIF"
                                        ? "bg-emerald-100 text-emerald-700"
                                        : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {h.status}
                                  </span>
                                </td>
                                <td
                                  className="px-3 py-2 text-slate-500 max-w-xs truncate"
                                  title={h.notes}
                                >
                                  {h.notes}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* SUB-SECTION 2: KONTEN FORM INPUT */}
                  <div className="rounded-xl border border-blue-200/90 bg-white p-4 shadow-2xs">
                    <div className="mb-3">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                        <span>⚡</span> Input Hasil Pekerjaan HARIAN → Pengajuan BORONGAN
                      </h5>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Form input cepat khusus item{" "}
                        <b className="text-slate-800">{item.work_item_name}</b> ({item.unit}).
                        Hasil yang tersimpan otomatis memperbarui progress produksi dan masuk ke
                        riwayat.
                      </p>
                    </div>

                    {canWrite ? (
                      <form
                        action={recordManualResultAction}
                        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                      >
                        <input
                          type="hidden"
                          name="project_id"
                          value={item.project_id}
                        />
                        <input
                          type="hidden"
                          name="product_id"
                          value={item.product_id}
                        />
                        <input
                          type="hidden"
                          name="work_item_id"
                          value={item.work_item_id}
                        />

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Tanggal Hasil
                          </label>
                          <input
                            name="result_date"
                            type="date"
                            required
                            defaultValue={new Date().toISOString().split("T")[0]}
                            className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Pekerja HARIAN
                          </label>
                          <select
                            name="worker_id"
                            required
                            className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-xs"
                          >
                            <option value="">
                              {workers.length
                                ? "Pilih Pekerja HARIAN"
                                : "Belum ada pekerja HARIAN aktif"}
                            </option>
                            {workers.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.code} · {w.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Qty ({item.unit})
                          </label>
                          <input
                            name="qty"
                            type="number"
                            min="0.0001"
                            step="0.0001"
                            required
                            placeholder="Masukkan jumlah..."
                            className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Alasan / Catatan Audit
                          </label>
                          <input
                            name="reason"
                            required
                            maxLength={500}
                            defaultValue={`Setoran hasil harian ${item.work_item_name}`}
                            placeholder="Wajib: sumber/verifikasi hasil"
                            className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 shadow-xs"
                          />
                        </div>

                        <div className="sm:col-span-2 lg:col-span-4 flex justify-end pt-1">
                          <button
                            type="submit"
                            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-blue-700 active:bg-blue-800"
                          >
                            Submit Pengajuan
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
                        Mode Baca Saja. Akun Anda tidak memiliki izin untuk menginput hasil
                        produksi.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
