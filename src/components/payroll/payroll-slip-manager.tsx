"use client";

import { useMemo, useRef, useState } from "react";
import { money, qty } from "@/lib/final/final-utils";
import {
  updatePayrollItemAction,
  updateOperatorPayrollItemAction,
  togglePayrollPaymentStatusAction,
} from "@/lib/final/actions";

export type PayrollRunRow = {
  id: number;
  payroll_code: string;
  payroll_type: string;
  period_start: string;
  period_end: string;
  status: string;
  total_gross: number | string;
  total_deduction: number | string;
  total_net: number | string;
  notes?: string | null;
  config_snapshot?: any;
};

export type PayrollItemRow = {
  id: number;
  payroll_run_id: number;
  worker_id: number;
  worker_name_snapshot: string;
  pay_system_snapshot: string;
  daily_wage_snapshot: number | string;
  monthly_salary_snapshot: number | string;
  full_days: number | string;
  half_days: number | string;
  overtime_minutes: number;
  base_amount: number | string;
  meal_amount: number | string;
  overtime_amount: number | string;
  overtime_bonus: number | string;
  holiday_bonus?: number | string;
  holiday_manual_amount?: number | string;
  kasbon_perusahaan_amount?: number | string;
  kasbon_warung_amount?: number | string;
  manual_overtime_hours?: number | string;
  manual_overtime_amount?: number | string;
  deduction_amount: number | string;
  net_amount: number | string;
};

export type OperatorRunRow = {
  id: number;
  payroll_code: string;
  period_start: string;
  period_end: string;
  status: string;
  total_operator_value: number | string;
  total_submission_value: number | string;
  notes?: string | null;
};

export type OperatorItemRow = {
  id: number;
  run_id: number;
  worker_id: number;
  work_item_id?: number;
  worker_name_snapshot: string;
  work_item_name_snapshot: string;
  qty_approved: number | string;
  operator_price_snapshot: number | string;
  submission_price_snapshot: number | string;
  operator_value: number | string;
  submission_value: number | string;
};

export type WorkerInfo = {
  id: number;
  worker_code: string;
  name: string;
  phone?: string | null;
  department?: string | null;
  position?: string | null;
  identity_no?: string | null;
  pay_system?: string | null;
};

type Props = {
  runs: PayrollRunRow[];
  items: PayrollItemRow[];
  operatorRuns?: OperatorRunRow[];
  operatorItems?: OperatorItemRow[];
  workers: WorkerInfo[];
  currentWorkerId?: number | null;
  canWrite?: boolean;
};

export type GroupedOperatorWorker = {
  workerId: number;
  workerName: string;
  workerCode: string;
  department: string;
  phone?: string | null;
  identityNo?: string | null;
  items: OperatorItemRow[];
  totalQty: number;
  totalOperatorValue: number;
  totalSubmissionValue: number;
};

function num(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function normalizePhone(raw?: string | null): string {
  if (!raw) return "";
  const cleaned = raw.replace(/\D/g, "");
  if (cleaned.startsWith("0")) return "62" + cleaned.slice(1);
  if (cleaned.startsWith("8")) return "62" + cleaned;
  return cleaned;
}

function getPeriodDescription(start: string, end: string, type: string): string {
  if (type === "BULANAN") {
    return `${start} s/d ${end} (Bulan Penuh)`;
  }
  if (type === "MINGGUAN") {
    return `${start} s/d ${end} (Siklus Sabtu–Jumat)`;
  }
  if (type === "BORONGAN") {
    return `${start} s/d ${end} (Siklus Jumat–Kamis)`;
  }
  return `${start} s/d ${end}`;
}

function getRunPaymentStatus(run?: { status?: string; config_snapshot?: any; notes?: string | null }): "SUDAH DIBAYAR" | "BELUM DIBAYAR" {
  if (!run) return "BELUM DIBAYAR";
  if (run.config_snapshot?.payment_status === "SUDAH_DIBAYAR") return "SUDAH DIBAYAR";
  if (run.config_snapshot?.payment_status === "BELUM_DIBAYAR") return "BELUM DIBAYAR";
  if (/\[STATUS:\s*SUDAH_DIBAYAR\]/i.test(run.notes || "")) return "SUDAH DIBAYAR";
  if (/\[STATUS:\s*BELUM_DIBAYAR\]/i.test(run.notes || "")) return "BELUM DIBAYAR";
  if (run.status === "PAID" || run.status === "FINAL") return "SUDAH DIBAYAR";
  return "BELUM DIBAYAR";
}

function getSlipTitle(run: PayrollRunRow, item: PayrollItemRow): string {
  const type = (run.payroll_type || "").toUpperCase();
  const wage = (item.pay_system_snapshot || "").toUpperCase();
  if (type === "BULANAN" || wage === "BULANAN") return "SLIP GAJI BULANAN";
  if (wage === "HARIAN") return "SLIP GAJI HARIAN";
  return "SLIP UANG MAKAN MINGGUAN";
}

function generateWhatsAppText(run: PayrollRunRow, item: PayrollItemRow, worker?: WorkerInfo): string {
  const title = getSlipTitle(run, item);
  const otHours = (num(item.overtime_minutes) / 60).toFixed(1);
  const manualOt = num(item.manual_overtime_amount);
  const totalOt = num(item.overtime_amount) + manualOt;
  const bonus = num(item.overtime_bonus) + num(item.holiday_bonus) + num(item.holiday_manual_amount);
  const paymentStatus = getRunPaymentStatus(run);

  const kasbonPerusahaan = num(item.kasbon_perusahaan_amount);
  const kasbonWarung = num(item.kasbon_warung_amount);
  const totalDeduction = num(item.deduction_amount) || (kasbonPerusahaan + kasbonWarung);
  const periodDesc = getPeriodDescription(run.period_start, run.period_end, run.payroll_type);

  return [
    `*${title}*`,
    `*PT KREASI DINAMIKA MAJU BERSAMA*`,
    `=============================`,
    `👤 *Nama:* ${item.worker_name_snapshot}`,
    `🆔 *ID:* ${worker?.worker_code || `PKR-${item.worker_id}`}${worker?.identity_no ? ` | NIK: ${worker.identity_no}` : ""}`,
    `🏢 *Bagian:* ${worker?.department || worker?.position || "-"}`,
    `💼 *Sistem Upah:* ${item.pay_system_snapshot}`,
    `📅 *Periode Gaji:* ${periodDesc}`,
    `🧾 *No. Payout:* ${run.payroll_code}`,
    `💳 *Status Bayar:* ${paymentStatus === "SUDAH DIBAYAR" ? "✅ SUDAH DIBAYAR (LUNAS)" : "⏳ BELUM DIBAYAR (PROSES)"}`,
    `=============================`,
    `*RINCIAN PENERIMAAN:*`,
    `• Kehadiran: ${num(item.full_days)} Full Day, ${num(item.half_days)} Half Day`,
    `• Gaji / Upah Pokok: ${money(item.base_amount)}`,
    num(item.meal_amount) > 0 ? `• Uang Makan Minggu: ${money(item.meal_amount)}` : null,
    totalOt > 0 ? `• Lembur (${otHours} jam${manualOt > 0 ? ` + Manual ${money(manualOt)}` : ""}): ${money(totalOt)}` : null,
    bonus > 0 ? `• Bonus / Insentif: ${money(bonus)}` : null,
    `-----------------------------`,
    `*Total Bruto:* ${money(num(item.base_amount) + num(item.meal_amount) + totalOt + bonus)}`,
    ``,
    `*POTONGAN KASBON & LAINNYA:*`,
    kasbonPerusahaan > 0 ? `• Kasbon Perusahaan (Cicilan): -${money(kasbonPerusahaan)}` : null,
    kasbonWarung > 0 ? `• Kasbon Warung Luar: -${money(kasbonWarung)}` : null,
    (kasbonPerusahaan === 0 && kasbonWarung === 0 && totalDeduction > 0) ? `• Potongan Kasbon: -${money(totalDeduction)}` : null,
    totalDeduction > 0 && (kasbonPerusahaan > 0 || kasbonWarung > 0) ? `• Total Seluruh Potongan: -${money(totalDeduction)}` : null,
    `=============================`,
    `*TOTAL DITERIMA (NET): ${money(item.net_amount)}*`,
    `=============================`,
    `_Slip ini diterbitkan resmi secara otomatis oleh Sistem SMPT V2._`,
    `_Harap simpan pesan ini sebagai bukti sah pembayaran upah._`,
  ]
    .filter(Boolean)
    .join("\n");
}

function generateOperatorWhatsAppText(run: OperatorRunRow, workerGroup: GroupedOperatorWorker): string {
  const paymentStatus = getRunPaymentStatus(run);
  const periodDesc = getPeriodDescription(run.period_start, run.period_end, "BORONGAN");

  return [
    `*SLIP UPAH BORONGAN*`,
    `*PT KREASI DINAMIKA MAJU BERSAMA*`,
    `=============================`,
    `👤 *Nama:* ${workerGroup.workerName}`,
    `🆔 *ID:* ${workerGroup.workerCode}${workerGroup.identityNo ? ` | NIK: ${workerGroup.identityNo}` : ""}`,
    `🏢 *Bagian:* ${workerGroup.department || "PRODUKSI"}`,
    `💼 *Sistem Upah:* BORONGAN`,
    `📅 *Periode Kerja:* ${periodDesc}`,
    `🧾 *No. Payout:* ${run.payroll_code}`,
    `💳 *Status Bayar:* ${paymentStatus === "SUDAH DIBAYAR" ? "✅ SUDAH DIBAYAR (LUNAS)" : "⏳ BELUM DIBAYAR"}`,
    `=============================`,
    `*RINCIAN HASIL KERJA BORONGAN:*`,
    ...workerGroup.items.map(
      (it) => `• ${it.work_item_name_snapshot}: ${qty(it.qty_approved)} PCS @ ${money(it.operator_price_snapshot)} = ${money(it.operator_value)}`
    ),
    `-----------------------------`,
    `*Total Qty Sah:* ${qty(workerGroup.totalQty)} PCS`,
    `=============================`,
    `*TOTAL DITERIMA (NET): ${money(workerGroup.totalOperatorValue)}*`,
    `=============================`,
    `_Slip ini diterbitkan resmi secara otomatis oleh Sistem SMPT V2._`,
    `_Harap simpan pesan ini sebagai bukti sah pembayaran upah borongan._`,
  ].join("\n");
}

export function PayrollSlipManager({
  runs,
  items,
  operatorRuns = [],
  operatorItems = [],
  workers,
  currentWorkerId,
  canWrite = false,
}: Props) {
  // Mode Kategori Tab: HARIAN (Mingguan) | BULANAN | BORONGAN
  const defaultCategory = useMemo<"HARIAN" | "BULANAN" | "BORONGAN">(() => {
    if (currentWorkerId) {
      const w = workers.find((x) => x.id === currentWorkerId);
      if (w?.pay_system === "BULANAN") return "BULANAN";
      if (w?.pay_system === "BORONGAN") return "BORONGAN";
      return "HARIAN";
    }
    if (runs.some((r) => r.payroll_type === "BULANAN")) return "BULANAN";
    return "HARIAN";
  }, [currentWorkerId, workers, runs]);

  const [activeCategory, setActiveCategory] = useState<"HARIAN" | "BULANAN" | "BORONGAN">(defaultCategory);

  // Selected general run
  const initialGeneralRunId = useMemo(() => {
    const matched = runs.filter((r) =>
      activeCategory === "BULANAN" ? r.payroll_type === "BULANAN" : r.payroll_type === "MINGGUAN"
    );
    return matched[0]?.id || runs[0]?.id || 0;
  }, [runs, activeCategory]);

  const [selectedRunId, setSelectedRunId] = useState<number>(initialGeneralRunId);
  const [selectedOpRunId, setSelectedOpRunId] = useState<number>(operatorRuns[0]?.id || 0);

  // Active items for view/preview/WA
  const [activeItem, setActiveItem] = useState<PayrollItemRow | null>(null);
  const [activeOpWorker, setActiveOpWorker] = useState<GroupedOperatorWorker | null>(null);

  // WhatsApp dialog state
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waOpModalOpen, setWaOpModalOpen] = useState(false);
  const [waPhone, setWaPhone] = useState("");
  const [copied, setCopied] = useState(false);
  const [filterMySlipOnly, setFilterMySlipOnly] = useState<boolean>(false);

  // State Koreksi General Payroll
  const [editingItem, setEditingItem] = useState<PayrollItemRow | null>(null);
  const [editBase, setEditBase] = useState<number>(0);
  const [editMeal, setEditMeal] = useState<number>(0);
  const [editOtHours, setEditOtHours] = useState<number>(0);
  const [editOt, setEditOt] = useState<number>(0);
  const [editManualOtHours, setEditManualOtHours] = useState<number>(0);
  const [editManualOt, setEditManualOt] = useState<number>(0);
  const [editBonus, setEditBonus] = useState<number>(0);
  const [editHoliday, setEditHoliday] = useState<number>(0);
  const [editKasbonPerusahaan, setEditKasbonPerusahaan] = useState<number>(0);
  const [editKasbonWarung, setEditKasbonWarung] = useState<number>(0);

  // State Koreksi Operator Borongan
  const [editingOpItem, setEditingOpItem] = useState<OperatorItemRow | null>(null);
  const [editOpQty, setEditOpQty] = useState<number>(0);
  const [editOpPrice, setEditOpPrice] = useState<number>(0);
  const [editOpVal, setEditOpVal] = useState<number>(0);

  const workerMap = useMemo(() => {
    const map = new Map<number, WorkerInfo>();
    workers.forEach((w) => map.set(w.id, w));
    return map;
  }, [workers]);

  // Selected General Run
  const selectedRun = useMemo(() => {
    return runs.find((r) => r.id === selectedRunId) || runs[0] || null;
  }, [runs, selectedRunId]);

  // Selected Operator Run
  const selectedOpRun = useMemo(() => {
    return operatorRuns.find((r) => r.id === selectedOpRunId) || operatorRuns[0] || null;
  }, [operatorRuns, selectedOpRunId]);

  // General Run Items
  const allRunItems = useMemo(() => {
    if (!selectedRun) return [];
    return items.filter((it) => it.payroll_run_id === selectedRun.id);
  }, [items, selectedRun]);

  const runItems = useMemo(() => {
    if (!selectedRun) return [];
    if (filterMySlipOnly && currentWorkerId) {
      return allRunItems.filter((it) => it.worker_id === currentWorkerId);
    }
    return allRunItems;
  }, [allRunItems, filterMySlipOnly, currentWorkerId, selectedRun]);

  // Operator Items Grouped by Worker
  const groupedOperatorWorkers = useMemo<GroupedOperatorWorker[]>(() => {
    if (!selectedOpRun) return [];
    const opItemsForRun = operatorItems.filter((it) => it.run_id === selectedOpRun.id);
    const groups = new Map<number, GroupedOperatorWorker>();

    opItemsForRun.forEach((it) => {
      const w = workerMap.get(it.worker_id);
      if (!groups.has(it.worker_id)) {
        groups.set(it.worker_id, {
          workerId: it.worker_id,
          workerName: it.worker_name_snapshot,
          workerCode: w?.worker_code || `PKR-${it.worker_id}`,
          department: w?.department || "PRODUKSI",
          phone: w?.phone || null,
          identityNo: w?.identity_no || null,
          items: [],
          totalQty: 0,
          totalOperatorValue: 0,
          totalSubmissionValue: 0,
        });
      }
      const g = groups.get(it.worker_id)!;
      g.items.push(it);
      g.totalQty += num(it.qty_approved);
      g.totalOperatorValue += num(it.operator_value);
      g.totalSubmissionValue += num(it.submission_value);
    });

    let res = Array.from(groups.values());
    if (filterMySlipOnly && currentWorkerId) {
      res = res.filter((g) => g.workerId === currentWorkerId);
    }
    return res;
  }, [selectedOpRun, operatorItems, workerMap, filterMySlipOnly, currentWorkerId]);

  // Dynamic overtime rates for correction
  const divisor = editingItem?.pay_system_snapshot === "BULANAN" ? 190 : 8;
  const baseForRate = editingItem?.pay_system_snapshot === "BULANAN"
    ? editBase
    : (num(editingItem?.daily_wage_snapshot) || (editBase / Math.max(1, num(editingItem?.full_days) || 1)));
  const hourlyRate = Math.round((baseForRate / Math.max(1, divisor)) * 100) / 100;

  const handleSysHoursChange = (hours: number) => {
    const h = Math.max(0, hours);
    setEditOtHours(h);
    setEditOt(Math.round(h * hourlyRate * 100) / 100);
  };

  const handleManualHoursChange = (hours: number) => {
    const h = Math.max(0, hours);
    setEditManualOtHours(h);
    setEditManualOt(Math.round(h * hourlyRate * 100) / 100);
  };

  const openEditModal = (item: PayrollItemRow) => {
    setEditingItem(item);
    const base = num(item.base_amount);
    setEditBase(base);
    setEditMeal(num(item.meal_amount));

    const div = item.pay_system_snapshot === "BULANAN" ? 190 : 8;
    const bRate = item.pay_system_snapshot === "BULANAN" ? base : (num(item.daily_wage_snapshot) || 80000);
    const rate = Math.max(1, bRate / div);

    const otAmt = num(item.overtime_amount);
    setEditOt(otAmt);
    const sysHours = num(item.overtime_minutes) > 0
      ? Math.round((num(item.overtime_minutes) / 60) * 10) / 10
      : (rate > 0 ? Math.round((otAmt / rate) * 10) / 10 : 0);
    setEditOtHours(sysHours);

    const manAmt = num(item.manual_overtime_amount);
    setEditManualOt(manAmt);
    setEditManualOtHours(rate > 0 ? Math.round((manAmt / rate) * 10) / 10 : 0);

    setEditBonus(num(item.overtime_bonus));
    setEditHoliday(num(item.holiday_bonus));
    setEditKasbonPerusahaan(num(item.kasbon_perusahaan_amount));
    setEditKasbonWarung(num(item.kasbon_warung_amount));
  };

  const openOperatorEditModal = (item: OperatorItemRow) => {
    setEditingOpItem(item);
    setEditOpQty(num(item.qty_approved));
    setEditOpPrice(num(item.operator_price_snapshot));
    setEditOpVal(num(item.operator_value));
  };

  const handleOpQtyChange = (q: number) => {
    setEditOpQty(q);
    setEditOpVal(Math.round(q * editOpPrice * 100) / 100);
  };

  const handleOpPriceChange = (p: number) => {
    setEditOpPrice(p);
    setEditOpVal(Math.round(editOpQty * p * 100) / 100);
  };

  const calcGross = editBase + editMeal + editOt + editManualOt + editBonus + editHoliday;
  const calcDeduction = editKasbonPerusahaan + editKasbonWarung;
  const calcNet = Math.max(0, calcGross - calcDeduction);

  const paymentStatusText = activeCategory === "BORONGAN"
    ? getRunPaymentStatus(selectedOpRun)
    : getRunPaymentStatus(selectedRun);

  // Printing Slip Handlers
  const handlePrintSlip = (item: PayrollItemRow) => {
    if (!selectedRun) return;
    const title = getSlipTitle(selectedRun, item);
    const worker = workerMap.get(item.worker_id);
    const otHours = (num(item.overtime_minutes) / 60).toFixed(1);
    const bonus = num(item.overtime_bonus) + num(item.holiday_bonus) + num(item.holiday_manual_amount);
    const periodDesc = getPeriodDescription(selectedRun.period_start, selectedRun.period_end, selectedRun.payroll_type);
    const payStatus = getRunPaymentStatus(selectedRun);

    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title} - ${item.worker_name_snapshot}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 20px; background: #fff; }
          .slip { max-width: 650px; margin: 0 auto; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 24px; box-sizing: border-box; }
          .header { border-bottom: 2px solid #0f2747; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; }
          .company { font-size: 19px; font-weight: 800; color: #0f2747; }
          .title { font-size: 13px; font-weight: 700; color: #2563eb; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.5px; }
          .right { text-align: right; font-size: 12px; color: #64748b; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 800; text-transform: uppercase; margin-top: 4px; ${payStatus === "SUDAH DIBAYAR" ? "background:#dcfce7;color:#15803d;border:1px solid #86efac;" : "background:#fef3c7;color:#b45309;border:1px solid #fde68a;"} }
          .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin-bottom: 18px; background: #f8fafc; padding: 12px 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 12px; }
          .meta div { display: flex; justify-content: space-between; }
          .meta span { color: #64748b; }
          .meta strong { color: #0f172a; }
          .table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
          .table td { padding: 7px 4px; border-bottom: 1px solid #f1f5f9; }
          .table tr.total td { font-weight: 700; border-top: 1.5px solid #94a3b8; border-bottom: 1.5px solid #94a3b8; }
          .net-box { background: #ecfdf5; border: 2px solid #10b981; border-radius: 8px; padding: 12px 18px; display: flex; justify-content: space-between; align-items: center; margin-top: 14px; }
          .net-box .lbl { font-size: 13px; font-weight: 700; color: #065f46; }
          .net-box .val { font-size: 22px; font-weight: 800; color: #065f46; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; text-align: center; font-size: 12px; }
          .sig-box { border-top: 1px solid #94a3b8; padding-top: 6px; margin-top: 50px; font-weight: 600; }
          .footer { margin-top: 20px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          @media print { body { padding: 0; } .slip { border: 0; padding: 0; } }
        </style>
      </head>
      <body>
        <div class="slip">
          <div class="header">
            <div>
              <div class="company">PT Kreasi Dinamika Maju Bersama</div>
              <div class="title">${title}</div>
            </div>
            <div class="right">
              <div>Kode: <strong>${selectedRun.payroll_code}</strong></div>
              <div>Periode: <strong>${periodDesc}</strong></div>
              <div class="badge">${payStatus}</div>
            </div>
          </div>

          <div class="meta">
            <div><span>Nama Pekerja:</span> <strong>${item.worker_name_snapshot}</strong></div>
            <div><span>ID Pekerja:</span> <strong>${worker?.worker_code || `PKR-${item.worker_id}`}</strong></div>
            <div><span>Bagian / Jabatan:</span> <strong>${worker?.department || worker?.position || "-"}</strong></div>
            <div><span>Sistem Upah:</span> <strong>${item.pay_system_snapshot}</strong></div>
            <div><span>Kehadiran:</span> <strong>${num(item.full_days)} Full Day • ${num(item.half_days)} Half Day</strong></div>
            <div><span>NIK / KTP:</span> <strong>${worker?.identity_no || "-"}</strong></div>
          </div>

          <table class="table">
            <tbody>
              <tr><td>Upah / Gaji Pokok</td><td style="text-align: right; font-weight: 600;">${money(item.base_amount)}</td></tr>
              ${num(item.meal_amount) > 0 ? `<tr><td>Uang Makan Minggu (Masuk 08:00–17:00)</td><td style="text-align: right; font-weight: 600;">${money(item.meal_amount)}</td></tr>` : ""}
              ${(num(item.overtime_amount) + num(item.manual_overtime_amount)) > 0 ? `<tr><td>Upah Lembur (${otHours} jam${num(item.manual_overtime_amount) > 0 ? ` + Manual ${money(item.manual_overtime_amount)}` : ""})</td><td style="text-align: right; font-weight: 600;">${money(num(item.overtime_amount) + num(item.manual_overtime_amount))}</td></tr>` : ""}
              ${bonus > 0 ? `<tr><td>Bonus / Tambahan Hadir Minggu</td><td style="text-align: right; font-weight: 600;">${money(bonus)}</td></tr>` : ""}
              <tr class="total"><td>Total Pendapatan Bruto</td><td style="text-align: right; font-weight: 700;">${money(num(item.base_amount) + num(item.meal_amount) + num(item.overtime_amount) + num(item.manual_overtime_amount) + bonus)}</td></tr>
              ${num(item.kasbon_perusahaan_amount) > 0 ? `<tr><td style="color: #dc2626;">Potongan Kasbon Kantor (Cicilan)</td><td style="text-align: right; font-weight: 600; color: #dc2626;">-${money(item.kasbon_perusahaan_amount)}</td></tr>` : ""}
              ${num(item.kasbon_warung_amount) > 0 ? `<tr><td style="color: #d97706;">Potongan Kasbon Warung Luar</td><td style="text-align: right; font-weight: 600; color: #d97706;">-${money(item.kasbon_warung_amount)}</td></tr>` : ""}
              ${num(item.kasbon_perusahaan_amount) === 0 && num(item.kasbon_warung_amount) === 0 && num(item.deduction_amount) > 0 ? `<tr><td style="color: #dc2626;">Potongan Kasbon</td><td style="text-align: right; font-weight: 600; color: #dc2626;">-${money(item.deduction_amount)}</td></tr>` : ""}
            </tbody>
          </table>

          <div class="net-box">
            <div class="lbl">TOTAL GAJI BERSIH (NET)</div>
            <div class="val">${money(item.net_amount)}</div>
          </div>

          <div class="signatures">
            <div>
              <span>Diterbitkan Oleh:</span>
              <div class="sig-box">Finance / HRD PT KDMB</div>
            </div>
            <div>
              <span>Diterima Oleh:</span>
              <div class="sig-box">${item.worker_name_snapshot}</div>
            </div>
          </div>

          <div class="footer">
            Dokumen ini sah dan diterbitkan resmi oleh Sistem SMPT V2 pada ${new Date().toLocaleDateString("id-ID")}.<br>
            Harap simpan slip ini sebagai tanda bukti pembayaran upah yang sah.
          </div>
        </div>
      </body>
      </html>
    `;

    const printWin = window.open("", "_blank", "width=750,height=850");
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
      setTimeout(() => {
        printWin.focus();
        printWin.print();
      }, 350);
    }
  };

  const handlePrintOperatorSlip = (group: GroupedOperatorWorker) => {
    if (!selectedOpRun) return;
    const periodDesc = getPeriodDescription(selectedOpRun.period_start, selectedOpRun.period_end, "BORONGAN");
    const payStatus = getRunPaymentStatus(selectedOpRun);

    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Slip Borongan - ${group.workerName}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 20px; background: #fff; }
          .slip { max-width: 650px; margin: 0 auto; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 24px; box-sizing: border-box; }
          .header { border-bottom: 2px solid #0f2747; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; }
          .company { font-size: 19px; font-weight: 800; color: #0f2747; }
          .title { font-size: 13px; font-weight: 700; color: #16a34a; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.5px; }
          .right { text-align: right; font-size: 12px; color: #64748b; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 800; text-transform: uppercase; margin-top: 4px; ${payStatus === "SUDAH DIBAYAR" ? "background:#dcfce7;color:#15803d;border:1px solid #86efac;" : "background:#fef3c7;color:#b45309;border:1px solid #fde68a;"} }
          .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin-bottom: 18px; background: #f8fafc; padding: 12px 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 12px; }
          .meta div { display: flex; justify-content: space-between; }
          .meta span { color: #64748b; }
          .meta strong { color: #0f172a; }
          .table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
          .table th { background: #f1f5f9; padding: 8px 6px; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569; }
          .table td { padding: 8px 6px; border-bottom: 1px solid #e2e8f0; }
          .table tr.total td { font-weight: 700; border-top: 1.5px solid #94a3b8; border-bottom: 1.5px solid #94a3b8; background: #f8fafc; }
          .net-box { background: #ecfdf5; border: 2px solid #10b981; border-radius: 8px; padding: 12px 18px; display: flex; justify-content: space-between; align-items: center; margin-top: 14px; }
          .net-box .lbl { font-size: 13px; font-weight: 700; color: #065f46; }
          .net-box .val { font-size: 22px; font-weight: 800; color: #065f46; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; text-align: center; font-size: 12px; }
          .sig-box { border-top: 1px solid #94a3b8; padding-top: 6px; margin-top: 50px; font-weight: 600; }
          .footer { margin-top: 20px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          @media print { body { padding: 0; } .slip { border: 0; padding: 0; } }
        </style>
      </head>
      <body>
        <div class="slip">
          <div class="header">
            <div>
              <div class="company">PT Kreasi Dinamika Maju Bersama</div>
              <div class="title">SLIP UPAH BORONGAN OPERATOR</div>
            </div>
            <div class="right">
              <div>Kode: <strong>${selectedOpRun.payroll_code}</strong></div>
              <div>Periode: <strong>${periodDesc}</strong></div>
              <div class="badge">${payStatus}</div>
            </div>
          </div>

          <div class="meta">
            <div><span>Nama Pekerja:</span> <strong>${group.workerName}</strong></div>
            <div><span>ID Operator:</span> <strong>${group.workerCode}</strong></div>
            <div><span>Bagian / Dept:</span> <strong>${group.department}</strong></div>
            <div><span>Sistem Upah:</span> <strong>BORONGAN</strong></div>
            <div><span>Total Item Tugas:</span> <strong>${group.items.length} Pekerjaan</strong></div>
            <div><span>NIK / KTP:</span> <strong>${group.identityNo || "-"}</strong></div>
          </div>

          <table class="table">
            <thead>
              <tr>
                <th>Item Pekerjaan</th>
                <th style="text-align: right;">Qty Sah</th>
                <th style="text-align: right;">Tarif Borongan</th>
                <th style="text-align: right;">Total Upah</th>
              </tr>
            </thead>
            <tbody>
              ${group.items.map((it) => `
                <tr>
                  <td><b>${it.work_item_name_snapshot}</b></td>
                  <td style="text-align: right;">${qty(it.qty_approved)}</td>
                  <td style="text-align: right;">${money(it.operator_price_snapshot)}</td>
                  <td style="text-align: right; font-weight: 600;">${money(it.operator_value)}</td>
                </tr>
              `).join("")}
              <tr class="total">
                <td>TOTAL UPAH BORONGAN</td>
                <td style="text-align: right;">${qty(group.totalQty)}</td>
                <td></td>
                <td style="text-align: right; font-weight: 800;">${money(group.totalOperatorValue)}</td>
              </tr>
            </tbody>
          </table>

          <div class="net-box">
            <div class="lbl">TOTAL DITERIMA (NET DIBAYARKAN)</div>
            <div class="val">${money(group.totalOperatorValue)}</div>
          </div>

          <div class="signatures">
            <div>
              <span>Disetujui Oleh:</span>
              <div class="sig-box">Supervisor / Finance</div>
            </div>
            <div>
              <span>Diterima Oleh:</span>
              <div class="sig-box">${group.workerName}</div>
            </div>
          </div>

          <div class="footer">
            Dokumen ini sah dan diterbitkan resmi oleh Sistem SMPT V2 pada ${new Date().toLocaleDateString("id-ID")}.<br>
            Harap simpan slip ini sebagai tanda bukti pembayaran upah borongan yang sah.
          </div>
        </div>
      </body>
      </html>
    `;

    const printWin = window.open("", "_blank", "width=750,height=850");
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
      setTimeout(() => {
        printWin.focus();
        printWin.print();
      }, 350);
    }
  };

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      {/* Selector Run Payroll & 3 Kategori Switcher */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs min-w-0 max-w-full">
        {/* 3 PILIHAN KATEGORI UTAMA: HARIAN | BULANAN | BORONGAN */}
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1 no-scrollbar">
          <span className="text-[11px] font-bold text-slate-400 shrink-0">Kategori:</span>

          {/* Pill 1: HARIAN */}
          <button
            type="button"
            onClick={() => {
              setActiveCategory("HARIAN");
              setFilterMySlipOnly(false);
              const harianRun = runs.find((r) => r.payroll_type === "MINGGUAN");
              if (harianRun) setSelectedRunId(harianRun.id);
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition shrink-0 shadow-2xs ${
              activeCategory === "HARIAN"
                ? "bg-blue-600 text-white ring-2 ring-blue-300"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span>🌾 Karyawan HARIAN (Sabtu–Jumat)</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                activeCategory === "HARIAN" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {runs.find((r) => r.payroll_type === "MINGGUAN")
                ? items.filter((it) => it.payroll_run_id === runs.find((r) => r.payroll_type === "MINGGUAN")?.id).length
                : 0} Slip
            </span>
          </button>

          {/* Pill 2: BULANAN */}
          <button
            type="button"
            onClick={() => {
              setActiveCategory("BULANAN");
              setFilterMySlipOnly(false);
              const bulananRun = runs.find((r) => r.payroll_type === "BULANAN");
              if (bulananRun) setSelectedRunId(bulananRun.id);
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition shrink-0 shadow-2xs ${
              activeCategory === "BULANAN"
                ? "bg-purple-600 text-white ring-2 ring-purple-300"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span>🏢 Karyawan BULANAN</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                activeCategory === "BULANAN" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {runs.find((r) => r.payroll_type === "BULANAN")
                ? items.filter((it) => it.payroll_run_id === runs.find((r) => r.payroll_type === "BULANAN")?.id).length
                : 0} Slip
            </span>
          </button>

          {/* Pill 3: BORONGAN */}
          <button
            type="button"
            onClick={() => {
              setActiveCategory("BORONGAN");
              setFilterMySlipOnly(false);
              if (operatorRuns.length > 0) setSelectedOpRunId(operatorRuns[0].id);
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition shrink-0 shadow-2xs ${
              activeCategory === "BORONGAN"
                ? "bg-emerald-600 text-white ring-2 ring-emerald-300"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span>🧵 Operator BORONGAN (Jumat–Kamis)</span>
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-black ${
                activeCategory === "BORONGAN" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {operatorRuns.length > 0
                ? operatorItems.filter((it) => it.run_id === (selectedOpRun?.id || operatorRuns[0].id)).length
                : 0} Item
            </span>
          </button>
        </div>

        {/* Header Rincian Run & Dropdown Select */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">
              {activeCategory === "BORONGAN"
                ? "Rincian Payroll Operator Borongan (Siklus Jumat s/d Kamis)"
                : activeCategory === "HARIAN"
                ? "Rincian Slip Gaji Karyawan Harian (Siklus Sabtu s/d Jumat)"
                : "Rincian Slip Gaji Karyawan Bulanan"}
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              {activeCategory === "BORONGAN"
                ? "Hasil kerja operator borongan berdasarkan SPK & Qty Sah Checker. Tersedia koreksi nominal & export Excel."
                : "Pilih finalisasi payroll untuk mencetak slip, mengoreksi lembur/uang makan, atau share ke WhatsApp."}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto min-w-0">
            {activeCategory === "BORONGAN" ? (
              <div className="w-full sm:w-80 min-w-0">
                <select
                  value={selectedOpRun?.id ?? 0}
                  onChange={(e) => {
                    setSelectedOpRunId(Number(e.target.value));
                    setFilterMySlipOnly(false);
                  }}
                  className="w-full max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-xs focus:border-emerald-500 focus:outline-none truncate"
                >
                  {operatorRuns.map((r) => {
                    const count = operatorItems.filter((it) => it.run_id === r.id).length;
                    return (
                      <option key={r.id} value={r.id}>
                        {r.payroll_code} • ({r.period_start} s/d {r.period_end}) — {count} Item ({money(r.total_operator_value)})
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : (
              <div className="w-full sm:w-80 min-w-0">
                <select
                  value={selectedRun?.id ?? 0}
                  onChange={(e) => {
                    setSelectedRunId(Number(e.target.value));
                    setFilterMySlipOnly(false);
                  }}
                  className="w-full max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none truncate"
                >
                  {runs
                    .filter((r) => (activeCategory === "BULANAN" ? r.payroll_type === "BULANAN" : r.payroll_type === "MINGGUAN"))
                    .map((r) => {
                      const count = items.filter((it) => it.payroll_run_id === r.id).length;
                      return (
                        <option key={r.id} value={r.id}>
                          {r.payroll_code} • {r.payroll_type} ({r.period_start} s/d {r.period_end}) — {count} Slip
                        </option>
                      );
                    })}
                </select>
              </div>
            )}

            {/* Tombol Export Excel */}
            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              {activeCategory === "BORONGAN" && selectedOpRun ? (
                <a
                  href={`/api/export/xlsx?report=operator_payroll_slips&run_id=${selectedOpRun.id}`}
                  download
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-xs"
                  title="Export seluruh slip borongan periode ini ke Excel (.xlsx)"
                >
                  📥 Export Excel Borongan (.xlsx)
                </a>
              ) : selectedRun ? (
                <a
                  href={`/api/export/xlsx?report=payroll_slips&run_id=${selectedRun.id}`}
                  download
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition shadow-xs"
                  title="Export seluruh slip gaji periode ini ke Excel (.xlsx)"
                >
                  📥 Export Excel (.xlsx)
                </a>
              ) : null}
            </div>
          </div>
        </div>

        {/* RUN META BOX: Nomor Payout, Periode, Total, & Status Pembayaran */}
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/40 p-3 sm:p-3.5 text-xs grid grid-cols-2 sm:grid-cols-5 gap-3 min-w-0">
          <div className="min-w-0">
            <span className="text-slate-400 font-medium text-[11px] block">No. Payout:</span>
            <div className="font-bold text-slate-800 truncate">
              {activeCategory === "BORONGAN" ? selectedOpRun?.payroll_code : selectedRun?.payroll_code}
            </div>
          </div>

          <div className="min-w-0 sm:col-span-2">
            <span className="text-slate-400 font-medium text-[11px] block">Periode Gaji:</span>
            <div className="font-bold text-slate-800 text-[11px] leading-tight break-words">
              {activeCategory === "BORONGAN" && selectedOpRun
                ? getPeriodDescription(selectedOpRun.period_start, selectedOpRun.period_end, "BORONGAN")
                : selectedRun
                ? getPeriodDescription(selectedRun.period_start, selectedRun.period_end, selectedRun.payroll_type)
                : "-"}
            </div>
          </div>

          <div className="min-w-0">
            <span className="text-slate-400 font-medium text-[11px] block">Total Nilai Bersih:</span>
            <div className="font-black text-emerald-700 text-sm truncate">
              {activeCategory === "BORONGAN"
                ? money(selectedOpRun?.total_operator_value ?? 0)
                : money(selectedRun?.total_net ?? 0)}
            </div>
          </div>

          {/* STATUS PEMBAYARAN DENGAN TOGGLE TOMBOL CEPAT */}
          <div className="min-w-0 flex flex-col justify-between">
            <span className="text-slate-400 font-medium text-[11px] block">Status Pembayaran:</span>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                  paymentStatusText === "SUDAH DIBAYAR"
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : "bg-amber-100 text-amber-900 border border-amber-300"
                }`}
              >
                {paymentStatusText === "SUDAH DIBAYAR" ? "🟢 SUDAH DIBAYAR" : "🟡 BELUM DIBAYAR"}
              </span>

              {canWrite && (
                <form action={togglePayrollPaymentStatusAction} className="inline-block">
                  <input
                    type="hidden"
                    name="run_type"
                    value={activeCategory === "BORONGAN" ? "OPERATOR" : "GENERAL"}
                  />
                  <input
                    type="hidden"
                    name="run_id"
                    value={activeCategory === "BORONGAN" ? selectedOpRun?.id ?? 0 : selectedRun?.id ?? 0}
                  />
                  <input
                    type="hidden"
                    name="payment_status"
                    value={paymentStatusText === "SUDAH DIBAYAR" ? "BELUM_DIBAYAR" : "SUDAH_DIBAYAR"}
                  />
                  <button
                    type="submit"
                    className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                    title="Ubah status bayar lunas/belum"
                  >
                    {paymentStatusText === "SUDAH DIBAYAR" ? "Ubah Belum" : "Set Lunas"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* VIEW DAFTAR PEKERJA: BORONGAN VS UMUM */}
      {activeCategory === "BORONGAN" ? (
        /* ================= 1. VIEW OPERATOR BORONGAN ================= */
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs min-w-0 max-w-full">
          <div className="flex items-center justify-between mb-3.5 flex-wrap gap-2">
            <h4 className="font-bold text-slate-900 text-sm">
              Daftar Operator Borongan ({groupedOperatorWorkers.length} Penerima Upah)
            </h4>
            <span className="text-xs text-slate-500">
              Periode: <b>{selectedOpRun?.period_start} s/d {selectedOpRun?.period_end}</b>
            </span>
          </div>

          {groupedOperatorWorkers.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Belum ada data pekerjaan operator borongan yang difinalisasi pada run ini.
            </div>
          ) : (
            <div className="space-y-3">
              {groupedOperatorWorkers.map((group) => {
                const isMe = group.workerId === currentWorkerId;
                return (
                  <div
                    key={group.workerId}
                    className={`rounded-2xl border p-3.5 sm:p-4 transition shadow-xs ${
                      isMe ? "border-emerald-400 bg-emerald-50/30 ring-1 ring-emerald-300" : "border-slate-200/90 bg-white"
                    }`}
                  >
                    {/* Header Pekerja & Total Net */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-slate-900 text-sm break-words">{group.workerName}</span>
                          {isMe ? (
                            <span className="rounded bg-emerald-600 text-white px-1.5 py-0.2 text-[9px] font-bold shrink-0">
                              Slip Saya
                            </span>
                          ) : null}
                          <span className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                            BORONGAN
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
                          {group.department} • {group.workerCode}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 block">
                          Upah Borongan (Net)
                        </span>
                        <span className="text-base font-black text-emerald-600">
                          {money(group.totalOperatorValue)}
                        </span>
                      </div>
                    </div>

                    {/* Rincian Item Pekerjaan */}
                    <div className="mt-2.5 space-y-1.5 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 text-xs">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Rincian Hasil Kerja (SPK / Proses):
                      </span>
                      {group.items.map((it) => (
                        <div key={it.id} className="flex justify-between items-center text-[11px] border-b border-slate-200/50 pb-1 last:border-0 last:pb-0">
                          <div className="truncate pr-2">
                            <span className="font-bold text-slate-800">{it.work_item_name_snapshot}</span>
                            <span className="text-slate-500 text-[10px] block">
                              {qty(it.qty_approved)} PCS @ {money(it.operator_price_snapshot)}
                            </span>
                          </div>
                          <div className="text-right shrink-0 flex items-center gap-2">
                            <span className="font-bold text-slate-900">{money(it.operator_value)}</span>
                            {canWrite && (
                              <button
                                type="button"
                                onClick={() => openOperatorEditModal(it)}
                                className="rounded px-1.5 py-0.5 text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-200 hover:bg-amber-200"
                                title="Koreksi Qty atau Harga Item Ini"
                              >
                                ✏️ Koreksi
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Tombol Aksi */}
                    <div className="mt-3 flex items-center justify-end gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handlePrintOperatorSlip(group)}
                        className="rounded-xl border border-slate-200 bg-white py-1.5 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition flex items-center gap-1"
                      >
                        📄 Cetak Slip Borongan
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveOpWorker(group);
                          setWaPhone(group.phone || "");
                          setWaOpModalOpen(true);
                          setCopied(false);
                        }}
                        className="rounded-xl bg-emerald-600 py-1.5 px-3 text-xs font-bold text-white hover:bg-emerald-700 shadow-2xs transition flex items-center gap-1"
                      >
                        💬 Share WA
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ================= 2. VIEW UMUM (HARIAN & BULANAN) ================= */
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs min-w-0 max-w-full">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h4 className="font-bold text-slate-900 text-sm">
              Daftar Penerima Upah ({runItems.length} Pekerja)
              {filterMySlipOnly ? " · Difilter: Hanya Slip Saya" : ""}
            </h4>
            <span className="text-xs text-slate-500">
              Periode: <b>{selectedRun?.period_start} s/d {selectedRun?.period_end}</b>
            </span>
          </div>

          {runItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Tidak ada data detail pekerja pada run payroll ini.
            </div>
          ) : (
            <div className="space-y-3">
              {runItems.map((item) => {
                const w = workerMap.get(item.worker_id);
                const isMe = item.worker_id === currentWorkerId;
                const bonus = num(item.overtime_bonus) + num(item.holiday_bonus) + num(item.holiday_manual_amount);
                const totalOt = num(item.overtime_amount) + num(item.manual_overtime_amount);
                const totalOtHours = Math.round(((num(item.overtime_minutes) / 60) + num(item.manual_overtime_hours)) * 10) / 10;

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border p-3.5 sm:p-4 transition shadow-xs min-w-0 max-w-full ${
                      isMe ? "border-blue-400 bg-blue-50/40 ring-1 ring-blue-300" : "border-slate-200/90 bg-white"
                    }`}
                  >
                    {/* Header Pekerja & Total Net */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-slate-900 text-sm break-words">{item.worker_name_snapshot}</span>
                          {isMe ? (
                            <span className="rounded bg-blue-600 text-white px-1.5 py-0.2 text-[9px] font-bold shrink-0">
                              Slip Saya
                            </span>
                          ) : null}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider shrink-0 ${
                              item.pay_system_snapshot === "BULANAN"
                                ? "bg-purple-100 text-purple-800 border border-purple-200"
                                : "bg-blue-100 text-blue-800 border border-blue-200"
                            }`}
                          >
                            {item.pay_system_snapshot}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
                          {w?.department || w?.position || "Produksi"} • {w?.worker_code || `ID #${item.worker_id}`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 block">
                          Gaji Bersih (Net)
                        </span>
                        <span className="text-base font-black text-emerald-600">
                          {money(item.net_amount)}
                        </span>
                      </div>
                    </div>

                    {/* Ringkasan Angka Gaji Bersih & Rinci */}
                    <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 min-w-0">
                      <div className="min-w-0">
                        <span className="text-slate-400 text-[10px] block">Gaji / Upah Pokok:</span>
                        <span className="font-bold text-slate-800 truncate block">{money(item.base_amount)}</span>
                        <span className="text-[10px] text-slate-500 block">({num(item.full_days)} Full · {num(item.half_days)} Half)</span>
                      </div>

                      <div className="min-w-0">
                        <span className="text-slate-400 text-[10px] block">Lembur:</span>
                        <span className="font-bold text-blue-700 truncate block">
                          {totalOt > 0 ? money(totalOt) : "-"}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          ({totalOtHours} Jam{num(item.manual_overtime_hours) > 0 ? ` incl manual` : ""})
                        </span>
                      </div>

                      <div className="min-w-0">
                        <span className="text-slate-400 text-[10px] block">
                          {item.pay_system_snapshot === "BULANAN" ? "Makan Minggu & Bonus:" : "Bonus & Insentif Minggu:"}
                        </span>
                        <span className="font-bold text-indigo-700 truncate block">
                          {num(item.meal_amount) + bonus > 0 ? money(num(item.meal_amount) + bonus) : "-"}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {num(item.meal_amount) > 0 ? `Makan: ${money(item.meal_amount)}` : "Tanpa insentif"}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <span className="text-slate-400 text-[10px] block">Potongan Kasbon:</span>
                        <span className="font-bold text-rose-600 truncate block">
                          {num(item.deduction_amount) > 0 ? `-${money(item.deduction_amount)}` : "-"}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {num(item.kasbon_perusahaan_amount) > 0 ? `Kantor ${money(item.kasbon_perusahaan_amount)}` : "Lunas"}
                        </span>
                      </div>
                    </div>

                    {/* 3 Tombol Aksi Ramah Sentuhan */}
                    <div className="mt-3 flex items-center justify-end gap-1.5 sm:gap-2 min-w-0">
                      {canWrite ? (
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="rounded-xl border border-amber-300 bg-amber-50 py-2 px-3 text-[11px] sm:text-xs font-bold text-amber-900 hover:bg-amber-100 shadow-2xs transition"
                        >
                          ✏️ Koreksi
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handlePrintSlip(item)}
                        className="rounded-xl border border-slate-200 bg-white py-2 px-3 text-[11px] sm:text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition"
                      >
                        📄 Cetak Slip
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveItem(item);
                          const w = workerMap.get(item.worker_id);
                          setWaPhone(w?.phone || "");
                          setWaModalOpen(true);
                          setCopied(false);
                        }}
                        className="rounded-xl bg-emerald-600 py-2 px-3 text-[11px] sm:text-xs font-bold text-white hover:bg-emerald-700 shadow-2xs transition"
                      >
                        💬 Share WA
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= MODAL KOREKSI GENERAL (HARIAN & BULANAN) ================= */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-slate-900 text-base sm:text-lg">
                    ✏️ Koreksi Payroll: {editingItem.worker_name_snapshot}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      editingItem.pay_system_snapshot === "BULANAN"
                        ? "bg-purple-100 text-purple-800 border border-purple-200"
                        : "bg-blue-100 text-blue-800 border border-blue-200"
                    }`}
                  >
                    {editingItem.pay_system_snapshot}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedRun?.payroll_code} • Periode: {selectedRun?.period_start} s/d {selectedRun?.period_end}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                ✕
              </button>
            </div>

            <form action={updatePayrollItemAction} className="mt-4 space-y-4 text-xs">
              <input type="hidden" name="item_id" value={editingItem.id} />
              <input type="hidden" name="overtime_minutes" value={Math.round(editOtHours * 60)} />
              <input type="hidden" name="manual_overtime_hours" value={editManualOtHours} />

              {/* 1. Gaji Pokok */}
              <div>
                <label className="font-bold text-slate-800 block mb-1">
                  {editingItem.pay_system_snapshot === "BULANAN"
                    ? "Gaji Pokok Bulanan (Rp)"
                    : "Upah Pokok Harian (Rp)"}
                </label>
                <input
                  name="base_amount"
                  type="number"
                  step="any"
                  value={editBase}
                  onChange={(e) => setEditBase(Number(e.target.value) || 0)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-bold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* 2. Khusus Bulanan: Uang Makan Minggu */}
              {editingItem.pay_system_snapshot === "BULANAN" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-amber-950">Uang Makan Minggu (Rp 50.000/Minggu)</label>
                    <button
                      type="button"
                      onClick={() => setEditMeal(0)}
                      className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100 shadow-2xs"
                    >
                      ⚡ Set Rp 0
                    </button>
                  </div>
                  <input
                    name="meal_amount"
                    type="number"
                    step="any"
                    value={editMeal}
                    onChange={(e) => setEditMeal(Number(e.target.value) || 0)}
                    className="w-full rounded-xl border border-amber-300 bg-white px-3.5 py-2 font-bold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-1.5">
                  <label className="font-bold text-amber-950 block">Tambahan Hadir Minggu (Rp 20.000/Minggu)</label>
                  <input
                    name="holiday_bonus"
                    type="number"
                    step="any"
                    value={editHoliday}
                    onChange={(e) => setEditHoliday(Number(e.target.value) || 0)}
                    className="w-full rounded-xl border border-amber-300 bg-white px-3.5 py-2 font-bold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
                  />
                </div>
              )}

              {/* 3. Koreksi Jam & Upah Lembur */}
              <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-3.5 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="font-extrabold text-blue-950 text-xs sm:text-sm">
                    ⚡ Koreksi Jam Lembur & Lupa Finger
                  </span>
                  <span className="text-[10px] font-bold text-blue-800 bg-white px-2 py-0.5 rounded-lg border border-blue-200">
                    Tarif: {money(hourlyRate)}/jam ({editingItem.pay_system_snapshot === "BULANAN" ? "Gaji/190" : "Gaji/8"})
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-white p-3 rounded-xl border border-blue-100 shadow-2xs">
                  <div>
                    <label className="font-bold text-slate-800 text-[11px] block mb-1">Jam Lembur Sistem (Jam)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={editOtHours}
                      onChange={(e) => handleSysHoursChange(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 font-black text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-800 text-[11px] block mb-1">Upah Lembur Sistem (Rp)</label>
                    <input
                      name="overtime_amount"
                      type="number"
                      step="any"
                      min="0"
                      value={editOt}
                      onChange={(e) => setEditOt(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 font-black text-blue-700 shadow-2xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Lembur Manual / Lupa Finger */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-white p-3 rounded-xl border border-blue-100 shadow-2xs">
                  <div>
                    <label className="font-bold text-blue-900 text-[11px] block mb-1">+ Jam Manual (Lupa Finger)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={editManualOtHours}
                      onChange={(e) => handleManualHoursChange(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-blue-300 px-3 py-2 font-black text-blue-900 shadow-2xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-blue-900 text-[11px] block mb-1">+ Upah Lembur Manual (Rp)</label>
                    <input
                      name="manual_overtime_amount"
                      type="number"
                      step="any"
                      min="0"
                      value={editManualOt}
                      onChange={(e) => setEditManualOt(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-blue-300 px-3 py-2 font-black text-blue-900 shadow-2xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="rounded-xl bg-blue-100/70 p-2.5 text-[11px] text-blue-950 font-bold flex items-center justify-between">
                  <span>Total Jam Lembur: <b className="text-blue-900">{Math.round((editOtHours + editManualOtHours) * 10) / 10} Jam</b></span>
                  <span>Total Upah Lembur: <b className="text-blue-900 text-xs">{money(editOt + editManualOt)}</b></span>
                </div>
              </div>

              {/* 4. Bonus Lembur 4H */}
              <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3 space-y-1.5">
                <label className="font-bold text-purple-950 text-xs block mb-1">
                  Bonus Lembur &ge; 4 Jam (Rp)
                </label>
                <input
                  name="overtime_bonus"
                  type="number"
                  step="any"
                  min="0"
                  value={editBonus}
                  onChange={(e) => setEditBonus(Number(e.target.value) || 0)}
                  className="w-full rounded-xl border border-purple-300 bg-white px-3.5 py-2 font-black text-purple-950 shadow-2xs focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* 5. Potongan Kasbon */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-rose-700 mb-1">Kasbon Kantor (Rp)</label>
                  <input
                    name="kasbon_perusahaan_amount"
                    type="number"
                    step="any"
                    value={editKasbonPerusahaan}
                    onChange={(e) => setEditKasbonPerusahaan(Number(e.target.value) || 0)}
                    className="w-full rounded-xl border border-rose-200 bg-white px-3.5 py-2 font-bold text-rose-700 shadow-2xs focus:border-rose-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-amber-700 mb-1">Kasbon Warung (Rp)</label>
                  <input
                    name="kasbon_warung_amount"
                    type="number"
                    step="any"
                    value={editKasbonWarung}
                    onChange={(e) => setEditKasbonWarung(Number(e.target.value) || 0)}
                    className="w-full rounded-xl border border-amber-200 bg-white px-3.5 py-2 font-bold text-amber-700 shadow-2xs focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Preview Hasil Baru */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 space-y-1.5 text-emerald-950 font-medium">
                <div className="flex justify-between text-[11px]">
                  <span>Total Bruto:</span>
                  <span className="font-bold">{money(calcGross)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-rose-700">
                  <span>Potongan Kasbon:</span>
                  <span className="font-bold">-{money(calcDeduction)}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm font-black text-emerald-800 border-t border-emerald-200 pt-1.5 mt-1">
                  <span>Perkiraan Net Baru:</span>
                  <span>{money(calcNet)}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 hover:bg-slate-50 text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-700 shadow-md transition text-xs"
                >
                  💾 Simpan Koreksi Gaji
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL KOREKSI OPERATOR BORONGAN ================= */}
      {editingOpItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-base sm:text-lg">
                  ✏️ Koreksi Upah Borongan
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pekerja: <b>{editingOpItem.worker_name_snapshot}</b> · Item: <b>{editingOpItem.work_item_name_snapshot}</b>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingOpItem(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                ✕
              </button>
            </div>

            <form action={updateOperatorPayrollItemAction} className="mt-4 space-y-3.5 text-xs">
              <input type="hidden" name="item_id" value={editingOpItem.id} />

              <div>
                <label className="font-bold text-slate-800 block mb-1">Qty Sah / Approved (PCS)</label>
                <input
                  name="qty_approved"
                  type="number"
                  step="any"
                  value={editOpQty}
                  onChange={(e) => handleOpQtyChange(Number(e.target.value) || 0)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 font-black text-slate-900 shadow-2xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">Tarif Borongan Satuan (Rp/PCS)</label>
                <input
                  name="operator_price"
                  type="number"
                  step="any"
                  value={editOpPrice}
                  onChange={(e) => handleOpPriceChange(Number(e.target.value) || 0)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 font-black text-emerald-700 shadow-2xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">Total Nilai Upah Borongan (Rp)</label>
                <input
                  name="operator_value"
                  type="number"
                  step="any"
                  value={editOpVal}
                  onChange={(e) => setEditOpVal(Number(e.target.value) || 0)}
                  className="w-full rounded-xl border border-emerald-300 bg-emerald-50/50 px-3.5 py-2 font-black text-emerald-900 shadow-2xs focus:border-emerald-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  = {editOpQty} PCS × {money(editOpPrice)}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingOpItem(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 hover:bg-slate-50 text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2 font-bold text-white hover:bg-emerald-700 shadow-md transition text-xs"
                >
                  💾 Simpan Koreksi Borongan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL SHARE WA UMUM ================= */}
      {waModalOpen && activeItem && selectedRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Kirim Slip ke WhatsApp</h3>
                <p className="text-xs text-slate-500">Pekerja: <b>{activeItem.worker_name_snapshot}</b></p>
              </div>
              <button
                type="button"
                onClick={() => setWaModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor WhatsApp Penerima:</label>
                <input
                  type="tel"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  placeholder="Contoh: 08123456789 atau 628123456789"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-800 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pratinjau Pesan:</label>
                <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-mono text-slate-700 leading-relaxed">
                  {generateWhatsAppText(selectedRun, activeItem, workerMap.get(activeItem.worker_id))}
                </pre>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const text = generateWhatsAppText(selectedRun, activeItem, workerMap.get(activeItem.worker_id));
                    navigator.clipboard.writeText(text).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                >
                  {copied ? "✅ Teks Disalin!" : "📋 Salin Teks Slip"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const text = generateWhatsAppText(selectedRun, activeItem, workerMap.get(activeItem.worker_id));
                    const clean = normalizePhone(waPhone);
                    const url = clean ? `https://wa.me/${clean}?text=${encodeURIComponent(text)}` : `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`;
                    window.open(url, "_blank");
                  }}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs"
                >
                  💬 Buka WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL SHARE WA OPERATOR BORONGAN ================= */}
      {waOpModalOpen && activeOpWorker && selectedOpRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Kirim Slip Borongan ke WhatsApp</h3>
                <p className="text-xs text-slate-500">Operator: <b>{activeOpWorker.workerName}</b></p>
              </div>
              <button
                type="button"
                onClick={() => setWaOpModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor WhatsApp Penerima:</label>
                <input
                  type="tel"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  placeholder="Contoh: 08123456789 atau 628123456789"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-800 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pratinjau Pesan Borongan:</label>
                <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-mono text-slate-700 leading-relaxed">
                  {generateOperatorWhatsAppText(selectedOpRun, activeOpWorker)}
                </pre>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const text = generateOperatorWhatsAppText(selectedOpRun, activeOpWorker);
                    navigator.clipboard.writeText(text).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                >
                  {copied ? "✅ Teks Disalin!" : "📋 Salin Teks Slip"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const text = generateOperatorWhatsAppText(selectedOpRun, activeOpWorker);
                    const clean = normalizePhone(waPhone);
                    const url = clean ? `https://wa.me/${clean}?text=${encodeURIComponent(text)}` : `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`;
                    window.open(url, "_blank");
                  }}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 shadow-xs"
                >
                  💬 Buka WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
