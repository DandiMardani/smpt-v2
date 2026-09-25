"use client";

import { useState } from "react";
import { Badge, Empty } from "@/components/final/final-ui";
import { money, n } from "@/lib/final/final-utils";

type WarungItem = {
  id: number;
  advance_code: string;
  advance_date: string;
  warung_name?: string | null;
  amount: number | string;
  paid_amount: number | string;
  notes?: string | null;
};

type LoanItem = {
  id: number;
  advance_code: string;
  advance_date: string;
  amount: number | string;
  paid_amount: number | string;
  installment_count?: number | null;
  installment_amount?: number | string | null;
  installments_paid?: number | null;
  notes?: string | null;
};

export function WorkerFinancialSummary({
  worker,
  warungDebts,
  companyLoans,
  workedDays,
  overtimeHours,
  estimatedGross,
}: {
  worker: {
    id: number;
    name: string;
    worker_code: string;
    pay_system: string;
    department?: string | null;
  };
  warungDebts: WarungItem[];
  companyLoans: LoanItem[];
  workedDays: number;
  overtimeHours: number;
  estimatedGross: number;
}) {
  const [showDetail, setShowDetail] = useState(false);

  // Calculations
  const totalWarung = warungDebts.reduce((acc, x) => acc + (n(x.amount) - n(x.paid_amount)), 0);
  const totalCompanyLoan = companyLoans.reduce((acc, x) => acc + (n(x.amount) - n(x.paid_amount)), 0);

  // Monthly active company installment
  const activeCompanyInstallment = companyLoans.reduce((acc, x) => {
    const rem = n(x.amount) - n(x.paid_amount);
    const instCount = Number(x.installment_count) || 1;
    const instAmt = n(x.installment_amount) || (instCount > 1 ? Math.round(n(x.amount) / instCount) : rem);
    return acc + Math.min(rem, instAmt);
  }, 0);

  const totalDeductionPending = totalWarung + (worker.pay_system === "BULANAN" ? activeCompanyInstallment : totalCompanyLoan);
  const estimatedNet = Math.max(0, estimatedGross - totalDeductionPending);

  return (
    <div className="rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50/50 via-white to-amber-50/30 p-5 shadow-xs sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/80 pb-3">
        <div>
          <span className="inline-block rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800 uppercase tracking-wider">
            Transparansi Finansial Pekerja
          </span>
          <h2 className="text-lg font-extrabold text-gray-900 mt-1">
            Status Gaji & Hutang Saya Hari Ini
          </h2>
          <p className="text-xs text-gray-500">
            {worker.name} ({worker.worker_code}) · Sistem Upah: <b>{worker.pay_system}</b>
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowDetail(!showDetail)}
          className="rounded-xl border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-2xs transition"
        >
          {showDetail ? "▲ Sembunyikan Rincian" : "▼ Lihat Rincian Kasbon"}
        </button>
      </div>

      {/* 4 Primary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Gaji Terkumpul */}
        <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-2xs">
          <div className="text-[11px] font-semibold text-gray-500">Estimasi Upah Terkumpul:</div>
          <div className="mt-1 text-xl font-black text-blue-700">{money(estimatedGross)}</div>
          <div className="mt-1 text-[11px] text-gray-500">
            {workedDays > 0 ? `${workedDays} Hari Kerja` : "Gaji Pokok"}
            {overtimeHours > 0 ? ` · Lembur ${overtimeHours} jam` : ""}
          </div>
        </div>

        {/* Card 2: Hutang Warung */}
        <div className="rounded-xl bg-amber-50/80 border border-amber-200 p-4 shadow-2xs">
          <div className="text-[11px] font-semibold text-amber-900 flex items-center justify-between">
            <span>🍜 Hutang Warung Luar:</span>
            <span className="font-bold">{warungDebts.length} nota</span>
          </div>
          <div className="mt-1 text-xl font-black text-amber-800">{money(totalWarung)}</div>
          <div className="mt-1 text-[10px] text-amber-950 font-medium">
            Otomatis dipotong saat payroll
          </div>
        </div>

        {/* Card 3: Kasbon Perusahaan */}
        <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-2xs">
          <div className="text-[11px] font-semibold text-gray-500 flex items-center justify-between">
            <span>🏢 Sisa Kasbon Kantor:</span>
            {activeCompanyInstallment > 0 && (
              <span className="text-blue-600 font-bold text-[10px]">Cicilan Aktif</span>
            )}
          </div>
          <div className="mt-1 text-xl font-black text-rose-600">{money(totalCompanyLoan)}</div>
          <div className="mt-1 text-[10px] text-gray-500">
            {activeCompanyInstallment > 0
              ? `Potongan bln ini: ${money(activeCompanyInstallment)}`
              : "Tidak ada cicilan aktif"}
          </div>
        </div>

        {/* Card 4: Estimasi Bersih Diterima */}
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 shadow-2xs">
          <div className="text-[11px] font-semibold text-emerald-900">Perkiraan Gaji Bersih (Net):</div>
          <div className="mt-1 text-xl font-black text-emerald-700">{money(estimatedNet)}</div>
          <div className="mt-1 text-[10px] text-emerald-800 font-medium">
            Setelah dikurangi seluruh kasbon
          </div>
        </div>
      </div>

      {/* Rincian Kasbon Detail Accordion */}
      {showDetail && (
        <div className="space-y-4 pt-2 border-t border-gray-200/80">
          {/* Detail Hutang Warung */}
          <div className="rounded-xl bg-white border border-amber-200 p-4">
            <h3 className="font-bold text-sm text-amber-950 mb-2 flex items-center gap-1.5">
              <span>🍜</span> Rincian Hutang Warung Mitra ({warungDebts.length} Catatan)
            </h3>
            {warungDebts.length === 0 ? (
              <p className="text-xs text-gray-500 italic">Anda tidak memiliki tagihan hutang di warung luar.</p>
            ) : (
              <div className="divide-y divide-gray-100 text-xs">
                {warungDebts.map((w) => {
                  const rem = n(w.amount) - n(w.paid_amount);
                  return (
                    <div key={w.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-gray-800">
                          {w.warung_name || "Warung Luar"} · <span className="font-normal text-gray-500">{w.advance_date}</span>
                        </div>
                        <div className="text-[11px] text-gray-600 mt-0.5">{w.notes || "Konsumsi / Belanja"}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-extrabold text-amber-800">{money(rem)}</div>
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                          Belum dipotong gaji
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail Kasbon Perusahaan */}
          <div className="rounded-xl bg-white border border-gray-200 p-4">
            <h3 className="font-bold text-sm text-gray-900 mb-2 flex items-center gap-1.5">
              <span>🏢</span> Rincian Kasbon Perusahaan & Angsuran ({companyLoans.length} Pinjaman)
            </h3>
            {companyLoans.length === 0 ? (
              <p className="text-xs text-gray-500 italic">Anda tidak memiliki pinjaman kasbon perusahaan yang aktif.</p>
            ) : (
              <div className="divide-y divide-gray-100 text-xs">
                {companyLoans.map((l) => {
                  const rem = n(l.amount) - n(l.paid_amount);
                  const count = Number(l.installment_count) || 1;
                  const paid = Number(l.installments_paid) || 0;
                  const instAmt = n(l.installment_amount) || Math.round(n(l.amount) / count);
                  return (
                    <div key={l.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-gray-800">
                          {l.advance_code} · {l.advance_date}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {count > 1 ? `Angsuran: ${paid} dari ${count} kali dipotong (${money(instAmt)}/bln)` : "Pinjaman Sekali Lunas"}
                          {l.notes ? ` · ${l.notes}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-extrabold text-rose-600">{money(rem)}</div>
                        <div className="text-[10px] text-gray-400">
                          dari total {money(l.amount)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
