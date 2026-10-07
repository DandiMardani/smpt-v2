"use client";

import { useMemo, useState, useEffect } from "react";
import { formatNumber } from "@/lib/master/page-utils";

function formatRp(val: number) {
  return "Rp " + new Intl.NumberFormat("id-ID").format(val);
}

type SummaryPoRow = {
  category: string;
  name: string;
  size: "18 INCH" | "26 INCH";
  targetPo: number;
  pricePerUnit: number;
  totalReceived: number;
  variance: number;
  totalBill: number;
};

type DailyArrivalRow = {
  id: string;
  date: string;
  arrivalDateStr: string;
  category: "JKS_SUB" | "JKG_BTH";
  item18Name: string;
  qty18: number;
  item26Name: string;
  qty26: number;
  totalBill: number;
  dpCut: number;
  cashPaid: number;
  paymentDate?: string;
  notes?: string;
};

// DATA DUMMY SUDAH DIKOSONGKAN
const INITIAL_SUMMARY_PO: SummaryPoRow[] = [];
const INITIAL_DAILY_LOGS: DailyArrivalRow[] = [];

const STORAGE_KEY_PO = "smpt_sarung_koper_summary_po_v2";
const STORAGE_KEY_LOGS = "smpt_sarung_koper_daily_logs_v2";

export function SarungKoperMonitoring() {
  const [activeTab, setActiveTab] = useState<"REKAP_PO" | "LOG_KEDATANGAN" | "KEUANGAN_DP">("REKAP_PO");

  const [summaryPo, setSummaryPo] = useState<SummaryPoRow[]>(INITIAL_SUMMARY_PO);
  const [dailyLogs, setDailyLogs] = useState<DailyArrivalRow[]>(INITIAL_DAILY_LOGS);

  // Modal State Edit Rekap PO
  const [editingPoIndex, setEditingPoIndex] = useState<number | null>(null);
  const [poFormData, setPoFormData] = useState<SummaryPoRow | null>(null);

  // Modal State Edit Log Harian
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [logFormData, setLogFormData] = useState<DailyArrivalRow | null>(null);

  // Inisialisasi dari LocalStorage
  useEffect(() => {
    try {
      const savedPo = localStorage.getItem(STORAGE_KEY_PO);
      if (savedPo) setSummaryPo(JSON.parse(savedPo));

      const savedLogs = localStorage.getItem(STORAGE_KEY_LOGS);
      if (savedLogs) setDailyLogs(JSON.parse(savedLogs));
    } catch {
      // Lewati jika error parsing
    }
  }, []);

  const savePoToStorage = (data: SummaryPoRow[]) => {
    setSummaryPo(data);
    try {
      localStorage.setItem(STORAGE_KEY_PO, JSON.stringify(data));
    } catch {}
  };

  const saveLogsToStorage = (data: DailyArrivalRow[]) => {
    setDailyLogs(data);
    try {
      localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(data));
    } catch {}
  };

  // Handler Hapus & Edit PO
  const handleDeletePo = (index: number) => {
    const item = summaryPo[index];
    if (confirm(`Hapus baris target PO "${item.name}"?`)) {
      const updated = summaryPo.filter((_, i) => i !== index);
      savePoToStorage(updated);
    }
  };

  const handleOpenEditPo = (index: number) => {
    setEditingPoIndex(index);
    setPoFormData({ ...summaryPo[index] });
  };

  const handleSaveEditPo = () => {
    if (editingPoIndex === null || !poFormData) return;
    const targetPo = Number(poFormData.targetPo) || 0;
    const pricePerUnit = Number(poFormData.pricePerUnit) || 0;
    const totalReceived = Number(poFormData.totalReceived) || 0;
    const variance = totalReceived - targetPo;
    const totalBill = totalReceived * pricePerUnit;

    const updated = [...summaryPo];
    updated[editingPoIndex] = {
      ...poFormData,
      targetPo,
      pricePerUnit,
      totalReceived,
      variance,
      totalBill,
    };

    savePoToStorage(updated);
    setEditingPoIndex(null);
    setPoFormData(null);
  };

  // Handler Hapus & Edit Log Harian
  const handleDeleteLog = (id: string) => {
    if (confirm(`Hapus catatan kedatangan [${id}]?`)) {
      const updated = dailyLogs.filter((x) => x.id !== id);
      saveLogsToStorage(updated);
    }
  };

  const handleOpenEditLog = (item: DailyArrivalRow) => {
    setEditingLogId(item.id);
    setLogFormData({ ...item });
  };

  const handleSaveEditLog = () => {
    if (!editingLogId || !logFormData) return;
    const qty18 = Number(logFormData.qty18) || 0;
    const qty26 = Number(logFormData.qty26) || 0;
    const totalBill = Number(logFormData.totalBill) || 0;
    const dpCut = Number(logFormData.dpCut) || 0;
    const cashPaid = Number(logFormData.cashPaid) || 0;

    const updated = dailyLogs.map((item) =>
      item.id === editingLogId
        ? {
            ...logFormData,
            qty18,
            qty26,
            totalBill,
            dpCut,
            cashPaid,
          }
        : item
    );

    saveLogsToStorage(updated);
    setEditingLogId(null);
    setLogFormData(null);
  };

  // Summary Metrics Kalkulasi Dinamis
  const totalQty18 = useMemo(
    () => summaryPo.filter((x) => x.size === "18 INCH").reduce((acc, x) => acc + (x.totalReceived || 0), 0),
    [summaryPo]
  );
  const totalQty26 = useMemo(
    () => summaryPo.filter((x) => x.size === "26 INCH").reduce((acc, x) => acc + (x.totalReceived || 0), 0),
    [summaryPo]
  );
  const grandTotalQty = useMemo(() => summaryPo.reduce((acc, x) => acc + (x.totalReceived || 0), 0), [summaryPo]);
  const totalTargetPo = useMemo(() => summaryPo.reduce((acc, x) => acc + (x.targetPo || 0), 0), [summaryPo]);
  const totalBillGross = useMemo(() => summaryPo.reduce((acc, x) => acc + (x.totalBill || 0), 0), [summaryPo]);

  const totalDpDeducted = useMemo(() => dailyLogs.reduce((acc, x) => acc + (x.dpCut || 0), 0), [dailyLogs]);
  const totalCashPaid = useMemo(() => dailyLogs.reduce((acc, x) => acc + (x.cashPaid || 0), 0), [dailyLogs]);
  const totalPayment = totalDpDeducted + totalCashPaid;
  const remainingBill = Math.max(0, totalBillGross - totalPayment);

  return (
    <div className="space-y-4">
      {/* HEADER RINGKASAN SUPPLIER */}
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-slate-50 p-4 text-xs shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🧳</span>
              <h3 className="text-base font-extrabold text-blue-950">
                Monitoring Supplier Sarung Koper Haji 2026 · Ibu Mita
              </h3>
            </div>
            <p className="text-slate-600 mt-0.5">
              Pantau pengadaan sarung koper 18 inch & 26 inch (JKS & JKG), pemotongan uang muka (DP), dan pencatatan pelunasan tagihan.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow-2xs">
              Supplier: Ibu Mita
            </span>
          </div>
        </div>

        {/* 4 KPI CARDS */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 block">Total Sarung Masuk</span>
            <p className="mt-1 text-xl font-black text-slate-900 font-mono">
              {formatNumber(grandTotalQty)} <span className="text-xs font-normal text-slate-400">pcs</span>
            </p>
            <span className="text-[10px] text-blue-700 font-medium block mt-0.5">
              18&quot;: {formatNumber(totalQty18)} | 26&quot;: {formatNumber(totalQty26)}
            </span>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 block">Total Nilai Tagihan</span>
            <p className="mt-1 text-base font-black text-slate-900 font-mono">
              {formatRp(totalBillGross)}
            </p>
            <span className="text-[10px] text-slate-500 block mt-0.5">{formatNumber(grandTotalQty)} Pcs Realisasi</span>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 shadow-2xs">
            <span className="text-[11px] font-semibold text-emerald-900 block">Total Terbayar (DP + Kas)</span>
            <p className="mt-1 text-base font-black text-emerald-700 font-mono">
              {formatRp(totalPayment)}
            </p>
            <span className="text-[10px] text-emerald-700 font-medium block mt-0.5">
              DP: {formatRp(totalDpDeducted)} + Kas: {formatRp(totalCashPaid)}
            </span>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 shadow-2xs">
            <span className="text-[11px] font-semibold text-amber-900 block">Sisa Tagihan Akhir</span>
            <p className="mt-1 text-xl font-black text-amber-700 font-mono">
              {formatRp(remainingBill)}
            </p>
            <span className="text-[10px] text-amber-800 font-semibold block mt-0.5">
              {remainingBill === 0 ? "Lunas Sepenuhnya" : "Sisa Belum Dibayar"}
            </span>
          </div>
        </div>
      </div>

      {/* NAVIGASI TAB */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("REKAP_PO")}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-2xs cursor-pointer ${
            activeTab === "REKAP_PO"
              ? "bg-blue-600 text-white shadow-xs"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          📊 Rekap PO & Fisik Barang ({summaryPo.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("LOG_KEDATANGAN")}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-2xs cursor-pointer ${
            activeTab === "LOG_KEDATANGAN"
              ? "bg-emerald-600 text-white shadow-xs"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          📥 Log Harian Barang Masuk ({dailyLogs.length})
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
          💰 Arus Keuangan & Potongan DP
        </button>
      </div>

      {/* TAB 1: REKAP PO */}
      {activeTab === "REKAP_PO" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500 shadow-2xs">
          {summaryPo.length === 0 ? (
            <p>Belum ada data rekap target PO.</p>
          ) : null}
        </div>
      )}

      {/* TAB 2: LOG HARIAN */}
      {activeTab === "LOG_KEDATANGAN" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500 shadow-2xs">
          {dailyLogs.length === 0 ? (
            <p>Belum ada catatan transaksi kedatangan sarung koper.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
