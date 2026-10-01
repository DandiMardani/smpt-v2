"use client";

import React, { useState, useTransition } from "react";
import * as payrollActions from "@/lib/final/actions";

export interface WorkerInfo {
  id?: number;
  name?: string;
  department?: string;
  code?: string;
  pay_system?: string;
  phone?: string;
  base_salary?: number | string;
  monthly_salary?: number | string;
  daily_salary?: number | string;
  [key: string]: any;
}

export interface PayrollItemRow {
  id: number;
  payroll_run_id: number;
  worker_id: number;
  worker_name_snapshot?: string;
  pay_system_snapshot?: string;
  department_snapshot?: string;
  worker_code_snapshot?: string;
  full_days?: number;
  half_days?: number;
  base_amount?: number;
  meal_amount?: number;
  overtime_minutes?: number;
  overtime_amount?: number;
  manual_overtime_hours?: number;
  manual_overtime_amount?: number;
  overtime_manual_hours?: number;
  overtime_manual_amount?: number;
  overtime_bonus?: number;
  holiday_bonus?: number;
  holiday_manual_amount?: number;
  holiday_manual_hours?: number;
  sunday_overtime_hours?: number;
  sunday_overtime_amount?: number;
  kasbon_perusahaan_amount?: number;
  kasbon_warung_amount?: number;
  deduction_amount?: number;
  net_amount?: number;
  workers?: WorkerInfo;
  [key: string]: any;
}

export type PayrollRunItem = PayrollItemRow;

export interface PayrollRunRow {
  id: number;
  payout_no?: string;
  payroll_code?: string;
  payroll_type?: string;
  period_start?: string;
  period_end?: string;
  notes?: string;
  total_gross?: number;
  total_deduction?: number;
  total_net?: number;
  total_operator_value?: number;
  total_submission_value?: number;
  config_snapshot?: any;
  [key: string]: any;
}

export type PayrollRun = PayrollRunRow;

export interface OperatorItemRow {
  id: number;
  run_id?: number;
  payroll_run_id?: number;
  worker_id?: number;
  worker_name?: string;
  worker_name_snapshot?: string;
  spk_no?: string;
  order_no?: string;
  work_item_name?: string;
  item_name?: string;
  qty_assigned?: number | string;
  qty_approved?: number | string;
  operator_price_snapshot?: number | string;
  submission_price_snapshot?: number | string;
  operator_value?: number | string;
  operatorValue?: number | string;
  submission_value?: number | string;
  submissionValue?: number | string;
  notes?: string;
  workers?: WorkerInfo;
  [key: string]: any;
}

export type OperatorItem = OperatorItemRow;
export type OperatorRun = PayrollRunRow;

export interface Props {
  runs?: any[];
  currentRunId?: number;
  items?: any[];
  operatorRuns?: any[];
  operatorItems?: any[];
  [key: string]: any;
}

export type PayrollSlipManagerProps = Props;

// Ikon Native SVG
const Users = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const Briefcase = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
  </svg>
);

const Wrench = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </svg>
);

const CheckCircle2 = ({ className = "w-3 h-3" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const Clock = ({ className = "w-3 h-3" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="10" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
  </svg>
);

const Unlock = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 11V7a5 5 0 019.9-1" />
  </svg>
);

const Lock = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

const Search = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const Edit3 = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const FileText = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const Send = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const X = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const Printer = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

const Utensils = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 2v20M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
  </svg>
);

export function PayrollSlipManager(props: Props) {
  const { runs = [], currentRunId, items = [], operatorRuns = [], operatorItems = [] } = props;
  const [isPending, startTransition] = useTransition();

  // Tab: Default ke GAJI BULANAN agar sinkron dengan tabel atas
  const [activeTab, setActiveTab] = useState<"BULANAN" | "UANG_MAKAN" | "HARIAN" | "BORONGAN">("BULANAN");
  const [selectedRunId, setSelectedRunId] = useState<number>(currentRunId || runs[0]?.id || 0);
  const [searchQuery, setSearchQuery] = useState("");

  const [viewingSlipItem, setViewingSlipItem] = useState<PayrollItemRow | null>(null);

  const activeRun = runs.find((r) => r.id === selectedRunId) || runs[0];
  const isPaid =
    activeRun?.config_snapshot?.payment_status_code === "SUDAH_DIBAYAR" ||
    activeRun?.config_snapshot?.payment_status === "SUDAH DIBAYAR" ||
    String(activeRun?.notes || "").includes("SUDAH_DIBAYAR");

  const runItems: PayrollItemRow[] = items.filter((it: any) => it.payroll_run_id === activeRun?.id);

  // Filter Staf Bulanan & Harian
  const filteredItems = runItems.filter((it) => {
    const paySystem = String(it.pay_system_snapshot || it.workers?.pay_system || "").toUpperCase();
    const isBulananWorker = paySystem === "BULANAN";

    let matchTab = false;
    if (activeTab === "BULANAN" || activeTab === "UANG_MAKAN") {
      matchTab = isBulananWorker;
    } else if (activeTab === "HARIAN") {
      matchTab = !isBulananWorker;
    }

    const name = String(it.worker_name_snapshot || it.workers?.name || "");
    const code = String(it.worker_code_snapshot || it.workers?.code || "");
    return (
      matchTab &&
      (name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        code.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  // Filter Borongan
  const allOperatorItems: OperatorItemRow[] = [
    ...operatorItems,
    ...((items.filter((it: any) => it.work_item_name || it.spk_no || it.qty_approved !== undefined) as unknown) as OperatorItemRow[])
  ];

  const filteredOpItems = allOperatorItems.filter((op) => {
    const name = String(op.worker_name_snapshot || op.worker_name || op.workers?.name || "");
    const spk = String(op.spk_no || op.order_no || "");
    const item = String(op.work_item_name || op.item_name || "");
    return (
      name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      spk.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const countBulanan = runItems.filter((i) => String(i.pay_system_snapshot || i.workers?.pay_system || "").toUpperCase() === "BULANAN").length;
  const countHarian = runItems.filter((i) => String(i.pay_system_snapshot || i.workers?.pay_system || "").toUpperCase() !== "BULANAN").length;
  const countBorongan = filteredOpItems.length;

  const formatRupiah = (val: number | string) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(num);
  };

  const handleToggleStatus = () => {
    if (!activeRun) return;
    const fd = new FormData();
    fd.set("run_id", String(activeRun.id));
    fd.set("run_type", activeTab === "BORONGAN" ? "OPERATOR" : "GENERAL");
    fd.set("payment_status", isPaid ? "BELUM_DIBAYAR" : "SUDAH_DIBAYAR");

    startTransition(async () => {
      if (payrollActions.togglePayrollPaymentStatusAction) {
        await payrollActions.togglePayrollPaymentStatusAction(fd);
      }
    });
  };

  return (
    <div className="space-y-4 pb-20">
      {/* 4 TAB KATEGORI PENGGAJIAN LENGKAP */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("BULANAN")}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl font-bold text-xs transition-all ${
            activeTab === "BULANAN"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-slate-600 hover:text-slate-900 bg-white sm:bg-transparent"
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span className="truncate">GAJI BULANAN ({countBulanan})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("UANG_MAKAN")}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl font-bold text-xs transition-all ${
            activeTab === "UANG_MAKAN"
              ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
              : "text-slate-600 hover:text-slate-900 bg-white sm:bg-transparent"
          }`}
        >
          <Utensils className="w-3.5 h-3.5" />
          <span className="truncate">UANG MAKAN ({countBulanan})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("HARIAN")}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl font-bold text-xs transition-all ${
            activeTab === "HARIAN"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "text-slate-600 hover:text-slate-900 bg-white sm:bg-transparent"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span className="truncate">HARIAN ({countHarian})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("BORONGAN")}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl font-bold text-xs transition-all ${
            activeTab === "BORONGAN"
              ? "bg-amber-600 text-white shadow-md shadow-amber-500/20"
              : "text-slate-600 hover:text-slate-900 bg-white sm:bg-transparent"
          }`}
        >
          <Wrench className="w-3.5 h-3.5" />
          <span className="truncate">BORONGAN ({countBorongan})</span>
        </button>
      </div>

      {/* RINGKASAN PAYOUT AKTIF */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-black text-slate-800">
              {activeTab === "BULANAN"
                ? "Rincian Slip Gaji Karyawan Bulanan Resmi"
                : activeTab === "UANG_MAKAN"
                ? "Form Pembayaran Uang Makan Mingguan (Bebas Kasbon)"
                : activeTab === "BORONGAN"
                ? "Rincian Slip Operator Borongan"
                : "Rincian Slip Pembayaran Upah Harian"}
            </h2>
            <p className="text-xs text-slate-500">
              {activeTab === "BULANAN"
                ? "Total THP = Gaji Pokok + Lembur - Kasbon Kantor - Kasbon Warung. Resmi CV. SMPT."
                : activeTab === "UANG_MAKAN"
                ? "Dihitung murni hari hadir (Rp 50.000/hari). Tidak memotong kasbon."
                : activeTab === "BORONGAN"
                ? "Dihitung dari Qty Sah Checker + Harga Satuan Borongan."
                : "Upah kehadiran harian, lembur, dan potongan kasbon otomatis tersinkron."}
            </p>
          </div>

          {runs.length > 0 && (
            <select
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(Number(e.target.value))}
              aria-label="Pilih Periode Payroll"
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              {runs.map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.payroll_code || r.payout_no || `PAY-${String(r.id).padStart(6, "0")}`} • {r.period_start} s/d {r.period_end}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* STATUS PAYOUT */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <div>
            <span className="text-[10px] font-bold text-slate-400 block uppercase">No. Payout</span>
            <span className="text-xs font-black text-slate-800">
              {activeRun?.payroll_code || activeRun?.payout_no || `PAY-${String(activeRun?.id || 0).padStart(6, "0")}`}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 block uppercase">Periode</span>
            <span className="text-xs font-black text-slate-800">
              {activeRun?.period_start} s/d {activeRun?.period_end}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 block uppercase">Total Nilai Bersih</span>
            <span className="text-xs font-black text-emerald-600">
              {formatRupiah(activeRun?.total_net || activeRun?.total_operator_value || 0)}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 block uppercase">Status Pembayaran</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                  isPaid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {isPaid ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {isPaid ? "SUDAH DIBAYAR" : "BELUM DIBAYAR"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            disabled={isPending}
            onClick={handleToggleStatus}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
              isPaid
                ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
            }`}
          >
            {isPaid ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {isPaid ? "Set Belum" : "Set Lunas"}
          </button>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Cari nama staf / kode pekerja...`}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* DAFTAR PEKERJA: BULANAN / UANG MAKAN / HARIAN */}
      {activeTab !== "BORONGAN" && (
        <div className="space-y-3">
          {filteredItems.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 space-y-2">
              <Users className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-600">Tidak ada pekerja dalam kategori ini</p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const workerName = item.worker_name_snapshot || item.workers?.name || "Tanpa Nama";
              const code = item.worker_code_snapshot || item.workers?.code || "-";
              const dept = item.department_snapshot || item.workers?.department || "PRODUKSI";

              const base = Number(item.base_amount || 0);
              const overtime =
                Number(item.overtime_amount || 0) +
                Number(item.manual_overtime_amount || 0) +
                Number(item.overtime_bonus || 0);
              const kp = Number(item.kasbon_perusahaan_amount || 0);
              const kw = Number(item.kasbon_warung_amount || 0);
              const totalDed = kp + kw;
              const gross = base + overtime;
              const bulananNet = Math.max(0, gross - totalDed);

              // Mode Uang Makan
              const mealAmt = Number(item.meal_amount || 0);
              const totalDays = mealAmt > 0 ? Math.round((mealAmt / 50000) * 10) / 10 : 0;

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3 hover:border-slate-300 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-slate-800">{workerName}</span>
                        <span
                          className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                            activeTab === "BULANAN"
                              ? "bg-blue-100 text-blue-700"
                              : activeTab === "UANG_MAKAN"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {activeTab === "BULANAN"
                            ? "GAJI BULANAN"
                            : activeTab === "UANG_MAKAN"
                            ? "UANG MAKAN MINGGUAN"
                            : "HARIAN"}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-slate-400 block">
                        {dept} • {code}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[9px] font-bold text-slate-400 block uppercase">
                        {activeTab === "UANG_MAKAN" ? "Uang Makan Net" : "Gaji Bersih (THP)"}
                      </span>
                      <span className="text-base font-black text-emerald-600">
                        {formatRupiah(activeTab === "UANG_MAKAN" ? mealAmt : bulananNet)}
                      </span>
                    </div>
                  </div>

                  {/* KARTU RINCIAN DATA SESUAI TAB */}
                  {activeTab === "BULANAN" ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Gaji Pokok:</span>
                        <span className="font-bold text-slate-800">{formatRupiah(base)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Lembur:</span>
                        <span className="font-bold text-slate-800">{formatRupiah(overtime)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Kasbon Kantor:</span>
                        <span className={`font-bold ${kp > 0 ? "text-rose-600" : "text-slate-600"}`}>
                          {kp > 0 ? `-${formatRupiah(kp)}` : "Rp 0"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Kasbon Warung:</span>
                        <span className={`font-bold ${kw > 0 ? "text-amber-600" : "text-slate-600"}`}>
                          {kw > 0 ? `-${formatRupiah(kw)}` : "Rp 0"}
                        </span>
                      </div>
                    </div>
                  ) : activeTab === "UANG_MAKAN" ? (
                    <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-3 text-xs space-y-1.5">
                      <div className="flex justify-between font-bold text-purple-900">
                        <span>Kehadiran: {totalDays} Hari Aktif</span>
                        <span>{formatRupiah(mealAmt)}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Uang Makan (Rp 35.000) + Insentif (Rp 15.000) = Rp 50.000/hari. Bebas potongan kasbon.
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Upah Pokok Hadir:</span>
                        <span className="font-bold text-slate-800">{formatRupiah(base)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Lembur:</span>
                        <span className="font-bold text-slate-800">{formatRupiah(overtime)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Potongan Kasbon:</span>
                        <span className="font-bold text-rose-600">-{formatRupiah(Number(item.deduction_amount || 0))}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Bersih:</span>
                        <span className="font-bold text-emerald-600">{formatRupiah(Number(item.net_amount || 0))}</span>
                      </div>
                    </div>
                  )}

                  {/* AKSI CETAK & SHARE WA */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setViewingSlipItem(item)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>{activeTab === "BULANAN" ? "Cetak Slip Gaji" : "Cetak Bukti"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        let noteMsg = "";
                        if (activeTab === "BULANAN") {
                          noteMsg = `*SLIP GAJI RESMI CV. SMPT*\n` +
                            `Periode: ${activeRun?.period_start} s/d ${activeRun?.period_end}\n` +
                            `Nama: ${workerName} (${code})\n` +
                            `--------------------------------\n` +
                            `Gaji Pokok: ${formatRupiah(base)}\n` +
                            `Lembur: ${formatRupiah(overtime)}\n` +
                            `Total Bruto: ${formatRupiah(gross)}\n` +
                            `Pot. Kasbon Kantor: -${formatRupiah(kp)}\n` +
                            `Pot. Kasbon Warung: -${formatRupiah(kw)}\n` +
                            `Total Potongan: -${formatRupiah(totalDed)}\n` +
                            `--------------------------------\n` +
                            `*GAJI BERSIH (THP): ${formatRupiah(bulananNet)}*\n\n` +
                            `Status: ${isPaid ? "LUNAS / TELAH DITRANSFER" : "DALAM PROSES"}`;
                        } else if (activeTab === "UANG_MAKAN") {
                          noteMsg = `Halo ${workerName}, berikut rincian Uang Makan periode ${activeRun?.period_start} s/d ${activeRun?.period_end}: Kehadiran ${totalDays} hari × Rp 50.000 = Total Diterima ${formatRupiah(mealAmt)} (Bebas Potongan Kasbon).`;
                        } else {
                          noteMsg = `Halo ${workerName}, slip upah harian periode ${activeRun?.period_start} s/d ${activeRun?.period_end}: Total Bersih ${formatRupiah(Number(item.net_amount || 0))}.`;
                        }
                        window.open(`https://wa.me/?text=${encodeURIComponent(noteMsg)}`, "_blank");
                      }}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Kirim WA</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* DAFTAR PEKERJA: BORONGAN */}
      {activeTab === "BORONGAN" && (
        <div className="space-y-3">
          {filteredOpItems.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 space-y-2">
              <Wrench className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-600">Tidak ada item operator borongan</p>
            </div>
          ) : (
            filteredOpItems.map((op) => {
              const opName = op.worker_name_snapshot || op.worker_name || op.workers?.name || "Operator";
              const spk = op.spk_no || op.order_no || "SPK-REGULER";
              const itemWork = op.work_item_name || op.item_name || "Pekerjaan Borongan";
              const qty = Number(op.qty_approved || 0);
              const price = Number(op.operator_price_snapshot || 0);
              const opVal = Number(op.operator_value ?? op.operatorValue ?? qty * price);

              return (
                <div
                  key={op.id}
                  className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-3 hover:border-slate-300 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-slate-800">{opName}</span>
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          BORONGAN
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-slate-400 block">
                        {spk} • {itemWork}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[9px] font-bold text-slate-400 block uppercase">Total Borongan</span>
                      <span className="text-base font-black text-amber-600">{formatRupiah(opVal)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Qty Sah Checker:</span>
                      <span className="font-black text-slate-700">{qty.toLocaleString("id-ID")} PCS</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Tarif Satuan:</span>
                      <span className="font-black text-slate-700">{formatRupiah(price)} / PCS</span>
                    </div>
                  </div>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const text = `Halo ${opName}, slip borongan ${spk} (${itemWork}): Qty Sah ${qty} PCS @ ${formatRupiah(price)} = Total ${formatRupiah(opVal)}.`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
                      }}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Share WA</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* MODAL CETAK SLIP RESMI CV. SMPT */}
      {viewingSlipItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="text-center border-b pb-3 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 block">
                CV. SISTEM MANAJEMEN PRODUKSI TERPADU
              </span>
              <h3 className="font-black text-base text-slate-900">
                {activeTab === "BULANAN"
                  ? "SLIP GAJI KARYAWAN BULANAN"
                  : activeTab === "UANG_MAKAN"
                  ? "BUKTI PENCAIRAN UANG MAKAN"
                  : "SLIP UPAH HARIAN"}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {activeRun?.payroll_code || activeRun?.payout_no} • {activeRun?.period_start} s/d {activeRun?.period_end}
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-dashed">
                <span className="text-slate-500">Nama Penerima</span>
                <span className="font-black text-slate-900">
                  {viewingSlipItem.worker_name_snapshot || viewingSlipItem.workers?.name}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed">
                <span className="text-slate-500">Departemen / Posisi</span>
                <span className="font-bold text-slate-800">
                  {viewingSlipItem.department_snapshot || viewingSlipItem.workers?.department || "Staff"}
                </span>
              </div>

              {activeTab === "BULANAN" ? (
                <>
                  <div className="flex justify-between py-1 border-b border-dashed">
                    <span className="text-slate-500">Gaji Pokok Bulanan</span>
                    <span className="font-bold text-slate-800">
                      {formatRupiah(Number(viewingSlipItem.base_amount || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-dashed">
                    <span className="text-slate-500">Upah Lembur</span>
                    <span className="font-bold text-slate-800">
                      {formatRupiah(
                        Number(viewingSlipItem.overtime_amount || 0) +
                        Number(viewingSlipItem.manual_overtime_amount || 0) +
                        Number(viewingSlipItem.overtime_bonus || 0)
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-dashed text-rose-600">
                    <span>Potongan Kasbon Kantor</span>
                    <span className="font-bold">
                      -{formatRupiah(Number(viewingSlipItem.kasbon_perusahaan_amount || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-dashed text-amber-600">
                    <span>Potongan Kasbon Warung</span>
                    <span className="font-bold">
                      -{formatRupiah(Number(viewingSlipItem.kasbon_warung_amount || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2.5 text-sm font-black text-emerald-700 bg-emerald-50/60 p-2 rounded-xl">
                    <span>TOTAL DITERIMA (THP)</span>
                    <span>
                      {formatRupiah(
                        Math.max(
                          0,
                          Number(viewingSlipItem.base_amount || 0) +
                          Number(viewingSlipItem.overtime_amount || 0) +
                          Number(viewingSlipItem.manual_overtime_amount || 0) +
                          Number(viewingSlipItem.overtime_bonus || 0) -
                          Number(viewingSlipItem.kasbon_perusahaan_amount || 0) -
                          Number(viewingSlipItem.kasbon_warung_amount || 0)
                        )
                      )}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between pt-2 text-sm font-black text-emerald-600">
                  <span>TOTAL DITERIMA</span>
                  <span>{formatRupiah(Number(viewingSlipItem.net_amount || viewingSlipItem.meal_amount || 0))}</span>
                </div>
              )}
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

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setViewingSlipItem(null)}
                className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-slate-100 text-slate-700 cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-xs bg-blue-600 text-white shadow-md cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PayrollSlipManager;
