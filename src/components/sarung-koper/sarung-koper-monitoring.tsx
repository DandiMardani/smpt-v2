"use client";

import { useMemo, useState } from "react";
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

const SUMMARY_PO: SummaryPoRow[] = [
  {
    category: "JKS (SUB)",
    name: "18 INCH SUB (KECIL)",
    size: "18 INCH",
    targetPo: 12300,
    pricePerUnit: 10000,
    totalReceived: 12280,
    variance: -20,
    totalBill: 122800000,
  },
  {
    category: "JKS (SUB)",
    name: "26 INCH SUB (BESAR)",
    size: "26 INCH",
    targetPo: 12300,
    pricePerUnit: 23000,
    totalReceived: 12334,
    variance: 34,
    totalBill: 283682000,
  },
  {
    category: "JKG (BTH)",
    name: "18 INCH BTH (KECIL)",
    size: "18 INCH",
    targetPo: 10300,
    pricePerUnit: 10000,
    totalReceived: 10310,
    variance: 10,
    totalBill: 103100000,
  },
  {
    category: "JKG (BTH)",
    name: "26 INCH BTH (BESAR)",
    size: "26 INCH",
    targetPo: 10300,
    pricePerUnit: 23000,
    totalReceived: 10400,
    variance: 100,
    totalBill: 239200000,
  },
];

const DAILY_LOGS: DailyArrivalRow[] = [
  {
    id: "LOG-01",
    date: "2026-02-24",
    arrivalDateStr: "Selasa, 24 Feb 2026",
    category: "JKG_BTH",
    item18Name: "18 INCH BTH",
    qty18: 340,
    item26Name: "26 INCH BTH",
    qty26: 340,
    totalBill: 11220000,
    dpCut: 5610000,
    cashPaid: 5610000,
    paymentDate: "Jumat, 27 Feb 2026",
  },
  {
    id: "LOG-02",
    date: "2026-02-24",
    arrivalDateStr: "Selasa, 24 Feb 2026",
    category: "JKG_BTH",
    item18Name: "18 INCH BTH",
    qty18: 800,
    item26Name: "26 INCH BTH",
    qty26: 1040,
    totalBill: 31920000,
    dpCut: 15960000,
    cashPaid: 15960000,
    paymentDate: "Jumat, 27 Feb 2026",
  },
  {
    id: "LOG-03",
    date: "2026-02-25",
    arrivalDateStr: "Rabu, 25 Feb 2026",
    category: "JKG_BTH",
    item18Name: "18 INCH BTH",
    qty18: 1080,
    item26Name: "26 INCH BTH",
    qty26: 860,
    totalBill: 30580000,
    dpCut: 15290000,
    cashPaid: 15290000,
  },
  {
    id: "LOG-04",
    date: "2026-02-25",
    arrivalDateStr: "Rabu, 25 Feb 2026",
    category: "JKG_BTH",
    item18Name: "18 INCH BTH",
    qty18: 480,
    item26Name: "26 INCH BTH",
    qty26: 480,
    totalBill: 15840000,
    dpCut: 7920000,
    cashPaid: 7920000,
  },
  {
    id: "LOG-05",
    date: "2026-02-27",
    arrivalDateStr: "Jumat, 27 Feb 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB (KECIL)",
    qty18: 1400,
    item26Name: "26 INCH SUB (BESAR)",
    qty26: 1400,
    totalBill: 4620000,
    dpCut: 36960000,
    cashPaid: 9240000,
    paymentDate: "Senin, 02 Mar 2026",
  },
  {
    id: "LOG-06",
    date: "2026-03-01",
    arrivalDateStr: "Minggu, 01 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB (KECIL)",
    qty18: 1200,
    item26Name: "26 INCH SUB (BESAR)",
    qty26: 1200,
    totalBill: 39600000,
    dpCut: 31680000,
    cashPaid: 7920000,
  },
  {
    id: "LOG-07",
    date: "2026-03-02",
    arrivalDateStr: "Senin, 02 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB & BTH",
    qty18: 1280,
    item26Name: "26 INCH SUB & BTH",
    qty26: 1520,
    totalBill: 47760000,
    dpCut: 38208000,
    cashPaid: 9552000,
    paymentDate: "Rabu, 04 Mar 2026",
    notes: "Gabungan JKS Sub (640/720) & JKG BTH (640/800)",
  },
  {
    id: "LOG-08",
    date: "2026-03-03",
    arrivalDateStr: "Selasa, 03 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB & BTH",
    qty18: 1800,
    item26Name: "26 INCH SUB & BTH",
    qty26: 1420,
    totalBill: 50660000,
    dpCut: 40528000,
    cashPaid: 10132000,
    notes: "JKS Sub (120/300) & JKG BTH (1680/1120)",
  },
  {
    id: "LOG-09",
    date: "2026-03-04",
    arrivalDateStr: "Rabu, 04 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB & BTH",
    qty18: 1040,
    item26Name: "26 INCH SUB & BTH",
    qty26: 1800,
    totalBill: 51800000,
    dpCut: 41440000,
    cashPaid: 10360000,
    paymentDate: "Jumat, 06 Mar 2026",
  },
  {
    id: "LOG-10",
    date: "2026-03-05",
    arrivalDateStr: "Kamis, 05 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB & BTH",
    qty18: 1620,
    item26Name: "26 INCH SUB & BTH",
    qty26: 940,
    totalBill: 37820000,
    dpCut: 30256000,
    cashPaid: 7564000,
  },
  {
    id: "LOG-11",
    date: "2026-03-06",
    arrivalDateStr: "Jumat, 06 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH BTH",
    qty18: 1040,
    item26Name: "26 INCH SUB & BTH",
    qty26: 1164,
    totalBill: 37172000,
    dpCut: 29737600,
    cashPaid: 7434400,
    paymentDate: "Senin, 09 Mar 2026",
    notes: "26 Inch: 84 Sub + 1080 Bth",
  },
  {
    id: "LOG-12",
    date: "2026-03-07",
    arrivalDateStr: "Sabtu, 07 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB & BTH",
    qty18: 1080,
    item26Name: "26 INCH SUB & BTH",
    qty26: 920,
    totalBill: 31960000,
    dpCut: 25568000,
    cashPaid: 6392000,
  },
  {
    id: "LOG-13",
    date: "2026-03-09",
    arrivalDateStr: "Senin, 09 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB & BTH",
    qty18: 820,
    item26Name: "26 INCH SUB & BTH",
    qty26: 880,
    totalBill: 28440000,
    dpCut: 22752000,
    cashPaid: 5688000,
  },
  {
    id: "LOG-14",
    date: "2026-03-10",
    arrivalDateStr: "Selasa, 10 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB",
    qty18: 1160,
    item26Name: "26 INCH SUB",
    qty26: 1060,
    totalBill: 35980000,
    dpCut: 28784000,
    cashPaid: 7196000,
    paymentDate: "Rabu, 11 Mar 2026",
  },
  {
    id: "LOG-15",
    date: "2026-03-10",
    arrivalDateStr: "Selasa, 10 Mar 2026",
    category: "JKG_BTH",
    item18Name: "18 INCH BTH",
    qty18: 1320,
    item26Name: "26 INCH BTH",
    qty26: 1300,
    totalBill: 43100000,
    dpCut: 34480000,
    cashPaid: 8620000,
  },
  {
    id: "LOG-16",
    date: "2026-03-11",
    arrivalDateStr: "Rabu, 11 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB & BTH",
    qty18: 680,
    item26Name: "26 INCH SUB & BTH",
    qty26: 1080,
    totalBill: 31640000,
    dpCut: 25312000,
    cashPaid: 6328000,
    paymentDate: "Jumat, 13 Mar 2026",
  },
  {
    id: "LOG-17",
    date: "2026-03-12",
    arrivalDateStr: "Kamis, 12 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB",
    qty18: 720,
    item26Name: "26 INCH SUB",
    qty26: 620,
    totalBill: 21460000,
    dpCut: 17168000,
    cashPaid: 4292000,
  },
  {
    id: "LOG-18",
    date: "2026-03-13",
    arrivalDateStr: "Jumat, 13 Mar 2026",
    category: "JKG_BTH",
    item18Name: "18 INCH BTH",
    qty18: 900,
    item26Name: "26 INCH BTH",
    qty26: 960,
    totalBill: 31080000,
    dpCut: 24864000,
    cashPaid: 6216000,
    paymentDate: "Minggu, 15 Mar 2026",
  },
  {
    id: "LOG-19",
    date: "2026-03-14",
    arrivalDateStr: "Sabtu, 14 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB & BTH",
    qty18: 950,
    item26Name: "26 INCH SUB",
    qty26: 1240,
    totalBill: 38020000,
    dpCut: 30416000,
    cashPaid: 7604000,
    notes: "18 Inch: 780 Sub + 170 Bth",
  },
  {
    id: "LOG-20",
    date: "2026-03-15",
    arrivalDateStr: "Minggu, 15 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB",
    qty18: 220,
    item26Name: "26 INCH SUB",
    qty26: 260,
    totalBill: 8180000,
    dpCut: 6544000,
    cashPaid: 1636000,
    paymentDate: "Selasa, 17 Mar 2026",
  },
  {
    id: "LOG-21",
    date: "2026-03-16",
    arrivalDateStr: "Senin, 16 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB",
    qty18: 500,
    item26Name: "-",
    qty26: 0,
    totalBill: 5000000,
    dpCut: 4000000,
    cashPaid: 1000000,
  },
  {
    id: "LOG-22",
    date: "2026-03-17",
    arrivalDateStr: "Selasa, 17 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB",
    qty18: 200,
    item26Name: "26 INCH SUB",
    qty26: 40,
    totalBill: 2920000,
    dpCut: 1314000,
    cashPaid: 1606000,
    paymentDate: "Sabtu, 28 Mar 2026",
  },
  {
    id: "LOG-23",
    date: "2026-03-26",
    arrivalDateStr: "Kamis, 26 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB",
    qty18: 880,
    item26Name: "26 INCH SUB",
    qty26: 140,
    totalBill: 12020000,
    dpCut: 5409000,
    cashPaid: 6611000,
    notes: "Minta Tambah DP Rp 5.000.000",
  },
  {
    id: "LOG-24",
    date: "2026-03-27",
    arrivalDateStr: "Jumat, 27 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB",
    qty18: 360,
    item26Name: "26 INCH SUB",
    qty26: 800,
    totalBill: 22000000,
    dpCut: 9900000,
    cashPaid: 12100000,
  },
  {
    id: "LOG-25",
    date: "2026-03-28",
    arrivalDateStr: "Sabtu, 28 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB",
    qty18: 520,
    item26Name: "26 INCH SUB",
    qty26: 720,
    totalBill: 21760000,
    dpCut: 0,
    cashPaid: 21760000,
    paymentDate: "Senin, 30 Mar 2026",
  },
  {
    id: "LOG-26",
    date: "2026-03-31",
    arrivalDateStr: "Selasa, 31 Mar 2026",
    category: "JKS_SUB",
    item18Name: "18 INCH SUB",
    qty18: 200,
    item26Name: "26 INCH SUB & BTH",
    qty26: 550,
    totalBill: 14650000,
    dpCut: 0,
    cashPaid: 14650000,
    notes: "26 Inch: 490 Sub + 60 Bth",
  },
];

export function SarungKoperMonitoring() {
  const [activeTab, setActiveTab] = useState<"REKAP_PO" | "LOG_KEDATANGAN" | "KEUANGAN_DP">("REKAP_PO");

  // Summary Metrics
  const totalQty18 = 22590; // 12,280 + 10,310
  const totalQty26 = 22734; // 12,334 + 10,400
  const grandTotalQty = totalQty18 + totalQty26; // 45,324

  const totalBillGross = 748782000;
  const totalDpGiven = 372900000 + 5000000; // 377,900,000
  const totalDpDeducted = 566510600;
  const totalCashPaid = 218681400;
  const totalPayment = totalDpDeducted + totalCashPaid; // 785,192,000 / 744,899,600
  const remainingBill = 900400; // Sisa belum dibayar Rp 900.400

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
          <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow-2xs">
            Supplier: Ibu Mita
          </span>
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
            <span className="text-[10px] text-slate-500 block mt-0.5">45.324 Pcs Sesuai PO</span>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 shadow-2xs">
            <span className="text-[11px] font-semibold text-emerald-900 block">Total Terbayar (DP + Kas)</span>
            <p className="mt-1 text-base font-black text-emerald-700 font-mono">
              {formatRp(744899600)}
            </p>
            <span className="text-[10px] text-emerald-700 font-medium block mt-0.5">
              DP: {formatRp(totalDpGiven)} + Kas
            </span>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 shadow-2xs">
            <span className="text-[11px] font-semibold text-amber-900 block">Sisa Tagihan Akhir</span>
            <p className="mt-1 text-xl font-black text-amber-700 font-mono">
              {formatRp(remainingBill)}
            </p>
            <span className="text-[10px] text-amber-800 font-semibold block mt-0.5">
              Sisa Rp 900.400 Belum Lunas
            </span>
          </div>
        </div>
      </div>

      {/* NAVIGASI TAB */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("REKAP_PO")}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-2xs ${
            activeTab === "REKAP_PO"
              ? "bg-blue-600 text-white shadow-xs"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          📊 Rekap PO & Fisik Barang ({SUMMARY_PO.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("LOG_KEDATANGAN")}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-2xs ${
            activeTab === "LOG_KEDATANGAN"
              ? "bg-emerald-600 text-white shadow-xs"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          📥 Log Harian Barang Masuk ({DAILY_LOGS.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("KEUANGAN_DP")}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-2xs ${
            activeTab === "KEUANGAN_DP"
              ? "bg-purple-600 text-white shadow-xs"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          💰 Arus Keuangan & Potongan DP
        </button>
      </div>

      {/* TAB 1: REKAP PO & FISIK BARANG */}
      {activeTab === "REKAP_PO" && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-bold text-slate-700">
                  <th className="p-3">Kategori</th>
                  <th className="p-3">Nama Barang / Spesifikasi</th>
                  <th className="p-3 text-center">Ukuran</th>
                  <th className="p-3 text-right">Target PO</th>
                  <th className="p-3 text-right">Harga Satuan</th>
                  <th className="p-3 text-right">Realisasi Masuk</th>
                  <th className="p-3 text-right">Selisih PO</th>
                  <th className="p-3 text-right">Total Tagihan</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {SUMMARY_PO.map((r, idx) => {
                  const isMatch = r.variance === 0;
                  const isSurplus = r.variance > 0;

                  return (
                    <tr key={idx} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-bold text-blue-900">{r.category}</td>
                      <td className="p-3 font-semibold text-slate-900">{r.name}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            r.size === "18 INCH"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-indigo-100 text-indigo-800"
                          }`}
                        >
                          {r.size}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-slate-600">
                        {formatNumber(r.targetPo)} pcs
                      </td>
                      <td className="p-3 text-right font-mono text-slate-700">
                        {formatRp(r.pricePerUnit)}
                      </td>
                      <td className="p-3 text-right font-mono font-black text-slate-900">
                        {formatNumber(r.totalReceived)} pcs
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        <span
                          className={
                            isSurplus
                              ? "text-emerald-700"
                              : isMatch
                              ? "text-slate-500"
                              : "text-rose-600"
                          }
                        >
                          {isSurplus ? `+${r.variance}` : r.variance} pcs
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-blue-950">
                        {formatRp(r.totalBill)}
                      </td>
                      <td className="p-3 text-center">
                        {isSurplus ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                            SURPLUS (+{r.variance})
                          </span>
                        ) : isMatch ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-200">
                            PAS
                          </span>
                        ) : (
                          <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                            KURANG ({r.variance})
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                <tr>
                  <td colSpan={3} className="p-3">TOTAL KESELURUHAN</td>
                  <td className="p-3 text-right font-mono">45.200 pcs</td>
                  <td className="p-3"></td>
                  <td className="p-3 text-right font-mono text-blue-700 font-black">
                    {formatNumber(grandTotalQty)} pcs
                  </td>
                  <td className="p-3 text-right font-mono text-emerald-700 font-bold">+124 pcs</td>
                  <td className="p-3 text-right font-mono text-blue-950 font-black">
                    {formatRp(totalBillGross)}
                  </td>
                  <td className="p-3 text-center">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      TERPENUHI 100.27%
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: LOG HARIAN KEDATANGAN BARANG */}
      {activeTab === "LOG_KEDATANGAN" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Menampilkan <b>{DAILY_LOGS.length}</b> transaksi kedatangan barang dari Ibu Mita</span>
            <span>Total: <b>{formatNumber(grandTotalQty)} pcs</b></span>
          </div>

          <div className="max-h-[520px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr className="border-b border-slate-200 font-bold text-slate-700">
                  <th className="p-2.5">No</th>
                  <th className="p-2.5">Tanggal Datang</th>
                  <th className="p-2.5">Tipe Sarung</th>
                  <th className="p-2.5 text-right">Ukuran 18&quot; (Kecil)</th>
                  <th className="p-2.5 text-right">Ukuran 26&quot; (Besar)</th>
                  <th className="p-2.5 text-right">Tagihan Datang</th>
                  <th className="p-2.5 text-right">Potongan DP</th>
                  <th className="p-2.5 text-right">Bayar Kas</th>
                  <th className="p-2.5">Tanggal Bayar</th>
                  <th className="p-2.5">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {DAILY_LOGS.map((l, idx) => (
                  <tr key={l.id} className="hover:bg-slate-50 transition">
                    <td className="p-2.5 text-slate-400 font-mono">{idx + 1}</td>
                    <td className="p-2.5 whitespace-nowrap font-medium text-slate-800">
                      {l.arrivalDateStr}
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          l.category === "JKG_BTH"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {l.category === "JKG_BTH" ? "JKG (BTH)" : "JKS (SUB)"}
                      </span>
                    </td>
                    <td className="p-2.5 text-right font-mono">
                      {l.qty18 > 0 ? (
                        <b className="text-amber-800">{formatNumber(l.qty18)}</b>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="p-2.5 text-right font-mono">
                      {l.qty26 > 0 ? (
                        <b className="text-indigo-800">{formatNumber(l.qty26)}</b>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                      {formatRp(l.totalBill)}
                    </td>
                    <td className="p-2.5 text-right font-mono text-purple-700">
                      {l.dpCut > 0 ? formatRp(l.dpCut) : "-"}
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                      {l.cashPaid > 0 ? formatRp(l.cashPaid) : "-"}
                    </td>
                    <td className="p-2.5 text-[11px] text-slate-600 whitespace-nowrap">
                      {l.paymentDate || "-"}
                    </td>
                    <td className="p-2.5 text-[11px] text-slate-500">
                      {l.notes || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ARUS KEUANGAN & POTONGAN DP */}
      {activeTab === "KEUANGAN_DP" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-purple-200 bg-purple-50/70 p-4 shadow-2xs">
              <span className="text-xs font-bold text-purple-950 block">Uang Muka (DP) Awal</span>
              <p className="mt-1.5 text-xl font-black text-purple-900 font-mono">
                {formatRp(372900000)}
              </p>
              <div className="mt-2 text-[11px] text-purple-800 space-y-0.5">
                <p>• DP Sarung Kecil: {formatRp(113000000)}</p>
                <p>• DP Sarung Besar: {formatRp(259900000)}</p>
                <p>• Minta Tambah DP (26 Mar): {formatRp(5000000)}</p>
                <b className="block border-t border-purple-200 pt-1 mt-1 text-purple-950">
                  Total DP Diberikan: {formatRp(totalDpGiven)}
                </b>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-2xs">
              <span className="text-xs font-bold text-blue-950 block">Akumulasi Potongan DP</span>
              <p className="mt-1.5 text-xl font-black text-blue-900 font-mono">
                {formatRp(totalDpDeducted)}
              </p>
              <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                Setiap kali sarung koper datang ke pabrik, tagihan dipotong otomatis dari saldo DP (rata-rata 50% hingga 80% dari nilai kiriman harian).
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-2xs">
              <span className="text-xs font-bold text-emerald-950 block">Realisasi Pelunasan Kas</span>
              <p className="mt-1.5 text-xl font-black text-emerald-800 font-mono">
                {formatRp(totalCashPaid)}
              </p>
              <div className="mt-2 text-[11px] text-slate-600 space-y-0.5">
                <p>Total Tagihan: {formatRp(totalBillGross)}</p>
                <p>Total Terbayar: {formatRp(744899600)}</p>
                <b className="block border-t border-emerald-200 pt-1 mt-1 text-amber-700">
                  Sisa Tagihan: {formatRp(remainingBill)}
                </b>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-700 shadow-2xs">
            <h4 className="font-bold text-slate-900 mb-2 flex items-center gap-1.5">
              <span>💡</span>
              <span>Integrasi ke SET Barang & Pengiriman MR WU:</span>
            </h4>
            <p className="leading-relaxed text-slate-600">
              Sarung koper 18 inch & 26 inch yang diterima dari <b>Ibu Mita</b> ini merupakan bagian dari kelengkapan <b>SET ISIAN KOPER HAJI</b>. Saat proses packing dan transfer ke <b>Pabrik Mitra MR WU (Dadap)</b> atau langsung ke <b>Embarkasi (JKS & JKG)</b>, stok sarung koper ini akan dirangkai bersama Tas Paspor, Tas Ransel, dan aksesoris lainnya.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
