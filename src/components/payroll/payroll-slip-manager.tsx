"use client";

import React, { useState, useTransition } from "react";
import { 
  updatePayrollItemAction, 
  updateOperatorPayrollItemAction,
  togglePayrollPaymentStatusAction, 
  syncPayrollAdvancesAction 
} from "@/lib/final/actions";
import { 
  Building2, 
  CheckCircle2, 
  Clock, 
  Edit3, 
  FileText, 
  Lock, 
  RefreshCw, 
  Search, 
  Send, 
  Sparkles, 
  Unlock, 
  Users, 
  Wrench, 
  X, 
  Zap,
  Printer
} from "lucide-react";

export interface PayrollRunItem {
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
  overtime_bonus?: number;
  holiday_bonus?: number;
  kasbon_perusahaan_amount?: number;
  kasbon_warung_amount?: number;
  deduction_amount?: number;
  net_amount?: number;
  workers?: {
    name?: string;
    department?: string;
    code?: string;
    pay_system?: string;
    phone?: string;
    base_salary?: number;
    monthly_salary?: number;
    daily_salary?: number;
  };
}

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
  qty_assigned?: number;
  qty_approved?: number;
  operator_price_snapshot?: number;
  submission_price_snapshot?: number;
  operator_value?: number;
  operatorValue?: number;
  submission_value?: number;
  submissionValue?: number;
  notes?: string;
  workers?: {
    name?: string;
    department?: string;
    code?: string;
    phone?: string;
  };
}

export interface PayrollRun {
  id: number;
  payout_no?: string;
  payroll_type: string;
  period_start: string;
  period_end: string;
  notes?: string;
  total_gross?: number;
  total_deduction?: number;
  total_net?: number;
  total_operator_value?: number;
  total_submission_value?: number;
  config_snapshot?: {
    payment_status?: string;
    payment_status_code?: string;
    payment_updated_at?: string;
  };
}

export interface Props {
  runs?: PayrollRun[];
  currentRunId?: number;
  items?: PayrollRunItem[];
  operatorRuns?: PayrollRun[];
  operatorItems?: OperatorItemRow[];
  [key: string]: any;
}

export function PayrollSlipManager(props: Props) {
  const { runs = [], currentRunId, items = [], operatorRuns = [], operatorItems = [] } = props;
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<"HARIAN" | "BULANAN" | "BORONGAN">("HARIAN");
  const [selectedRunId, setSelectedRunId] = useState<number>(currentRunId || runs[0]?.id || 0);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal Koreksi Harian & Bulanan
  const [editingItem, setEditingItem] = useState<PayrollRunItem | null>(null);
  const [editDays, setEditDays] = useState<string>("0");
  const [editMealAmount, setEditMealAmount] = useState<number>(0);
  const [editBaseAmount, setEditBaseAmount] = useState<number>(0);
  const [editOtHours, setEditOtHours] = useState<number>(0);
  const [editOtAmount, setEditOtAmount] = useState<number>(0);
  const [editManualOtHours, setEditManualOtHours] = useState<number>(0);
  const [editManualOtAmount, setEditManualOtAmount] = useState<number>(0);
  const [editOtBonus, setEditOtBonus] = useState<number>(0);
  const [editHolidayBonus, setEditHolidayBonus] = useState<number>(0);
  const [editKasbonP, setEditKasbonP] = useState<number>(0);
  const [editKasbonW, setEditKasbonW] = useState<number>(0);

  // Modal Koreksi Operator Borongan
  const [editingOpItem, setEditingOpItem] = useState<OperatorItemRow | null>(null);
  const [editOpQty, setEditOpQty] = useState<number>(0);
  const [editOpPrice, setEditOpPrice] = useState<number>(0);
  const [editOpSubPrice, setEditOpSubPrice] = useState<number>(0);

  // Modal Slip Cetak
  const [viewingSlipItem, setViewingSlipItem] = useState<PayrollRunItem | null>(null);

  const activeRun = runs.find((r) => r.id === selectedRunId) || runs[0];
  const isPaid =
    activeRun?.config_snapshot?.payment_status_code === "SUDAH_DIBAYAR" ||
    activeRun?.config_snapshot?.payment_status === "SUDAH DIBAYAR" ||
    (activeRun?.notes || "").includes("SUDAH_DIBAYAR");

  const runItems = items.filter((it) => it.payroll_run_id === activeRun?.id);

  // Filter Harian & Bulanan
  const filteredItems = runItems.filter((it) => {
    const paySystem = (it.pay_system_snapshot || it.workers?.pay_system || "").toUpperCase();
    const isMatchingType = activeTab === "BULANAN" ? paySystem === "BULANAN" : paySystem !== "BULANAN";
    const name = it.worker_name_snapshot || it.workers?.name || "";
    const code = it.worker_code_snapshot || it.workers?.code || "";
    return isMatchingType && (name.toLowerCase().includes(searchQuery.toLowerCase()) || code.toLowerCase().includes(searchQuery.toLowerCase()));
  });

  // Filter Operator Borongan
  const allOperatorItems: OperatorItemRow[] = [
    ...operatorItems,
    ...((items.filter((it: any) => it.work_item_name || it.spk_no || it.qty_approved !== undefined) as unknown) as OperatorItemRow[])
  ];

  const filteredOpItems = allOperatorItems.filter((op) => {
    const name = op.worker_name_snapshot || op.worker_name || op.workers?.name || "";
    const spk = op.spk_no || op.order_no || "";
    const item = op.work_item_name || op.item_name || "";
    return (
      name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      spk.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const countHarian = runItems.filter((i) => (i.pay_system_snapshot || i.workers?.pay_system || "").toUpperCase() !== "BULANAN").length;
  const countBulanan = runItems.filter((i) => (i.pay_system_snapshot || i.workers?.pay_system || "").toUpperCase() === "BULANAN").length;
  const countBorongan = filteredOpItems.length;

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  // Handler Buka Edit Harian / Bulanan
  const handleOpenEdit = (item: PayrollRunItem) => {
    setEditingItem(item);
    const existingMeal = Number(item.meal_amount || 0);
    const calculatedDays = existingMeal > 0 ? Math.round(existingMeal / 50000) : (item.full_days || 0);
    
    setEditDays(String(calculatedDays));
    setEditMealAmount(existingMeal);
    setEditBaseAmount(Number(item.base_amount || 0));
    setEditOtHours(item.overtime_minutes ? Math.round((item.overtime_minutes / 60) * 10) / 10 : 0);
    setEditOtAmount(Number(item.overtime_amount || 0));
    setEditManualOtHours(Number(item.manual_overtime_hours || 0));
    setEditManualOtAmount(Number(item.manual_overtime_amount || 0));
    setEditOtBonus(Number(item.overtime_bonus || 0));
    setEditHolidayBonus(Number(item.holiday_bonus || 0));
    setEditKasbonP(Number(item.kasbon_perusahaan_amount || 0));
    setEditKasbonW(Number(item.kasbon_warung_amount || 0));
  };

  const handleDaysChange = (daysStr: string) => {
    setEditDays(daysStr);
    const parsed = parseFloat(daysStr) || 0;
    setEditMealAmount(Math.max(0, parsed * 50000));
  };

  const handleSetPresetDays = (days: number) => {
    setEditDays(String(days));
    setEditMealAmount(days * 50000);
  };

  const handleApplySundayShift = () => {
    setEditManualOtHours(8);
    const basePokok = editBaseAmount || Number(editingItem?.workers?.monthly_salary || 0);
    const hourlyRate = basePokok > 0 ? Math.round((basePokok / 190) * 100) / 100 : 0;
    setEditManualOtAmount(Math.round(8 * hourlyRate));
    setEditOtBonus(17500);
    
    const curDays = parseFloat(editDays) || 0;
    const nextDays = curDays + 1;
    setEditDays(String(nextDays));
    setEditMealAmount(nextDays * 50000);
  };

  const calculatedTotalGross = editBaseAmount + editMealAmount + editOtAmount + editManualOtAmount + editOtBonus + editHolidayBonus;
  const calculatedTotalDeduction = editKasbonP + editKasbonW;
  const calculatedNet = Math.max(0, calculatedTotalGross - calculatedTotalDeduction);

  const handleSaveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const fd = new FormData();
    fd.set("item_id", String(editingItem.id));
    fd.set("base_amount", String(editBaseAmount));
    fd.set("meal_amount", String(editMealAmount));
    fd.set("overtime_minutes", String(Math.round(editOtHours * 60)));
    fd.set("overtime_amount", String(editOtAmount));
    fd.set("manual_overtime_hours", String(editManualOtHours));
    fd.set("manual_overtime_amount", String(editManualOtAmount));
    fd.set("overtime_bonus", String(editOtBonus));
    fd.set("holiday_bonus", String(editHolidayBonus));
    fd.set("kasbon_perusahaan_amount", String(editKasbonP));
    fd.set("kasbon_warung_amount", String(editKasbonW));
    fd.set("deduction_amount", String(calculatedTotalDeduction));

    startTransition(async () => {
      await updatePayrollItemAction(fd);
      setEditingItem(null);
    });
  };

  // Handler Buka Edit Operator Borongan
  const handleOpenEditOp = (item: OperatorItemRow) => {
    setEditingOpItem(item);
    setEditOpQty(Number(item.qty_approved || 0));
    setEditOpPrice(Number(item.operator_price_snapshot || 0));
    setEditOpSubPrice(Number(item.submission_price_snapshot || 0));
  };

  const handleSaveOpCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOpItem) return;

    const fd = new FormData();
    fd.set("item_id", String(editingOpItem.id));
    fd.set("qty_approved", String(editOpQty));
    fd.set("operator_price", String(editOpPrice));
    fd.set("submission_price", String(editOpSubPrice));
    fd.set("operator_value", String(Math.round(editOpQty * editOpPrice * 100) / 100));
    fd.set("submission_value", String(Math.round(editOpQty * editOpSubPrice * 100) / 100));

    startTransition(async () => {
      await updateOperatorPayrollItemAction(fd);
      setEditingOpItem(null);
    });
  };

  const handleToggleStatus = () => {
    if (!activeRun) return;
    const fd = new FormData();
    fd.set("run_id", String(activeRun.id));
    fd.set("run_type", activeTab === "BORONGAN" ? "OPERATOR" : "GENERAL");
    fd.set("payment_status", isPaid ? "BELUM_DIBAYAR" : "SUDAH_DIBAYAR");

    startTransition(async () => {
      await togglePayrollPaymentStatusAction(fd);
    });
  };

  const handleSyncData = () => {
    if (!activeRun) return;
    const fd = new FormData();
    fd.set("run_id", String(activeRun.id));

    startTransition(async () => {
      await syncPayrollAdvancesAction(fd);
    });
  };

  return (
    <div className="space-y-4 pb-20">
      {/* 3 PILIHAN TAB KATEGORI PENGGAJIAN */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("HARIAN")}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl font-bold text-xs sm:text-sm transition-all ${
            activeTab === "HARIAN"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="truncate">HARIAN ({countHarian})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("BULANAN")}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl font-bold text-xs sm:text-sm transition-all ${
            activeTab === "BULANAN"
              ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="truncate">BULANAN ({countBulanan})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("BORONGAN")}
          className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl font-bold text-xs sm:text-sm transition-all ${
            activeTab === "BORONGAN"
              ? "bg-amber-600 text-white shadow-md shadow-amber-500/20"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Wrench className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="truncate">BORONGAN ({countBorongan})</span>
        </button>
      </div>

      {/* RINGKASAN PAYOUT AKTIF */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
              <span>
                {activeTab === "BULANAN"
                  ? "Uang Makan Staf Bulanan"
                  : activeTab === "BORONGAN"
                  ? "Rincian Slip Operator Borongan"
                  : "Rincian Slip Gaji Harian"}
              </span>
            </h2>
            <p className="text-xs text-slate-500">
              {activeTab === "BULANAN"
                ? "Isi jumlah hari kehadiran untuk uang makan mingguan (Rp 50.000/hari)."
                : activeTab === "BORONGAN"
                ? "Dihitung dari Qty Sah Checker + Harga Satuan Borongan."
                : "Upah kehadiran, lembur, dan potongan kasbon otomatis tersinkron."}
            </p>
          </div>

          {runs.length > 0 && (
            <select
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(Number(e.target.value))}
              aria-label="Pilih Periode Payroll"
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.payout_no || `PAY-${String(r.id).padStart(6, "0")}`} • {r.period_start} s/d {r.period_end}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* KARTU STATUS PAYOUT */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <div>
            <span className="text-[10px] font-bold text-slate-400 block uppercase">No. Payout</span>
            <span className="text-xs font-black text-slate-800">
              {activeRun?.payout_no || `PAY-${String(activeRun?.id || 0).padStart(6, "0")}`}
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

        {/* ACTION BUTTONS */}
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

          {activeTab !== "BORONGAN" && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleSyncData}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`} />
              <span>Sinkronkan Gaji & Kasbon</span>
            </button>
          )}
        </div>
      </div>

      {/* PENCARIAN */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Cari nama staf / borongan / SPK...`}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* DAFTAR PEKERJA: HARIAN & BULANAN */}
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
              const isBulanan = (item.pay_system_snapshot || item.workers?.pay_system || "").toUpperCase() === "BULANAN";

              const fullDays = item.full_days || 0;
              const halfDays = item.half_days || 0;
              const mealAmt = Number(item.meal_amount || 0);
              const netAmt = Number(item.net_amount || 0);

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
                            isBulanan ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {isBulanan ? "BULANAN" : "HARIAN"}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-slate-400 block">
                        {dept} • {code}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[9px] font-bold text-slate-400 block uppercase">Gaji Bersih (Net)</span>
                      <span className="text-base font-black text-emerald-600">{formatRupiah(netAmt)}</span>
                    </div>
                  </div>

                  {/* Rincian Komponen Upah */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">
                        {isBulanan ? "Uang Makan Mingguan:" : "Upah Pokok Hadir:"}
                      </span>
                      <span className="font-bold text-slate-700">
                        {isBulanan ? formatRupiah(mealAmt) : formatRupiah(Number(item.base_amount || 0))}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {isBulanan
                          ? `(${mealAmt > 0 ? mealAmt / 50000 : 0} Hari Masuk)`
                          : `(${fullDays} Full • ${halfDays} Half)`}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Lembur:</span>
                      <span className="font-bold text-slate-700">
                        {formatRupiah(Number(item.overtime_amount || 0) + Number(item.manual_overtime_amount || 0))}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {Math.round(((item.overtime_minutes || 0) / 60) * 10) / 10 + Number(item.manual_overtime_hours || 0)} Jam
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Bonus & Insentif:</span>
                      <span className="font-bold text-slate-700">
                        {formatRupiah(Number(item.overtime_bonus || 0) + Number(item.holiday_bonus || 0))}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {Number(item.holiday_bonus || 0) > 0 ? "Insentif Minggu" : "Reguler"}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Potongan Kasbon:</span>
                      <span className="font-bold text-rose-600">
                        {Number(item.deduction_amount || 0) > 0 ? `-${formatRupiah(Number(item.deduction_amount || 0))}` : "-"}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {Number(item.deduction_amount || 0) > 0 ? "Kantor / Warung" : "Bebas Kasbon"}
                      </span>
                    </div>
                  </div>

                  {/* Tombol Aksi */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(item)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Koreksi</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setViewingSlipItem(item)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Cetak Slip</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const text = `Halo ${workerName}, rincian slip upah periode ${activeRun?.period_start} s/d ${activeRun?.period_end}: Total Bersih ${formatRupiah(netAmt)}.`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
                      }}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all"
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

      {/* DAFTAR PEKERJA: OPERATOR BORONGAN */}
      {activeTab === "BORONGAN" && (
        <div className="space-y-3">
          {filteredOpItems.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 space-y-2">
              <Wrench className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-600">Tidak ada item operator borongan</p>
              <p className="text-[11px] text-slate-400">Pastikan Qty Sah Checker sudah difinalisasi.</p>
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
                      <span className="text-[9px] font-bold text-slate-400 block uppercase">Total Nilai Borongan</span>
                      <span className="text-base font-black text-amber-600">{formatRupiah(opVal)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Qty Sah Checker:</span>
                      <span className="font-black text-slate-700">{qty.toLocaleString("id-ID")} PCS</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Tarif Satuan:</span>
                      <span className="font-black text-slate-700">{formatRupiah(price)} / PCS</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Harga Setoran:</span>
                      <span className="font-bold text-slate-500">
                        {formatRupiah(Number(op.submission_price_snapshot || 0))}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEditOp(op)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Koreksi Qty / Harga</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const text = `Halo ${opName}, slip borongan ${spk} (${itemWork}): Qty Sah ${qty} PCS @ ${formatRupiah(price)} = Total ${formatRupiah(opVal)}.`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
                      }}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all"
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

      {/* MODAL KOREKSI HARIAN & BULANAN (DENGAN INPUT HARI & PRESET CEPAT) */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-base text-slate-800">
                    Koreksi: {editingItem.worker_name_snapshot || editingItem.workers?.name}
                  </h3>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                    {editingItem.pay_system_snapshot || editingItem.workers?.pay_system}
                  </span>
                </div>
                <span className="text-xs text-slate-400 font-medium">
                  {activeRun?.payout_no} • {activeRun?.period_start} s/d {activeRun?.period_end}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCorrection} className="space-y-4">
              {/* UANG MAKAN: CUKUP KETIK HARI / TAP TOMBOL */}
              <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="modal-input-hari-masuk" className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>Uang Makan Mingguan (Rp 50.000/Hari)</span>
                  </label>
                  <span className="text-xs font-black text-amber-800">
                    {formatRupiah(editMealAmount)}
                  </span>
                </div>

                <div>
                  <div className="relative">
                    <input
                      id="modal-input-hari-masuk"
                      type="number"
                      step="0.5"
                      min="0"
                      max="14"
                      value={editDays}
                      onChange={(e) => handleDaysChange(e.target.value)}
                      placeholder="Ketik jumlah hari (misal: 6)"
                      className="w-full bg-white border border-amber-300 text-slate-800 font-black text-base rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      Hari Hadir
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-700 font-medium block mt-1">
                    Ketik harinya (contoh: 6), otomatis dihitung Rp 300.000
                  </span>
                </div>

                {/* Preset 1-Tap */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Pilihan Cepat (1-Tap):
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleSetPresetDays(5)}
                      className={`py-1.5 px-2 rounded-lg font-bold text-xs border transition-all ${
                        editDays === "5"
                          ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                          : "bg-white text-slate-700 border-amber-200 hover:bg-amber-100"
                      }`}
                    >
                      5 Hari
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetPresetDays(6)}
                      className={`py-1.5 px-2 rounded-lg font-bold text-xs border transition-all ${
                        editDays === "6"
                          ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                          : "bg-white text-slate-700 border-amber-200 hover:bg-amber-100"
                      }`}
                    >
                      6 Hari
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetPresetDays(7)}
                      className={`py-1.5 px-2 rounded-lg font-bold text-xs border transition-all ${
                        editDays === "7"
                          ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                          : "bg-white text-slate-700 border-amber-200 hover:bg-amber-100"
                      }`}
                    >
                      7 Hari
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetPresetDays(0)}
                      className="py-1.5 px-2 rounded-lg font-bold text-xs bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200"
                    >
                      Reset 0
                    </button>
                  </div>
                </div>

                {/* Shortcut Shift Hari Minggu */}
                <button
                  type="button"
                  onClick={handleApplySundayShift}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-purple-100 text-purple-800 font-bold text-xs hover:bg-purple-200 transition-all border border-purple-200"
                >
                  <Zap className="w-3.5 h-3.5 text-purple-600" />
                  <span>+ Tambah Shift Lembur Minggu (8 Jam + Uang Makan)</span>
                </button>
              </div>

              {/* Gaji Pokok (Tetap 0 di Mingguan) */}
              <div className="space-y-1">
                <label htmlFor="modal-input-gaji-pokok" className="text-xs font-bold text-slate-600">Gaji Pokok (Rp)</label>
                <input
                  id="modal-input-gaji-pokok"
                  type="number"
                  value={editBaseAmount}
                  onChange={(e) => setEditBaseAmount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold text-xs rounded-xl px-3 py-2 outline-none"
                />
                <span className="text-[10px] text-slate-400">
                  Untuk siklus mingguan biarkan Rp 0 agar gaji pokok tidak keluar ganda.
                </span>
              </div>

              {/* Lembur & Manual */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
                <span className="text-xs font-black text-slate-700 block">Lembur & Jam Tambahan</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="modal-input-jam-manual" className="text-[10px] font-bold text-slate-500">Jam Lembur Manual</label>
                    <input
                      id="modal-input-jam-manual"
                      type="number"
                      step="0.5"
                      value={editManualOtHours}
                      onChange={(e) => {
                        const h = parseFloat(e.target.value) || 0;
                        setEditManualOtHours(h);
                        const rate = (editingItem?.workers?.monthly_salary || 0) / 190;
                        setEditManualOtAmount(Math.round(h * rate));
                      }}
                      className="w-full bg-white border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 mt-0.5"
                    />
                  </div>
                  <div>
                    <label htmlFor="modal-input-upah-lembur" className="text-[10px] font-bold text-slate-500">Upah Lembur (Rp)</label>
                    <input
                      id="modal-input-upah-lembur"
                      type="number"
                      value={editManualOtAmount}
                      onChange={(e) => setEditManualOtAmount(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 mt-0.5"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="modal-input-bonus-lembur" className="text-[10px] font-bold text-slate-500">Bonus Lembur (Rp)</label>
                    <input
                      id="modal-input-bonus-lembur"
                      type="number"
                      value={editOtBonus}
                      onChange={(e) => setEditOtBonus(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 mt-0.5"
                    />
                  </div>
                  <div>
                    <label htmlFor="modal-input-insentif-minggu" className="text-[10px] font-bold text-slate-500">Insentif Minggu (Rp)</label>
                    <input
                      id="modal-input-insentif-minggu"
                      type="number"
                      value={editHolidayBonus}
                      onChange={(e) => setEditHolidayBonus(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 mt-0.5"
                    />
                  </div>
                </div>
              </div>

              {/* Potongan Kasbon */}
              <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-3.5 space-y-2">
                <span className="text-xs font-black text-rose-800 block">Potongan Kasbon</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="modal-input-kasbon-kantor" className="text-[10px] font-bold text-rose-600">Kasbon Kantor (Rp)</label>
                    <input
                      id="modal-input-kasbon-kantor"
                      type="number"
                      value={editKasbonP}
                      onChange={(e) => setEditKasbonP(Number(e.target.value))}
                      className="w-full bg-white border border-rose-200 text-xs font-bold rounded-xl px-3 py-2 mt-0.5"
                    />
                  </div>
                  <div>
                    <label htmlFor="modal-input-kasbon-warung" className="text-[10px] font-bold text-rose-600">Kasbon Warung (Rp)</label>
                    <input
                      id="modal-input-kasbon-warung"
                      type="number"
                      value={editKasbonW}
                      onChange={(e) => setEditKasbonW(Number(e.target.value))}
                      className="w-full bg-white border border-rose-200 text-xs font-bold rounded-xl px-3 py-2 mt-0.5"
                    />
                  </div>
                </div>
              </div>

              {/* Preview Total Net */}
              <div className="bg-slate-900 text-white p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">
                    Take Home Pay (Bersih)
                  </span>
                  <span className="text-lg font-black text-emerald-400">
                    {formatRupiah(calculatedNet)}
                  </span>
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  <span>Bruto: {formatRupiah(calculatedTotalGross)}</span>
                  <span className="block text-rose-400">Pot: -{formatRupiah(calculatedTotalDeduction)}</span>
                </div>
              </div>

              {/* Tombol Simpan */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="flex-1 py-3 rounded-xl font-bold text-xs bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-2 w-full py-3 rounded-xl font-black text-xs bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20"
                >
                  {isPending ? "Menyimpan..." : "💾 Simpan Koreksi Gaji"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KOREKSI OPERATOR BORONGAN */}
      {editingOpItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <h3 className="font-black text-base text-slate-800">
                  Koreksi Borongan: {editingOpItem.worker_name_snapshot || editingOpItem.worker_name}
                </h3>
                <span className="text-xs text-slate-400">
                  {editingOpItem.spk_no} • {editingOpItem.work_item_name}
                </span>
              </div>
              <button onClick={() => setEditingOpItem(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOpCorrection} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block">Qty Sah Checker (PCS)</label>
                <input
                  type="number"
                  step="1"
                  value={editOpQty}
                  onChange={(e) => setEditOpQty(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-black text-sm rounded-xl px-3 py-2 mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block">Tarif Satuan Borongan (Rp/PCS)</label>
                <input
                  type="number"
                  value={editOpPrice}
                  onChange={(e) => setEditOpPrice(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-black text-sm rounded-xl px-3 py-2 mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block">Harga Setoran (Rp/PCS)</label>
                <input
                  type="number"
                  value={editOpSubPrice}
                  onChange={(e) => setEditOpSubPrice(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold text-sm rounded-xl px-3 py-2 mt-1"
                />
              </div>

              <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex justify-between items-center">
                <span className="text-xs text-slate-400 font-bold uppercase">Total Nilai Borongan</span>
                <span className="text-base font-black text-amber-400">
                  {formatRupiah(editOpQty * editOpPrice)}
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingOpItem(null)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-slate-100 text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-2 w-full py-2.5 rounded-xl font-black text-xs bg-amber-600 text-white hover:bg-amber-700 shadow-md"
                >
                  {isPending ? "Menyimpan..." : "💾 Simpan Borongan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CETAK SLIP GAJI */}
      {viewingSlipItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="text-center border-b pb-3 space-y-1">
              <h3 className="font-black text-base text-slate-800">SLIP PEMBAYARAN UPAH</h3>
              <p className="text-xs text-slate-500">
                {activeRun?.payout_no} • {activeRun?.period_start} s/d {activeRun?.period_end}
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-dashed">
                <span className="text-slate-500">Nama Pekerja</span>
                <span className="font-black text-slate-800">{viewingSlipItem.worker_name_snapshot || viewingSlipItem.workers?.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed">
                <span className="text-slate-500">Sistem Upah</span>
                <span className="font-bold text-slate-800">{viewingSlipItem.pay_system_snapshot}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed">
                <span className="text-slate-500">Gaji Pokok / Upah Hadir</span>
                <span className="font-bold text-slate-800">{formatRupiah(Number(viewingSlipItem.base_amount || 0))}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed">
                <span className="text-slate-500">Uang Makan</span>
                <span className="font-bold text-slate-800">{formatRupiah(Number(viewingSlipItem.meal_amount || 0))}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed">
                <span className="text-slate-500">Lembur & Insentif</span>
                <span className="font-bold text-slate-800">
                  {formatRupiah(Number(viewingSlipItem.overtime_amount || 0) + Number(viewingSlipItem.manual_overtime_amount || 0) + Number(viewingSlipItem.holiday_bonus || 0))}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed text-rose-600">
                <span>Potongan Kasbon</span>
                <span className="font-bold">-{formatRupiah(Number(viewingSlipItem.deduction_amount || 0))}</span>
              </div>
              <div className="flex justify-between pt-2 text-sm font-black text-emerald-600">
                <span>TOTAL DITERIMA (NET)</span>
                <span>{formatRupiah(Number(viewingSlipItem.net_amount || 0))}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setViewingSlipItem(null)}
                className="flex-1 py-2.5 rounded-xl font-bold text-xs bg-slate-100 text-slate-700"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-xs bg-blue-600 text-white shadow-md"
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
