"use client";

import { useState } from "react";
import { Badge, Empty } from "@/components/final/final-ui";
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
  const isHarian = !isBorongan && !isBulanan;

  // Cek apakah slip sudah lunas atau batch terakhir sudah terbayar
  const isSlipPaid = Boolean(
    officialSlip &&
    (
      officialSlip.paymentStatus === "SUDAH DIBAYAR" ||
      (officialSlip as any).status === "PAID" ||
      (officialSlip as any).status === "SUDAH_DIBAYAR"
    )
  );

  // Perhitungan saldo kasbon aktif
  const totalWarung = warungDebts.reduce((acc, x) => acc + (n(x.amount) - n(x.paid_amount)), 0);
  const totalCompanyLoan = companyLoans.reduce((acc, x) => acc + (n(x.amount) - n(x.paid_amount)), 0);

  // Angsuran aktif pinjaman kantor
  const activeCompanyInstallment = companyLoans.reduce((acc, x) => {
    const rem = n(x.amount) - n(x.paid_amount);
    const instCount = Number(x.installment_count) || 1;
    const instAmt = n(x.installment_amount) || (instCount > 1 ? Math.round(n(x.amount) / instCount) : rem);
    return acc + Math.min(rem, instAmt);
  }, 0);

  // Jika slip resmi sudah lunas, lembur bulan lalu sudah selesai dibayar -> lembur berjalan reset ke 0
  const liveOvertimeHours = isSlipPaid ? 0 : overtimeHours;
  const liveOvertimeWage = isSlipPaid ? 0 : (breakdown?.overtimeWage || 0);
  const liveBonus4h = isSlipPaid ? 0 : (breakdown?.bonus4h || 0);

  // Gross berjalan bersih
  const baseSalary = isBulanan ? Number(breakdown?.baseAmount || 3000000) : (breakdown?.baseAmount || 0);
  const liveEstimatedGross = isSlipPaid ? baseSalary : (baseSalary + liveOvertimeWage + liveBonus4h);

  const totalDeductionPending = totalWarung + (isBulanan ? activeCompanyInstallment : totalCompanyLoan);
  const estimatedNet = Math.max(0, liveEstimatedGross - totalDeductionPending);

  // Nilai yang ditampilkan
  const displayedGross = isSlipPaid && officialSlip ? officialSlip.grossAmount : liveEstimatedGross;
  const displayedDeduction = isSlipPaid && officialSlip ? officialSlip.deductionAmount : totalDeductionPending;
  const displayedNet = isSlipPaid && officialSlip ? officialSlip.netAmount : estimatedNet;
  const displayedKasbonPerusahaan = isSlipPaid && officialSlip && officialSlip.kasbonPerusahaanAmount !== undefined
    ? officialSlip.kasbonPerusahaanAmount
    : (isBulanan ? activeCompanyInstallment : totalCompanyLoan);
  const displayedKasbonWarung = isSlipPaid && officialSlip && officialSlip.kasbonWarungAmount !== undefined
    ? officialSlip.kasbonWarungAmount
    : totalWarung;

  // Generator WhatsApp untuk slip resmi
  const getOfficialWhatsAppText = () => {
    if (!officialSlip) return "";
    const isSlipBorongan = officialSlip.type === "BORONGAN";
    const statusText = officialSlip.paymentStatus === "SUDAH DIBAYAR" ? "✅ SUDAH DIBAYAR" : "⏳ BELUM DIBAYAR";

    if (isSlipBorongan) {
      const itemsList = (officialSlip.boronganItems || [])
        .map((it) => `• ${it.workItemName}: ${qty(it.qtyApproved)} pcs @ ${money(it.operatorPrice)} = ${money(it.operatorValue)}`)
        .join("\n");

      return `*SLIP GAJI OPERATOR BORONGAN - CV. SMPT*\nNo. Dokumen: ${officialSlip.payrollCode}\nStatus: ${statusText}\nPeriode: ${formatDateId(officialSlip.periodStart)} s/d ${formatDateId(officialSlip.periodEnd)}\n\nNama Operator: ${worker.name} (${worker.worker_code})\nSistem Upah: BORONGAN\n\n*RINCIAN HASIL KERJA BORONGAN:*\n${itemsList || "• Hasil kerja borongan periode ini"}\n\n*Total Nilai Borongan Bruto:* ${money(officialSlip.grossAmount)}\n*Total Potongan Kasbon:* ${money(officialSlip.deductionAmount)}\n---------------------------------------------\n*UPAH BERSIH DITERIMA: ${money(officialSlip.netAmount)}*\n\nCatatan: Dokumen sah diterbitkan otomatis oleh sistem SMPT V2.`;
    }

    const totalOtMins = (officialSlip.overtimeMinutes || 0) + ((officialSlip.manualOvertimeHours || 0) * 60);
    const otHrs = Math.round((totalOtMins / 60) * 10) / 10;
    const totalOtAmt = (officialSlip.overtimeAmount || 0) + (officialSlip.manualOvertimeAmount || 0);

    return `*SLIP GAJI RESMI - CV. SMPT - Kreasi Dinamika*\nNo. Dokumen: ${officialSlip.payrollCode}\nStatus: ${statusText}\nPeriode: ${formatDateId(officialSlip.periodStart)} s/d ${formatDateId(officialSlip.periodEnd)}\n\nNama Pekerja: ${worker.name} (${worker.worker_code})\nBagian: ${worker.department || "Operasional"}\nSistem Upah: ${officialSlip.type}\n\n*RINCIAN PENGHASILAN (BRUTO):*\n• Gaji / Upah Pokok: ${money(officialSlip.baseAmount || 0)}\n${totalOtAmt > 0 ? `• Upah Lembur (${otHrs} Jam):${money(totalOtAmt)}\n` : ""}${(officialSlip.overtimeBonus || 0) > 0 ? `• Bonus Lembur ≥4 Jam: ${money(officialSlip.overtimeBonus || 0)}\n` : ""}${(officialSlip.mealAmount || 0) > 0 ? `• Uang Makan: ${money(officialSlip.mealAmount || 0)}\n` : ""}*Total Penghasilan Bruto:* ${money(officialSlip.grossAmount)}\n\n*RINCIAN POTONGAN:*\n• Angsuran Kasbon Kantor: ${money(officialSlip.kasbonPerusahaanAmount || 0)}\n• Tagihan Warung Makan: ${money(officialSlip.kasbonWarungAmount || 0)}\n*Total Potongan:* ${money(officialSlip.deductionAmount)}\n---------------------------------------------\n*GAJI BERSIH (TAKE HOME PAY): ${money(officialSlip.netAmount)}*\n\nCatatan: Dokumen resmi penggajian CV. SMPT.`;
  };

  return (
    <div className="space-y-5">
      {/* KARTU STATUS KEUANGAN */}
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
              {isSlipPaid && officialSlip ? `Slip Payout: ${officialSlip.payrollCode}` : "Akumulasi Upah & Kasbon Saya Hari Ini"}
            </h2>

            <p className="text-xs text-gray-600 flex flex-wrap items-center gap-2">
              <span><b>{worker.name}</b> ({worker.worker_code})</span>
              <span>•</span>
              <span>Sistem Upah: <b>{isSlipPaid && officialSlip?.type ? officialSlip.type : worker.pay_system}</b></span>
              {isSlipPaid && officialSlip?.periodStart && (
                <>
                  <span>•</span>
                  <span>📅 <b>Periode Gaji:</b> {formatDateId(officialSlip.periodStart)} s/d {formatDateId(officialSlip.periodEnd)}</span>
                </>
              )}
            </p>

            {isSlipPaid ? (
              <p className="text-[11px] text-emerald-700 flex items-center gap-1 font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Data telah diverifikasi & dibayarkan. Ini adalah arsip resmi slip gaji Anda.</span>
              </p>
            ) : (
              <p className="text-[11px] text-blue-700 flex items-center gap-1 font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                <span>Nilai berjalan real-time (mengikuti absensi, lembur, dan kasbon aktif bulan berjalan).</span>
              </p>
            )}
          </div>

          {/* Action Buttons Header */}
          <div className="flex flex-wrap items-center gap-2">
            {isSlipPaid && officialSlip ? (
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
                  💬 Kirim WA
                </button>
              </>
            ) : null}

            <button
              type="button"
              onClick={() => setShowRulesInfo(!showRulesInfo)}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 shadow-2xs transition cursor-pointer"
            >
              {showRulesInfo ? "✕ Tutup SOP" : "ℹ️ SOP Periode & Lupa Absen"}
            </button>

            <button
              type="button"
              onClick={() => setShowDetail(!showDetail)}
              className="rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-2xs transition cursor-pointer"
            >
              {showDetail ? "▲ Sembunyikan Rincian" : "▼ Rincian Komponen"}
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

        {/* 4 Kartu Metrik Keuangan Utama */}
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Upah Bruto */}
          <div className="rounded-xl bg-white border border-gray-200 p-4 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-semibold text-gray-500">
                {isSlipPaid ? "Gaji / Upah Bruto Resmi:" : "Perkiraan Upah Bruto Berjalan:"}
              </div>
              <div className="mt-1 text-2xl font-black text-gray-900">{money(displayedGross)}</div>
              <div className="mt-1 text-[11px] text-gray-600">
                {isBulanan
                  ? (liveOvertimeHours > 0
                      ? `Pokok (${money(baseSalary)}) + Lembur`
                      : "Gaji Pokok Bulanan Tetap")
                  : isBorongan
                  ? `${qty(isSlipPaid && officialSlip?.totalQtyApproved ? officialSlip.totalQtyApproved : 0)} PCS disetujui`
                  : `${workedDays} Hari Kerja + ${liveOvertimeHours} Jam Lembur`}
              </div>
            </div>

            {/* Riwayat Pergerakan Komponen Gaji */}
            <div className="mt-3 pt-2.5 border-t border-gray-100 space-y-1.5 text-[11px]">
              <div className="font-bold text-gray-700 text-[10px] uppercase tracking-wider">
                Komponen Gaji Aktif:
              </div>
              <div className="space-y-1.5">
                <div className="rounded-lg bg-gray-50 border border-gray-200/70 p-2 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-gray-800">
                      {isBulanan ? "Gaji Pokok Bulanan" : "Upah Kerja Pokok"}
                    </span>
                  </div>
                  <span className="font-black text-gray-800 text-xs">
                    {money(baseSalary)}
                  </span>
                </div>

                {liveOvertimeWage > 0 ? (
                  <div className="rounded-lg bg-blue-50/60 border border-blue-200/70 p-2 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-blue-800">Upah Lembur</span>
                      <span className="text-blue-600 text-[10px] block">
                        {liveOvertimeHours} Jam
                      </span>
                    </div>
                    <span className="font-black text-blue-700 text-xs">
                      +{money(liveOvertimeWage)}
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
                {displayedKasbonWarung > 0 ? "Otomatis dipotong saat gajian" : "Tidak ada tagihan warung aktif"}
              </div>
            </div>
          </div>

          {/* Card 3: Kasbon Kantor */}
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

        {/* Accordion Rincian Hutang Berjalan */}
        {showDetail && (
          <div className="space-y-4 pt-2 border-t border-gray-200/80">
            {/* Detail Kasbon Perusahaan */}
            <div className="rounded-xl bg-white border border-gray-200 p-4">
              <h3 className="font-bold text-sm text-gray-900 mb-2 flex items-center gap-1.5">
                <span>🏢</span> Status Pinjaman Kantor ({companyLoans.length} Pinjaman)
              </h3>
              {companyLoans.length === 0 ? (
                <p className="text-xs text-gray-500 italic">Tidak ada pinjaman kantor aktif.</p>
              ) : (
                <div className="divide-y divide-gray-100 text-xs">
                  {companyLoans.map((l) => {
                    const rem = n(l.amount) - n(l.paid_amount);
                    const count = Number(l.installment_count) || 1;
                    const paid = Number(l.installments_paid) || 0;
                    const currentInst = paid + 1;
                    const instAmt = n(l.installment_amount) || Math.round(n(l.amount) / count);
                    return (
                      <div key={l.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-gray-800">
                            {l.advance_code} · {l.advance_date}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            {count > 1 ? (
                              <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                Angsuran ke-{Math.min(currentInst, count)} dari {count} kali ({money(instAmt)}/bln)
                              </span>
                            ) : (
                              "Pinjaman Sekali Lunas"
                            )}
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

      {/* MODAL CETAK SLIP RESMI */}
      {showSlipModal && isSlipPaid && officialSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 sm:p-7 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Pratinjau Dokumen Resmi
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">
                  Slip Gaji Karyawan ({officialSlip.type})
                </h3>
              </div>
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
                    SLIP GAJI RESMI ({officialSlip.type})
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
  );
        }
