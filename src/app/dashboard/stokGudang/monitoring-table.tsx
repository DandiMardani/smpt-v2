import { formatNumber } from "@/lib/master/page-utils";

export type MonitoringRow = {
  materialId: number;
  materialCode: string;
  name: string;
  unit: string;
  categoryGroup: string;
  specPerPcs: number;
  totalMasuk: number;
  totalKebutuhan: number;
  selisih: number;
  status: "SURPLUS" | "DEFISIT" | "SESUAI";
};

export function MonitoringMaterialTable({
  rows,
  targetProduction,
}: {
  rows: MonitoringRow[];
  targetProduction: number;
}) {
  const surplusCount = rows.filter((r) => r.selisih > 0).length;
  const defisitCount = rows.filter((r) => r.selisih < 0).length;

  // Group by categoryGroup
  const groups = Array.from(new Set(rows.map((r) => r.categoryGroup)));

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Target Paket Proyek</p>
          <p className="mt-1 text-2xl font-extrabold text-blue-600">
            {formatNumber(targetProduction)} <span className="text-sm font-normal text-slate-500">pcs</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-400">Dasar perhitungan kebutuhan BOM</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-2xs">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Material Surplus / Aman</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-700">
            {surplusCount} <span className="text-sm font-normal text-emerald-600">item</span>
          </p>
          <p className="mt-0.5 text-xs text-emerald-600">Stok masuk mencukupi kebutuhan</p>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4 shadow-2xs">
          <p className="text-xs font-bold uppercase tracking-wider text-red-700">Material Defisit / Kurang</p>
          <p className="mt-1 text-2xl font-extrabold text-red-700">
            {defisitCount} <span className="text-sm font-normal text-red-600">item</span>
          </p>
          <p className="mt-0.5 text-xs text-red-600">Perlu order tambahan ke supplier</p>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-slate-700 font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Kode</th>
                <th className="py-3 px-4">Nama Barang / Item</th>
                <th className="py-3 px-4 text-right">Spec / Pcs</th>
                <th className="py-3 px-4 text-center">Sat</th>
                <th className="py-3 px-4 text-right bg-blue-50/50 text-blue-900">Total Masuk Gudang</th>
                <th className="py-3 px-4 text-right bg-amber-50/50 text-amber-900">Total Kebutuhan</th>
                <th className="py-3 px-4 text-right">Kekurangan / Kelebihan</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groups.map((groupName) => {
                const groupRows = rows.filter((r) => r.categoryGroup === groupName);
                return (
                  <React.Fragment key={groupName}>
                    <tr className="bg-slate-100/80">
                      <td colSpan={8} className="py-2 px-4 font-extrabold uppercase tracking-wider text-slate-700 text-[11px]">
                        🏷️ {groupName} ({groupRows.length} item)
                      </td>
                    </tr>
                    {groupRows.map((r) => {
                      const isMinus = r.selisih < 0;
                      const isZero = r.selisih === 0;

                      return (
                        <tr key={r.materialId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-4 font-mono font-bold text-blue-600">{r.materialCode}</td>
                          <td className="py-2.5 px-4 font-semibold text-slate-800">{r.name}</td>
                          <td className="py-2.5 px-4 text-right font-mono text-slate-600">
                            {r.specPerPcs > 0 ? r.specPerPcs : "-"}
                          </td>
                          <td className="py-2.5 px-4 text-center font-medium text-slate-500">{r.unit}</td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-blue-700 bg-blue-50/30">
                            {formatNumber(r.totalMasuk)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-amber-800 bg-amber-50/30">
                            {formatNumber(r.totalKebutuhan)}
                          </td>
                          <td
                            className={`py-2.5 px-4 text-right font-mono font-extrabold ${
                              isMinus
                                ? "text-red-600"
                                : isZero
                                ? "text-slate-500"
                                : "text-emerald-600"
                            }`}
                          >
                            {isMinus ? formatNumber(r.selisih) : `+${formatNumber(r.selisih)}`}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {isMinus ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-extrabold text-red-700">
                                🔴 KURANG
                              </span>
                            ) : isZero ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                ⚪ PAS
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">
                                🟢 SURPLUS
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import React from "react";
