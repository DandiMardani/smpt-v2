"use client";

import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/master/page-utils";
import Link from "next/link";

export type ProductBreakdown = {
  productId: number;
  productCode: string;
  productName: string;
  targetProduction: number;
  unit: string;
  qtyPerUnit: number;
  allowancePercent: number;
  qtyWithOverage: number;
  totalNeed: number;
};

export type MaterialMrpItem = {
  materialId: number;
  materialCode: string;
  materialName: string;
  unit: string;
  totalNeed: number;
  allocatedQty: number;
  globalStockQty: number;
  shortageQty: number;
  fulfillmentPercent: number;
  breakdown: ProductBreakdown[];
  receivedQty?: number;
};

export type ProjectMrpGroup = {
  projectId: number;
  projectCode: string;
  projectName: string;
  projectStatus: string;
  totalMaterials: number;
  shortageMaterialsCount: number;
  fulfilledMaterialsCount: number;
  averageFulfillment: number;
  materials: MaterialMrpItem[];
};

export type RawLedgerEntry = {
  id: number;
  material_id: number | null;
  location_id: number;
  project_id: number | null;
  movement_kind: string;
  quantity_delta: number | string;
  unit_snapshot: string;
  notes: string | null;
  created_at: string;
  materialName?: string;
  materialCode?: string;
  locationName?: string;
  projectName?: string;
};

interface MrpDashboardClientProps {
  projectGroups: ProjectMrpGroup[];
  rawLedgerEntries?: RawLedgerEntry[];
}

export function MrpDashboardClient({
  projectGroups,
  rawLedgerEntries = [],
}: MrpDashboardClientProps) {
  const [mainTab, setMainTab] = useState<"mrp" | "log">("mrp");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "SHORTAGE" | "FULFILLED">("ALL");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Toggle ekspansi baris rincian produk
  const toggleRow = (key: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Metrik Global Keseluruhan
  const globalMetrics = useMemo(() => {
    let totalProjects = projectGroups.length;
    let totalMaterialLines = 0;
    let totalShortageLines = 0;
    let totalFulfilledLines = 0;

    projectGroups.forEach((proj) => {
      proj.materials.forEach((mat) => {
        totalMaterialLines++;
        if (mat.shortageQty > 0) {
          totalShortageLines++;
        } else {
          totalFulfilledLines++;
        }
      });
    });

    return {
      totalProjects,
      totalMaterialLines,
      totalShortageLines,
      totalFulfilledLines,
    };
  }, [projectGroups]);

  // Filter Group Proyek & Material
  const filteredProjects = useMemo(() => {
    let list = projectGroups;

    // Filter berdasarkan Proyek terpilih
    if (selectedProjectId !== "ALL") {
      list = list.filter((p) => String(p.projectId) === selectedProjectId);
    }

    // Filter text query & status
    const query = searchQuery.trim().toLowerCase();

    return list
      .map((proj) => {
        // Filter material di dalam proyek
        const filteredMats = proj.materials.filter((mat) => {
          // Status filter
          if (statusFilter === "SHORTAGE" && mat.shortageQty <= 0) return false;
          if (statusFilter === "FULFILLED" && mat.shortageQty > 0) return false;

          // Search query matching
          if (!query) return true;

          const matchMat =
            mat.materialName.toLowerCase().includes(query) ||
            mat.materialCode.toLowerCase().includes(query);
          const matchProj =
            proj.projectName.toLowerCase().includes(query) ||
            proj.projectCode.toLowerCase().includes(query);
          const matchProduct = mat.breakdown.some(
            (b) =>
              b.productName.toLowerCase().includes(query) ||
              b.productCode.toLowerCase().includes(query)
          );

          return matchMat || matchProj || matchProduct;
        });

        return {
          ...proj,
          materials: filteredMats,
        };
      })
      .filter((proj) => {
        // Tampilkan jika materialnya cocok, atau jika belum ada pencarian
        if (!query && statusFilter === "ALL") return true;
        return proj.materials.length > 0;
      });
  }, [projectGroups, selectedProjectId, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Tab Navigasi Utama */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMainTab("mrp")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition cursor-pointer ${
              mainTab === "mrp"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <span>📊</span>
            <span>Monitoring Kebutuhan Bahan (MRP)</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                mainTab === "mrp" ? "bg-white/25 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {globalMetrics.totalMaterialLines} Item
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab("log")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition cursor-pointer ${
              mainTab === "log"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <span>📜</span>
            <span>Log Mutasi Bahan Baku</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                mainTab === "log" ? "bg-white/25 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {rawLedgerEntries.length}
            </span>
          </button>
        </div>

        <Link
          href="/dashboard/masterKebutuhan"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
        >
          <span>⚙️</span>
          <span>Kelola BOM / Kebutuhan</span>
        </Link>
      </div>

      {mainTab === "mrp" ? (
        <>
          {/* Ringkasan Metrik Global */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 block">Total Proyek Dipantau</span>
              <b className="text-2xl font-black text-slate-900 mt-1 block">
                {globalMetrics.totalProjects} Proyek
              </b>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Proyek dengan kebutuhan BOM aktif
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 block">Total Item Bahan</span>
              <b className="text-2xl font-black text-blue-600 mt-1 block">
                {globalMetrics.totalMaterialLines} Material
              </b>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Terkait rencana produksi
              </span>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
              <span className="text-xs font-semibold text-emerald-800 block">Bahan Terpenuhi (100%)</span>
              <b className="text-2xl font-black text-emerald-700 mt-1 block">
                {globalMetrics.totalFulfilledLines} Item
              </b>
              <span className="text-[11px] text-emerald-600 mt-0.5 block">
                Alokasi keluar mencukupi kebutuhan
              </span>
            </div>

            <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 shadow-xs">
              <span className="text-xs font-semibold text-rose-800 block">Bahan Kurang / Defisit</span>
              <b className="text-2xl font-black text-rose-600 mt-1 block">
                {globalMetrics.totalShortageLines} Item
              </b>
              <span className="text-[11px] text-rose-500 mt-0.5 block">
                Perlu pengeluaran atau PO tambahan
              </span>
            </div>
          </div>

          {/* Bar Kontrol & Filter */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                {/* Search Input */}
                <div className="relative min-w-[240px] flex-1 max-w-md">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 text-xs">
                    🔍
                  </span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama material, kode, atau proyek..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Pilih Proyek Tabs / Dropdown */}
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 cursor-pointer"
                >
                  <option value="ALL">Semua Proyek ({projectGroups.length})</option>
                  {projectGroups.map((p) => (
                    <option key={p.projectId} value={String(p.projectId)}>
                      {p.projectCode} · {p.projectName}
                    </option>
                  ))}
                </select>

                {/* Filter Status Defisit */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setStatusFilter("ALL")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                      statusFilter === "ALL"
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("SHORTAGE")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                      statusFilter === "SHORTAGE"
                        ? "bg-rose-600 text-white shadow-2xs"
                        : "text-rose-700 hover:bg-rose-50"
                    }`}
                  >
                    Kurang ({globalMetrics.totalShortageLines})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("FULFILLED")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                      statusFilter === "FULFILLED"
                        ? "bg-emerald-600 text-white shadow-2xs"
                        : "text-emerald-700 hover:bg-emerald-50"
                    }`}
                  >
                    Terpenuhi
                  </button>
                </div>
              </div>

              {/* Reset filter jika aktif */}
              {(searchQuery || selectedProjectId !== "ALL" || statusFilter !== "ALL") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedProjectId("ALL");
                    setStatusFilter("ALL");
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  Reset Filter
                </button>
              )}
            </div>
          </div>

          {/* Daftar Proyek & Tabel Monitoring MRP */}
          {filteredProjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center space-y-3">
              <span className="text-4xl block">📦</span>
              <h3 className="text-base font-extrabold text-slate-800">
                Tidak Ada Data Kebutuhan Bahan (MRP)
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {searchQuery || statusFilter !== "ALL" || selectedProjectId !== "ALL"
                  ? "Tidak ada item material atau proyek yang cocok dengan filter yang Anda tentukan."
                  : "Belum ada Master Kebutuhan (BOM) yang dibuat untuk proyek aktif. Silakan buat rincian BOM terlebih dahulu."}
              </p>
              <Link
                href="/dashboard/masterKebutuhan"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
              >
                <span>➕</span>
                <span>Tambah Kebutuhan BOM</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredProjects.map((project) => {
                const totalMat = project.materials.length;
                const shortageMat = project.materials.filter((m) => m.shortageQty > 0).length;

                return (
                  <div
                    key={project.projectId}
                    className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden transition-all duration-200 hover:border-slate-300"
                  >
                    {/* Header Proyek */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:px-6">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white font-mono font-black text-sm shadow-2xs">
                          📁
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-extrabold text-slate-900 text-base">
                              {project.projectName}
                            </h3>
                            <span className="rounded-lg bg-blue-100 px-2 py-0.5 font-mono text-[11px] font-bold text-blue-800">
                              {project.projectCode}
                            </span>
                            <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                              {project.projectStatus || "AKTIF"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Monitoring pemenuhan material terhadap target produksi semua produk dalam proyek ini.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 text-xs">
                        <span className="rounded-xl bg-white border border-slate-200 px-3 py-1.5 font-bold text-slate-700 shadow-2xs">
                          {totalMat} Jenis Material
                        </span>
                        {shortageMat > 0 ? (
                          <span className="rounded-xl bg-rose-100 border border-rose-200 px-3 py-1.5 font-extrabold text-rose-800 shadow-2xs animate-pulse">
                            ⚠️ {shortageMat} Belum Terpenuhi
                          </span>
                        ) : (
                          <span className="rounded-xl bg-emerald-100 border border-emerald-200 px-3 py-1.5 font-extrabold text-emerald-800 shadow-2xs">
                            ✅ 100% Terpenuhi
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Tabel Monitoring MRP Material */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-100/60 font-bold uppercase tracking-wider text-slate-600">
                          <tr>
                            <th className="py-3 px-4 w-[250px]">Nama Material</th>
                            <th className="py-3 px-4 w-[150px]">Total Kebutuhan</th>
                            <th className="py-3 px-4 w-[150px]">Teralokasi / Keluar</th>
                            <th className="py-3 px-4 w-[140px]">Stok Gudang</th>
                            <th className="py-3 px-4 w-[170px]">Kekurangan</th>
                            <th className="py-3 px-4 min-w-[180px]">Status Pemenuhan</th>
                            <th className="py-3 px-4 text-center w-[70px]">Rincian</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {project.materials.map((mat) => {
                            const rowKey = `${project.projectId}_${mat.materialId}`;
                            const isExpanded = Boolean(expandedRows[rowKey]);
                            const isDeficit = mat.shortageQty > 0;

                            return (
                              <tr key={mat.materialId} className="group hover:bg-slate-50/50 transition">
                                <td className="py-3.5 px-4 align-top" colSpan={7}>
                                  <div className="grid grid-cols-[250px_150px_150px_140px_170px_1fr_70px] items-center gap-3">
                                    {/* Kolom 1: Nama Material */}
                                    <div>
                                      <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                                        <span>{mat.materialName}</span>
                                      </div>
                                      <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="font-mono text-[11px] font-bold text-slate-500">
                                          {mat.materialCode}
                                        </span>
                                        <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                                          Satuan: {mat.unit}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Kolom 2: Total Kebutuhan */}
                                    <div className="align-middle">
                                      <b className="font-mono text-sm font-extrabold text-slate-900 block">
                                        {formatNumber(mat.totalNeed)} {mat.unit}
                                      </b>
                                      <button
                                        type="button"
                                        onClick={() => toggleRow(rowKey)}
                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline mt-0.5 cursor-pointer"
                                      >
                                        <span>{isExpanded ? "▲ Tutup" : "▼ Rincian"}</span>
                                        <span>({mat.breakdown.length} produk)</span>
                                      </button>
                                    </div>

                                    {/* Kolom 3: Teralokasi / Keluar */}
                                    <div className="align-middle">
                                      <b className="font-mono text-sm font-extrabold text-blue-700 block">
                                        {formatNumber(mat.allocatedQty ?? mat.receivedQty ?? 0)} {mat.unit}
                                      </b>
                                      <span className="text-[10px] text-slate-400 block">
                                        Alokasi ke proyek ini
                                      </span>
                                    </div>

                                    {/* Kolom 4: Stok Gudang (Global) */}
                                    <div className="align-middle">
                                      <b className="font-mono text-sm font-extrabold text-slate-800 block">
                                        {formatNumber(mat.globalStockQty ?? 0)} {mat.unit}
                                      </b>
                                      <span className="text-[10px] text-slate-400 block">
                                        Stok fisik gudang
                                      </span>
                                    </div>

                                    {/* Kolom 5: Kekurangan (Kekurangan = Total Kebutuhan - Teralokasi) */}
                                    <div className="align-middle">
                                      {isDeficit ? (
                                        <div className="inline-flex flex-col items-start gap-1">
                                          <span className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 font-mono text-xs font-black text-rose-700 shadow-2xs">
                                            <span>⚠️</span>
                                            <span>-{formatNumber(mat.shortageQty)} {mat.unit}</span>
                                          </span>
                                          {mat.shortageQty > (mat.globalStockQty ?? 0) ? (
                                            <span className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-800 shadow-2xs">
                                              <span>⚠️</span>
                                              <span>Perlu PO/Beli</span>
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 shadow-2xs">
                                              <span>📦</span>
                                              <span>Stok Aman</span>
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="inline-flex flex-col items-start gap-1">
                                          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-mono text-xs font-bold text-emerald-700">
                                            <span>✓</span>
                                            <span>Terpenuhi (0)</span>
                                          </span>
                                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                            <span>Stok Aman</span>
                                          </span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Kolom 6: Status (Progress Bar %) */}
                                    <div className="space-y-1.5 pr-4">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="font-bold text-slate-700">
                                          {mat.fulfillmentPercent}%
                                        </span>
                                        <span
                                          className={`text-[10px] font-extrabold uppercase tracking-wide ${
                                            mat.fulfillmentPercent >= 100
                                              ? "text-emerald-700"
                                              : mat.fulfillmentPercent >= 50
                                              ? "text-blue-700"
                                              : "text-rose-700"
                                          }`}
                                        >
                                          {mat.fulfillmentPercent >= 100
                                            ? "Lengkap"
                                            : mat.fulfillmentPercent > 0
                                            ? "Parsial"
                                            : "Belum Ada"}
                                        </span>
                                      </div>
                                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200/60 shadow-inner">
                                        <div
                                          className={`h-full rounded-full transition-all duration-300 ${
                                            mat.fulfillmentPercent >= 100
                                              ? "bg-emerald-500"
                                              : mat.fulfillmentPercent >= 50
                                              ? "bg-blue-600"
                                              : mat.fulfillmentPercent > 0
                                              ? "bg-amber-500"
                                              : "bg-slate-300"
                                          }`}
                                          style={{ width: `${Math.min(100, mat.fulfillmentPercent)}%` }}
                                        />
                                      </div>
                                    </div>

                                    {/* Kolom 7: Toggle Button */}
                                    <div className="text-center">
                                      <button
                                        type="button"
                                        onClick={() => toggleRow(rowKey)}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-2xs transition cursor-pointer"
                                        title="Buka rincian breakdown produk"
                                      >
                                        <span
                                          className={`transform transition-transform text-xs font-bold ${
                                            isExpanded ? "rotate-180" : ""
                                          }`}
                                        >
                                          ▼
                                        </span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* Expandable Row: Data Breakdown per Produk */}
                                  {isExpanded && (
                                    <div className="mt-3.5 pt-3.5 border-t border-indigo-100 bg-indigo-50/40 rounded-xl p-3.5 space-y-2 animate-in fade-in duration-200">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 font-bold text-xs text-indigo-950">
                                          <span>📦</span>
                                          <span>
                                            Rincian Kebutuhan Material{" "}
                                            <b className="underline">{mat.materialName}</b> per Produk:
                                          </span>
                                        </div>
                                        <span className="text-[11px] text-slate-500 font-mono">
                                          Rumus: ((Qty BOM + Overage) × Target Produksi)
                                        </span>
                                      </div>

                                      <div className="overflow-x-auto rounded-lg border border-indigo-200/80 bg-white">
                                        <table className="w-full text-left text-xs">
                                          <thead className="bg-indigo-50/70 border-b border-indigo-100 font-bold text-indigo-900 text-[11px]">
                                            <tr>
                                              <th className="py-2 px-3">Kode & Nama Produk</th>
                                              <th className="py-2 px-3 text-right">Target Produksi</th>
                                              <th className="py-2 px-3 text-right">Qty BOM Satuan</th>
                                              <th className="py-2 px-3 text-right">Toleransi (Overage)</th>
                                              <th className="py-2 px-3 text-right">BOM + Overage</th>
                                              <th className="py-2 px-3 text-right">Subtotal Kebutuhan</th>
                                              <th className="py-2 px-3 text-right">Porsi</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                                            {mat.breakdown.map((b) => {
                                              const share =
                                                mat.totalNeed > 0
                                                  ? Math.round((b.totalNeed / mat.totalNeed) * 100)
                                                  : 0;

                                              return (
                                                <tr key={b.productId} className="hover:bg-slate-50/50">
                                                  <td className="py-2 px-3 font-sans font-bold text-slate-900">
                                                    <span className="font-mono text-blue-700 mr-1.5">
                                                      {b.productCode}
                                                    </span>
                                                    <span>{b.productName}</span>
                                                  </td>
                                                  <td className="py-2 px-3 text-right text-slate-700">
                                                    {formatNumber(b.targetProduction)} pcs
                                                  </td>
                                                  <td className="py-2 px-3 text-right text-slate-600">
                                                    {formatNumber(b.qtyPerUnit)} {b.unit}
                                                  </td>
                                                  <td className="py-2 px-3 text-right text-slate-600">
                                                    {b.allowancePercent}%
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-semibold text-slate-800">
                                                    {formatNumber(b.qtyWithOverage)} {b.unit}
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-extrabold text-blue-700">
                                                    {formatNumber(b.totalNeed)} {b.unit}
                                                  </td>
                                                  <td className="py-2 px-3 text-right text-slate-500 font-sans">
                                                    {share}%
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                          <tfoot className="border-t border-indigo-200 bg-indigo-50/50 font-bold text-xs">
                                            <tr>
                                              <td className="py-2 px-3 text-indigo-900 font-sans">
                                                Total Akumulasi Proyek:
                                              </td>
                                              <td colSpan={4}></td>
                                              <td className="py-2 px-3 text-right font-mono font-black text-blue-800">
                                                {formatNumber(mat.totalNeed)} {mat.unit}
                                              </td>
                                              <td className="py-2 px-3 text-right text-indigo-900 font-sans">
                                                100%
                                              </td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* TAB 2: Mutasi Log Bahan Baku Fisik (Tampilan Log Original yang Dirapikan) */
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Riwayat Mutasi Fisik Material Terbaru
              </h3>
              <p className="text-xs text-slate-500">
                Log pergerakan stok material dari transaksi Gudang, Cutting, atau Siap Produksi.
              </p>
            </div>
            <span className="rounded-xl bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {rawLedgerEntries.length} Baris
            </span>
          </div>

          <div className="space-y-2">
            {rawLedgerEntries.map((r) => {
              const isPos = Number(r.quantity_delta) >= 0;
              return (
                <div
                  key={r.id}
                  className="grid gap-2 rounded-xl border border-slate-200/80 bg-white p-3 text-xs shadow-2xs md:grid-cols-[160px_1fr_1fr_1fr_auto] items-center hover:border-slate-300 transition"
                >
                  <span className="text-[11px] text-slate-500 font-mono">
                    {new Date(r.created_at).toLocaleString("id-ID")}
                  </span>
                  <span className="font-bold text-slate-900">
                    {r.materialCode} · {r.materialName}
                  </span>
                  <span className="text-slate-600 font-medium">
                    {r.locationName || "Gudang"}
                  </span>
                  <span className="text-slate-600 font-medium">
                    {r.projectName || "Global Gudang"}
                  </span>
                  <b className={`font-mono text-sm font-black ${isPos ? "text-emerald-700" : "text-amber-700"}`}>
                    {isPos ? "+" : ""}
                    {formatNumber(r.quantity_delta)} {r.unit_snapshot}
                  </b>
                  <div className="md:col-span-5 text-[11px] text-slate-500 border-t border-slate-100 pt-1.5 mt-0.5 flex items-center justify-between">
                    <span className="font-semibold text-slate-700">
                      Jenis Gerakan: {r.movement_kind}
                    </span>
                    {r.notes ? <span className="text-slate-400 truncate max-w-md">{r.notes}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
