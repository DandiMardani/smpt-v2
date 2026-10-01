"use client";

import { useState } from "react";
import { money, n, qty } from "@/lib/final/final-utils";

export type WarungItem = {
  id: number;
  advance_code: string;
  advance_date: string;
  warung_name?: string | null;
  amount: number | string;
  paid_amount: number | string;
  notes?: string | null;
};

export type LoanItem = {
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

export type BoronganItemDetail = {
  spkCode?: string;
  orderDate?: string;
  status?: string;
  workItemName: string;
  assignedQty?: number;
  goodQty?: number;
  rejectQty?: number;
  operatorPrice: number;
  totalValue: number;
};

export type SalaryBreakdown = {
  baseAmount: number;
  overtimeWage: number;
  bonus4h: number;
  sundayMealOrBonus: number;
  regularMeal: number;
  totalGross: number;
  otHourlyRate?: number;
  count4h?: number;
  sundayCount?: number;
  otMinutes?: number;
  boronganItems?: BoronganItemDetail[];
};

export type OfficialSlipData = {
  type: string;
  payrollCode: string;
  periodStart: string;
  periodEnd: string;
  paymentStatus: "SUDAH DIBAYAR" | "BELUM DIBAYAR";
  baseAmount?: number;
  fullDays?: number;
  halfDays?: number;
  overtimeMinutes?: number;
  manualOvertimeHours?: number;
  overtimeAmount?: number;
  manualOvertimeAmount?: number;
  overtimeBonus?: number;
  mealAmount?: number;
  holidayBonus?: number;
  grossAmount: number;
  kasbonPerusahaanAmount?: number;
  kasbonWarungAmount?: number;
  deductionAmount: number;
  netAmount: number;
  notes?: string | null;
  totalQtyApproved?: number;
  boronganItems?: Array<{
    workItemName: string;
    qtyApproved: number;
    operatorPrice: number;
    operatorValue: number;
  }>;
};

function formatDateId(dateStr?: string): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function normalizePhone(phone?: string | null): string {
  if (!phone) return "";
  let clean = phone.replace(/[^0-9]/g, "");
  if (clean.startsWith("0")) clean = "62" + clean.slice(1);
  return clean;
}

export function WorkerFinancialSummary({
  worker,
  warungDebts,
  companyLoans,
  workedDays,
  overtimeHours,
  estimatedGross,
  breakdown,
  officialSlip,
}: {
  worker: {
    id: number;
    name: string;
    worker_code: string;
    pay_system: string;
    department?: string | null;
    phone?: string | null;
  };
  warungDebts: WarungItem[];
  companyLoans: LoanItem[];
  workedDays: number;
  overtimeHours: number;
  estimatedGross: number;
  breakdown?: SalaryBreakdown;
  officialSlip?: OfficialSlipData | null;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [showRulesInfo, setShowRulesInfo] = useState(false);
  const [copied, setCopied] = useState(false);

  const isBorongan = worker.pay_system === "BORONGAN";
  const isBulanan = worker.pay_system === "BULANAN";

  // Periksa apakah slip resmi sudah dibayarkan
  const isSlipPaid = Boolean(
    officialSlip &&
    (
      officialSlip.paymentStatus === "SUDAH DIBAYAR" ||
      (officialSlip as any).status === "PAID" ||
      (officialSlip as any).status === "SUDAH_DIBAYAR"
    )
  );

  // LOGIKA RESET:
  // Jika slip resmi sudah lunas, atau jika karyawan bulanan (karena tanggal 1 adalah cut-off siklus baru),
  // maka lembur periode lalu tidak lagi dihitung di upah berjalan!
  const hasOfficialSlip = Boolean(officialSlip);
  const resetOldOvertime = isSlipPaid || hasOfficialSlip;

  const effectiveOtHours = resetOldOvertime ? 0 : overtimeHours;
  const effectiveOtWage = resetOldOvertime ? 0 : (breakdown?.overtimeWage || 0);
  const effectiveBonus4h = resetOldOvertime ? 0 : (breakdown?.bonus4h || 0);

  // Upah pokok standar
  const baseSalary = Number(breakdown?.baseAmount || (isBulanan ? 3000000 : 0));
  
  // Total bruto berjalan yang sudah di-reset
  const liveGross = isBulanan 
    ? (baseSalary + effectiveOtWage + effectiveBonus4h)
    : (workedDays * (breakdown?.baseAmount || 0) + effectiveOtWage + effectiveBonus4h);

  // Hitung Kasbon
  const totalWarung = warungDebts.reduce((acc, x) => acc + (n(x.amount) - n(x.paid_amount)), 0);
  const totalCompanyLoan = companyLoans.reduce((acc, x) => acc + (n(x.amount) - n(x.paid_amount)), 0);

  const activeCompanyInstallment = companyLoans.reduce((acc, x) => {
    const rem = n(x.amount) - n(x.paid_amount);
    const instCount = Number(x.installment_count) || 1;
    const instAmt = n(x.installment_amount) || (instCount > 1 ? Math.round(n(x.amount) / instCount) : rem);
    return acc + Math.min(rem, instAmt);
  }, 0);

  const currentDeduction = totalWarung + (isBulanan ? activeCompanyInstallment : totalCompanyLoan);
  const liveNet = Math.max(0, liveGross - currentDeduction);

  // Nilai Akhir yang ditampilkan di layar
  const displayedGross = isSlipPaid && officialSlip ? officialSlip.grossAmount : liveGross;
  const displayedDeduction = isSlipPaid && officialSlip ? officialSlip.deductionAmount : currentDeduction;
  const displayedNet = isSlipPaid && officialSlip ? officialSlip.netAmount : liveNet;

  const displayedKasbonPerusahaan = isSlipPaid && officialSlip && officialSlip.kasbonPerusahaanAmount !== undefined
    ? officialSlip.kasbonPerusahaanAmount
    : (isBulanan ? activeCompanyInstallment : totalCompanyLoan);

  const displayedKasbonWarung = isSlipPaid && officialSlip && officialSlip.kasbonWarungAmount !== undefined
    ? officialSlip.kasbonWarungAmount
    : totalWarung;

  const getOfficialWhatsAppText = () => {
    if (!officialSlip) return "";
    const totalOtMins = (officialSlip.overtimeMinutes || 0) + ((officialSlip.manualOvertimeHours || 0) * 60);
    const otHrs = Math.round((totalOtMins / 60) * 10) / 10;
    const totalOtAmt = (officialSlip.overtimeAmount || 0) + (officialSlip.manualOvertimeAmount || 0);

    return `*SLIP GAJI RESMI - CV. SMPT - Kreasi Dinamika*\n` +
      `No. Dokumen: ${officialSlip.payrollCode}\n` +
      `Status: ${officialSlip.paymentStatus}\n` +
      `Periode: ${formatDateId(officialSlip.periodStart)} s/d ${formatDateId(officialSlip.periodEnd)}\n\n` +
      `Nama Pekerja: ${worker.name} (${worker.worker_code})\n` +
      `Sistem Upah: ${officialSlip.type}\n\n` +
      `• Gaji Pokok: ${money(officialSlip.baseAmount || 0)}\n` +
      `${totalOtAmt > 0 ? `• Lembur (${otHrs} Jam):${money(totalOtAmt)}\n` : ""}` +
      `• Pot. Kasbon Kantor: -${money(officialSlip.kasbonPerusahaanAmount || 0)}\n` +
      `• Pot. Kasbon Warung: -${money(officialSlip.kasbonWarungAmount || 0)}\n` +
      `---------------------------------------------\n` +
      `*GAJI BERSIH (THP): ${money(officialSlip.netAmount)}*`;
  };

  return (
    <div className="space-y-5">
      <div
        className={`rounded-2xl border-2 p-5 sm:p-6 shadow-xs space-y-5 ${
          isSlipPaid
            ? "border-emerald-300 bg-gradient-to-br from-emerald-50/50 via-white to-slate-50"
            : "border-blue-200 bg-gradient-to-br from-blue-50/50 via-white to-amber-50/30"
        }`}
      >
        {/* Header Kartu */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200/80 pb-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black shadow-xs ${
                  isSlipPaid ? "bg-emerald-600 text-white" : "bg-blue-600 text-white"
                }`}
              >
                {isSlipPaid ? "📜 DOKUMEN SLIP RESMI TERVERIFIKASI" : "⏱️ ESTIMASI GAJI BERJALAN"}
              </span>

              {isSlipPaid ? (
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black shadow-xs bg-emerald-100 text-emerald-800 border border-emerald-300">
                  🟢 SUDAH DIBAYAR (LUNAS)
                </span>
              ) : null}
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-gray-900 mt-1">
              {isSlipPaid && officialSlip ? `Slip Payout: ${officialSlip.payrollCode}` : "Akumulasi Upah & Kasbon Saya"}
            </h2>

            <p className="text-xs text-gray-600 flex flex-wrap items-center gap-2">
              <span><b>{worker.name}</b> ({worker.worker_code})</span>
              <span>•</span>
              <span>Sistem Upah: <b>{worker.pay_system}</b></span>
              {officialSlip?.periodStart && (
                <>
                  <span>•</span>
                  <span>📅 <b>Periode:</b> {formatDateId(officialSlip.periodStart)} s/d {formatDateId(officialSlip.periodEnd)}</span>
                </>
              )}
            </p>

            <p className="text-[11px] text-blue-700 flex items-center gap-1 font-medium">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
              <span>Nilai berjalan real-time periode baru. Lembur periode yang sudah dibayar otomatis di-reset.</span>
            </p>
          </div>

          {/* Action Buttons Header */}
          <div className="flex flex-wrap items-center gap-2">
            {officialSlip ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowSlipModal(true)}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  📄 Lihat / Cetak Slip
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const text = getOfficialWhatsAppText();
                    const phone = normalizePhone(worker.phone);
                    const appUrl = phone
                      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
                      : `https://wa.me/?text=${encodeURIComponent(text)}`;
                    window.open(appUrl, "_blank");
                  }}
                  className="rounded-xl border border-emerald-600 bg-white hover:bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 shadow-2xs transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  💬 Share WA
                </button>
              </>
            ) : null}

            <button
              type="button"
              onClick={() => setShowRulesInfo(!showRulesInfo)}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 shadow-2xs transition cursor-pointer"
            >
              {showRulesInfo ? "✕ Tutup SOP" : "ℹ️ SOP Periode"}
            </button>

            <button
              type="button"
              onClick={() => setShowDetail(!showDetail)}
              className="rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-2xs transition cursor-pointer"
            >
              {showDetail ? "▲ Tutup Rincian" : "▼ Rincian Komponen"}
            </button>
          </div>
        </div>

        {/* 4 Kartu Metrik Keuangan Utama */}
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Upah Bruto */}
          <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-semibold text-gray-500">
                {isSlipPaid ? "Gaji Bruto Resmi:" : "Perkiraan Upah Bruto Berjalan:"}
              </div>
              <div className="mt-1 text-2xl font-black text-gray-900">{money(displayedGross)}</div>
              <div className="mt-1 text-[11px] text-gray-600">
                {isBulanan
                  ? (effectiveOtHours > 0
                      ? `Pokok (${money(baseSalary)}) + Lembur`
                      : "Gaji Pokok Bulanan Tetap")
                  : `${workedDays} Hari Kerja + ${effectiveOtHours} Jam Lembur`}
              </div>
            </div>

            {/* Riwayat Komponen Gaji */}
            <div className="mt-3 pt-2.5 border-t border-gray-100 space-y-1.5 text-[11px]">
              <div className="font-bold text-gray-700 text-[10px] uppercase tracking-wider">
                Komponen Gaji Aktif:
              </div>
              <div className="space-y-1.5">
                <div className="rounded-lg bg-gray-50 border border-gray-200/70 p-2 flex justify-between items-center">
                  <span className="font-bold text-gray-800">
                    {isBulanan ? "Gaji Pokok Bulanan" : "Upah Kerja Pokok"}
                  </span>
                  <span className="font-black text-gray-800 text-xs">
                    {money(baseSalary)}
                  </span>
                </div>

                {/* Lembur HANYA tampil jika ada lembur baru di periode berjalan */}
                {effectiveOtWage > 0 ? (
                  <div className="rounded-lg bg-blue-50/60 border border-blue-200/70 p-2 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-blue-800">Upah Lembur</span>
                      <span className="text-blue-600 text-[10px] block">
                        {effectiveOtHours} Jam
                      </span>
                    </div>
                    <span className="font-black text-blue-700 text-xs">
                      +{money(effectiveOtWage)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Card 2: Tagihan Warung */}
          <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-4 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-semibold text-amber-900 flex items-center justify-between">
                <span>🍜 Tagihan Warung Luar:</span>
                <span className="font-bold bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded text-[10px]">
                  {warungDebts.length} nota
                </span>
              </div>
              <div className="mt-1 text-2xl font-black text-amber-800">{money(displayedKasbonWarung)}</div>
              <div className="mt-1 text-[11px] text-amber-900">
                {displayedKasbonWarung > 0 ? "Otomatis dipotong saat gajian" : "Lunas (0 tagihan)"}
              </div>
            </div>
          </div>

          {/* Card 3: Kasbon Perusahaan */}
          <div className="rounded-xl bg-rose-50/40 border border-rose-200 p-4 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-semibold text-rose-800 flex items-center justify-between">
                <span>🏢 Angsuran Kasbon Kantor:</span>
                {companyLoans.length > 0 && (
                  <span className="font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded text-[10px]">
                    {companyLoans.length} pinjaman
                  </span>
                )}
              </div>
              <div className="mt-1 text-2xl font-black text-rose-600">{money(displayedKasbonPerusahaan)}</div>
              <div className="mt-1 text-[11px] text-rose-800">
                {activeCompanyInstallment > 0
                  ? `Cicilan aktif bln ini: ${money(activeCompanyInstallment)}`
                  : "Lunas / Tidak ada cicilan"}
              </div>
            </div>
          </div>

          {/* Card 4: Gaji Bersih */}
          <div className="rounded-xl bg-emerald-600 border border-emerald-700 p-4 shadow-xs text-white flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-bold text-emerald-100 uppercase tracking-wider">
                {isSlipPaid ? "Gaji Bersih Resmi (THP):" : "Perkiraan Bersih (THP):"}
              </div>
              <div className="mt-1 text-2xl sm:text-3xl font-black text-white">{money(displayedNet)}</div>
              <div className="mt-1 text-[11px] text-emerald-100">
                Total potongan: <b>{money(displayedDeduction)}</b>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-emerald-500/60 text-[11px] text-emerald-100">
              {isSlipPaid ? "Sudah dibayarkan lunas" : "Sisa bersih estimasi bulan ini"}
            </div>
          </div>
        </div>

        {/* Modal Cetak Slip Resmi */}
        {showSlipModal && officialSlip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs">
            <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 sm:p-7 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
              <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                <h3 className="text-lg font-black text-slate-900">
                  Slip Gaji Karyawan ({officialSlip.type})
                </h3>
                <button
                  type="button"
                  onClick={() => setShowSlipModal(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4 text-slate-900 space-y-4">
                <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-start">
                  <div>
                    <h2 className="text-base font-black tracking-tight text-slate-900">
                      CV. SMPT - Kreasi Dinamika
                    </h2>
                    <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mt-0.5">
                      SLIP GAJI RESMI
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-mono font-bold text-slate-800">{officialSlip.payrollCode}</div>
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase mt-1 bg-emerald-100 text-emerald-800">
                      {officialSlip.paymentStatus}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-dashed">
                    <span className="text-slate-500">Nama Penerima</span>
                    <span className="font-black text-slate-900">{worker.name} ({worker.worker_code})</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-dashed">
                    <span className="text-slate-500">Gaji Pokok Bulanan</span>
                    <span className="font-bold text-slate-800">{money(officialSlip.baseAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-dashed">
                    <span className="text-slate-500">Upah Lembur</span>
                    <span className="font-bold text-slate-800">
                      {money((officialSlip.overtimeAmount || 0) + (officialSlip.manualOvertimeAmount || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-dashed text-rose-600">
                    <span>Potongan Kasbon Kantor</span>
                    <span className="font-bold">-{money(officialSlip.kasbonPerusahaanAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-dashed text-amber-600">
                    <span>Potongan Kasbon Warung</span>
                    <span className="font-bold">-{money(officialSlip.kasbonWarungAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between pt-2 text-sm font-black text-emerald-700 bg-emerald-50/60 p-2 rounded-xl">
                    <span>TOTAL GAJI BERSIH (THP)</span>
                    <span>{money(officialSlip.netAmount)}</span>
                  </div>
                </div>

                <div className="pt-4 border-t grid grid-cols-2 text-center text-[10px] text-slate-600">
                  <div>
                    <p>Disetujui,</p>
                    <div className="h-10"></div>
                    <p className="font-bold text-slate-900 underline">Bony Daty</p>
                  </div>
                  <div>
                    <p>Yang Mengajukan,</p>
                    <div className="h-10"></div>
                    <p className="font-bold text-slate-900 underline">Dandi Mardani</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition cursor-pointer"
                >
                  🖨️ Cetak Slip
                </button>
                <button
                  type="button"
                  onClick={() => setShowSlipModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
