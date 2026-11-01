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

export type OfficialMealSlipData = {
  payrollCode: string;
  periodStart: string;
  periodEnd: string;
  paymentStatus: "SUDAH DIBAYAR" | "BELUM DIBAYAR";
  mealAmount: number;
  fullDays: number;
  halfDays: number;
  notes?: string | null;
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
  currentPeriod,
  latestMealSlip,
}: {
  worker: {
    id: number;
    name: string;
    worker_code: string;
    pay_system: string;
    department?: string | null;
    phone?: string | null;
    monthly_salary?: number | string | null;
    daily_wage?: number | string | null;
  };
  warungDebts: WarungItem[];
  companyLoans: LoanItem[];
  workedDays: number;
  overtimeHours: number;
  estimatedGross: number;
  breakdown?: SalaryBreakdown;
  officialSlip?: OfficialSlipData | null;
  currentPeriod?: { start: string; end: string };
  latestMealSlip?: OfficialMealSlipData | null;
}) {
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [modalMode, setModalMode] = useState<"OFFICIAL" | "ESTIMATION">("OFFICIAL");
  const [showRulesInfo, setShowRulesInfo] = useState(false);
  const [showWarungDetail, setShowWarungDetail] = useState(false);
  const [showLoanDetail, setShowLoanDetail] = useState(false);

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

  // DATA SIKLUS BERJALAN (REAL-TIME ESTIMATION):
  // Dihitung murni dari data kerja & absensi siklus aktif saat ini
  const runningOtHours = overtimeHours;
  const runningOtWage = breakdown?.overtimeWage || 0;
  const runningBonus4h = breakdown?.bonus4h || 0;
  const runningSundayBonus = breakdown?.sundayMealOrBonus || 0;
  const runningBaseSalary = Number(breakdown?.baseAmount || 0);

  // Total upah bruto berjalan siklus aktif
  const liveGross = estimatedGross;

  // Kasbon Siklus Berjalan
  const totalWarung = warungDebts.reduce((acc, x) => acc + (n(x.amount) - n(x.paid_amount)), 0);
  const totalCompanyLoan = companyLoans.reduce((acc, x) => acc + (n(x.amount) - n(x.paid_amount)), 0);

  const activeCompanyInstallment = companyLoans.reduce((acc, x) => {
    const rem = n(x.amount) - n(x.paid_amount);
    const instCount = Number(x.installment_count) || 1;
    const instAmt = n(x.installment_amount) || (instCount > 1 ? Math.round(n(x.amount) / instCount) : rem);
    return acc + Math.min(rem, instAmt);
  }, 0);

  const activeLoanDeduction = isBulanan ? activeCompanyInstallment : totalCompanyLoan;
  const currentDeduction = totalWarung + activeLoanDeduction;
  const liveNet = Math.max(0, liveGross - currentDeduction);

  // Rentang Tanggal Periode Siklus Berjalan
  const periodStartDate = currentPeriod?.start || "";
  const periodEndDate = currentPeriod?.end || "";

  // WhatsApp Message Generators
  const getOfficialSlipWhatsAppText = (slip: OfficialSlipData) => {
    const totalOtMins = (slip.overtimeMinutes || 0) + ((slip.manualOvertimeHours || 0) * 60);
    const otHrs = Math.round((totalOtMins / 60) * 10) / 10;
    const totalOtAmt = (slip.overtimeAmount || 0) + (slip.manualOvertimeAmount || 0);

    return `*SLIP GAJI RESMI - CV. SMPT - Kreasi Dinamika*\n` +
      `No. Dokumen: ${slip.payrollCode}\n` +
      `Status: ${slip.paymentStatus}\n` +
      `Periode: ${formatDateId(slip.periodStart)} s/d ${formatDateId(slip.periodEnd)}\n\n` +
      `Nama Pekerja: ${worker.name} (${worker.worker_code})\n` +
      `Sistem Upah: ${slip.type}\n\n` +
      `• Gaji Pokok: ${money(slip.baseAmount || 0)}\n` +
      `${totalOtAmt > 0 ? `• Lembur (${otHrs} Jam): ${money(totalOtAmt)}\n` : ""}` +
      `${Number(slip.overtimeBonus || 0) > 0 ? `• Bonus Lembur (≥ 4 Jam): +${money(slip.overtimeBonus || 0)}\n` : ""}` +
      `${Number(slip.holidayBonus || 0) > 0 ? `• Tambahan Hari Minggu: +${money(slip.holidayBonus || 0)}\n` : ""}` +
      `• Pot. Kasbon Kantor: -${money(slip.kasbonPerusahaanAmount || 0)}\n` +
      `• Pot. Kasbon Warung: -${money(slip.kasbonWarungAmount || 0)}\n` +
      `---------------------------------------------\n` +
      `*GAJI BERSIH (THP): ${money(slip.netAmount)}*`;
  };

  const getEstimationWhatsAppText = () => {
    return `*ESTIMASI GAJI BERJALAN - CV. SMPT*\n` +
      `Periode: ${formatDateId(periodStartDate)} s/d ${formatDateId(periodEndDate)}\n\n` +
      `Nama Pekerja: ${worker.name} (${worker.worker_code})\n` +
      `Sistem Upah: ${worker.pay_system}\n\n` +
      `• ${isBulanan ? "Gaji Pokok Bulanan" : "Upah Kerja Pokok"}: ${money(runningBaseSalary)}\n` +
      `${runningOtWage > 0 ? `• Upah Lembur (${runningOtHours} Jam): +${money(runningOtWage)}\n` : ""}` +
      `${runningBonus4h > 0 ? `• Bonus Lembur (≥ 4 Jam): +${money(runningBonus4h)}\n` : ""}` +
      `${runningSundayBonus > 0 ? `• Tambahan Hari Minggu: +${money(runningSundayBonus)}\n` : ""}` +
      `• Pot. Kasbon Kantor: -${money(activeLoanDeduction)}\n` +
      `• Pot. Kasbon Warung: -${money(totalWarung)}\n` +
      `---------------------------------------------\n` +
      `*ESTIMASI GAJI BERSIH (THP): ${money(liveNet)}*`;
  };

  return (
    <div className="space-y-5">
      {/* 1. SEKSI DOKUMEN SLIP RESMI (Jika Tersedia) */}
      {officialSlip ? (
        <div
          className={`rounded-2xl border-2 p-5 sm:p-6 shadow-xs space-y-4 ${
            isSlipPaid
              ? "border-emerald-300 bg-gradient-to-br from-emerald-50/70 via-white to-emerald-50/30"
              : "border-amber-200 bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200/80 pb-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black shadow-xs ${
                    isSlipPaid ? "bg-emerald-700 text-white" : "bg-amber-600 text-white"
                  }`}
                >
                  📜 {isSlipPaid ? "DOKUMEN SLIP RESMI TERVERIFIKASI" : "DRAFT SLIP PAYROLL RESMI"}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black shadow-xs border ${
                    isSlipPaid
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : "bg-amber-100 text-amber-800 border-amber-300"
                  }`}
                >
                  {isSlipPaid ? "🟢 SUDAH DIBAYAR (LUNAS)" : "🟡 BELUM DIBAYAR"}
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                {isSlipPaid ? "Slip Payout Resmi:" : "Draft Slip Payroll:"}{" "}
                <span className="font-mono text-emerald-800">{officialSlip.payrollCode}</span>
              </h2>

              <p className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
                <span><b>{worker.name}</b> ({worker.worker_code})</span>
                <span>•</span>
                <span>Sistem Upah: <b>{officialSlip.type}</b></span>
                <span>•</span>
                <span>📅 <b>Periode Slip:</b> {formatDateId(officialSlip.periodStart)} s/d {formatDateId(officialSlip.periodEnd)}</span>
              </p>

              <p className={`text-[11px] font-medium flex items-center gap-1.5 ${isSlipPaid ? "text-emerald-800" : "text-amber-800"}`}>
                <span className={`inline-block w-2 h-2 rounded-full ${isSlipPaid ? "bg-emerald-500" : "bg-amber-500"}`}></span>
                <span>
                  {isSlipPaid
                    ? "Slip resmi periode ini telah dibayar lunas sesuai ketetapan manajemen. Dokumen sah tersimpan di sistem."
                    : "Draft slip payroll telah diterbitkan oleh manajemen dan sedang menunggu jadwal pencairan."}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setModalMode("OFFICIAL");
                  setShowSlipModal(true);
                }}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold text-white shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer ${
                  isSlipPaid ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                📄 {isSlipPaid ? "Lihat / Cetak Slip Lunas" : "Lihat Draft Slip"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const text = getOfficialSlipWhatsAppText(officialSlip);
                  const phone = normalizePhone(worker.phone);
                  const appUrl = phone
                    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
                    : `https://wa.me/?text=${encodeURIComponent(text)}`;
                  window.open(appUrl, "_blank");
                }}
                className={`rounded-xl border bg-white px-3.5 py-2 text-xs font-bold shadow-2xs transition inline-flex items-center gap-1.5 cursor-pointer ${
                  isSlipPaid
                    ? "border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                    : "border-amber-600 text-amber-700 hover:bg-amber-50"
                }`}
              >
                💬 {isSlipPaid ? "Share WA Slip Lunas" : "Share WA Draft"}
              </button>
            </div>
          </div>

          {/* Rincian Ringkas Dokumen Slip Resmi */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-white border border-gray-200/90 p-3.5 shadow-2xs">
              <div className="text-[11px] font-semibold text-slate-500">Gaji Pokok Slip:</div>
              <div className="mt-1 text-lg font-black text-slate-900">{money(officialSlip.baseAmount || 0)}</div>
              <div className="mt-0.5 text-[10.5px] text-slate-500">
                {officialSlip.type === "BORONGAN"
                  ? `${officialSlip.totalQtyApproved || 0} pcs disetujui`
                  : `${(officialSlip.fullDays || 0) + (officialSlip.halfDays || 0) * 0.5} hari kerja`}
              </div>
            </div>

            <div className="rounded-xl bg-white border border-gray-200/90 p-3.5 shadow-2xs">
              <div className="text-[11px] font-semibold text-slate-500">Total Bruto Resmi:</div>
              <div className="mt-1 text-lg font-black text-slate-900">{money(officialSlip.grossAmount)}</div>
              <div className="mt-0.5 text-[10.5px] text-slate-500">
                Lembur: {money((officialSlip.overtimeAmount || 0) + (officialSlip.manualOvertimeAmount || 0))}
              </div>
            </div>

            <div className="rounded-xl bg-white border border-gray-200/90 p-3.5 shadow-2xs">
              <div className="text-[11px] font-semibold text-rose-800">Total Potongan Resmi:</div>
              <div className="mt-1 text-lg font-black text-rose-600">-{money(officialSlip.deductionAmount)}</div>
              <div className="mt-0.5 text-[10.5px] text-rose-700">
                Kasbon: {money(officialSlip.kasbonPerusahaanAmount || 0)} · Warung: {money(officialSlip.kasbonWarungAmount || 0)}
              </div>
            </div>

            <div className={`rounded-xl border p-3.5 shadow-2xs text-white ${isSlipPaid ? "bg-emerald-600 border-emerald-700" : "bg-amber-600 border-amber-700"}`}>
              <div className="text-[11px] font-bold text-white/90 uppercase tracking-wider">
                {isSlipPaid ? "Gaji Bersih Diterima (THP):" : "Estimasi Bersih Draft:"}
              </div>
              <div className="mt-1 text-xl sm:text-2xl font-black text-white">{money(officialSlip.netAmount)}</div>
              <div className="mt-0.5 text-[10.5px] text-white/90 font-medium">
                Status: {officialSlip.paymentStatus}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 2. Seksi Uang Makan Staf Mingguan Terakhir (Khusus Karyawan Bulanan) */}
      {isBulanan && latestMealSlip && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 shadow-2xs space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-base">🍱</span>
              <span className="text-xs font-bold text-amber-950">
                Uang Makan Staf Terakhir: <b className="font-mono text-amber-900">{latestMealSlip.payrollCode}</b>
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black border ${
                latestMealSlip.paymentStatus === "SUDAH DIBAYAR"
                  ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                  : "bg-amber-100 text-amber-800 border-amber-300"
              }`}>
                {latestMealSlip.paymentStatus === "SUDAH DIBAYAR" ? "🟢 SUDAH DIBAYAR (LUNAS)" : "🟡 BELUM DIBAYAR"}
              </span>
            </div>
            <span className="text-xs font-mono font-black text-amber-950">
              {money(latestMealSlip.mealAmount)}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between text-[11px] text-amber-900 gap-2">
            <span>
              📅 Periode Mingguan: <b>{formatDateId(latestMealSlip.periodStart)}</b> s/d <b>{formatDateId(latestMealSlip.periodEnd)}</b> ({latestMealSlip.fullDays} hari kerja)
            </span>
            <span className="text-amber-800 text-[10.5px]">
              ℹ️ Uang makan staf dibayarkan terpisah per minggu, terpisah dari gaji pokok bulanan & lembur.
            </span>
          </div>
        </div>
      )}

      {/* 3. SEKSI ESTIMASI GAJI SIKLUS BERJALAN (4 KARTU METRIK UTAMA) */}
      <div className="rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50/50 via-white to-amber-50/30 p-5 sm:p-6 shadow-xs space-y-5">
        {/* Header Kartu Berjalan */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200/80 pb-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black shadow-xs bg-blue-600 text-white">
                ⏱️ ESTIMASI GAJI BERJALAN
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black shadow-xs bg-blue-100 text-blue-800 border border-blue-300">
                {isSlipPaid ? "SIKLUS BARU AKTIF" : "PERIODE AKTIF"}
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-gray-900 mt-1">
              Akumulasi Upah & Kasbon Saya
            </h2>

            <p className="text-xs text-gray-600 flex flex-wrap items-center gap-2">
              <span><b>{worker.name}</b> ({worker.worker_code})</span>
              <span>•</span>
              <span>Sistem Upah: <b>{worker.pay_system}</b></span>
              {periodStartDate && periodEndDate && (
                <>
                  <span>•</span>
                  <span>📅 <b>Periode Berjalan:</b> {formatDateId(periodStartDate)} s/d {formatDateId(periodEndDate)}</span>
                </>
              )}
            </p>

            <p className="text-[11px] text-blue-700 flex items-center gap-1 font-medium">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
              <span>
                Akumulasi berjalan real-time. Jam kerja & lembur aktif dihitung langsung untuk siklus berjalan saat ini tanpa menunggu jadwal payroll.
              </span>
            </p>
          </div>

          {/* Action Buttons Header */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setModalMode("ESTIMATION");
                setShowSlipModal(true);
              }}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              📄 Lihat Slip Estimasi
            </button>
            <button
              type="button"
              onClick={() => {
                const text = getEstimationWhatsAppText();
                const phone = normalizePhone(worker.phone);
                const appUrl = phone
                  ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
                  : `https://wa.me/?text=${encodeURIComponent(text)}`;
                window.open(appUrl, "_blank");
              }}
              className="rounded-xl border border-blue-600 bg-white hover:bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-700 shadow-2xs transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              💬 Share WA Estimasi
            </button>

            <button
              type="button"
              onClick={() => setShowRulesInfo(!showRulesInfo)}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 shadow-2xs transition cursor-pointer"
            >
              {showRulesInfo ? "✕ Tutup SOP" : "ℹ️ SOP Periode"}
            </button>
          </div>
        </div>

        {/* SOP Info Box */}
        {showRulesInfo && (
          <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/90 to-purple-50/60 p-4 text-xs space-y-3">
            <h4 className="font-extrabold text-indigo-950 text-sm">
              📌 SOP Penggajian Lapangan & Absensi
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 text-indigo-950">
              <div className="rounded-lg bg-white/80 border border-indigo-200/70 p-3 space-y-1">
                <span className="font-bold text-indigo-900 block">💼 Karyawan Bulanan:</span>
                <p className="text-[11px] leading-relaxed text-indigo-800">
                  Gaji pokok bulanan utuh. Lembur dihitung terpisah (Pokok ÷ 190 / jam). Uang makan dibayar mingguan dan bebas potongan hutang.
                </p>
              </div>
              <div className="rounded-lg bg-white/80 border border-indigo-200/70 p-3 space-y-1">
                <span className="font-bold text-indigo-900 block">👥 Karyawan Harian:</span>
                <p className="text-[11px] leading-relaxed text-indigo-800">
                  Upah dibayar mingguan per hari masuk aktual. Potongan kasbon kantor & warung otomatis disinkronkan saat pembayaran payroll.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 4 Kartu Metrik Keuangan Siklus Berjalan */}
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
          {/* Card 1: Upah Bruto Siklus Berjalan */}
          <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-semibold text-gray-500">
                Perkiraan Upah Bruto Berjalan:
              </div>
              <div className="mt-1 text-2xl font-black text-gray-900">{money(liveGross)}</div>
              <div className="mt-1 text-[11px] text-gray-600">
                {isBulanan
                  ? (runningOtHours > 0
                      ? `${workedDays} Hari Kerja · Lembur (${runningOtHours} Jam)`
                      : (workedDays > 0 ? `${workedDays} Hari Kerja Masuk` : "Belum ada absensi siklus baru"))
                  : (isBorongan
                      ? `${breakdown?.boronganItems?.length || 0} SPK dikerjakan`
                      : `${workedDays} Hari Kerja + ${runningOtHours} Jam Lembur`)}
              </div>
            </div>

            {/* Riwayat Komponen Gaji Berjalan */}
            <div className="mt-3 pt-2.5 border-t border-gray-100 space-y-1.5 text-[11px]">
              <div className="font-bold text-gray-700 text-[10px] uppercase tracking-wider">
                Komponen Gaji Aktif:
              </div>
              
              {liveGross === 0 ? (
                <div className="rounded-lg bg-gray-50 border border-dashed border-gray-300 p-2.5 text-center text-[10.5px] text-gray-500">
                  Siklus baru dimulai. Belum ada akumulasi jam kerja / lembur aktif (Rp 0).
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="rounded-lg bg-gray-50 border border-gray-200/70 p-2 flex justify-between items-center">
                    <span className="font-bold text-gray-800">
                      {isBulanan ? "Gaji Pokok Bulanan" : "Upah Kerja Pokok"}
                    </span>
                    <span className="font-black text-gray-800 text-xs">
                      {money(runningBaseSalary)}
                    </span>
                  </div>

                  {/* Komponen Upah Lembur Berjalan */}
                  {runningOtWage > 0 ? (
                    <div className="rounded-lg bg-blue-50/60 border border-blue-200/70 p-2 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-blue-800">Upah Lembur</span>
                        <span className="text-blue-600 text-[10px] block">
                          {runningOtHours} Jam
                        </span>
                      </div>
                      <span className="font-black text-blue-700 text-xs">
                        +{money(runningOtWage)}
                      </span>
                    </div>
                  ) : null}

                  {/* Komponen Bonus Lembur Berjalan */}
                  {runningBonus4h > 0 ? (
                    <div className="rounded-lg bg-purple-50/60 border border-purple-200/70 p-2 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-purple-800">Bonus Lembur</span>
                        <span className="text-purple-600 text-[10px] block">
                          (Lembur ≥ 4 Jam)
                        </span>
                      </div>
                      <span className="font-black text-purple-700 text-xs">
                        +{money(runningBonus4h)}
                      </span>
                    </div>
                  ) : null}

                  {/* Komponen Tambahan Hadir Minggu */}
                  {runningSundayBonus > 0 ? (
                    <div className="rounded-lg bg-amber-50/60 border border-amber-200/70 p-2 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-amber-900">Tambahan Hadir Minggu</span>
                        <span className="text-amber-700 text-[10px] block">
                          Shift Hari Minggu
                        </span>
                      </div>
                      <span className="font-black text-amber-800 text-xs">
                        +{money(runningSundayBonus)}
                      </span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Tagihan Warung Luar Siklus Berjalan */}
          <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-4 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-semibold text-amber-900 flex items-center justify-between">
                <span>🍜 Tagihan Warung Luar:</span>
                {warungDebts.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowWarungDetail((prev) => !prev)}
                    className="font-bold bg-amber-200/80 hover:bg-amber-300 text-amber-900 px-2 py-0.5 rounded text-[10px] inline-flex items-center gap-1 cursor-pointer transition"
                    title="Klik untuk melihat rincian nota"
                  >
                    <span>{warungDebts.length} nota</span>
                    <span>{showWarungDetail ? "▲" : "▼"}</span>
                  </button>
                ) : (
                  <span className="font-bold bg-amber-200/50 text-amber-900 px-2 py-0.5 rounded text-[10px]">
                    0 nota
                  </span>
                )}
              </div>
              <div className="mt-1 text-2xl font-black text-amber-800">{money(totalWarung)}</div>
              <div className="mt-1 text-[11px] text-amber-900">
                {totalWarung > 0 ? "Otomatis dipotong saat gajian" : "Lunas (0 tagihan)"}
              </div>
            </div>

            {/* Rincian Nota Warung */}
            {showWarungDetail && warungDebts.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-amber-200/80 space-y-2 text-[11px]">
                <div className="font-bold text-amber-950 text-[10px] uppercase tracking-wider flex justify-between items-center">
                  <span>Rincian Nota Warung:</span>
                  <span className="text-[9px] font-normal text-amber-800">{warungDebts.length} transaksi</span>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
                  {warungDebts.map((item) => {
                    const rem = n(item.amount) - n(item.paid_amount);
                    return (
                      <div
                        key={item.id}
                        className="rounded-lg bg-white/95 border border-amber-200/90 p-2 text-stone-800 shadow-2xs space-y-1"
                      >
                        <div className="flex justify-between items-start gap-1">
                          <span className="font-bold text-amber-950 truncate">
                            {item.warung_name || "Warung Luar"}
                          </span>
                          <span className="font-black text-amber-900 whitespace-nowrap">
                            {money(rem)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-stone-500">
                          <span>📅 {formatDateId(item.advance_date)}</span>
                          <span className="font-mono text-[9px] text-stone-400">{item.advance_code}</span>
                        </div>
                        {item.notes ? (
                          <div className="text-[10px] text-stone-600 bg-amber-50/70 rounded px-1.5 py-0.5">
                            Ket: {item.notes}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Card 3: Kasbon Perusahaan Siklus Berjalan */}
          <div className="rounded-xl bg-rose-50/40 border border-rose-200 p-4 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-semibold text-rose-800 flex items-center justify-between">
                <span>🏢 Angsuran Kasbon Kantor:</span>
                {companyLoans.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowLoanDetail((prev) => !prev)}
                    className="font-bold bg-rose-100 hover:bg-rose-200 text-rose-800 px-2 py-0.5 rounded text-[10px] inline-flex items-center gap-1 cursor-pointer transition"
                    title="Klik untuk melihat rincian pinjaman"
                  >
                    <span>{companyLoans.length} pinjaman</span>
                    <span>{showLoanDetail ? "▲" : "▼"}</span>
                  </button>
                ) : (
                  <span className="font-bold bg-rose-100/60 text-rose-800 px-2 py-0.5 rounded text-[10px]">
                    0 pinjaman
                  </span>
                )}
              </div>
              <div className="mt-1 text-2xl font-black text-rose-600">{money(activeLoanDeduction)}</div>
              <div className="mt-1 text-[11px] text-rose-800">
                {activeLoanDeduction > 0
                  ? `Cicilan aktif: ${money(activeLoanDeduction)}`
                  : "Lunas / Tidak ada cicilan"}
              </div>
            </div>

            {/* Rincian Kasbon & Angsuran Kantor */}
            {showLoanDetail && companyLoans.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-rose-200/80 space-y-2 text-[11px]">
                <div className="font-bold text-rose-950 text-[10px] uppercase tracking-wider flex justify-between items-center">
                  <span>Rincian Pinjaman:</span>
                  <span className="text-[9px] font-normal text-rose-800">{companyLoans.length} record</span>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-2 pr-0.5">
                  {companyLoans.map((item) => {
                    const totalAmt = n(item.amount);
                    const paidAmt = n(item.paid_amount);
                    const rem = totalAmt - paidAmt;
                    const instCount = Number(item.installment_count) || 1;
                    const instPaid = Number(item.installments_paid) || 0;
                    const instAmt = n(item.installment_amount) || (instCount > 1 ? Math.round(totalAmt / instCount) : rem);
                    const activeThisMonth = Math.min(rem, instAmt);

                    return (
                      <div
                        key={item.id}
                        className="rounded-lg bg-white/95 border border-rose-200 p-2.5 text-stone-800 shadow-2xs space-y-1.5"
                      >
                        <div className="flex justify-between items-center text-[10px] text-stone-500 border-b border-rose-100 pb-1">
                          <span className="font-mono font-bold text-rose-800">{item.advance_code}</span>
                          <span>Tgl: {formatDateId(item.advance_date)}</span>
                        </div>

                        <div className="space-y-1 text-[10.5px]">
                          <div className="flex justify-between">
                            <span className="text-stone-500">Pinjaman Pokok:</span>
                            <span className="font-semibold text-stone-800">{money(totalAmt)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-stone-500">Skema Angsuran:</span>
                            <span className="font-semibold text-rose-700">
                              {instCount > 1
                                ? `Bulan ke-${Math.min(instPaid + 1, instCount)} dari ${instCount} bln`
                                : "1x Pelunasan Penuh"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-stone-500">Cicilan Bln Ini:</span>
                            <span className="font-black text-rose-600">{money(activeThisMonth)}</span>
                          </div>
                          <div className="flex justify-between pt-0.5 border-t border-dashed border-rose-100">
                            <span className="text-stone-500">Sisa Saldo Pokok:</span>
                            <span className="font-bold text-stone-900">{money(rem)}</span>
                          </div>
                        </div>

                        {item.notes ? (
                          <div className="text-[10px] text-stone-600 bg-rose-50/70 rounded px-1.5 py-0.5">
                            Ket: {item.notes}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Card 4: Gaji Bersih Siklus Berjalan */}
          <div className="rounded-xl bg-emerald-600 border border-emerald-700 p-4 shadow-xs text-white flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-bold text-emerald-100 uppercase tracking-wider">
                Perkiraan Bersih (THP):
              </div>
              <div className="mt-1 text-2xl sm:text-3xl font-black text-white">{money(liveNet)}</div>
              <div className="mt-1 text-[11px] text-emerald-100">
                Total potongan: <b>{money(currentDeduction)}</b>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-emerald-500/60 text-[11px] text-emerald-100">
              Sisa bersih estimasi siklus berjalan
            </div>
          </div>
        </div>

        {/* Modal Cetak Slip Resmi / Estimasi */}
        {showSlipModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs">
            <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 sm:p-7 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
              <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                <h3 className="text-lg font-black text-slate-900">
                  {modalMode === "OFFICIAL" && officialSlip
                    ? `Slip Gaji Karyawan (${officialSlip.type})`
                    : `Pratinjau Estimasi Gaji (${worker.pay_system})`}
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
                      {modalMode === "OFFICIAL" && officialSlip ? "SLIP GAJI RESMI" : "ESTIMASI GAJI BERJALAN"}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-mono font-bold text-slate-800">
                      {modalMode === "OFFICIAL" && officialSlip ? officialSlip.payrollCode : "DRAFT-REALTIME"}
                    </div>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase mt-1 ${
                      modalMode === "OFFICIAL" && isSlipPaid
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : modalMode === "OFFICIAL"
                        ? "bg-amber-100 text-amber-800 border border-amber-300"
                        : "bg-blue-100 text-blue-800 border border-blue-300"
                    }`}>
                      {modalMode === "OFFICIAL" && officialSlip ? officialSlip.paymentStatus : "BERJALAN"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-dashed">
                    <span className="text-slate-500">Periode</span>
                    <span className="font-bold text-slate-800">
                      {modalMode === "OFFICIAL" && officialSlip
                        ? `${formatDateId(officialSlip.periodStart)} s/d ${formatDateId(officialSlip.periodEnd)}`
                        : `${formatDateId(periodStartDate)} s/d ${formatDateId(periodEndDate)}`}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-dashed">
                    <span className="text-slate-500">Nama Penerima</span>
                    <span className="font-black text-slate-900">{worker.name} ({worker.worker_code})</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-dashed">
                    <span className="text-slate-500">{isBulanan ? "Gaji Pokok Bulanan" : "Upah Kerja Pokok"}</span>
                    <span className="font-bold text-slate-800">
                      {money(modalMode === "OFFICIAL" && officialSlip ? (officialSlip.baseAmount || 0) : runningBaseSalary)}
                    </span>
                  </div>
                  
                  {/* Lembur */}
                  {(() => {
                    const otWage = modalMode === "OFFICIAL" && officialSlip
                      ? ((officialSlip.overtimeAmount || 0) + (officialSlip.manualOvertimeAmount || 0))
                      : runningOtWage;
                    const otHours = modalMode === "OFFICIAL" && officialSlip
                      ? Math.round((((officialSlip.overtimeMinutes || 0) / 60) + (officialSlip.manualOvertimeHours || 0)) * 10) / 10
                      : runningOtHours;
                    if (otWage <= 0 && otHours <= 0) return null;
                    return (
                      <div className="flex justify-between py-1 border-b border-dashed">
                        <span className="text-slate-500">
                          Upah Lembur {otHours > 0 ? `(${otHours} Jam)` : ""}
                        </span>
                        <span className="font-bold text-slate-800">{money(otWage)}</span>
                      </div>
                    );
                  })()}

                  {/* Bonus Lembur 4H */}
                  {(() => {
                    const b4h = modalMode === "OFFICIAL" && officialSlip
                      ? Number(officialSlip.overtimeBonus || 0)
                      : runningBonus4h;
                    if (b4h <= 0) return null;
                    return (
                      <div className="flex justify-between py-1 border-b border-dashed">
                        <span className="text-slate-500">Bonus Lembur (≥ 4 Jam)</span>
                        <span className="font-bold text-slate-800">{money(b4h)}</span>
                      </div>
                    );
                  })()}

                  {/* Holiday / Sunday Bonus */}
                  {(() => {
                    const sunAmt = modalMode === "OFFICIAL" && officialSlip
                      ? Number(officialSlip.holidayBonus || 0)
                      : runningSundayBonus;
                    if (sunAmt <= 0) return null;
                    return (
                      <div className="flex justify-between py-1 border-b border-dashed">
                        <span className="text-slate-500">Tambahan Hadir Hari Minggu</span>
                        <span className="font-bold text-slate-800">{money(sunAmt)}</span>
                      </div>
                    );
                  })()}

                  {/* Kasbon Kantor */}
                  <div className="flex justify-between py-1 border-b border-dashed text-rose-600">
                    <span>Potongan Kasbon Kantor</span>
                    <span className="font-bold">
                      -{money(modalMode === "OFFICIAL" && officialSlip ? (officialSlip.kasbonPerusahaanAmount || 0) : activeLoanDeduction)}
                    </span>
                  </div>

                  {/* Kasbon Warung */}
                  <div className="flex justify-between py-1 border-b border-dashed text-amber-600">
                    <span>Potongan Kasbon Warung</span>
                    <span className="font-bold">
                      -{money(modalMode === "OFFICIAL" && officialSlip ? (officialSlip.kasbonWarungAmount || 0) : totalWarung)}
                    </span>
                  </div>

                  {/* Net */}
                  <div className="flex justify-between pt-2 text-sm font-black text-emerald-700 bg-emerald-50/60 p-2 rounded-xl">
                    <span>TOTAL GAJI BERSIH (THP)</span>
                    <span>
                      {money(modalMode === "OFFICIAL" && officialSlip ? officialSlip.netAmount : liveNet)}
                    </span>
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
                    <p className="font-bold text-slate-900 underline">{worker.name}</p>
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
