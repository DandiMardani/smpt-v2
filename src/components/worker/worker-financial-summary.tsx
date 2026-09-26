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

  // Calculations for real-time balances
  const totalWarung = warungDebts.reduce((acc, x) => acc + (n(x.amount) - n(x.paid_amount)), 0);
  const totalCompanyLoan = companyLoans.reduce((acc, x) => acc + (n(x.amount) - n(x.paid_amount)), 0);

  // Monthly active company installment
  const activeCompanyInstallment = companyLoans.reduce((acc, x) => {
    const rem = n(x.amount) - n(x.paid_amount);
    const instCount = Number(x.installment_count) || 1;
    const instAmt = n(x.installment_amount) || (instCount > 1 ? Math.round(n(x.amount) / instCount) : rem);
    return acc + Math.min(rem, instAmt);
  }, 0);

  const totalDeductionPending = totalWarung + (isBulanan ? activeCompanyInstallment : totalCompanyLoan);
  const estimatedNet = Math.max(0, estimatedGross - totalDeductionPending);

  // Generate WhatsApp text for official slip
  const getOfficialWhatsAppText = () => {
    if (!officialSlip) return "";
    const isSlipBorongan = officialSlip.type === "BORONGAN";
    const statusText = officialSlip.paymentStatus === "SUDAH DIBAYAR" ? "✅ SUDAH DIBAYAR" : "⏳ BELUM DIBAYAR";

    if (isSlipBorongan) {
      const itemsList = (officialSlip.boronganItems || [])
        .map((it) => `• ${it.workItemName}: ${qty(it.qtyApproved)} pcs @ ${money(it.operatorPrice)} = ${money(it.operatorValue)}`)
        .join("\n");

      return `*SLIP GAJI OPERATOR BORONGAN - CV. SMPT*
No. Dokumen: ${officialSlip.payrollCode}
Status: ${statusText}
Periode: ${formatDateId(officialSlip.periodStart)} s/d ${formatDateId(officialSlip.periodEnd)}

Nama Operator: ${worker.name} (${worker.worker_code})
Sistem Upah: BORONGAN

*RINCIAN HASIL KERJA BORONGAN:*
${itemsList || "• Hasil kerja borongan periode ini"}

*Total Nilai Borongan Bruto:* ${money(officialSlip.grossAmount)}
*Total Potongan Kasbon:* ${money(officialSlip.deductionAmount)}
---------------------------------------------
*UPAH BERSIH DITERIMA: ${money(officialSlip.netAmount)}*

Catatan: Dokumen sah diterbitkan otomatis oleh sistem SMPT V2.`;
    }

    const totalOtMins = (officialSlip.overtimeMinutes || 0) + ((officialSlip.manualOvertimeHours || 0) * 60);
    const otHrs = Math.round((totalOtMins / 60) * 10) / 10;
    const totalOtAmt = (officialSlip.overtimeAmount || 0) + (officialSlip.manualOvertimeAmount || 0);

    return `*SLIP GAJI RESMI - CV. SMPT - Kreasi Dinamika*
No. Dokumen: ${officialSlip.payrollCode}
Status: ${statusText}
Periode: ${formatDateId(officialSlip.periodStart)} s/d ${formatDateId(officialSlip.periodEnd)}

Nama Pekerja: ${worker.name} (${worker.worker_code})
Bagian: ${worker.department || "Operasional"}
Sistem Upah: ${officialSlip.type}

*RINCIAN PENGHASILAN (BRUTO):*
• Gaji / Upah Pokok: ${money(officialSlip.baseAmount || 0)}
${totalOtAmt > 0 ? `• Upah Lembur (${otHrs} Jam): ${money(totalOtAmt)}\n` : ""}${(officialSlip.overtimeBonus || 0) > 0 ? `• Bonus Lembur ≥4 Jam: ${money(officialSlip.overtimeBonus || 0)}\n` : ""}${(officialSlip.mealAmount || 0) > 0 ? `• Uang Makan Minggu: ${money(officialSlip.mealAmount || 0)}\n` : ""}${(officialSlip.holidayBonus || 0) > 0 ? `• Insentif Hadir Minggu: ${money(officialSlip.holidayBonus || 0)}\n` : ""}*Total Penghasilan Bruto:* ${money(officialSlip.grossAmount)}

*RINCIAN POTONGAN:*
• Angsuran Kasbon Kantor: ${money(officialSlip.kasbonPerusahaanAmount || 0)}
• Tagihan Warung Makan Luar: ${money(officialSlip.kasbonWarungAmount || 0)}
*Total Potongan:* ${money(officialSlip.deductionAmount)}
---------------------------------------------
*GAJI BERSIH (TAKE HOME PAY): ${money(officialSlip.netAmount)}*

Catatan: Dokumen resmi penggajian CV. SMPT - Kreasi Dinamika.`;
  };

  const handlePrint = () => {
    window.print();
  };

  // Tentukan angka yang ditampilkan (Prioritas ke officialSlip terverifikasi admin)
  const displayedGross = officialSlip ? officialSlip.grossAmount : estimatedGross;
  const displayedDeduction = officialSlip ? officialSlip.deductionAmount : totalDeductionPending;
  const displayedNet = officialSlip ? officialSlip.netAmount : estimatedNet;
  const displayedKasbonPerusahaan = officialSlip && officialSlip.kasbonPerusahaanAmount !== undefined
    ? officialSlip.kasbonPerusahaanAmount
    : (isBulanan ? activeCompanyInstallment : totalCompanyLoan);
  const displayedKasbonWarung = officialSlip && officialSlip.kasbonWarungAmount !== undefined
    ? officialSlip.kasbonWarungAmount
    : totalWarung;

  return (
    <div className="space-y-5">
      {/* ================= SATU KARTU STATUS KEUANGAN & SLIP TERVERIFIKASI ================= */}
      <div
        className={`rounded-2xl border-2 p-5 sm:p-6 shadow-sm space-y-5 ${
          officialSlip
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
                  officialSlip ? "bg-emerald-600 text-white" : "bg-blue-600 text-white"
                }`}
              >
                {officialSlip ? "📜 DOKUMEN SLIP RESMI TERVERIFIKASI" : "⏱️ ESTIMASI GAJI BERJALAN"}
              </span>

              {officialSlip ? (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black shadow-xs ${
                    officialSlip.paymentStatus === "SUDAH DIBAYAR"
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : "bg-amber-100 text-amber-800 border border-amber-300 animate-pulse"
                  }`}
                >
                  {officialSlip.paymentStatus === "SUDAH DIBAYAR"
                    ? "🟢 SUDAH DIBAYAR (LUNAS)"
                    : "⏳ BELUM DIBAYAR (PROSES KASIR)"}
                </span>
              ) : null}
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-gray-900 mt-1">
              {officialSlip ? `Slip Payout: ${officialSlip.payrollCode}` : "Akumulasi Upah & Kasbon Saya Hari Ini"}
            </h2>

            <p className="text-xs text-gray-600 flex flex-wrap items-center gap-2">
              <span><b>{worker.name}</b> ({worker.worker_code})</span>
              <span>•</span>
              <span>Sistem Upah: <b>{officialSlip?.type || worker.pay_system}</b></span>
              {officialSlip?.periodStart && (
                <>
                  <span>•</span>
                  <span>📅 <b>Periode Gaji:</b> {formatDateId(officialSlip.periodStart)} s/d {formatDateId(officialSlip.periodEnd)}</span>
                </>
              )}
            </p>

            {officialSlip ? (
              <p className="text-[11px] text-emerald-700 flex items-center gap-1 font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Data telah diverifikasi Admin Keuangan. Tidak ada perbedaan antara estimasi dan slip resmi.</span>
              </p>
            ) : null}
          </div>

          {/* Action Buttons Header */}
          <div className="flex flex-wrap items-center gap-2">
            {officialSlip ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowSlipModal(true)}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition inline-flex items-center gap-1.5"
                >
                  📄 Lihat / Cetak Slip
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const text = getOfficialWhatsAppText();
                    const phone = normalizePhone(worker.phone);
                    const appUrl = phone
                      ? `whatsapp://send?phone=${phone}&text=${encodeURIComponent(text)}`
                      : `whatsapp://send?text=${encodeURIComponent(text)}`;
                    window.location.href = appUrl;
                  }}
                  className="rounded-xl border border-emerald-600 bg-white hover:bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 shadow-2xs transition inline-flex items-center gap-1.5"
                >
                  💬 Buka WA App
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const text = getOfficialWhatsAppText();
                    navigator.clipboard.writeText(text).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-2xs transition"
                >
                  {copied ? "✅ Disalin!" : "📋 Salin Teks"}
                </button>
              </>
            ) : null}

            <button
              type="button"
              onClick={() => setShowRulesInfo(!showRulesInfo)}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 shadow-2xs transition"
            >
              {showRulesInfo ? "✕ Tutup SOP" : "ℹ️ SOP Periode & Lupa Absen"}
            </button>

            <button
              type="button"
              onClick={() => setShowDetail(!showDetail)}
              className="rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-2xs transition"
            >
              {showDetail ? "▲ Sembunyikan Rincian" : "▼ Rincian Komponen"}
            </button>
          </div>
        </div>

        {/* SOP Lapangan & Ketentuan Lupa Absen Box */}
        {showRulesInfo && (
          <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/90 to-purple-50/60 p-4 text-xs space-y-3">
            <div className="flex items-center gap-2 border-b border-indigo-200/80 pb-2">
              <span className="text-lg">📌</span>
              <h4 className="font-extrabold text-indigo-950 text-sm">
                SOP Penggajian Lapangan & Penanganan Lupa Absen
              </h4>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 text-indigo-950">
              {/* Karyawan Harian */}
              <div className="rounded-lg bg-white/80 border border-indigo-200/70 p-3 space-y-1">
                <div className="font-black text-indigo-900 flex items-center gap-1.5">
                  <span>📅</span> Karyawan Harian (Sabtu - Jumat)
                </div>
                <p className="text-[11px] leading-relaxed text-indigo-800">
                  • <b>Hari Jumat</b>: Absen pagi dihitung 1 hari kerja penuh (masuk Sabtu–Jumat + Minggu = 7 hari).<br />
                  • <b>Pulang Jam 12:00</b>: Dikoreksi admin menjadi <b>0.5 hari</b>.<br />
                  • <b>Lembur Jumat &gt;17:00</b>: Dihitung dan dibayarkan pada <b>payroll minggu berikutnya</b>.<br />
                  • <b>Hari Minggu</b>: Jam shift normal (08:00–17:00) mendapat insentif hadir <b>Rp 20.000</b>.
                </p>
              </div>

              {/* Karyawan Bulanan */}
              <div className="rounded-lg bg-white/80 border border-indigo-200/70 p-3 space-y-1">
                <div className="font-black text-indigo-900 flex items-center gap-1.5">
                  <span>💼</span> Karyawan Bulanan (Siklus Bulanan)
                </div>
                <p className="text-[11px] leading-relaxed text-indigo-800">
                  • Gaji pokok utuh (Senin–Sabtu).<br />
                  • <b>Hari Minggu</b> (08:00–17:00) dihitung: Lembur 8 jam (Pokok ÷ 190/jam) + Uang Makan Minggu <b>Rp 50.000</b> + Bonus Lembur 4 jam <b>Rp 17.500</b>.<br />
                  • Tidak ada uang makan reguler harian karena sudah menyatu di gaji bulanan tetap.
                </p>
              </div>

              {/* Operator Borongan & Lupa Absen */}
              <div className="rounded-lg bg-white/80 border border-indigo-200/70 p-3 space-y-1">
                <div className="font-black text-indigo-900 flex items-center gap-1.5">
                  <span>✂️</span> Borongan & Solusi Lupa Absen
                </div>
                <p className="text-[11px] leading-relaxed text-indigo-800">
                  • <b>Borongan (Jumat - Kamis)</b>: Dihitung dari Qty Sah hasil kerja. Kasbon urgent / pekerjaan habis dapat dicairkan lebih awal.<br />
                  • <b>Lupa Finger Absen</b>: Untuk <b>Bulanan</b> gaji pokok aman; lembur/Minggu ditambahkan admin via form koreksi. Untuk <b>Harian</b>, supervisor konfirmasi fisik dan admin input koreksi hari/lembur manual pada slip.
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
                {officialSlip ? "Gaji / Upah Bruto Resmi:" : "Perkiraan Upah Bruto Berjalan:"}
              </div>
              <div className="mt-1 text-2xl font-black text-gray-900">{money(displayedGross)}</div>
              <div className="mt-1 text-[11px] text-gray-600">
                {isBulanan
                  ? (officialSlip && ((officialSlip.overtimeAmount || 0) + (officialSlip.manualOvertimeAmount || 0)) > 0
                      ? `Pokok + Lembur ${overtimeHours} Jam + Insentif`
                      : "Gaji Pokok Bulanan Tetap")
                  : isBorongan
                  ? `${qty(officialSlip?.totalQtyApproved || breakdown?.boronganItems?.reduce((a, b) => a + (b.goodQty || 0), 0) || 0)} PCS disetujui`
                  : `${workedDays} Hari Kerja + ${overtimeHours} Jam Lembur`}
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
                {officialSlip ? "Potongan resmi tercantum di slip" : "Otomatis dipotong saat payroll"}
              </div>
            </div>

            {warungDebts.length > 0 ? (
              <div className="mt-3 pt-2.5 border-t border-amber-200/70 space-y-1.5 text-[11px]">
                <div className="font-bold text-amber-900 text-[10px] uppercase tracking-wider">Riwayat Hutang:</div>
                <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                  {warungDebts.map((w) => {
                    const rem = n(w.amount) - n(w.paid_amount);
                    return (
                      <div key={w.id} className="rounded-lg bg-white/90 border border-amber-200/60 p-2 flex justify-between items-start gap-1">
                        <div className="leading-tight">
                          <span className="font-bold text-gray-800">{w.warung_name || "Warung Luar"}</span>
                          <span className="text-gray-500 text-[10px] block mt-0.5">{w.advance_date} {w.notes ? `· ${w.notes}` : ""}</span>
                        </div>
                        <span className="font-black text-amber-800 whitespace-nowrap text-xs">{money(rem)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
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
                {officialSlip
                  ? "Potongan resmi tercantum di slip"
                  : (activeCompanyInstallment > 0 ? `Cicilan aktif bln ini: ${money(activeCompanyInstallment)}` : "Lunas / Tidak ada cicilan")}
              </div>
            </div>

            {companyLoans.length > 0 ? (
              <div className="mt-3 pt-2.5 border-t border-rose-100 space-y-1.5 text-[11px]">
                <div className="font-bold text-rose-800 text-[10px] uppercase tracking-wider">Rincian Angsuran:</div>
                <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                  {companyLoans.map((l) => {
                    const rem = n(l.amount) - n(l.paid_amount);
                    const count = Number(l.installment_count) || 1;
                    const paid = Number(l.installments_paid) || 0;
                    const currentInst = paid + 1;
                    const instAmt = n(l.installment_amount) || Math.round(n(l.amount) / count);
                    return (
                      <div key={l.id} className="rounded-lg bg-white border border-rose-100 p-2 flex justify-between items-start gap-1">
                        <div className="leading-tight">
                          <span className="font-bold text-blue-700">
                            {count > 1 ? `Angsuran ke-${Math.min(currentInst, count)} dari ${count} kali` : "Sekali Lunas"}
                          </span>
                          <span className="text-gray-500 text-[10px] block mt-0.5">
                            {count > 1 ? `${money(instAmt)}/bln · ` : ""}{l.advance_date}
                          </span>
                        </div>
                        <span className="font-black text-rose-600 whitespace-nowrap text-xs">{money(rem)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {/* Card 4: Gaji Bersih */}
          <div className="rounded-xl bg-emerald-600 border border-emerald-700 p-4 shadow-sm text-white flex flex-col justify-between">
            <div>
              <div className="text-[11px] font-bold text-emerald-100 uppercase tracking-wider">
                {officialSlip ? "Gaji Bersih Resmi (Take Home Pay):" : "Perkiraan Bersih (Take Home Pay):"}
              </div>
              <div className="mt-1 text-2xl sm:text-3xl font-black text-white">{money(displayedNet)}</div>
              <div className="mt-1 text-[11px] text-emerald-100">
                Total potongan kasbon: <b>{money(displayedDeduction)}</b>
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-emerald-500/60 text-[11px] text-emerald-100">
              {officialSlip
                ? `Status Bayar: ${officialSlip.paymentStatus}`
                : `Sisa bersih setelah dikurangi semua kasbon`}
            </div>
          </div>
        </div>

        {/* Rincian Kasbon & Upah Detail Accordion */}
        {showDetail && (
          <div className="space-y-4 pt-2 border-t border-gray-200/80">
            {/* Detail Khusus Borongan */}
            {isBorongan && breakdown?.boronganItems && breakdown.boronganItems.length > 0 ? (
              <div className="rounded-xl bg-white border border-emerald-200 p-4">
                <h3 className="font-bold text-sm text-emerald-950 mb-3 flex items-center gap-1.5">
                  <span>✂️</span> Rincian Hasil Pengerjaan SPK Borongan Aktif
                </h3>
                <div className="divide-y divide-gray-100 text-xs">
                  {breakdown.boronganItems.map((b, idx) => (
                    <div key={idx} className="py-2.5 flex flex-wrap justify-between items-center gap-2">
                      <div>
                        <div className="font-bold text-gray-900">{b.workItemName}</div>
                        <div className="text-[11px] text-gray-500">
                          SPK: <b>{b.spkCode}</b> · Sah: <b className="text-emerald-700">{qty(b.goodQty || 0)}</b> pcs
                          {(b.rejectQty || 0) > 0 ? ` · Reject: ${qty(b.rejectQty)} pcs` : ""}
                          · Tarif: {money(b.operatorPrice)}/pcs
                        </div>
                      </div>
                      <div className="font-extrabold text-emerald-800 text-sm">
                        {money(b.totalValue)}
                      </div>
                    </div>
                  ))}
                  <div className="py-2.5 flex justify-between items-center font-bold text-sm bg-emerald-50/70 px-2 rounded-lg mt-1">
                    <div className="text-emerald-950">Total Nilai Borongan Bruto</div>
                    <div className="text-emerald-900">{money(breakdown.totalGross)}</div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Detail Komponen Upah Harian / Bulanan */}
            {breakdown && !isBorongan ? (
              <div className="rounded-xl bg-white border border-blue-200 p-4">
                <h3 className="font-bold text-sm text-blue-950 mb-3 flex items-center gap-1.5">
                  <span>💰</span> Rincian Komponen Upah, Lembur & Tunjangan Berjalan
                </h3>
                <div className="divide-y divide-gray-100 text-xs">
                  <div className="py-2 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-gray-800">Gaji / Upah Pokok</div>
                      <div className="text-[11px] text-gray-500">
                        {isBulanan ? "Gaji pokok bulanan tetap" : `${workedDays} hari kerja aktif`}
                      </div>
                    </div>
                    <div className="font-extrabold text-gray-900">{money(breakdown.baseAmount)}</div>
                  </div>

                  {breakdown.overtimeWage > 0 ? (
                    <div className="py-2 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-blue-700">Upah Lembur ({overtimeHours} Jam)</div>
                        <div className="text-[11px] text-gray-500">
                          {isBulanan
                            ? `Rumus Bulanan: Jam lembur × (Gaji ÷ 190)`
                            : `Rumus Harian: Jam lembur × (Upah ÷ 8)`}
                        </div>
                      </div>
                      <div className="font-extrabold text-blue-700">+{money(breakdown.overtimeWage)}</div>
                    </div>
                  ) : null}

                  {breakdown.bonus4h > 0 ? (
                    <div className="py-2 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-emerald-700">Bonus Lembur ≥ 4 Jam ({breakdown.count4h || 1} Hari)</div>
                        <div className="text-[11px] text-gray-500">
                          {isBulanan ? "Tambahan Rp 17.500 per hari" : "Tambahan Rp 5.000 per hari"}
                        </div>
                      </div>
                      <div className="font-extrabold text-emerald-700">+{money(breakdown.bonus4h)}</div>
                    </div>
                  ) : null}

                  {breakdown.sundayMealOrBonus > 0 ? (
                    <div className="py-2 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-indigo-700">
                          {isBulanan ? "Uang Makan Lembur Hari Minggu" : "Insentif Kehadiran Hari Minggu"} ({breakdown.sundayCount || 1} Hari)
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {isBulanan ? "Uang makan Rp 50.000 per hari Minggu" : "Tambahan Rp 20.000 per hari Minggu"}
                        </div>
                      </div>
                      <div className="font-extrabold text-indigo-700">+{money(breakdown.sundayMealOrBonus)}</div>
                    </div>
                  ) : null}

                  <div className="py-2.5 flex justify-between items-center font-bold text-sm bg-blue-50/50 px-2 rounded-lg mt-1">
                    <div className="text-blue-900">Total Upah Bruto Terkumpul</div>
                    <div className="text-blue-900">{money(breakdown.totalGross)}</div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Detail Hutang Warung */}
            <div className="rounded-xl bg-white border border-amber-200 p-4">
              <h3 className="font-bold text-sm text-amber-950 mb-2 flex items-center gap-1.5">
                <span>🍜</span> Rincian Riwayat Hutang Warung Mitra ({warungDebts.length} Catatan)
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
                <span>🏢</span> Rincian Kasbon Perusahaan & Progress Angsuran ({companyLoans.length} Pinjaman)
              </h3>
              {companyLoans.length === 0 ? (
                <p className="text-xs text-gray-500 italic">Anda tidak memiliki pinjaman kasbon perusahaan yang aktif.</p>
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

      {/* ================= 3. MODAL CETAK / PRATINJAU SLIP RESMI ================= */}
      {showSlipModal && officialSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-5 sm:p-7 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
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
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                ✕
              </button>
            </div>

            {/* Konten Slip Format Cetak */}
            <div id="printable-slip" className="mt-4 rounded-xl border border-slate-300 bg-white p-4 sm:p-5 text-slate-900 space-y-4 min-w-0">
              {/* Header Slip */}
              <div className="border-b-2 border-slate-900 pb-3 flex flex-wrap justify-between items-start gap-2">
                <div>
                  <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-900">
                    CV. SMPT - Kreasi Dinamika
                  </h2>
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mt-0.5">
                    SLIP PEMBAYARAN GAJI KARYAWAN ({officialSlip.type})
                  </p>
                </div>
                <div className="text-right text-xs">
                  <div className="font-mono font-bold text-slate-800">{officialSlip.payrollCode}</div>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase mt-1 ${
                      officialSlip.paymentStatus === "SUDAH DIBAYAR"
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-amber-100 text-amber-800 border border-amber-300"
                    }`}
                  >
                    {officialSlip.paymentStatus}
                  </span>
                </div>
              </div>

              {/* Meta Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500 block text-[11px]">Nama Pekerja:</span>
                  <b className="font-bold text-slate-900 text-sm">{worker.name}</b>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Kode Pekerja:</span>
                  <b className="font-bold text-slate-800">{worker.worker_code}</b>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Periode Kerja:</span>
                  <b className="font-bold text-slate-800">
                    {formatDateId(officialSlip.periodStart)} s/d {formatDateId(officialSlip.periodEnd)}
                  </b>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Bagian / Sistem:</span>
                  <b className="font-bold text-slate-800">
                    {worker.department || "Operasional"} · {officialSlip.type}
                  </b>
                </div>
              </div>

              {/* Tabel Komponen Upah & Potongan */}
              {officialSlip.type === "BORONGAN" ? (
                <div className="space-y-3">
                  <div className="font-bold text-xs uppercase tracking-wider text-slate-700">
                    Rincian Hasil Pengerjaan Borongan:
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden min-w-[280px]">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          <th className="p-2 text-left font-bold">Item Pekerjaan</th>
                          <th className="p-2 text-right font-bold">Qty Sah</th>
                          <th className="p-2 text-right font-bold">Tarif</th>
                          <th className="p-2 text-right font-bold">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(officialSlip.boronganItems || []).map((it, idx) => (
                          <tr key={idx}>
                            <td className="p-2 font-medium text-slate-800">{it.workItemName}</td>
                            <td className="p-2 text-right font-mono">{qty(it.qtyApproved)} pcs</td>
                            <td className="p-2 text-right font-mono">{money(it.operatorPrice)}</td>
                            <td className="p-2 text-right font-bold font-mono text-emerald-800">{money(it.operatorValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4 text-xs">
                  {/* Kolom Penerimaan */}
                  <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                    <div className="font-bold uppercase tracking-wider text-slate-800 text-[11px] border-b border-slate-200 pb-1">
                      Penerimaan (Upah Bruto)
                    </div>
                    <div className="space-y-1.5 text-slate-700">
                      <div className="flex justify-between">
                        <span>Gaji / Upah Pokok:</span>
                        <span className="font-bold">{money(officialSlip.baseAmount || 0)}</span>
                      </div>
                      {((officialSlip.overtimeAmount || 0) + (officialSlip.manualOvertimeAmount || 0)) > 0 ? (
                        <div className="flex justify-between text-blue-700">
                          <span>
                            Upah Lembur ({Math.round(((officialSlip.overtimeMinutes || 0) / 60 + (officialSlip.manualOvertimeHours || 0)) * 10) / 10}h):
                          </span>
                          <span className="font-bold">
                            +{money((officialSlip.overtimeAmount || 0) + (officialSlip.manualOvertimeAmount || 0))}
                          </span>
                        </div>
                      ) : null}
                      {(officialSlip.overtimeBonus || 0) > 0 ? (
                        <div className="flex justify-between text-emerald-700">
                          <span>Bonus Lembur ≥4 Jam:</span>
                          <span className="font-bold">+{money(officialSlip.overtimeBonus || 0)}</span>
                        </div>
                      ) : null}
                      {(officialSlip.mealAmount || 0) > 0 ? (
                        <div className="flex justify-between text-indigo-700">
                          <span>Uang Makan Minggu:</span>
                          <span className="font-bold">+{money(officialSlip.mealAmount || 0)}</span>
                        </div>
                      ) : null}
                      {(officialSlip.holidayBonus || 0) > 0 ? (
                        <div className="flex justify-between text-indigo-700">
                          <span>Insentif Minggu:</span>
                          <span className="font-bold">+{money(officialSlip.holidayBonus || 0)}</span>
                        </div>
                      ) : null}
                    </div>
                    <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900">
                      <span>Total Penerimaan Bruto:</span>
                      <span>{money(officialSlip.grossAmount)}</span>
                    </div>
                  </div>

                  {/* Kolom Potongan */}
                  <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                    <div className="font-bold uppercase tracking-wider text-rose-850 text-[11px] border-b border-slate-200 pb-1">
                      Potongan (Kasbon & Hutang)
                    </div>
                    <div className="space-y-1.5 text-slate-700">
                      <div className="flex justify-between">
                        <span>Cicilan Kasbon Kantor:</span>
                        <span className="font-bold text-rose-600">
                          {money(officialSlip.kasbonPerusahaanAmount || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tagihan Warung Mitra:</span>
                        <span className="font-bold text-amber-800">
                          {money(officialSlip.kasbonWarungAmount || 0)}
                        </span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-rose-700">
                      <span>Total Pemotongan:</span>
                      <span>{money(officialSlip.deductionAmount)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Total Bersih Take Home Pay */}
              <div className="rounded-xl bg-slate-900 p-4 text-white flex flex-wrap justify-between items-center gap-2">
                <div>
                  <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                    Gaji Bersih Diterima (Take Home Pay)
                  </div>
                  <div className="text-xs text-slate-300">
                    Status: <b>{officialSlip.paymentStatus}</b>
                  </div>
                </div>
                <div className="text-2xl font-black text-emerald-300">
                  {money(officialSlip.netAmount)}
                </div>
              </div>

              {/* Tanda Tangan */}
              <div className="pt-6 grid grid-cols-2 text-center text-xs text-slate-600">
                <div>
                  <p>Penerima,</p>
                  <div className="h-16"></div>
                  <p className="font-bold text-slate-900 underline">{worker.name}</p>
                </div>
                <div>
                  <p>Mengetahui / Keuangan,</p>
                  <div className="h-16"></div>
                  <p className="font-bold text-slate-900 underline">Admin Payroll CV. SMPT</p>
                </div>
              </div>
            </div>

            {/* Action Buttons Modal */}
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => {
                  const text = getOfficialWhatsAppText();
                  const phone = normalizePhone(worker.phone);
                  const appUrl = phone
                    ? `whatsapp://send?phone=${phone}&text=${encodeURIComponent(text)}`
                    : `whatsapp://send?text=${encodeURIComponent(text)}`;
                  window.location.href = appUrl;
                }}
                className="rounded-xl border border-emerald-500 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs"
              >
                💬 Buka Aplikasi WhatsApp
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow-sm transition"
              >
                🖨️ Cetak / Simpan PDF
              </button>

              <button
                type="button"
                onClick={() => setShowSlipModal(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
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
