"use client";

import { Fragment, useMemo, useState } from "react";
import { formatNumber } from "@/lib/master/page-utils";
import { cancelResult, updateResult } from "./actions";

export type ComponentItem = {
  id: number;
  component_code: string;
  project_id: number;
  product_id: number | null;
  name: string;
  qty_per_product: number | string;
  unit: string;
  color: string;
  notes?: string | null;
  status: string;
  product_name?: string;
  project_name?: string;
  target_production?: number;
};

export type CuttingResultItem = {
  id: number;
  result_code: string;
  result_date: string;
  cutting_component_id: number;
  good_qty: number | string;
  reject_qty: number | string;
  unit_snapshot: string;
  officer: string;
  notes?: string | null;
  status: string;
};

export function CuttingRekapTable({
  components,
  results,
  canWrite,
}: {
  components: ComponentItem[];
  results: CuttingResultItem[];
  canWrite: boolean;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [editingResultId, setEditingResultId] = useState<number | null>(null);

  // Group results by component_id
  const resultsByComp = useMemo(() => {
    const map = new Map<number, CuttingResultItem[]>();
    for (const r of results) {
      const list = map.get(r.cutting_component_id) || [];
      list.push(r);
      map.set(r.cutting_component_id, list);
    }
    return map;
  }, [results]);

  // Aggregate good and reject
  const summaryByComp = useMemo(() => {
    const map = new Map<number, { good: number; reject: number; activeCount: number }>();
    for (const r of results) {
      if (r.status !== "AKTIF") continue;
      const cur = map.get(r.cutting_component_id) || { good: 0, reject: 0, activeCount: 0 };
      cur.good += Number(r.good_qty || 0);
      cur.reject += Number(r.reject_qty || 0);
      cur.activeCount += 1;
      map.set(r.cutting_component_id, cur);
    }
    return map;
  }, [results]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(components.map((c) => c.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  // Filtered components
  const filteredComponents = useMemo(() => {
    return components.filter((c) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchName = c.name.toLowerCase().includes(q);
        const matchCode = c.component_code.toLowerCase().includes(q);
        const matchProd = (c.product_name || "").toLowerCase().includes(q);
        const matchNotes = (c.notes || "").toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchProd && !matchNotes) return false;
      }

      if (statusFilter !== "ALL") {
        const summary = summaryByComp.get(c.id) || { good: 0, reject: 0, activeCount: 0 };
        const targetQty = c.target_production
          ? Math.round(Number(c.target_production) * Number(c.qty_per_product || 1))
          : 0;
        const isDone = targetQty > 0 ? summary.good >= targetQty : summary.good > 0;
        const isRunning = !isDone && summary.good > 0;
        const isPending = summary.good === 0;

        if (statusFilter === "DONE" && !isDone) return false;
        if (statusFilter === "RUNNING" && !isRunning) return false;
        if (statusFilter === "PENDING" && !isPending) return false;
      }

      return true;
    });
  }, [components, searchTerm, statusFilter, summaryByComp]);

  return (
    <div className="space-y-3">
      {/* Kontrol Filter & Pencarian */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="🔍 Cari komponen, kode (A001..), produk..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
          >
            <option value="ALL">Semua Status</option>
            <option value="DONE">Selesai (Target Tercapai)</option>
            <option value="RUNNING">Sedang Berjalan</option>
            <option value="PENDING">Belum Ada Hasil</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition shadow-2xs"
          >
            ⏬ Buka Semua Riwayat
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition shadow-2xs"
          >
            ⏫ Tutup Semua
          </button>
        </div>
      </div>

      {filteredComponents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          Tidak ada data komponen cutting yang cocok dengan filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-bold text-slate-700">
                <th className="w-10 p-3 text-center">Riwayat</th>
                <th className="p-3">Komponen</th>
                <th className="p-3">Proyek & Produk</th>
                <th className="p-3 text-right">Target Kebutuhan</th>
                <th className="p-3 text-right">Sudah Dipotong</th>
                <th className="p-3 text-right">Reject</th>
                <th className="p-3 text-right">Sisa Target</th>
                <th className="p-3 text-center">Progress</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredComponents.map((c) => {
                const summary = summaryByComp.get(c.id) || { good: 0, reject: 0, activeCount: 0 };
                const compResults = resultsByComp.get(c.id) || [];
                const isExpanded = expandedIds.has(c.id);

                const targetQty = c.target_production
                  ? Math.round(Number(c.target_production) * Number(c.qty_per_product || 1))
                  : 0;
                const remaining = Math.max(0, targetQty - summary.good);
                const progressPct =
                  targetQty > 0
                    ? Math.min(100, Math.round((summary.good / targetQty) * 100))
                    : summary.good > 0
                      ? 100
                      : 0;
                const isDone = targetQty > 0 ? summary.good >= targetQty : summary.good > 0;

                return (
                  <Fragment key={c.id}>
                    {/* BARIS UTAMA KOMPONEN */}
                    <tr
                      className={`hover:bg-blue-50/30 transition-colors ${
                        isExpanded ? "bg-blue-50/20 font-medium" : ""
                      }`}
                    >
                      {/* Tombol Panah Buka / Tutup */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleExpand(c.id)}
                          aria-label={isExpanded ? "Tutup riwayat" : "Buka riwayat"}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${
                            isExpanded
                              ? "border-blue-400 bg-blue-600 text-white shadow-xs"
                              : "border-slate-300 bg-white text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
                          }`}
                          title={isExpanded ? "Klik untuk menutup riwayat" : "Klik untuk membuka riwayat potong"}
                        >
                          <svg
                            className={`h-4 w-4 transform transition-transform duration-200 ${
                              isExpanded ? "rotate-90" : "rotate-0"
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </td>

                      <td className="p-3 cursor-pointer" onClick={() => toggleExpand(c.id)}>
                        <div className="flex items-center gap-1.5">
                          <b className="text-slate-900 font-semibold">{c.name}</b>
                          {c.color ? <span className="text-slate-500 font-normal">({c.color})</span> : null}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-[11px] font-bold text-blue-600">{c.component_code}</span>
                          {c.notes ? <span className="text-[10px] text-slate-500 truncate max-w-xs">{c.notes}</span> : null}
                        </div>
                      </td>

                      <td className="p-3">
                        <span className="font-semibold text-slate-800">{c.product_name || "-"}</span>
                        <p className="text-[11px] text-slate-500">{c.project_name || "Proyek"}</p>
                      </td>

                      <td className="p-3 text-right font-mono text-slate-600">
                        {targetQty > 0 ? `${formatNumber(targetQty)} ${c.unit}` : "-"}
                      </td>

                      <td className="p-3 text-right font-mono font-black text-emerald-700">
                        {formatNumber(summary.good)} {c.unit}
                      </td>

                      <td className="p-3 text-right font-mono font-medium text-rose-600">
                        {summary.reject > 0 ? `${formatNumber(summary.reject)} ${c.unit}` : "0"}
                      </td>

                      <td className="p-3 text-right font-mono text-slate-700">
                        {targetQty > 0 ? `${formatNumber(remaining)} ${c.unit}` : "-"}
                      </td>

                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-16 h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isDone ? "bg-emerald-500" : progressPct > 0 ? "bg-blue-500" : "bg-slate-300"
                              }`}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-slate-700">{progressPct}%</span>
                        </div>
                      </td>

                      <td className="p-3 text-center">
                        {isDone ? (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                            SELESAI
                          </span>
                        ) : summary.good > 0 ? (
                          <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                            BERJALAN
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                            BELUM
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* SUB-BARIS AKORDION: RIWAYAT HASIL CUTTING */}
                    {isExpanded ? (
                      <tr className="bg-gradient-to-b from-blue-50/40 to-slate-50/50">
                        <td colSpan={9} className="p-4 border-y border-blue-100">
                          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3">
                            {/* Header Panel Riwayat */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                              <div className="flex items-center gap-2">
                                <span className="text-base">📋</span>
                                <div>
                                  <h4 className="font-bold text-slate-900 text-xs">
                                    Riwayat Hasil Potong: {c.name} ({c.component_code})
                                  </h4>
                                  <p className="text-[11px] text-slate-500">
                                    Total {compResults.length} catatan log harian ({summary.activeCount} aktif) · Akumulasi baik:{" "}
                                    <b className="text-emerald-700 font-mono">{formatNumber(summary.good)} {c.unit}</b>
                                  </p>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => toggleExpand(c.id)}
                                className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                              >
                                ✕ Tutup Panel
                              </button>
                            </div>

                            {/* Daftar / Tabel Hasil Cutting */}
                            {compResults.length === 0 ? (
                              <div className="py-6 text-center text-xs text-slate-500 italic bg-slate-50 rounded-lg border border-dashed border-slate-200">
                                Belum ada catatan hasil potong untuk komponen ini.
                              </div>
                            ) : (
                              <div className="overflow-x-auto rounded-lg border border-slate-200">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50/90 text-slate-600 font-semibold">
                                      <th className="p-2.5">Tanggal</th>
                                      <th className="p-2.5">Kode Transaksi</th>
                                      <th className="p-2.5 text-right">Hasil Baik</th>
                                      <th className="p-2.5 text-right">Reject</th>
                                      <th className="p-2.5">Petugas</th>
                                      <th className="p-2.5">Keterangan</th>
                                      <th className="p-2.5 text-center">Status</th>
                                      {canWrite ? <th className="p-2.5 text-center w-36">Aksi</th> : null}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {compResults.map((r) => {
                                      const isEditing = editingResultId === r.id;
                                      const isCancelled = r.status === "DIBATALKAN";

                                      if (isEditing) {
                                        return (
                                          <tr key={r.id} className="bg-amber-50/50">
                                            <td colSpan={canWrite ? 8 : 7} className="p-3">
                                              <form
                                                action={async (formData) => {
                                                  await updateResult(formData);
                                                  setEditingResultId(null);
                                                }}
                                                className="space-y-3"
                                              >
                                                <input type="hidden" name="result_id" value={r.id} />
                                                <input type="hidden" name="component_id" value={c.id} />

                                                <div className="flex items-center gap-2 text-xs font-bold text-amber-900 mb-1">
                                                  <span>✏️ Edit Hasil Potong: #{r.result_code}</span>
                                                </div>

                                                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-5">
                                                  <div>
                                                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                                                      Tanggal
                                                    </label>
                                                    <input
                                                      type="date"
                                                      name="result_date"
                                                      required
                                                      defaultValue={r.result_date}
                                                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                                                      Hasil Baik ({c.unit})
                                                    </label>
                                                    <input
                                                      type="number"
                                                      name="good_qty"
                                                      min="0"
                                                      step="0.0001"
                                                      required
                                                      defaultValue={Number(r.good_qty)}
                                                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono font-bold text-emerald-800 focus:border-blue-500 focus:outline-none"
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                                                      Reject ({c.unit})
                                                    </label>
                                                    <input
                                                      type="number"
                                                      name="reject_qty"
                                                      min="0"
                                                      step="0.0001"
                                                      required
                                                      defaultValue={Number(r.reject_qty)}
                                                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono text-rose-700 focus:border-blue-500 focus:outline-none"
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                                                      Petugas
                                                    </label>
                                                    <input
                                                      type="text"
                                                      name="officer"
                                                      required
                                                      defaultValue={r.officer}
                                                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                                                      Keterangan
                                                    </label>
                                                    <input
                                                      type="text"
                                                      name="notes"
                                                      defaultValue={r.notes || ""}
                                                      placeholder="Catatan revisi"
                                                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                                                    />
                                                  </div>
                                                </div>

                                                <div className="flex items-center gap-2 justify-end pt-1">
                                                  <button
                                                    type="button"
                                                    onClick={() => setEditingResultId(null)}
                                                    className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                                                  >
                                                    Batal
                                                  </button>
                                                  <button
                                                    type="submit"
                                                    className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 shadow-xs"
                                                  >
                                                    💾 Simpan Perubahan
                                                  </button>
                                                </div>
                                              </form>
                                            </td>
                                          </tr>
                                        );
                                      }

                                      return (
                                        <tr
                                          key={r.id}
                                          className={`hover:bg-slate-50 transition-colors ${
                                            isCancelled ? "opacity-50 line-through bg-slate-50/60" : ""
                                          }`}
                                        >
                                          <td className="p-2.5 font-medium text-slate-800">{r.result_date}</td>
                                          <td className="p-2.5 font-mono text-[11px] text-blue-700">{r.result_code}</td>
                                          <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                                            {formatNumber(r.good_qty)} {r.unit_snapshot}
                                          </td>
                                          <td className="p-2.5 text-right font-mono text-rose-600">
                                            {Number(r.reject_qty) > 0 ? `${formatNumber(r.reject_qty)} ${r.unit_snapshot}` : "0"}
                                          </td>
                                          <td className="p-2.5 text-slate-700">{r.officer}</td>
                                          <td className="p-2.5 text-slate-500 text-[11px] max-w-xs truncate">
                                            {r.notes || "-"}
                                          </td>
                                          <td className="p-2.5 text-center">
                                            {isCancelled ? (
                                              <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-bold text-rose-700 border border-rose-200">
                                                BATAL
                                              </span>
                                            ) : (
                                              <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200">
                                                AKTIF
                                              </span>
                                            )}
                                          </td>

                                          {canWrite ? (
                                            <td className="p-2.5 text-center">
                                              {!isCancelled ? (
                                                <div className="flex items-center justify-center gap-1.5">
                                                  <button
                                                    type="button"
                                                    onClick={() => setEditingResultId(r.id)}
                                                    className="inline-flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 hover:bg-blue-100 transition"
                                                    title="Edit data hasil potong ini"
                                                  >
                                                    ✏️ Edit
                                                  </button>

                                                  <form
                                                    action={cancelResult}
                                                    onSubmit={(e) => {
                                                      if (
                                                        !confirm(
                                                          `Yakin ingin menghapus / membatalkan hasil cutting #${r.result_code} (${formatNumber(
                                                            r.good_qty
                                                          )} ${r.unit_snapshot})?\nSaldo barang jadi di gudang hasil akan dikembalikan secara akurat.`
                                                        )
                                                      ) {
                                                        e.preventDefault();
                                                      }
                                                    }}
                                                  >
                                                    <input type="hidden" name="result_id" value={r.id} />
                                                    <button
                                                      type="submit"
                                                      className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 hover:bg-rose-100 transition"
                                                      title="Hapus / Batalkan hasil potong ini"
                                                    >
                                                      🗑️ Hapus
                                                    </button>
                                                  </form>
                                                </div>
                                              ) : (
                                                <span className="text-[10px] text-slate-400 italic">Telah dibatalkan</span>
                                              )}
                                            </td>
                                          ) : null}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
