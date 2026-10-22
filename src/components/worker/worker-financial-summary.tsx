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

  // LEMBUR REAL-TIME BERJALAN:
  // - Mode Estimasi Berjalan (!isSlipPaid): Selalu hitung jam lembur aktual secara real-time dari absensi tanpa di-reset!
  // - Mode Slip Resmi Lunas (isSlipPaid): Gunakan nilai lembur yang tercantum pada dokumen slip resmi.
  const effectiveOtHours = isSlipPaid && officialSlip
    ? (Number(officialSlip.overtimeMinutes || 0) / 60) + Number(officialSlip.manualOvertimeHours || 0)
    : overtimeHours;

  const effectiveOtWage = isSlipPaid && officialSlip
    ? (Number(officialSlip.overtimeAmount || 0) + Number(officialSlip.manualOvertimeAmount || 0))
    : (breakdown?.overtimeWage || 0);

  const effectiveBonus4h = isSlipPaid && officialSlip
    ? Number(officialSlip.overtimeBonus || 0)
    : (breakdown?.bonus4h || 0);

  // Upah pokok standar
  const baseSalary = Number(
    breakdown?.baseAmount || (isBulanan ? Number(worker.monthly_salary || 3000000) : 0)
  );
  
  // Total bruto berjalan yang sudah diakumulasi real-time
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

  // Tanggal Periode: gunakan slip resmi jika ada, atau gunakan periode kalender berjalan (tanggal 1 s/d akhir bulan untuk bulanan)
  const periodStartDate = officialSlip?.periodStart || currentPeriod?.start;
  const periodEndDate = officialSlip?.periodEnd || currentPeriod?.end;

  const getWhatsAppText = () => {
    if (officialSlip) {
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
        `${totalOtAmt > 0 ? `• Lembur (${otHrs} Jam): ${money(totalOtAmt)}\n` : ""}` +
        `• Pot. Kasbon Kantor: -${money(officialSlip.kasbonPerusahaanAmount || 0)}\n` +
        `• Pot. Kasbon Warung: -${money(officialSlip.kasbonWarungAmount || 0)}\n` +
        `---------------------------------------------\n` +
        `*GAJI BERSIH (THP): ${money(officialSlip.netAmount)}*`;
    }

    return `*ESTIMASI GAJI BERJALAN - CV. SMPT*\n` +
      `Periode: ${formatDateId(periodStartDate)} s/d ${formatDateId(periodEndDate)}\n\n` +
      `Nama Pekerja: ${worker.name} (${worker.worker_code})\n` +
      `Sistem Upah: ${worker.pay_system}\n\n` +
      `• ${isBulanan ? "Gaji Pokok Bulanan" : "Upah Kerja Pokok"}: ${money(baseSalary)}\n` +
      `${effectiveOtWage > 0 ? `• Upah Lembur (${effectiveOtHours} Jam): +${money(effectiveOtWage)}\n` : ""}` +
      `${effectiveBonus4h > 0 ? `• Bonus Lembur (>= 4 Jam): +${money(effectiveBonus4h)}\n` : ""}` +
      `• Pot. Kasbon Kantor: -${money(displayedKasbonPerusahaan)}\n` +
      `• Pot. Kasbon Warung: -${money(displayedKasbonWarung)}\n` +
      `---------------------------------------------\n` +
      `*ESTIMASI GAJI BERSIH (THP): ${money(displayedNet)}*`;
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
              {periodStartDate && periodEndDate && (
                <>
                  <span>•</span>
                  <span>📅 <b>Periode:</b> {formatDateId(periodStartDate)} s/d {formatDateId(periodEndDate)}</span>
                </>
              )}
            </p>

            <p className="text-[11px] text-blue-700 flex items-center gap-1 font-medium">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
              <span>
                {isSlipPaid
                  ? "Slip resmi telah dibayar lunas sesuai ketetapan manajemen."
                  : "Akumulasi berjalan real-time. Jam lembur terdata langsung masuk ke perkiraan upah tanpa menunggu jadwal payroll."}
              </span>
            </p>
          </div>

          {/* Action Buttons Header */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSlipModal(true)}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              📄 {officialSlip ? "Lihat / Cetak Slip" : "Lihat Slip Estimasi"}
            </button>
            <button
              type="button"
              onClick={() => {
                const text = getWhatsAppText();
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

        {/* Seksi Uang Makan Staf Mingguan Terakhir (Khusus Karyawan Bulanan) */}
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

        {/* 4 Kartu Metrik Keuangan Utama */}
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
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
                      ? `Pokok (${money(baseSalary)}) + Lembur (${effectiveOtHours} Jam)`
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

                {/* Komponen Upah Lembur Berjalan */}
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

                {/* Komponen Bonus Lembur Berjalan */}
                {effectiveBonus4h > 0 ? (
                  <div className="rounded-lg bg-purple-50/60 border border-purple-200/70 p-2 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-purple-800">Bonus Lembur</span>
                      <span className="text-purple-600 text-[10px] block">
                        (Lembur ≥ 4 Jam)
                      </span>
                    </div>
                    <span className="font-black text-purple-700 text-xs">
                      +{money(effectiveBonus4h)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Card 2: Tagihan Warung Luar (Dengan Detail Buka/Tutup) */}
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
              <div className="mt-1 text-2xl font-black text-amber-800">{money(displayedKasbonWarung)}</div>
              <div className="mt-1 text-[11px] text-amber-900">
                {displayedKasbonWarung > 0 ? "Otomatis dipotong saat gajian" : "Lunas (0 tagihan)"}
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

          {/* Card 3: Kasbon Perusahaan (Dengan Detail Buka/Tutup) */}
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
              <div className="mt-1 text-2xl font-black text-rose-600">{money(displayedKasbonPerusahaan)}</div>
              <div className="mt-1 text-[11px] text-rose-800">
                {activeCompanyInstallment > 0
                  ? `Cicilan aktif bln ini: ${money(activeCompanyInstallment)}`
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

        {/* Modal Cetak Slip Resmi / Estimasi */}
        {showSlipModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs">
            <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 sm:p-7 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
              <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                <h3 className="text-lg font-black text-slate-900">
                  {officialSlip ? `Slip Gaji Karyawan (${officialSlip.type})` : `Pratinjau Estimasi Gaji (${worker.pay_system})`}
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
                      {officialSlip ? "SLIP GAJI RESMI" : "ESTIMASI GAJI BERJALAN"}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-mono font-bold text-slate-800">
                      {officialSlip ? officialSlip.payrollCode : "DRAFT-REALTIME"}
                    </div>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase mt-1 ${
                      isSlipPaid ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                    }`}>
                      {officialSlip ? officialSlip.paymentStatus : "BERJALAN"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-dashed">
                    <span className="text-slate-500">Periode</span>
                    <span className="font-bold text-slate-800">
                      {formatDateId(periodStartDate)} s/d {formatDateId(periodEndDate)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-dashed">
                    <span className="text-slate-500">Nama Penerima</span>
                    <span className="font-black text-slate-900">{worker.name} ({worker.worker_code})</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-dashed">
                    <span className="text-slate-500">{isBulanan ? "Gaji Pokok Bulanan" : "Upah Kerja Pokok"}</span>
                    <span className="font-bold text-slate-800">{money(baseSalary)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-dashed">
                    <span className="text-slate-500">
                      Upah Lembur {effectiveOtHours > 0 ? `(${effectiveOtHours} Jam)` : ""}
                    </span>
                    <span className="font-bold text-slate-800">
                      {money(effectiveOtWage)}
                    </span>
                  </div>
                  {effectiveBonus4h > 0 && (
                    <div className="flex justify-between py-1 border-b border-dashed">
                      <span className="text-slate-500">Bonus Lembur (≥ 4 Jam)</span>
                      <span className="font-bold text-slate-800">{money(effectiveBonus4h)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1 border-b border-dashed text-rose-600">
                    <span>Potongan Kasbon Kantor</span>
                    <span className="font-bold">-{money(displayedKasbonPerusahaan)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-dashed text-amber-600">
                    <span>Potongan Kasbon Warung</span>
                    <span className="font-bold">-{money(displayedKasbonWarung)}</span>
                  </div>
                  <div className="flex justify-between pt-2 text-sm font-black text-emerald-700 bg-emerald-50/60 p-2 rounded-xl">
                    <span>TOTAL GAJI BERSIH (THP)</span>
                    <span>{money(displayedNet)}</span>
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
