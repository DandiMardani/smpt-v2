"use client";

import React, { useState, useTransition, useMemo } from "react";
import * as payrollActions from "@/lib/final/actions";
import { AdaptivePayrollDetail } from "./payroll-accordion-table";
import type { PayrollSettingsMap } from "./payroll-settings-modal";

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
  work_item_name_snapshot?: string;
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
  work_items?: { id: number; name: string; item_code?: string };
  [key: string]: any;
}

export type OperatorItem = OperatorItemRow;
export type OperatorRun = PayrollRunRow;

export interface CashAdvanceRow {
  id: number;
  worker_id: number;
  amount: number;
  paid_amount: number;
  category: "KASBON_PERUSAHAAN" | "KASBON_WARUNG" | string;
  warung_name?: string | null;
  installment_amount?: number | null;
  installment_count?: number | null;
  installments_paid?: number | null;
  status: string;
  notes?: string | null;
}

export interface Props {
  runs?: any[];
  currentRunId?: number;
  items?: any[];
  operatorRuns?: any[];
  operatorItems?: any[];
  settings?: PayrollSettingsMap;
  activeAdvances?: CashAdvanceRow[];
  workers?: WorkerInfo[];
  [key: string]: any;
}

export type PayrollSlipManagerProps = Props;

function normalizePhone(phone?: string | null): string {
  if (!phone) return "";
  let clean = phone.replace(/\D/g, "");
  if (clean.startsWith("0")) {
    clean = "62" + clean.slice(1);
  } else if (!clean.startsWith("62") && clean.length >= 8) {
    clean = "62" + clean;
  }
  return clean;
}

// Ikon Native SVG
const ChevronRight = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

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
  const {
    runs = [],
    currentRunId,
    items = [],
    operatorRuns = [],
    operatorItems = [],
    settings,
    activeAdvances = [],
    workers = [],
  } = props;

  const workerMap = useMemo(() => {
    const map = new Map<number, WorkerInfo>();
    for (const w of workers) {
      if (w && w.id) map.set(w.id, w);
    }
    return map;
  }, [workers]);
  const [isPending, startTransition] = useTransition();

  // Tab: Default ke GAJI BULANAN agar sinkron dengan tabel atas
  const [activeTab, setActiveTab] = useState<"BULANAN" | "UANG_MAKAN" | "HARIAN" | "BORONGAN">("BULANAN");
  const [selectedRunId, setSelectedRunId] = useState<number>(currentRunId || runs[0]?.id || 0);
  const [searchQuery, setSearchQuery] = useState("");

  const [viewingSlipItem, setViewingSlipItem] = useState<PayrollItemRow | null>(null);
  const [expandedCardIds, setExpandedCardIds] = useState<Set<number>>(new Set());

  const toggleCard = (id: number) => {
    setExpandedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleAllCards = () => {
    if (expandedCardIds.size === filteredItems.length) {
      setExpandedCardIds(new Set());
    } else {
      setExpandedCardIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const activeRun = runs.find((r) => r.id === selectedRunId) || runs[0];
  const isPaid =
    activeRun?.config_snapshot?.payment_status_code === "SUDAH_DIBAYAR" ||
    activeRun?.config_snapshot?.payment_status === "SUDAH DIBAYAR" ||
    String(activeRun?.notes || "").includes("SUDAH_DIBAYAR");

  const runItems: PayrollItemRow[] = items.filter((it: any) => it.payroll_run_id === activeRun?.id);

  // Filter Staf Bulanan & Harian
  const bulananRefNames = ["SURATNO", "DANDI MARDANI", "USMAN ALAMSYAH", "JAJANG ROSADI", "SUHERMANTO", "SUHERMAN", "NEDIH"];

  const filteredItems = runItems.filter((it) => {
    const matchedWorker = (it.worker_id ? workerMap.get(it.worker_id) : null) || it.workers;
    const workerName = String(it.worker_name_snapshot || matchedWorker?.name || "");
    const isKnownBulanan = bulananRefNames.some((bn) => workerName.toUpperCase().includes(bn));
    const paySystem = String(it.pay_system_snapshot || matchedWorker?.pay_system || (isKnownBulanan ? "BULANAN" : "")).toUpperCase();
    const isBulananWorker = paySystem === "BULANAN" || isKnownBulanan;

    let matchTab = false;
    if (activeTab === "BULANAN" || activeTab === "UANG_MAKAN") {
      matchTab = isBulananWorker;
    } else if (activeTab === "HARIAN") {
      matchTab = !isBulananWorker;
    }

    const code = String(it.worker_code_snapshot || matchedWorker?.code || "");
    return (
      matchTab &&
      (workerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
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
    const item = String(op.work_item_name || op.work_item_name_snapshot || op.work_items?.name || op.item_name || "");
    return (
      name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      spk.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  interface WorkerBoronganGroup {
    workerKey: string;
    workerId?: number;
    workerName: string;
    workerCode?: string;
    items: OperatorItemRow[];
    subtotalQty: number;
    subtotalValue: number;
  }

  const groupedBorongan: WorkerBoronganGroup[] = useMemo(() => {
    const map = new Map<string, WorkerBoronganGroup>();

    for (const op of filteredOpItems) {
      const opName = String(op.worker_name_snapshot || op.worker_name || op.workers?.name || "Operator").trim();
      const key = op.worker_id ? `id_${op.worker_id}` : `name_${opName.toLowerCase()}`;

      const qty = Number(op.qty_approved || 0);
      const price = Number(op.operator_price_snapshot || (op as any).operator_price || 0);
      const opVal = Number(op.operator_value ?? (op as any).operatorValue ?? (qty * price));

      if (!map.has(key)) {
        map.set(key, {
          workerKey: key,
          workerId: op.worker_id,
          workerName: opName,
          workerCode: op.workers?.worker_code || (op.workers as any)?.code,
          items: [],
          subtotalQty: 0,
          subtotalValue: 0,
        });
      }

      const grp = map.get(key)!;
      grp.items.push(op);
      grp.subtotalQty += qty;
      grp.subtotalValue += opVal;
    }

    return Array.from(map.values());
  }, [filteredOpItems]);

  const [expandedWorkerKeys, setExpandedWorkerKeys] = useState<Set<string>>(new Set());

  const toggleWorkerExpand = (key: string) => {
    setExpandedWorkerKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    if (expandedWorkerKeys.size === groupedBorongan.length) {
      setExpandedWorkerKeys(new Set());
    } else {
      setExpandedWorkerKeys(new Set(groupedBorongan.map((g) => g.workerKey)));
    }
  };

  const countBulanan = runItems.filter((i) => {
    const matchedWorker = (i.worker_id ? workerMap.get(i.worker_id) : null) || i.workers;
    const workerName = String(i.worker_name_snapshot || matchedWorker?.name || "");
    const isKnownBulanan = bulananRefNames.some((bn) => workerName.toUpperCase().includes(bn));
    const paySystem = String(i.pay_system_snapshot || matchedWorker?.pay_system || (isKnownBulanan ? "BULANAN" : "")).toUpperCase();
    return paySystem === "BULANAN" || isKnownBulanan;
  }).length;
  const countHarian = runItems.length - countBulanan;
  const countBorongan = filteredOpItems.length;
  const totalBoronganQty = filteredOpItems.reduce((acc, op) => acc + Number(op.qty_approved || 0), 0);
  const totalBoronganVal = filteredOpItems.reduce((acc, op) => {
    const qty = Number(op.qty_approved || 0);
    const price = Number(op.operator_price_snapshot || (op as any).operator_price || 0);
    return acc + Number(op.operator_value ?? (op as any).operatorValue ?? (qty * price));
  }, 0);

  const formatRupiah = (val: number | string) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(num);
  };

  const buildItemWhatsAppUrl = (
    item: PayrollItemRow,
    workerName: string,
    code: string,
    base: number,
    overtime: number,
    gross: number,
    kp: number,
    kw: number,
    denda: number,
    totalDed: number,
    bulananNet: number,
    mealAmt: number,
    totalDays: number
  ) => {
    const matchedWorker = (item.worker_id ? workerMap.get(item.worker_id) : null) || item.workers;
    const phone = normalizePhone(matchedWorker?.phone);

    // Ambil data kasbon pekerja
    const workerAdvances = (activeAdvances || []).filter(
      (adv) => Number(adv.worker_id) === Number(item.worker_id)
    );

    // 1. DETAIL KASBON KANTOR (ANGSURAN)
    const companyAdvances = workerAdvances.filter(
      (adv) => adv.category === "KASBON_PERUSAHAAN" || (!adv.category && !adv.warung_name)
    );
    const compAdv =
      companyAdvances.find((a) => Number(a.installment_count || 1) > 1) || companyAdvances[0];
    const instCount = compAdv ? Number(compAdv.installment_count || 1) : 1;
    const instPaid = compAdv ? Number(compAdv.installments_paid || 0) : 0;

    let kantorLine = `Pot. Kasbon Kantor: -${formatRupiah(kp)}`;
    if (instCount > 1) {
      const currentInst = isPaid ? Math.max(1, instPaid) : Math.min(instPaid + 1, instCount);
      kantorLine = `Pot. Kasbon Kantor (Angsuran ke-${currentInst} dari ${instCount}): -${formatRupiah(kp)}`;
    }

    // 2. DETAIL KASBON WARUNG (MAP/LOOP ARRAY RINCIAN PER WARUNG)
    const warungAdvances = workerAdvances.filter(
      (adv) => adv.category === "KASBON_WARUNG" || Boolean(adv.warung_name)
    );
    const warungGroupMap = new Map<string, number>();
    for (const adv of warungAdvances) {
      const wName = (adv.warung_name || "Warung").trim();
      const remaining = Math.max(0, Number(adv.amount || 0) - Number(adv.paid_amount || 0));
      const instAmt = Number(adv.installment_amount || 0);
      const targetAmt = instAmt > 0 && instAmt < remaining ? instAmt : remaining;
      const nominal = targetAmt > 0 ? targetAmt : Number(adv.amount || 0);
      warungGroupMap.set(wName, (warungGroupMap.get(wName) || 0) + nominal);
    }

    let warungLines: string[] = [];
    if (warungGroupMap.size > 0) {
      const entries = Array.from(warungGroupMap.entries());
      if (entries.length === 1 && kw > 0) {
        warungLines = [`Pot. ${entries[0][0]}: -${formatRupiah(kw)}`];
      } else {
        const totalMap = entries.reduce((acc, [, val]) => acc + val, 0);
        warungLines = entries.map(([wName, wAmt]) => {
          const displayAmt =
            totalMap > 0 && kw > 0 && totalMap !== kw ? Math.round((wAmt / totalMap) * kw) : wAmt;
          return `Pot. ${wName}: -${formatRupiah(displayAmt)}`;
        });
      }
    } else if (kw > 0) {
      warungLines = [`Pot. Kasbon Warung: -${formatRupiah(kw)}`];
    } else {
      warungLines = [`Pot. Kasbon Warung: -Rp 0`];
    }

    let noteMsg = "";
    if (activeTab === "BULANAN") {
      const lines = [
        `*SLIP GAJI RESMI PT. KREASI DINAMIKA MAJI BERSAMA*`,
        `Periode: ${activeRun?.period_start || "-"} s/d ${activeRun?.period_end || "-"}`,
        `Nama: ${workerName} (${code})`,
        `--------------------------------`,
        `Gaji Pokok: ${formatRupiah(base)}`,
        `Lembur: ${formatRupiah(overtime)}`,
        `Total Bruto: ${formatRupiah(gross)}`,
        kantorLine,
        ...warungLines,
        ...(denda > 0 ? [`Pot. Denda/Keterlambatan: -${formatRupiah(denda)}`] : []),
        `Total Potongan: -${formatRupiah(totalDed)}`,
        `--------------------------------`,
        `*GAJI BERSIH (THP): ${formatRupiah(bulananNet)}*`,
        ``,
        `Status: ${isPaid ? "LUNAS / TELAH DITRANSFER" : "DALAM PROSES"}`,
      ];
      noteMsg = lines.join("\n");
    } else if (activeTab === "HARIAN") {
      const harianNet = item.net_amount !== undefined ? Number(item.net_amount) : bulananNet;
      const lines = [
        `*SLIP GAJI RESMI PT. KREASI DINAMIKA MAJI BERSAMA*`,
        `Jenis: UPAH HARIAN`,
        `Periode: ${activeRun?.period_start || "-"} s/d ${activeRun?.period_end || "-"}`,
        `Nama: ${workerName} (${code})`,
        `--------------------------------`,
        `Upah Pokok (${totalDays} Hari): ${formatRupiah(base)}`,
        `Lembur: ${formatRupiah(overtime)}`,
        `Total Bruto: ${formatRupiah(gross)}`,
        kantorLine,
        ...warungLines,
        ...(denda > 0 ? [`Pot. Denda/Keterlambatan: -${formatRupiah(denda)}`] : []),
        `Total Potongan: -${formatRupiah(totalDed)}`,
        `--------------------------------`,
        `*GAJI BERSIH (THP): ${formatRupiah(harianNet)}*`,
        ``,
        `Status: ${isPaid ? "LUNAS / TELAH DITRANSFER" : "DALAM PROSES"}`,
      ];
      noteMsg = lines.join("\n");
    } else if (activeTab === "UANG_MAKAN") {
      const lines = [
        `*SLIP UANG MAKAN PT. KREASI DINAMIKA MAJI BERSAMA*`,
        `Periode: ${activeRun?.period_start || "-"} s/d ${activeRun?.period_end || "-"}`,
        `Nama: ${workerName} (${code})`,
        `--------------------------------`,
        `Kehadiran: ${totalDays} hari × Rp 50.000`,
        `*TOTAL DITERIMA: ${formatRupiah(mealAmt)}* (Bebas Potongan Kasbon)`,
        ``,
        `Status: ${isPaid ? "LUNAS / TELAH DITRANSFER" : "DALAM PROSES"}`,
      ];
      noteMsg = lines.join("\n");
    } else {
      noteMsg = `Halo ${workerName}, slip gaji periode ${activeRun?.period_start || "-"} s/d ${activeRun?.period_end || "-"}: Total Bersih ${formatRupiah(Number(item.net_amount || 0))}.`;
    }

    return phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(noteMsg)}`
      : `https://wa.me/?text=${encodeURIComponent(noteMsg)}`;
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

      {/* DAFTAR PEKERJA: BULANAN / UANG MAKAN / HARIAN (ACCORDION INTERAKTIF) */}
      {activeTab !== "BORONGAN" && (
        <div className="space-y-3">
          {/* Bar Kontrol Accordion Masal */}
          {filteredItems.length > 0 && (
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-500">
                Menampilkan {filteredItems.length} Pekerja ({activeTab === "BULANAN" ? "Bulanan" : activeTab === "UANG_MAKAN" ? "Uang Makan" : "Harian"})
              </span>
              <button
                type="button"
                onClick={handleToggleAllCards}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition cursor-pointer"
              >
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expandedCardIds.size === filteredItems.length ? "rotate-90 text-blue-600" : ""}`} />
                <span>{expandedCardIds.size === filteredItems.length ? "Tutup Semua Rincian" : "Buka Semua Rincian (Accordion)"}</span>
              </button>
            </div>
          )}

          {filteredItems.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 space-y-2">
              <Users className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-600">Tidak ada pekerja dalam kategori ini</p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const matchedWorker = (item.worker_id ? workerMap.get(item.worker_id) : null) || item.workers;
              const workerName = item.worker_name_snapshot || matchedWorker?.name || "Tanpa Nama";
              const code = item.worker_code_snapshot || matchedWorker?.worker_code || matchedWorker?.code || "-";
              const dept = item.department_snapshot || matchedWorker?.department || "PRODUKSI";

              // 1. Gaji Pokok Bulanan (Ambil gaji pokok master bila base_amount dari run mingguan bernilai 0)
              const bulananBase = Number(item.base_amount || item.monthly_salary_snapshot || matchedWorker?.monthly_salary || matchedWorker?.base_salary || 0);
              const base = activeTab === "BULANAN" ? bulananBase : Number(item.base_amount || 0);

              // 2. Lembur & Bonus
              const otMinutes = Number(item.overtime_minutes || 0) + (Number(item.manual_overtime_hours || 0) * 60);
              const hourlyRate = (activeTab === "BULANAN" && bulananBase > 0) ? Math.round((bulananBase / 190) * 100) / 100 : 0;
              const calculatedBulananOt = (activeTab === "BULANAN" && Number(item.overtime_amount || 0) === 0)
                ? Math.round((otMinutes / 60) * hourlyRate * 100) / 100
                : Number(item.overtime_amount || 0);

              const overtime = activeTab === "BULANAN"
                ? calculatedBulananOt + Number(item.manual_overtime_amount || 0)
                : (activeTab === "UANG_MAKAN" ? 0 : (Number(item.overtime_amount || 0) + Number(item.manual_overtime_amount || 0)));

              // Pada tab UANG_MAKAN: bonus/lembur wajib 0. Pada tab BULANAN: sertakan bonus lembur shift Rp 17.500
              const bonuses = activeTab === "UANG_MAKAN"
                ? 0
                : (Number(item.overtime_bonus || 0) + Number(item.holiday_bonus || 0));

              // 3. Kasbon & Potongan
              const kp = activeTab === "UANG_MAKAN" ? 0 : Number(item.kasbon_perusahaan_amount || 0);
              const kw = activeTab === "UANG_MAKAN" ? 0 : Number(item.kasbon_warung_amount || 0);
              const denda = activeTab === "UANG_MAKAN" ? 0 : Number(item.late_deduction_amount || item.denda_amount || item.late_deduction || 0);
              const totalDed = activeTab === "UANG_MAKAN" ? 0 : (kp + kw + denda);

              // 4. Mode Uang Makan vs Gaji Bulanan
              const mealAmt = Number(item.meal_amount || 0);
              const totalDays = Number(item.full_days || 0) + Number(item.half_days || 0) * 0.5 || (mealAmt > 0 ? Math.round((mealAmt / 50000) * 10) / 10 : 0);

              // 5. THP (Bebas Uang Makan untuk Gaji Bulanan!)
              const gross = activeTab === "BULANAN" ? (base + overtime + bonuses) : (base + mealAmt + overtime + bonuses);
              const bulananNet = Math.max(0, (base + overtime + bonuses) - totalDed);
              const netThp = activeTab === "UANG_MAKAN" ? mealAmt : bulananNet;

              // HIDE KARTU KOSONG (ZERO STATE):
              if (base === 0 && overtime === 0 && bonuses === 0 && netThp === 0 && mealAmt === 0) {
                return null;
              }

              const isExpanded = expandedCardIds.has(item.id);

              // Item khusus yang disuapkan ke AdaptivePayrollDetail dan Popup Cetak Slip
              const itemForDetail: PayrollItemRow = {
                ...item,
                worker_name_snapshot: workerName,
                worker_code_snapshot: code,
                department_snapshot: dept,
                base_amount: base,
                monthly_salary_snapshot: bulananBase,
                overtime_amount: overtime,
                overtime_bonus: bonuses,
                meal_amount: activeTab === "BULANAN" ? 0 : mealAmt,
                kasbon_perusahaan_amount: kp,
                kasbon_warung_amount: kw,
                deduction_amount: totalDed,
                net_amount: netThp,
              };

              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-3xl border transition-all ${
                    isExpanded
                      ? "border-blue-300 shadow-md ring-2 ring-blue-100"
                      : "border-slate-200 shadow-sm hover:border-slate-300"
                  }`}
                >
                  {/* HEADER KARTU (ACCORDION TOGGLE) */}
                  <div
                    onClick={() => toggleCard(item.id)}
                    className="p-4 sm:p-5 cursor-pointer flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 select-none"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCard(item.id);
                        }}
                        className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                          isExpanded
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        }`}
                        title={isExpanded ? "Tutup rincian perhitungan" : "Buka rincian perhitungan adaptif"}
                      >
                        <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-90 text-white" : ""}`} />
                      </button>
                      <div className="space-y-0.5">
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
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 pl-10 sm:pl-0">
                      {!isExpanded && (
                        <div className="hidden md:flex items-center gap-3 text-[11px] text-slate-500 font-medium border-r border-slate-100 pr-4">
                          <div>Pokok: <b className="text-slate-800">{formatRupiah(activeTab === "UANG_MAKAN" ? mealAmt : base)}</b></div>
                          <div>Lembur: <b className="text-slate-800">{formatRupiah(activeTab === "UANG_MAKAN" ? 0 : overtime)}</b></div>
                          <div>Pot: <b className="text-rose-600">-{formatRupiah(activeTab === "UANG_MAKAN" ? 0 : totalDed)}</b></div>
                        </div>
                      )}
                      <div className="text-right">
                        <span className="text-[9px] font-bold text-slate-400 block uppercase">
                          {activeTab === "UANG_MAKAN" ? "Uang Makan Net" : "Gaji Bersih (THP)"}
                        </span>
                        <span className="text-base font-black text-emerald-600">
                          {formatRupiah(netThp)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* KONTEN RINCIAN PERHITUNGAN ADAPTIF (ACCORDION BODY) */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5 space-y-4 rounded-b-3xl">
                      <AdaptivePayrollDetail
                        item={itemForDetail}
                        worker={matchedWorker || item.workers}
                        settings={settings || activeRun?.config_snapshot}
                        type={activeTab as any}
                      />

                      {/* AKSI CETAK & SHARE WA */}
                      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200/60">
                        <button
                          type="button"
                          onClick={() => setViewingSlipItem(itemForDetail)}
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>{activeTab === "BULANAN" ? "Cetak Slip Gaji" : "Cetak Bukti"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const waUrl = buildItemWhatsAppUrl(
                              itemForDetail,
                              workerName,
                              code,
                              base,
                              overtime,
                              gross,
                              kp,
                              kw,
                              denda,
                              totalDed,
                              bulananNet,
                              mealAmt,
                              totalDays
                            );
                            window.open(waUrl, "_blank");
                          }}
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs transition-all cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Kirim WA</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* DAFTAR PEKERJA: BORONGAN */}
      {activeTab === "BORONGAN" && (
        <div className="space-y-4">
          {/* Header & Statistik Khusus Pekerja Borongan */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-amber-200/60 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-amber-600 px-2.5 py-0.5 text-xs font-black text-white">
                    BORONGAN
                  </span>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Tabel Rekapitulasi Pekerja Borongan
                  </h3>
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Perhitungan resmi berdasarkan <b>Qty Sah Checker × Tarif Harga Operator</b> (Bebas dari Harga Pengajuan).
                </p>
              </div>
              <div className="flex items-center gap-3">
                {groupedBorongan.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExpandAll}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 shadow-2xs hover:bg-amber-100 transition cursor-pointer"
                  >
                    <span>{expandedWorkerKeys.size === groupedBorongan.length ? "Tutup Semua Rincian" : "Buka Semua Rincian"}</span>
                  </button>
                )}
                <div className="text-left sm:text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Upah Operator</span>
                  <span className="text-lg sm:text-xl font-black text-amber-700">{formatRupiah(totalBoronganVal)}</span>
                </div>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="rounded-xl border border-amber-200/80 bg-white p-2.5">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Total Operator</span>
                <span className="text-sm font-black text-slate-800">{groupedBorongan.length} Pekerja</span>
              </div>
              <div className="rounded-xl border border-amber-200/80 bg-white p-2.5">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Total Item / SPK</span>
                <span className="text-sm font-black text-slate-800">{filteredOpItems.length} Catatan</span>
              </div>
              <div className="rounded-xl border border-amber-200/80 bg-white p-2.5">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Total Qty Disetor</span>
                <span className="text-sm font-black text-slate-800">{totalBoronganQty.toLocaleString("id-ID")} PCS</span>
              </div>
              <div className="col-span-2 sm:col-span-1 rounded-xl border border-amber-200/80 bg-white p-2.5">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">Dasar Tarif</span>
                <span className="text-sm font-black text-emerald-700">100% Harga Operator</span>
              </div>
            </div>
          </div>

          {groupedBorongan.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 space-y-2">
              <Wrench className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-600">Tidak ada data rincian pekerjaan borongan untuk filter ini.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase font-extrabold text-[10px] tracking-wider">
                  <tr>
                    <th className="px-3 py-3 text-center w-12">Rincian</th>
                    <th className="px-3.5 py-3 text-center w-12">No</th>
                    <th className="px-3.5 py-3">Nama Pekerja (Operator)</th>
                    <th className="px-3.5 py-3 text-center">Jumlah Item SPK</th>
                    <th className="px-3.5 py-3 text-right">Sub-Total Qty Sah</th>
                    <th className="px-3.5 py-3 text-right">Sub-Total Upah Operator</th>
                    <th className="px-3.5 py-3 text-center w-28">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {groupedBorongan.map((group, idx) => {
                    const isExpanded = expandedWorkerKeys.has(group.workerKey);

                    return (
                      <React.Fragment key={group.workerKey}>
                        {/* Baris Utama / Ringkasan per Pekerja */}
                        <tr
                          onClick={() => toggleWorkerExpand(group.workerKey)}
                          className={`cursor-pointer transition-colors ${
                            isExpanded ? "bg-amber-50/40 hover:bg-amber-50/60" : "hover:bg-slate-50/80"
                          }`}
                        >
                          <td className="px-3 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleWorkerExpand(group.workerKey);
                              }}
                              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                isExpanded
                                  ? "bg-amber-100 border-amber-300 text-amber-900"
                                  : "bg-white border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                              }`}
                              title={isExpanded ? "Tutup rincian SPK" : "Buka rincian SPK"}
                            >
                              <ChevronRight
                                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                  isExpanded ? "rotate-90 text-amber-700" : ""
                                }`}
                              />
                            </button>
                          </td>
                          <td className="px-3.5 py-2.5 text-center text-slate-400 font-bold">{idx + 1}</td>
                          <td className="px-3.5 py-2.5 font-bold text-slate-900">
                            <div className="flex items-center gap-2">
                              <span>{group.workerName}</span>
                              {group.workerCode ? (
                                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                                  {group.workerCode}
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 text-center">
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                              📑 {group.items.length} Item SPK
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-black text-slate-800">
                            {group.subtotalQty.toLocaleString("id-ID")} PCS
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-black text-amber-700 bg-amber-50/40 text-sm">
                            {formatRupiah(group.subtotalValue)}
                          </td>
                          <td className="px-3.5 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                const opWorker = group.workerId ? workerMap.get(group.workerId) : null;
                                const phone = normalizePhone(opWorker?.phone);
                                const summaryText =
                                  `*SLIP UPAH BORONGAN — PT. KREASI DINAMIKA MAJI BERSAMA*\n` +
                                  `Nama Operator: ${group.workerName}\n` +
                                  `Periode: ${activeRun?.period_start || "-"} s/d ${activeRun?.period_end || "-"}\n` +
                                  `--------------------------------\n` +
                                  group.items
                                    .map(
                                      (it, i) =>
                                        `${i + 1}. [${it.spk_no || it.order_no || "SPK"}] ${
                                          it.work_item_name ||
                                          it.work_item_name_snapshot ||
                                          it.work_items?.name ||
                                          it.item_name ||
                                          "Item SPK"
                                        }: ${Number(it.qty_approved || 0).toLocaleString("id-ID")} PCS @ ${formatRupiah(
                                          Number(it.operator_price_snapshot || (it as any).operator_price || 0)
                                        )} = ${formatRupiah(
                                          Number(
                                            it.operator_value ??
                                              (it as any).operatorValue ??
                                              Number(it.qty_approved || 0) * Number(it.operator_price_snapshot || 0)
                                          )
                                        )}`
                                    )
                                    .join("\n") +
                                  `\n--------------------------------\n` +
                                  `*TOTAL QTY: ${group.subtotalQty.toLocaleString("id-ID")} PCS*\n` +
                                  `*TOTAL UPAH: ${formatRupiah(group.subtotalValue)}*\n\n` +
                                  `Status: ${isPaid ? "LUNAS / TELAH DITRANSFER" : "DALAM PROSES"}`;
                                const waUrl = phone
                                  ? `https://wa.me/${phone}?text=${encodeURIComponent(summaryText)}`
                                  : `https://wa.me/?text=${encodeURIComponent(summaryText)}`;
                                window.open(waUrl, "_blank");
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer"
                              title="Kirim Rekapitulasi via WhatsApp"
                            >
                              <Send className="w-3 h-3" />
                              <span>Kirim WA</span>
                            </button>
                          </td>
                        </tr>

                        {/* Baris Expandable: Rincian Item Pekerjaan Asli dari SPK */}
                        {isExpanded && (
                          <tr className="bg-amber-50/20">
                            <td colSpan={7} className="p-0">
                              <div className="px-4 py-3 sm:px-6 border-y border-amber-200/60 bg-amber-50/30">
                                <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                                  <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between">
                                    <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                                      🔧 Rincian Item SPK Borongan ({group.items.length} item) — <b className="text-amber-800">{group.workerName}</b>
                                    </span>
                                    <span className="text-[10px] font-medium text-slate-500">
                                      Sub-Total: <b className="text-amber-700">{formatRupiah(group.subtotalValue)}</b> ({group.subtotalQty.toLocaleString("id-ID")} PCS)
                                    </span>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                      <thead className="bg-slate-100/70 text-[10px] font-bold uppercase text-slate-600 border-b border-slate-200">
                                        <tr>
                                          <th className="px-3 py-2 text-center w-8">#</th>
                                          <th className="px-3 py-2 w-32">No. SPK</th>
                                          <th className="px-3 py-2">Item Pekerjaan</th>
                                          <th className="px-3 py-2 text-right">Qty Sah</th>
                                          <th className="px-3 py-2 text-right">Harga Satuan</th>
                                          <th className="px-3 py-2 text-right">Nilai Operator</th>
                                          <th className="px-3 py-2 text-center w-20">Aksi</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 font-medium">
                                        {group.items.map((op, itemIdx) => {
                                          const spk = op.spk_no || op.order_no || "SPK-REGULER";
                                          const itemWork =
                                            op.work_item_name ||
                                            op.work_item_name_snapshot ||
                                            op.work_items?.name ||
                                            op.item_name ||
                                            (op.work_item_id ? `Item #${op.work_item_id}` : "Item SPK");
                                          const itemQty = Number(op.qty_approved || 0);
                                          const itemPrice = Number(op.operator_price_snapshot || (op as any).operator_price || 0);
                                          const itemVal = Number(
                                            op.operator_value ?? (op as any).operatorValue ?? itemQty * itemPrice
                                          );

                                          return (
                                            <tr key={op.id ?? itemIdx} className="hover:bg-amber-50/30 transition-colors">
                                              <td className="px-3 py-2 text-center text-slate-400 font-bold">{itemIdx + 1}</td>
                                              <td className="px-3 py-2 whitespace-nowrap">
                                                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-200">
                                                  {spk}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2 font-semibold text-slate-800">
                                                {itemWork}
                                              </td>
                                              <td className="px-3 py-2 text-right font-black text-slate-900 whitespace-nowrap">
                                                {itemQty.toLocaleString("id-ID")} PCS
                                              </td>
                                              <td className="px-3 py-2 text-right font-medium text-slate-600 whitespace-nowrap">
                                                {formatRupiah(itemPrice)}
                                              </td>
                                              <td className="px-3 py-2 text-right font-black text-amber-700 bg-amber-50/20 whitespace-nowrap">
                                                {formatRupiah(itemVal)}
                                              </td>
                                              <td className="px-3 py-2 text-center whitespace-nowrap">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const opWorker = group.workerId ? workerMap.get(group.workerId) : null;
                                                    const phone = normalizePhone(opWorker?.phone);
                                                    const text = `Halo ${group.workerName}, rincian SPK ${spk} (${itemWork}): Qty Sah ${itemQty.toLocaleString("id-ID")} PCS @ ${formatRupiah(itemPrice)} = Total Upah ${formatRupiah(itemVal)}.`;
                                                    const waUrl = phone
                                                      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
                                                      : `https://wa.me/?text=${encodeURIComponent(text)}`;
                                                    window.open(waUrl, "_blank");
                                                  }}
                                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-2xs hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer"
                                                  title="Kirim rincian item ini via WhatsApp"
                                                >
                                                  <Send className="w-2.5 h-2.5" />
                                                  <span>WA</span>
                                                </button>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                      <tfoot className="bg-slate-50 font-bold text-slate-800 border-t border-slate-200 text-[11px]">
                                        <tr>
                                          <td colSpan={3} className="px-3 py-1.5 text-slate-600 uppercase text-[10px]">
                                            Sub-Total ({group.items.length} item)
                                          </td>
                                          <td className="px-3 py-1.5 text-right text-slate-400 font-normal">
                                            -
                                          </td>
                                          <td className="px-3 py-1.5 text-right text-slate-400">-</td>
                                          <td className="px-3 py-1.5 text-right font-black text-amber-800">
                                            {formatRupiah(group.subtotalValue)}
                                          </td>
                                          <td></td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-100/90 font-black text-slate-900 border-t-2 border-slate-300">
                  <tr>
                    <td colSpan={3} className="px-3.5 py-3 uppercase text-[11px] tracking-wider text-slate-600">
                      TOTAL ({groupedBorongan.length} Operator · {filteredOpItems.length} Item Borongan)
                    </td>
                    <td className="px-3.5 py-3 text-center text-xs text-slate-600">
                      {filteredOpItems.length} Catatan
                    </td>
                    <td className="px-3.5 py-3 text-right text-slate-900">
                      {totalBoronganQty.toLocaleString("id-ID")} PCS
                    </td>
                    <td className="px-3.5 py-3 text-right text-amber-800 text-sm bg-amber-100/70">
                      {formatRupiah(totalBoronganVal)}
                    </td>
                    <td className="px-3.5 py-3 text-center">-</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL CETAK SLIP RESMI CV. SMPT */}
      {viewingSlipItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 space-y-4 shadow-xl border border-slate-200">
            <div className="text-center border-b pb-3 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 block">
                PT. KREASI DINAMIKA MAJI BERSAMA
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

              {activeTab !== "UANG_MAKAN" ? (
                <>
                  <div className="flex justify-between py-1 border-b border-dashed">
                    <span className="text-slate-500">
                      {activeTab === "BULANAN" ? "Gaji Pokok Bulanan" : `Upah Pokok (${Number(viewingSlipItem.full_days || 0)} Hari)`}
                    </span>
                    <span className="font-bold text-slate-800">
                      {formatRupiah(Number(viewingSlipItem.base_amount || viewingSlipItem.monthly_salary_snapshot || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-dashed">
                    <span className="text-slate-500">Upah Lembur</span>
                    <span className="font-bold text-slate-800">
                      {formatRupiah(
                        Number(viewingSlipItem.overtime_amount || 0) +
                        Number(viewingSlipItem.manual_overtime_amount || 0)
                      )}
                    </span>
                  </div>
                  {(Number(viewingSlipItem.overtime_bonus || 0) > 0 || Number(viewingSlipItem.holiday_bonus || 0) > 0) && (
                    <div className="flex justify-between py-1 border-b border-dashed text-amber-700">
                      <span>Bonus & Insentif Lembur/Libur</span>
                      <span className="font-bold">
                        +{formatRupiah(
                          Number(viewingSlipItem.overtime_bonus || 0) +
                          Number(viewingSlipItem.holiday_bonus || 0)
                        )}
                      </span>
                    </div>
                  )}
                  {(() => {
                    const kp = Number(viewingSlipItem.kasbon_perusahaan_amount || 0);
                    return (
                      <div className="flex justify-between py-1 border-b border-dashed text-rose-600">
                        <span>Potongan Kasbon Kantor</span>
                        <span className="font-bold">
                          {kp > 0 ? `-${formatRupiah(kp)}` : "Rp 0"}
                        </span>
                      </div>
                    );
                  })()}
                  {(() => {
                    const kw = Number(viewingSlipItem.kasbon_warung_amount || 0);
                    return (
                      <div className="flex justify-between py-1 border-b border-dashed text-amber-600">
                        <span>Potongan Kasbon Warung</span>
                        <span className="font-bold">
                          {kw > 0 ? `-${formatRupiah(kw)}` : "Rp 0"}
                        </span>
                      </div>
                    );
                  })()}
                  {(() => {
                    const denda = Number(
                      viewingSlipItem.late_deduction_amount ||
                      viewingSlipItem.denda_amount ||
                      viewingSlipItem.late_deduction ||
                      0
                    );
                    return (
                      <div className="flex justify-between py-1 border-b border-dashed text-rose-600">
                        <span>Potongan Denda</span>
                        <span className="font-bold">
                          {denda > 0 ? `-${formatRupiah(denda)}` : "Rp 0"}
                        </span>
                      </div>
                    );
                  })()}
                  <div className="flex justify-between pt-2.5 text-sm font-black text-emerald-700 bg-emerald-50/60 p-2 rounded-xl">
                    <span>TOTAL DITERIMA (THP)</span>
                    <span>
                      {formatRupiah(
                        Number(viewingSlipItem.net_amount) ||
                        Math.max(
                          0,
                          Number(viewingSlipItem.base_amount || viewingSlipItem.monthly_salary_snapshot || 0) +
                          Number(viewingSlipItem.overtime_amount || 0) +
                          Number(viewingSlipItem.manual_overtime_amount || 0) +
                          Number(viewingSlipItem.overtime_bonus || 0) +
                          Number(viewingSlipItem.holiday_bonus || 0) -
                          Number(viewingSlipItem.kasbon_perusahaan_amount || 0) -
                          Number(viewingSlipItem.kasbon_warung_amount || 0) -
                          Number(
                            viewingSlipItem.late_deduction_amount ||
                            viewingSlipItem.denda_amount ||
                            viewingSlipItem.late_deduction ||
                            0
                          )
                        )
                      )}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between pt-2 text-sm font-black text-emerald-600">
                  <span>TOTAL DITERIMA</span>
                  <span>{formatRupiah(Number(viewingSlipItem.meal_amount || 0))}</span>
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
