"use client";

import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/master/page-utils";
import {
  deleteVendorDeliveryLogAction,
  saveVendorDeliveryLogAction,
  addVendorDownPaymentAction,
  deleteVendorDownPaymentAction,
  saveVendorPoTargetAction,
  deleteVendorPoTargetAction,
} from "@/lib/final/actions";

function formatRp(val: number) {
  return "Rp " + new Intl.NumberFormat("id-ID").format(val);
}

type VendorItem = {
  id: number;
  name: string;
  vendor_code?: string;
};

type DownPaymentItem = {
  id: number;
  vendor_id: number;
  payment_date: string;
  amount: number;
  notes?: string;
};

type PoTargetItem = {
  id: number;
  vendor_id: number;
  category: string;
  item_name: string;
  size: string;
  target_po: number;
  price_per_unit: number;
};

type DeliveryLogItem = {
  id: number;
  vendor_id: number;
  log_code: string;
  delivery_date: string;
  category: string;
  item_description: string;
  qty_18: number;
  qty_26: number;
  total_qty: number;
  total_bill: number;
  dp_cut: number;
  cash_paid: number;
  payment_date?: string;
  notes?: string;
};

type Props = {
  vendors: VendorItem[];
  downPayments: DownPaymentItem[];
  poTargets: PoTargetItem[];
  deliveryLogs: DeliveryLogItem[];
  canEdit?: boolean;
};

export function SarungKoperMonitoring({
  vendors,
  downPayments,
  poTargets,
  deliveryLogs,
  canEdit = true,
}: Props) {
  const [activeTab, setActiveTab] = useState<"REKAP_PO" | "LOG_KEDATANGAN" | "KEUANGAN_DP">("LOG_KEDATANGAN");

  // Cari vendor default (Ibu Mita) atau vendor pertama
  const defaultVendor = useMemo(() => {
    return vendors.find((v) => v.name.toLowerCase().includes("mita")) || vendors[0];
  }, [vendors]);

  const [selectedVendorId, setSelectedVendorId] = useState<number>(defaultVendor?.id || 0);

  const activeVendor = useMemo(() => {
    return vendors.find((v) => v.id === selectedVendorId) || defaultVendor;
  }, [vendors, selectedVendorId, defaultVendor]);

  // Filter Data Berdasarkan Vendor Terpilih
  const currentLogs = useMemo(() => {
    return deliveryLogs.filter((l) => l.vendor_id === selectedVendorId);
  }, [deliveryLogs, selectedVendorId]);

  const currentPoTargets = useMemo(() => {
    return poTargets.filter((p) => p.vendor_id === selectedVendorId);
  }, [poTargets, selectedVendorId]);

  const currentDpList = useMemo(() => {
    return downPayments.filter((d) => d.vendor_id === selectedVendorId);
  }, [downPayments, selectedVendorId]);

  // Modal State Edit/Add Log
  const [editingLog, setEditingLog] = useState<DeliveryLogItem | null>(null);
  const [showAddLogModal, setShowAddLogModal] = useState<boolean>(false);

  // Modal State Add DP
  const [showAddDpModal, setShowAddDpModal] = useState<boolean>(false);

  // Modal State Edit/Add PO Target
  const [editingPo, setEditingPo] = useState<PoTargetItem | null>(null);
  const [showAddPoModal, setShowAddPoModal] = useState<boolean>(false);

  // Kalkulasi Keuangan Vendor Terpilih
  const totalQty18 = useMemo(
    () => currentLogs.reduce((acc, x) => acc + (Number(x.qty_18) || 0), 0),
    [currentLogs]
  );
  const totalQty26 = useMemo(
    () => currentLogs.reduce((acc, x) => acc + (Number(x.qty_26) || 0), 0),
    [currentLogs]
  );
  const grandTotalQty = useMemo(
    () => currentLogs.reduce((acc, x) => acc + (Number(x.total_qty) || 0), 0),
    [currentLogs]
  );
  const totalBillGross = useMemo(
    () => currentLogs.reduce((acc, x) => acc + (Number(x.total_bill) || 0), 0),
    [currentLogs]
  );

  const totalDpGiven = useMemo(
    () => currentDpList.reduce((acc, x) => acc + (Number(x.amount) || 0), 0),
    [currentDpList]
  );
  const totalDpDeducted = useMemo(
    () => currentLogs.reduce((acc, x) => acc + (Number(x.dp_cut) || 0), 0),
    [currentLogs]
  );
  const totalCashPaid = useMemo(
    () => currentLogs.reduce((acc, x) => acc + (Number(x.cash_paid) || 0), 0),
    [currentLogs]
  );

  const totalPayment = totalDpDeducted + totalCashPaid;
  const remainingBill = Math.max(0, totalBillGross - totalPayment);
  const remainingDpSaldo = Math.max(0, totalDpGiven - totalDpDeducted);

  return (
    <div className="space-y-4">
      {/* HEADER SUPPLIER & PILIHAN VENDOR */}
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-slate-50 p-4 text-xs shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🧳</span>
              <h3 className="text-base font-extrabold text-blue-950">
                Monitoring Supplier & Saldo Uang Muka (DP)
              </h3>
            </div>
            <p className="text-slate-600 mt-0.5">
              Pantau realisasi kiriman barang, pemotongan DP bertahap, dan sisa pelunasan tagihan per supplier secara real-time.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-slate-700 whitespace-nowrap">Pilih Supplier:</label>
            <select
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(Number(e.target.value))}
              className="rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-bold text-blue-900 shadow-2xs focus:border-blue-500 focus:outline-none"
            >
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.vendor_code ? `(${v.vendor_code})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 4 KPI CARDS */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 block">Total Realisasi Masuk</span>
            <p className="mt-1 text-xl font-black text-slate-900 font-mono">
              {formatNumber(grandTotalQty)} <span className="text-xs font-normal text-slate-400">pcs</span>
            </p>
            <span className="text-[10px] text-blue-700 font-medium block mt-0.5">
              {totalQty18 > 0 || totalQty26 > 0 ? `18": ${formatNumber(totalQty18)} | 26": ${formatNumber(totalQty26)}` : `${currentLogs.length} Kali Kirim`}
            </span>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 block">Total Nilai Tagihan</span>
            <p className="mt-1 text-base font-black text-slate-900 font-mono">
              {formatRp(totalBillGross)}
            </p>
            <span className="text-[10px] text-slate-500 block mt-0.5">{formatNumber(grandTotalQty)} Pcs Masuk</span>
          </div>

          <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3 shadow-2xs">
            <span className="text-[11px] font-semibold text-purple-900 block">Sisa Saldo DP di Vendor</span>
            <p className="mt-1 text-base font-black text-purple-700 font-mono">
              {formatRp(remainingDpSaldo)}
            </p>
            <span className="text-[10px] text-purple-700 font-medium block mt-0.5">
              DP Awal: {formatRp(totalDpGiven)}
            </span>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 shadow-2xs">
            <span className="text-[11px] font-semibold text-amber-900 block">Sisa Tagihan Akhir</span>
            <p className="mt-1 text-xl font-black text-amber-700 font-mono">
              {formatRp(remainingBill)}
            </p>
            <span className="text-[10px] text-amber-800 font-semibold block mt-0.5">
              {remainingBill === 0 ? "✅ Lunas Sepenuhnya" : "⚠️ Sisa Belum Dibayar"}
            </span>
          </div>
        </div>
      </div>

      {/* NAVIGASI TAB */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("LOG_KEDATANGAN")}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-2xs cursor-pointer ${
              activeTab === "LOG_KEDATANGAN"
                ? "bg-emerald-600 text-white shadow-xs"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            📥 Log Kedatangan Barang ({currentLogs.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("KEUANGAN_DP")}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-2xs cursor-pointer ${
              activeTab === "KEUANGAN_DP"
                ? "bg-purple-600 text-white shadow-xs"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            💰 Riwayat Uang Muka (DP) & Pemotongan
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("REKAP_PO")}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-2xs cursor-pointer ${
              activeTab === "REKAP_PO"
                ? "bg-blue-600 text-white shadow-xs"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            📊 Rekap Target PO ({currentPoTargets.length})
          </button>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            {activeTab === "LOG_KEDATANGAN" && (
              <button
                type="button"
                onClick={() => setShowAddLogModal(true)}
                className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition cursor-pointer"
              >
                + Tambah Log Kiriman
              </button>
            )}
            {activeTab === "KEUANGAN_DP" && (
              <button
                type="button"
                onClick={() => setShowAddDpModal(true)}
                className="rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-purple-700 transition cursor-pointer"
              >
                + Berikan DP Baru ke {activeVendor?.name}
              </button>
            )}
          </div>
        )}
      </div>

      {/* TAB 1: LOG KEDATANGAN */}
      {activeTab === "LOG_KEDATANGAN" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Transaksi kedatangan dari <b>{activeVendor?.name}</b></span>
            <span>Total: <b>{formatNumber(grandTotalQty)} pcs</b></span>
          </div>

          <div className="max-h-[520px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xs">
            {currentLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Belum ada transaksi kedatangan barang untuk supplier ini.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100">
                  <tr className="border-b border-slate-200 font-bold text-slate-700">
                    <th className="p-2.5">No</th>
                    <th className="p-2.5">Tanggal</th>
                    <th className="p-2.5">Tipe / Barang</th>
                    <th className="p-2.5 text-right">Ukuran 18&quot;</th>
                    <th className="p-2.5 text-right">Ukuran 26&quot;</th>
                    <th className="p-2.5 text-right">Total Qty</th>
                    <th className="p-2.5 text-right">Tagihan Datang</th>
                    <th className="p-2.5 text-right">Potongan DP</th>
                    <th className="p-2.5 text-right">Bayar Kas</th>
                    <th className="p-2.5">Tanggal Bayar</th>
                    <th className="p-2.5">Catatan</th>
                    {canEdit && <th className="p-2.5 text-right">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentLogs.map((l, idx) => (
                    <tr key={l.id} className="hover:bg-slate-50 transition">
                      <td className="p-2.5 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="p-2.5 whitespace-nowrap font-medium text-slate-800">
                        {l.delivery_date}
                      </td>
                      <td className="p-2.5">
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                          {l.category || "UMUM"}
                        </span>
                        <div className="text-[11px] text-slate-600 mt-0.5 font-medium">{l.item_description}</div>
                      </td>
                      <td className="p-2.5 text-right font-mono">
                        {l.qty_18 > 0 ? <b className="text-amber-800">{formatNumber(l.qty_18)}</b> : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="p-2.5 text-right font-mono">
                        {l.qty_26 > 0 ? <b className="text-indigo-800">{formatNumber(l.qty_26)}</b> : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                        {formatNumber(l.total_qty || (l.qty_18 + l.qty_26))}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                        {formatRp(l.total_bill)}
                      </td>
                      <td className="p-2.5 text-right font-mono text-purple-700 font-semibold">
                        {l.dp_cut > 0 ? formatRp(l.dp_cut) : "-"}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                        {l.cash_paid > 0 ? formatRp(l.cash_paid) : "-"}
                      </td>
                      <td className="p-2.5 text-[11px] text-slate-600 whitespace-nowrap">
                        {l.payment_date || "-"}
                      </td>
                      <td className="p-2.5 text-[11px] text-slate-500">
                        {l.notes || "-"}
                      </td>
                      {canEdit && (
                        <td className="p-2.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingLog(l)}
                              className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-100 shadow-2xs transition cursor-pointer"
                            >
                              ✏️
                            </button>
                            <form
                              action={deleteVendorDeliveryLogAction}
                              onSubmit={(e) => {
                                if (!confirm(`Hapus catatan kedatangan [${l.log_code || l.id}] secara permanen dari database?`)) {
                                  e.preventDefault();
                                }
                              }}
                            >
                              <input type="hidden" name="return_path" value="/dashboard/barangLuar" />
                              <input type="hidden" name="log_id" value={l.id} />
                              <button
                                type="submit"
                                className="rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 shadow-2xs transition cursor-pointer"
                              >
                                🗑️
                              </button>
                            </form>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ARUS KEUANGAN & DP */}
      {activeTab === "KEUANGAN_DP" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-purple-200 bg-purple-50/70 p-4 shadow-2xs">
              <span className="text-xs font-bold text-purple-950 block">Total DP Diberikan</span>
              <p className="mt-1.5 text-xl font-black text-purple-900 font-mono">
                {formatRp(totalDpGiven)}
              </p>
              <div className="mt-2 text-[11px] text-purple-800 space-y-1">
                {currentDpList.map((dp) => (
                  <div key={dp.id} className="flex items-center justify-between border-b border-purple-200/60 pb-1">
                    <span>{dp.payment_date}: {dp.notes || "DP"}</span>
                    <div className="flex items-center gap-1.5 font-bold font-mono">
                      <span>{formatRp(dp.amount)}</span>
                      {canEdit && (
                        <form action={deleteVendorDownPaymentAction} onSubmit={(e) => { if (!confirm("Hapus catatan DP ini?")) e.preventDefault(); }}>
                          <input type="hidden" name="dp_id" value={dp.id} />
                          <button type="submit" className="text-rose-600 hover:text-rose-800">✕</button>
                        </form>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-2xs">
              <span className="text-xs font-bold text-blue-950 block">Akumulasi Potongan DP Berjalan</span>
              <p className="mt-1.5 text-xl font-black text-blue-900 font-mono">
                {formatRp(totalDpDeducted)}
              </p>
              <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                Tiap kiriman barang datang, sebagian tagihan dipotong otomatis dari saldo DP sampai saldo DP habis (Rp 0).
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-2xs">
              <span className="text-xs font-bold text-emerald-950 block">Realisasi Pelunasan Kas</span>
              <p className="mt-1.5 text-xl font-black text-emerald-800 font-mono">
                {formatRp(totalCashPaid)}
              </p>
              <div className="mt-2 text-[11px] text-slate-600 space-y-0.5">
                <p>Total Tagihan: {formatRp(totalBillGross)}</p>
                <p>Total Terbayar: {formatRp(totalPayment)}</p>
                <b className="block border-t border-emerald-200 pt-1 mt-1 text-amber-700">
                  Sisa Tagihan: {formatRp(remainingBill)}
                </b>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: REKAP PO */}
      {activeTab === "REKAP_PO" && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-2xs">
            {currentPoTargets.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                <p>Belum ada target PO yang diatur untuk vendor ini.</p>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setShowAddPoModal(true)}
                    className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs"
                  >
                    + Buat Target PO Baru
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-bold text-slate-700">
                    <th className="p-3">Kategori</th>
                    <th className="p-3">Nama Barang</th>
                    <th className="p-3 text-center">Ukuran</th>
                    <th className="p-3 text-right">Target PO</th>
                    <th className="p-3 text-right">Harga Satuan</th>
                    {canEdit && <th className="p-3 text-right">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentPoTargets.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-bold text-blue-900">{r.category}</td>
                      <td className="p-3 font-semibold text-slate-900">{r.item_name}</td>
                      <td className="p-3 text-center">{r.size}</td>
                      <td className="p-3 text-right font-mono">{formatNumber(r.target_po)} pcs</td>
                      <td className="p-3 text-right font-mono">{formatRp(r.price_per_unit)}</td>
                      {canEdit && (
                        <td className="p-3 text-right">
                          <form action={deleteVendorPoTargetAction} onSubmit={(e) => { if (!confirm("Hapus target PO ini?")) e.preventDefault(); }}>
                            <input type="hidden" name="target_id" value={r.id} />
                            <button type="submit" className="text-rose-600 hover:text-rose-800 font-bold text-xs">🗑️ Hapus</button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* MODAL TAMBAH DP BARU */}
      {showAddDpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-black text-slate-900 text-sm">Tambah Uang Muka (DP) ke {activeVendor?.name}</h3>
              <button type="button" onClick={() => setShowAddDpModal(false)} className="text-slate-400 font-bold">✕</button>
            </div>
            <form action={addVendorDownPaymentAction} className="space-y-3 text-xs">
              <input type="hidden" name="vendor_id" value={selectedVendorId} />
              <div>
                <label className="font-bold text-slate-700 block mb-1">Tanggal Bayar DP</label>
                <input name="payment_date" type="date" required defaultValue={new Date().toISOString().split("T")[0]} className="w-full rounded-xl border border-slate-300 p-2 font-semibold" />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Nominal DP (Rp)</label>
                <input name="amount" type="number" min="1" required placeholder="Contoh: 50000000" className="w-full rounded-xl border border-slate-300 p-2 font-mono font-bold" />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Keterangan / Catatan</label>
                <input name="notes" type="text" placeholder="Misal: DP Pengadaan Sarung Tahap 2" className="w-full rounded-xl border border-slate-300 p-2" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowAddDpModal(false)} className="rounded-xl border border-slate-300 px-3 py-1.5 font-bold text-slate-600">Batal</button>
                <button type="submit" className="rounded-xl bg-purple-600 px-4 py-1.5 font-bold text-white shadow-xs">Simpan DP</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH/EDIT LOG HARIAN */}
      {(showAddLogModal || editingLog) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-black text-slate-900 text-sm">
                {editingLog ? `Edit Log [${editingLog.log_code || editingLog.id}]` : `Tambah Log Kiriman - ${activeVendor?.name}`}
              </h3>
              <button type="button" onClick={() => { setShowAddLogModal(false); setEditingLog(null); }} className="text-slate-400 font-bold">✕</button>
            </div>
            <form action={saveVendorDeliveryLogAction} className="space-y-3 text-xs">
              <input type="hidden" name="vendor_id" value={selectedVendorId} />
              {editingLog && <input type="hidden" name="log_id" value={editingLog.id} />}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tanggal Datang</label>
                  <input name="delivery_date" type="date" required defaultValue={editingLog?.delivery_date || new Date().toISOString().split("T")[0]} className="w-full rounded-xl border border-slate-300 p-2 font-semibold" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Kategori / Kloter</label>
                  <input name="category" type="text" defaultValue={editingLog?.category || "JKS_SUB"} placeholder="Contoh: JKS_SUB, JKG_BTH" className="w-full rounded-xl border border-slate-300 p-2 font-semibold" />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Keterangan Barang</label>
                <input name="item_description" type="text" defaultValue={editingLog?.item_description || "Sarung Koper"} required placeholder="Contoh: 18 INCH & 26 INCH SUB" className="w-full rounded-xl border border-slate-300 p-2" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Qty 18&quot; (Kecil)</label>
                  <input name="qty_18" type="number" defaultValue={editingLog?.qty_18 ?? 0} className="w-full rounded-xl border border-slate-300 p-2 font-mono" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Qty 26&quot; (Besar)</label>
                  <input name="qty_26" type="number" defaultValue={editingLog?.qty_26 ?? 0} className="w-full rounded-xl border border-slate-300 p-2 font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Total Tagihan (Rp)</label>
                  <input name="total_bill" type="number" required defaultValue={editingLog?.total_bill ?? 0} className="w-full rounded-xl border border-slate-300 p-2 font-mono font-bold" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Potongan DP (Rp)</label>
                  <input name="dp_cut" type="number" defaultValue={editingLog?.dp_cut ?? 0} className="w-full rounded-xl border border-slate-300 p-2 font-mono text-purple-700 font-bold" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Bayar Kas (Rp)</label>
                  <input name="cash_paid" type="number" defaultValue={editingLog?.cash_paid ?? 0} className="w-full rounded-xl border border-slate-300 p-2 font-mono text-emerald-700 font-bold" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Tanggal Bayar Kas</label>
                  <input name="payment_date" type="text" defaultValue={editingLog?.payment_date || ""} placeholder="Contoh: Jumat, 27 Feb 2026" className="w-full rounded-xl border border-slate-300 p-2" />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Catatan Tambahan</label>
                  <input name="notes" type="text" defaultValue={editingLog?.notes || ""} placeholder="Opsional" className="w-full rounded-xl border border-slate-300 p-2" />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => { setShowAddLogModal(false); setEditingLog(null); }} className="rounded-xl border border-slate-300 px-3 py-1.5 font-bold text-slate-600">Batal</button>
                <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-1.5 font-bold text-white shadow-xs">Simpan Log</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
