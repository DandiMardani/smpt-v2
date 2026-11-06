"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge, Card, Empty, buttonClass, inputClass } from "@/components/final/final-ui";
import { money, qty } from "@/lib/final/final-utils";
import { CancelOperatorPayrollRunButton } from "@/components/payroll/cancel-operator-run-button";

// Tipe Data Adaptasi dari Database
export type BoronganItemRow = {
  id: number; run_id: number; worker_id: number;
  worker_name_snapshot: string; work_item_name_snapshot: string;
  qty_approved: number | string; operator_price_snapshot: number | string;
  submission_price_snapshot: number | string; operator_value: number | string;
  submission_value: number | string; spk_no?: string | null;
  payment_status?: string | null;
};

export type BoronganRunRow = {
  id: number; payroll_code: string; period_start: string; period_end: string;
  status: string; total_operator_value: number | string; total_submission_value: number | string;
};

export type BoronganWorkerRow = { id: number; name: string; worker_code?: string | null };

export type BoronganFilters = { periodStart: string; periodEnd: string; workerId: string; search: string };

// Payload Struktur Set Lunas (Persiapan ke Backend/Production_Checks)
export type SetLunasPayload = {
  runIds: number[]; checkIds: number[]; workerIds: number[];
  periodStart: string; periodEnd: string; totalAmount: number; totalQty: number;
};

type ContainerProps = {
  runs: BoronganRunRow[];
  items: BoronganItemRow[];
  workers: BoronganWorkerRow[];
  initialFilters: BoronganFilters;
  canWrite: boolean;
};

// Helper: Konversi Nilai Aman
const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function PayrollBoronganContainer({ runs, items, workers, initialFilters, canWrite }: ContainerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<BoronganFilters>(initialFilters);
  const [isPending, startTransition] = useTransition();

  // Sinkronisasi URL Search Params (Agar Data Tidak Hilang Saat Refresh)
  const patchFilter = (key: keyof BoronganFilters, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    
    // Gunakan transisi UI agar form input tidak lag
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  // Kalkulasi & Rekap Data Dinamis: Kelompokkan Item Berdasarkan Pekerja & Run
  const { groupedRows, grandTotal, totalChecks, periodLabel } = useMemo(() => {
    // 1. Filter Run Berdasarkan Rentang Tanggal
    let activeRuns = runs;
    if (filters.periodStart) {
      activeRuns = activeRuns.filter(r => (r.period_end || "9999-12-31") >= filters.periodStart);
    }
    if (filters.periodEnd) {
      activeRuns = activeRuns.filter(r => (r.period_start || "0000-01-01") <= filters.periodEnd);
    }

    const validRunIds = new Set(activeRuns.map(r => r.id));

    // 2. Filter Item Pekerjaan (Berdasarkan Run, Pekerja, dan Search)
    const validItems = items.filter(i => {
      if (!validRunIds.has(i.run_id)) return false;
      if (filters.workerId && i.worker_id.toString() !== filters.workerId) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        return i.worker_name_snapshot?.toLowerCase().includes(q) || i.work_item_name_snapshot?.toLowerCase().includes(q);
      }
      return true;
    });

    // 3. Kelompokkan Menjadi Baris Slip Pekerja
    // Key format: "runId:workerId"
    const rowMap = new Map<string, {
      run: BoronganRunRow, workerId: number, workerName: string, items: BoronganItemRow[],
      totalQty: number, totalAmount: number
    }>();

    let grandTot = 0;
    validItems.forEach(item => {
      const key = `${item.run_id}:${item.worker_id}`;
      let row = rowMap.get(key);
      if (!row) {
        const runData = activeRuns.find(r => r.id === item.run_id)!;
        row = { run: runData, workerId: item.worker_id, workerName: item.worker_name_snapshot, items: [], totalQty: 0, totalAmount: 0 };
        rowMap.set(key, row);
      }
      row.items.push(item);
      const q = num(item.qty_approved);
      const amt = num(item.operator_value);
      row.totalQty += q;
      row.totalAmount += amt;
      grandTot += amt;
    });

    // 4. Hitung Periode Dinamis
    let pLabel = "Belum Ada Periode";
    if (filters.periodStart && filters.periodEnd) {
      pLabel = `${filters.periodStart} s/d ${filters.periodEnd}`;
    } else if (activeRuns.length > 0) {
      const starts = activeRuns.map(r => r.period_start).filter(Boolean).sort();
      const ends = activeRuns.map(r => r.period_end).filter(Boolean).sort();
      if (starts.length > 0 && ends.length > 0) {
        pLabel = `${starts[0]} s/d ${ends[ends.length - 1]}`;
      }
    }

    return {
      groupedRows: Array.from(rowMap.values()),
      grandTotal: grandTot,
      totalChecks: validItems.length,
      periodLabel: pLabel
    };
  }, [runs, items, filters]);

  // STUB: Handler Set Lunas
  const handleSetLunas = () => {
    if (groupedRows.length === 0) return alert("Belum ada data valid untuk dilunasi.");

    // Ekstrak data dari semua baris (row) yang terlihat saat ini untuk dijadikan payload
    const checkIds = groupedRows.flatMap(row => row.items.map(i => i.id));
    const runIds = Array.from(new Set(groupedRows.map(row => row.run.id)));
    const workerIds = Array.from(new Set(groupedRows.map(row => row.workerId)));

    const payload: SetLunasPayload = {
      checkIds, runIds, workerIds,
      periodStart: filters.periodStart || new Date().toISOString().split('T')[0],
      periodEnd: filters.periodEnd || new Date().toISOString().split('T')[0],
      totalAmount: grandTotal,
      totalQty: groupedRows.reduce((acc, row) => acc + row.totalQty, 0)
    };

    console.log("[PAYLOAD SET LUNAS (Siap Lempar ke Backend)]:", payload);
    alert(`Mempersiapkan Pelunasan untuk ${workerIds.length} Pekerja (Total Rp ${money(grandTotal)}). (Backend Integrasi Menyusul)`);
  };

  return (
    <div className="space-y-6">
      {/* FILTER BAR */}
      <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-xl border border-gray-200">
        <input type="date" value={filters.periodStart} onChange={(e) => patchFilter("periodStart", e.target.value)} className={inputClass} />
        <span className="text-gray-500 font-medium">s/d</span>
        <input type="date" value={filters.periodEnd} onChange={(e) => patchFilter("periodEnd", e.target.value)} className={inputClass} />

        <select value={filters.workerId} onChange={(e) => patchFilter("workerId", e.target.value)} className={inputClass}>
          <option value="">Semua Pekerja...</option>
          {workers.map(w => (
            <option key={w.id} value={w.id}>{w.worker_code ? `[${w.worker_code}] ` : ""}{w.name}</option>
          ))}
        </select>
      </div>

      {/* CARD: RINCIAN SLIP & TOTAL NILAI BERSIH */}
      <Card title="Rincian Slip Operator Borongan">
        <div className="mb-4">
          <p className="text-sm text-slate-500">
            Dihitung berdasarkan {totalChecks} data setoran yang masuk ke perhitungan periode ini.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-slate-50 rounded-lg p-5 border border-slate-200 shadow-sm mb-6">
           <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Total Setoran / SPK</p>
              <p className="text-sm font-semibold text-slate-700">{totalChecks} Pekerjaan</p>
           </div>
           <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Periode</p>
              <p className="text-sm font-bold text-slate-800">{periodLabel}</p>
           </div>
           <div>
              <p className="text-[10px] uppercase font-bold text-emerald-600/70 tracking-wider mb-1">Total Nilai Bersih</p>
              <p className="text-2xl font-black text-emerald-600">Rp {money(grandTotal)}</p>
           </div>
           <div>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Status Pembayaran</p>
              <div>
                <span className="inline-flex rounded bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                Belum Dibayar
                </span>
              </div>
           </div>
        </div>

        {canWrite && (
           <button onClick={handleSetLunas} className={`${buttonClass} bg-emerald-600 text-white hover:bg-emerald-700 px-6 py-2 shadow-sm font-semibold flex items-center gap-2`}>
              <span>🔒</span> Set Lunas & Kunci Data
           </button>
        )}
      </Card>

      {/* TABEL REKAPITULASI BAWAH */}
      <div className="bg-white border border-amber-100 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-amber-50 px-4 py-3 border-b border-amber-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-amber-900 flex items-center gap-2">
               <span className="bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded uppercase">Borongan</span>
               Tabel Rekapitulasi Pekerja Borongan
            </h3>
          </div>
          <div className="text-right">
             <span className="text-[10px] uppercase text-amber-700/70 font-bold block mb-0.5">Total Upah Operator</span>
             <span className="font-black text-amber-700 text-lg leading-none block">Rp {money(grandTotal)}</span>
          </div>
        </div>

        {groupedRows.length === 0 ? (
          <Empty>
            Tidak ada data setoran. Silakan pilih rentang tanggal periode atau buat kalkulasi batch baru terlebih dahulu.
         </Empty>
        ) : (
          <div className="overflow-x-auto p-4">
             <table className="w-full text-left text-sm border-collapse">
               <thead>
                 <tr className="border-b-2 border-amber-100">
                   <th className="py-3 px-2 font-bold text-amber-900 uppercase text-[11px] whitespace-nowrap">Pekerja</th>
                   <th className="py-3 px-2 font-bold text-amber-900 uppercase text-[11px] whitespace-nowrap">Run Code</th>
                   <th className="py-3 px-2 font-bold text-amber-900 uppercase text-[11px] whitespace-nowrap text-right">Total Qty (Pcs)</th>
                   <th className="py-3 px-2 font-bold text-amber-900 uppercase text-[11px] whitespace-nowrap text-right">Total Upah Bersih</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-gray-100">
                 {groupedRows.map((row, idx) => (
                   <tr key={idx} className="hover:bg-amber-50/50 transition-colors">
                     <td className="py-3 px-2">
                        <span className="font-bold text-slate-800">{row.workerName}</span>
                     </td>
                     <td className="py-3 px-2 text-slate-500 text-xs">
                        {row.run.payroll_code}
                     </td>
                     <td className="py-3 px-2 text-right font-medium text-slate-700">
                        {qty(row.totalQty)}
                     </td>
                     <td className="py-3 px-2 text-right font-bold text-emerald-700">
                        Rp {money(row.totalAmount)}
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
          </div>
        )}
      </div>
      
      {/* RIWAYAT RUN KONTRAK / BATCH (Opsional - Keep Asli) */}
      {runs.length > 0 && (
         <div className="mt-8 opacity-75">
            <h4 className="text-sm font-bold text-slate-600 mb-3 border-b pb-2">Log Batch / Riwayat Kalkulasi Borongan</h4>
            <div className="space-y-2">
               {runs.map(r => (
                  <div key={r.id} className="flex justify-between items-center text-xs p-2 bg-gray-50 border rounded-md">
                     <span><strong>{r.payroll_code}</strong> ({r.period_start} s/d {r.period_end})</span>
                     <div className="flex items-center gap-4">
                        <span className="text-emerald-700 font-bold">Total: Rp {money(r.total_operator_value)}</span>
                        {r.status !== "LUNAS" && canWrite && <CancelOperatorPayrollRunButton runId={r.id} />}
                     </div>
                  </div>
               ))}
            </div>
         </div>
      )}
    </div>
  );
}