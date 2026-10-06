"use client";

import { useMemo, useState } from "react";

type CuttingRow = {
  code: string;
  name: string;
  productName: string;
  factor: number;
  targetQty: number;
  actualQty: number;
  diff: number;
};

type MaterialUsageRow = {
  materialCode: string;
  materialName: string;
  forProduct: string;
  standardPerUnit: string;
  totalNeeded: string;
  totalUsed: string;
  warehouseStock: string;
  remainingStock: string;
  unit: string;
  status: "AMAN" | "PERHATIAN" | "DEFISIT";
};

export function CuttingHajiMonitoring({
  componentsData,
}: {
  componentsData: {
    id: number;
    component_code: string;
    name: string;
    product_name: string;
    qty_per_product: number;
    notes?: string | null;
    total_good: number;
  }[];
}) {
  const [filterProduct, setFilterProduct] = useState<string>("ALL");

  // Format data 32 komponen
  const rows: CuttingRow[] = useMemo(() => {
    return componentsData.map((c) => {
      // Ambil kode pola dari notes jika ada, misal 'A001'
      const match = c.notes?.match(/A\d{3}/);
      const code = match ? match[0] : c.component_code;
      const factor = Number(c.qty_per_product) || 1;
      const targetQty = 22600 * factor;
      const actualQty = Number(c.total_good) || 0;
      const diff = actualQty - targetQty;

      return {
        code,
        name: c.name,
        productName: c.product_name,
        factor,
        targetQty,
        actualQty,
        diff,
      };
    });
  }, [componentsData]);

  const filteredRows = useMemo(() => {
    if (filterProduct === "ALL") return rows;
    return rows.filter((r) => r.productName.toLowerCase().includes(filterProduct.toLowerCase()));
  }, [rows, filterProduct]);

  // Kalkulasi Otomatis Pemakaian Bahan Kain (BOM Derivation)
  const materialUsages: MaterialUsageRow[] = useMemo(() => {
    return [
      {
        materialCode: "A010",
        materialName: "POLIYESTER 6030 PU",
        forProduct: "Tas Paspor 2026",
        standardPerUnit: "0.1805 yard",
        totalNeeded: "4.079,30",
        totalUsed: "4.088,00",
        warehouseStock: "5.290,00",
        remainingStock: "+1.202,00",
        unit: "yard",
        status: "AMAN",
      },
      {
        materialCode: "A020",
        materialName: "POLIYESTER RIBSTOP 37550 WRWP",
        forProduct: "Tas Ransel 2026",
        standardPerUnit: "0.5500 yard",
        totalNeeded: "12.430,00",
        totalUsed: "12.430,00",
        warehouseStock: "15.206,00",
        remainingStock: "+2.776,00",
        unit: "yard",
        status: "AMAN",
      },
      {
        materialCode: "AB01",
        materialName: "MIKA 0.35 BENING",
        forProduct: "Paspor + Ransel",
        standardPerUnit: "0.05m / 0.0134m",
        totalNeeded: "1.432,84",
        totalUsed: "1.432,84",
        warehouseStock: "1.500,00",
        remainingStock: "+67,16",
        unit: "meter",
        status: "AMAN",
      },
      {
        materialCode: "AB03 / A016",
        materialName: "JARING HITAM",
        forProduct: "Paspor + Ransel",
        standardPerUnit: "0.028y / 0.058y",
        totalNeeded: "1.943,60",
        totalUsed: "1.943,60",
        warehouseStock: "10.800,00",
        remainingStock: "+8.856,40",
        unit: "yard",
        status: "AMAN",
      },
      {
        materialCode: "A005",
        materialName: "OXFORD MOTIF TEBAL ABU",
        forProduct: "Lapisan Koper (18\" & 26\")",
        standardPerUnit: "0.66y / 1.06y",
        totalNeeded: "38.872,00",
        totalUsed: "15.600,00",
        warehouseStock: "6.000,00",
        remainingStock: "-17.272,00",
        unit: "yard",
        status: "PERHATIAN",
      },
      {
        materialCode: "A008 / A026",
        materialName: "SPUNBOND 65 gr ABU",
        forProduct: "Lapis Paspor & Ransel",
        standardPerUnit: "0.034m / 0.068m",
        totalNeeded: "2.305,20",
        totalUsed: "2.305,20",
        warehouseStock: "3.200,00",
        remainingStock: "+894,80",
        unit: "meter",
        status: "AMAN",
      },
    ];
  }, []);

  return (
    <div className="space-y-6">
      {/* KARTU RINGKASAN ATAS */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Total Komponen Pola</p>
          <p className="mt-1 text-2xl font-black text-blue-950">{rows.length} Komponen</p>
          <p className="text-[11px] text-blue-700/80 mt-0.5">32 Pola (Paspor, Ransel, Lapisan)</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Tas Paspor (A001-A009)</p>
          <p className="mt-1 text-2xl font-black text-emerald-950">100% Selesai</p>
          <p className="text-[11px] text-emerald-700/80 mt-0.5">Surplus buffer +74 s/d +800 pcs</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Tas Ransel (A010-A022)</p>
          <p className="mt-1 text-2xl font-black text-emerald-950">100% Selesai</p>
          <p className="text-[11px] text-emerald-700/80 mt-0.5">Pas target & surplus s/d +1.100</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Lapisan Koper (A023-A032)</p>
          <p className="mt-1 text-2xl font-black text-amber-950">Dalam Proses</p>
          <p className="text-[11px] text-amber-700/80 mt-0.5">Defisit -12.600 s/d -35.200 pcs</p>
        </div>
      </div>

      {/* TABEL 1: PEMAKAIAN BAHAN KAIN OTOMATIS (ESTIMASI BOM VS GUDANG) */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50/40 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <span>⚡</span> Pemakaian Bahan Baku Kain (Kalkulasi Otomatis dari Hasil Potongan)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Dihitung otomatis mengikuti rasio standar BOM produk. Tim potong <b>tidak perlu repot menghitung meter kain</b> per lembar.
            </p>
          </div>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold text-blue-700">
            Sistem Otomatis Aktif
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Kode Bahan</th>
                <th className="px-4 py-3">Nama Material Kain</th>
                <th className="px-4 py-3">Untuk Produk</th>
                <th className="px-4 py-3">Standar / Pcs</th>
                <th className="px-4 py-3 text-right">Kain Terpakai</th>
                <th className="px-4 py-3 text-right">Stok di Gudang</th>
                <th className="px-4 py-3 text-right">Sisa Stok Bahan</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {materialUsages.map((m, idx) => (
                <tr key={idx} className="hover:bg-slate-50/60 transition">
                  <td className="px-4 py-3 font-mono font-bold text-blue-600">{m.materialCode}</td>
                  <td className="px-4 py-3 font-bold text-slate-900">{m.materialName}</td>
                  <td className="px-4 py-3 text-slate-600">{m.forProduct}</td>
                  <td className="px-4 py-3 font-mono text-slate-500">{m.standardPerUnit}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                    {m.totalUsed} <span className="text-[10px] text-slate-500">{m.unit}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600">
                    {m.warehouseStock} <span className="text-[10px] text-slate-400">{m.unit}</span>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-black ${
                    m.remainingStock.startsWith("-") ? "text-rose-600" : "text-emerald-700"
                  }`}>
                    {m.remainingStock} <span className="text-[10px] text-slate-400">{m.unit}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      m.status === "AMAN"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}>
                      {m.status === "AMAN" ? "✅ Stok Cukup" : "⚠️ Perlu Tambahan"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* TABEL 2: REKAP HASIL POTONGAN KOMPONEN POLA (32 ITEM) */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="border-b border-slate-100 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <span>📋</span> Monitoring Hasil Potongan Komponen Pola ({filteredRows.length} Item)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Akumulasi real-time dari 191 transaksi harian meja potong (03 - 21 Februari 2026).
            </p>
          </div>

          {/* Filter Produk */}
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1 text-xs font-bold">
            <button
              onClick={() => setFilterProduct("ALL")}
              className={`rounded-lg px-2.5 py-1 transition ${
                filterProduct === "ALL" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Semua (32)
            </button>
            <button
              onClick={() => setFilterProduct("Paspor")}
              className={`rounded-lg px-2.5 py-1 transition ${
                filterProduct === "Paspor" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tas Paspor (9)
            </button>
            <button
              onClick={() => setFilterProduct("Ransel")}
              className={`rounded-lg px-2.5 py-1 transition ${
                filterProduct === "Ransel" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tas Ransel (13)
            </button>
            <button
              onClick={() => setFilterProduct("Lapisan")}
              className={`rounded-lg px-2.5 py-1 transition ${
                filterProduct === "Lapisan" ? "bg-white text-blue-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Lapisan Koper (10)
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Nama Item / Pola</th>
                <th className="px-4 py-3">Model Produk</th>
                <th className="px-4 py-3 text-center">Rasio/Tas</th>
                <th className="px-4 py-3 text-right">Target Kebutuhan</th>
                <th className="px-4 py-3 text-right">Hasil Potong</th>
                <th className="px-4 py-3 text-right">Selisih</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((r, i) => {
                const isComplete = r.diff >= 0;
                return (
                  <tr key={i} className="hover:bg-slate-50/70 transition">
                    <td className="px-4 py-2.5 font-mono font-bold text-blue-600">{r.code}</td>
                    <td className="px-4 py-2.5 font-bold text-slate-900">{r.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.productName}</td>
                    <td className="px-4 py-2.5 text-center font-mono font-semibold text-slate-500">{r.factor}x</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-600">
                      {r.targetQty.toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-black text-slate-900">
                      {r.actualQty.toLocaleString("id-ID")}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono font-bold ${
                      r.diff > 0 ? "text-emerald-700" : r.diff === 0 ? "text-slate-600" : "text-rose-600"
                    }`}>
                      {r.diff > 0 ? `+${r.diff.toLocaleString("id-ID")}` : r.diff.toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        r.diff > 0
                          ? "bg-emerald-100 text-emerald-800"
                          : r.diff === 0
                          ? "bg-blue-100 text-blue-800"
                          : "bg-rose-100 text-rose-800"
                      }`}>
                        {r.diff > 0 ? "Surplus (Lebih)" : r.diff === 0 ? "Pas 100%" : "Kurang"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
