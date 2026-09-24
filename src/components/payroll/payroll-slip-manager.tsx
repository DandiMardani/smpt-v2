"use client";

import { useMemo, useRef, useState } from "react";
import { money } from "@/lib/final/final-utils";

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
  deduction_amount: number | string;
  net_amount: number | string;
};

export type WorkerInfo = {
  id: number;
  worker_code: string;
  name: string;
  phone?: string | null;
  department?: string | null;
  position?: string | null;
  identity_no?: string | null;
};

type Props = {
  runs: PayrollRunRow[];
  items: PayrollItemRow[];
  workers: WorkerInfo[];
};

function num(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function normalizePhone(raw?: string | null): string {
  if (!raw) return "";
  const cleaned = raw.replace(/\D/g, "");
  if (cleaned.startsWith("0")) {
    return "62" + cleaned.slice(1);
  }
  if (cleaned.startsWith("8")) {
    return "62" + cleaned;
  }
  return cleaned;
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
  const bonus = num(item.overtime_bonus) + num(item.holiday_bonus) + num(item.holiday_manual_amount);

  return [
    `*${title}*`,
    `*PT KREASI DINAMIKA MAJU BERSAMA*`,
    `=============================`,
    `👤 *Nama:* ${item.worker_name_snapshot}`,
    `🆔 *ID:* ${worker?.worker_code || `PKR-${item.worker_id}`}${worker?.identity_no ? ` | NIK: ${worker.identity_no}` : ""}`,
    `🏢 *Bagian:* ${worker?.department || worker?.position || "-"}`,
    `💼 *Sistem Upah:* ${item.pay_system_snapshot}`,
    `📅 *Periode:* ${run.period_start} s/d ${run.period_end}`,
    `🧾 *No. Payout:* ${run.payroll_code}`,
    `=============================`,
    `*RINCIAN PENERIMAAN:*`,
    `• Kehadiran: ${num(item.full_days)} Full Day, ${num(item.half_days)} Half Day`,
    `• Gaji / Upah Pokok: ${money(item.base_amount)}`,
    num(item.meal_amount) > 0 ? `• Uang Makan: ${money(item.meal_amount)}` : null,
    num(item.overtime_amount) > 0 ? `• Lembur (${otHours} jam): ${money(item.overtime_amount)}` : null,
    bonus > 0 ? `• Bonus: ${money(bonus)}` : null,
    `-----------------------------`,
    `*Total Bruto:* ${money(num(item.base_amount) + num(item.meal_amount) + num(item.overtime_amount) + bonus)}`,
    ``,
    `*POTONGAN:*`,
    `• Kasbon / Lainnya: -${money(item.deduction_amount)}`,
    `=============================`,
    `*TOTAL DITERIMA (NET): ${money(item.net_amount)}*`,
    `=============================`,
    `_Slip ini diterbitkan resmi secara otomatis oleh Sistem SMPT V2._`,
    `_Harap simpan pesan ini sebagai bukti sah pembayaran upah._`,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderSlipCanvas(run: PayrollRunRow, item: PayrollItemRow, worker?: WorkerInfo): HTMLCanvasElement {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d");
  if (!c) return canvas;

  const title = getSlipTitle(run, item);
  const otHours = (num(item.overtime_minutes) / 60).toFixed(1);
  const bonus = num(item.overtime_bonus) + num(item.holiday_bonus) + num(item.holiday_manual_amount);
  const gross = num(item.base_amount) + num(item.meal_amount) + num(item.overtime_amount) + bonus;
  const deduction = num(item.deduction_amount);
  const net = num(item.net_amount);

  // Background
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, W, H);

  // Header band
  c.fillStyle = "#0f2747";
  c.fillRect(0, 0, W, 175);

  // Header text
  c.fillStyle = "#ffffff";
  c.textAlign = "left";
  c.font = "bold 40px Arial, sans-serif";
  c.fillText("PT Kreasi Dinamika Maju Bersama", 70, 75);

  c.font = "bold 28px Arial, sans-serif";
  c.fillStyle = "#93c5fd";
  c.fillText(title, 70, 125);

  // Run meta (top right)
  c.textAlign = "right";
  c.font = "bold 24px Arial, sans-serif";
  c.fillStyle = "#ffffff";
  c.fillText(run.payroll_code, W - 70, 75);
  c.font = "normal 22px Arial, sans-serif";
  c.fillStyle = "#cbd5e1";
  c.fillText(`${run.period_start} s/d ${run.period_end}`, W - 70, 118);

  // Worker Info Block
  c.fillStyle = "#1e293b";
  c.textAlign = "left";
  c.font = "bold 38px Arial, sans-serif";
  c.fillText(item.worker_name_snapshot, 80, 245);

  c.font = "normal 25px Arial, sans-serif";
  c.fillStyle = "#64748b";
  const workerCode = worker?.worker_code || `PKR-${item.worker_id}`;
  c.fillText(`${workerCode}  •  ${item.pay_system_snapshot}  •  ${worker?.department || worker?.position || "Produksi"}`, 80, 290);
  c.fillText(`Kehadiran: ${num(item.full_days)} Full Day  •  ${num(item.half_days)} Half Day`, 80, 335);

  // Divider
  c.strokeStyle = "#cbd5e1";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(80, 370);
  c.lineTo(W - 80, 370);
  c.stroke();

  // Helper row drawer
  const drawRow = (label: string, val: string, y: number, bold = false) => {
    c.font = (bold ? "bold " : "normal ") + "30px Arial, sans-serif";
    c.fillStyle = "#334155";
    c.textAlign = "left";
    c.fillText(label, 80, y);

    c.font = (bold ? "bold " : "normal ") + "30px Arial, sans-serif";
    c.textAlign = "right";
    c.fillStyle = bold ? "#0f172a" : "#1e293b";
    c.fillText(val, W - 80, y);

    c.strokeStyle = "#f1f5f9";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(80, y + 18);
    c.lineTo(W - 80, y + 18);
    c.stroke();
  };

  let curY = 430;
  drawRow("Upah / Gaji Pokok", money(item.base_amount), curY);
  curY += 65;

  if (num(item.meal_amount) > 0) {
    drawRow("Uang Makan", money(item.meal_amount), curY);
    curY += 65;
  }

  if (num(item.overtime_amount) > 0) {
    drawRow(`Lembur (${otHours} jam)`, money(item.overtime_amount), curY);
    curY += 65;
  }

  if (bonus > 0) {
    drawRow("Bonus / Hari Libur", money(bonus), curY);
    curY += 65;
  }

  drawRow("Total Pendapatan Bruto", money(gross), curY, true);
  curY += 80;

  if (deduction > 0) {
    drawRow("Potongan Kasbon / Lainnya", `-${money(deduction)}`, curY);
    curY += 75;
  }

  // Net Box
  c.fillStyle = "#ecfdf5";
  c.strokeStyle = "#a7f3d0";
  c.lineWidth = 2;
  c.fillRect(70, curY, W - 140, 140);
  c.strokeRect(70, curY, W - 140, 140);

  c.fillStyle = "#065f46";
  c.textAlign = "left";
  c.font = "bold 32px Arial, sans-serif";
  c.fillText("TOTAL DITERIMA (NET)", 100, curY + 60);

  c.textAlign = "right";
  c.font = "bold 48px Arial, sans-serif";
  c.fillText(money(net), W - 100, curY + 95);

  // Footer notes
  c.fillStyle = "#94a3b8";
  c.textAlign = "center";
  c.font = "normal 22px Arial, sans-serif";
  c.fillText("Slip ini sah dan diterbitkan resmi oleh Sistem ERP SMPT V2.", W / 2, 1240);
  c.fillText("Simpan slip ini sebagai bukti pembayaran upah Anda.", W / 2, 1275);

  return canvas;
}

export function PayrollSlipManager({ runs, items, workers }: Props) {
  const [selectedRunId, setSelectedRunId] = useState<number>(runs[0]?.id ?? 0);
  const [activeItem, setActiveItem] = useState<PayrollItemRow | null>(null);
  const [waPhone, setWaPhone] = useState("");
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const printFrameRef = useRef<HTMLIFrameElement>(null);

  const workerMap = useMemo(() => {
    const map = new Map<number, WorkerInfo>();
    workers.forEach((w) => map.set(w.id, w));
    return map;
  }, [workers]);

  const selectedRun = useMemo(() => {
    return runs.find((r) => r.id === selectedRunId) || runs[0] || null;
  }, [runs, selectedRunId]);

  const runItems = useMemo(() => {
    if (!selectedRun) return [];
    return items.filter((it) => it.payroll_run_id === selectedRun.id);
  }, [items, selectedRun]);

  const openSlip = (item: PayrollItemRow) => {
    setActiveItem(item);
  };

  const openWaDialog = (item: PayrollItemRow) => {
    setActiveItem(item);
    const w = workerMap.get(item.worker_id);
    setWaPhone(w?.phone || "");
    setWaModalOpen(true);
    setCopied(false);
  };

  const handleCopyText = () => {
    if (!selectedRun || !activeItem) return;
    const text = generateWhatsAppText(selectedRun, activeItem, workerMap.get(activeItem.worker_id));
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSendWhatsAppWeb = () => {
    if (!selectedRun || !activeItem) return;
    const text = generateWhatsAppText(selectedRun, activeItem, workerMap.get(activeItem.worker_id));
    const cleanPhone = normalizePhone(waPhone);
    const encoded = encodeURIComponent(text);
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encoded}`
      : `https://web.whatsapp.com/send?text=${encoded}`;
    window.open(url, "_blank");
  };

  const handleDownloadPng = () => {
    if (!selectedRun || !activeItem) return;
    const canvas = renderSlipCanvas(selectedRun, activeItem, workerMap.get(activeItem.worker_id));
    const safeName = activeItem.worker_name_snapshot.replace(/[^a-zA-Z0-9]/g, "_");
    const link = document.createElement("a");
    link.download = `Slip_${safeName}_${selectedRun.payroll_code}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const handleNativeShare = async () => {
    if (!selectedRun || !activeItem) return;
    setIsSharing(true);
    try {
      const canvas = renderSlipCanvas(selectedRun, activeItem, workerMap.get(activeItem.worker_id));
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      const safeName = activeItem.worker_name_snapshot.replace(/[^a-zA-Z0-9]/g, "_");
      const text = generateWhatsAppText(selectedRun, activeItem, workerMap.get(activeItem.worker_id));

      if (blob && navigator.share && navigator.canShare?.({ files: [new File([blob], "slip.png", { type: "image/png" })] })) {
        const file = new File([blob], `Slip_${safeName}_${selectedRun.payroll_code}.png`, { type: "image/png" });
        await navigator.share({
          title: `Slip Gaji - ${activeItem.worker_name_snapshot}`,
          text: text,
          files: [file],
        });
      } else {
        // Fallback: buka link WhatsApp
        handleSendWhatsAppWeb();
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        handleSendWhatsAppWeb();
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handlePrintSlip = (item: PayrollItemRow) => {
    if (!selectedRun) return;
    const title = getSlipTitle(selectedRun, item);
    const worker = workerMap.get(item.worker_id);
    const otHours = (num(item.overtime_minutes) / 60).toFixed(1);
    const bonus = num(item.overtime_bonus) + num(item.holiday_bonus) + num(item.holiday_manual_amount);

    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title} - ${item.worker_name_snapshot}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px; background: #fff; }
          .slip { max-width: 680px; margin: 0 auto; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 28px; box-sizing: border-box; }
          .header { border-bottom: 2px solid #0f2747; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
          .company { font-size: 20px; font-weight: 800; color: #0f2747; }
          .title { font-size: 14px; font-weight: 700; color: #2563eb; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
          .right { text-align: right; font-size: 13px; color: #64748b; }
          .right strong { color: #0f172a; }
          .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; margin-bottom: 22px; background: #f8fafc; padding: 14px 18px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; }
          .meta div { display: flex; justify-content: space-between; }
          .meta span { color: #64748b; }
          .meta strong { color: #0f172a; text-align: right; }
          .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .table td { padding: 9px 4px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
          .table tr.total td { font-weight: 700; border-top: 1.5px solid #94a3b8; border-bottom: 1.5px solid #94a3b8; }
          .net-box { background: #ecfdf5; border: 2px solid #10b981; border-radius: 8px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin-top: 15px; }
          .net-box .lbl { font-size: 15px; font-weight: 700; color: #065f46; }
          .net-box .val { font-size: 24px; font-weight: 800; color: #065f46; }
          .footer { margin-top: 24px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 14px; }
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
              <div>Periode: <strong>${selectedRun.period_start} s/d ${selectedRun.period_end}</strong></div>
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
              ${num(item.meal_amount) > 0 ? `<tr><td>Uang Makan</td><td style="text-align: right; font-weight: 600;">${money(item.meal_amount)}</td></tr>` : ""}
              ${num(item.overtime_amount) > 0 ? `<tr><td>Upah Lembur (${otHours} jam)</td><td style="text-align: right; font-weight: 600;">${money(item.overtime_amount)}</td></tr>` : ""}
              ${bonus > 0 ? `<tr><td>Bonus / Hari Libur</td><td style="text-align: right; font-weight: 600;">${money(bonus)}</td></tr>` : ""}
              <tr class="total"><td>Total Pendapatan Bruto</td><td style="text-align: right; font-weight: 700;">${money(num(item.base_amount) + num(item.meal_amount) + num(item.overtime_amount) + bonus)}</td></tr>
              ${num(item.deduction_amount) > 0 ? `<tr><td style="color: #dc2626;">Potongan Kasbon / Lainnya</td><td style="text-align: right; font-weight: 600; color: #dc2626;">-${money(item.deduction_amount)}</td></tr>` : ""}
            </tbody>
          </table>

          <div class="net-box">
            <div class="lbl">TOTAL DITERIMA (NET)</div>
            <div class="val">${money(item.net_amount)}</div>
          </div>

          <div class="footer">
            Dokumen ini sah dan diterbitkan resmi oleh Sistem SMPT V2 pada ${new Date().toLocaleDateString("id-ID")}.<br>
            Harap simpan slip ini sebagai tanda bukti pembayaran upah.
          </div>
        </div>
      </body>
      </html>
    `;

    const printWin = window.open("", "_blank", "width=800,height=900");
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

  const handlePrintAll = () => {
    if (!selectedRun || runItems.length === 0) return;
    const slipsHtml = runItems
      .map((item) => {
        const title = getSlipTitle(selectedRun, item);
        const worker = workerMap.get(item.worker_id);
        const otHours = (num(item.overtime_minutes) / 60).toFixed(1);
        const bonus = num(item.overtime_bonus) + num(item.holiday_bonus) + num(item.holiday_manual_amount);

        return `
        <div class="slip" style="page-break-after: always; margin-bottom: 24px;">
          <div class="header" style="border-bottom: 2px solid #0f2747; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between;">
            <div>
              <div style="font-size: 18px; font-weight: 800; color: #0f2747;">PT Kreasi Dinamika Maju Bersama</div>
              <div style="font-size: 13px; font-weight: 700; color: #2563eb; margin-top: 3px;">${title}</div>
            </div>
            <div style="text-align: right; font-size: 12px; color: #64748b;">
              <div>Kode: <strong>${selectedRun.payroll_code}</strong></div>
              <div>Periode: <strong>${selectedRun.period_start} s/d ${selectedRun.period_end}</strong></div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; margin-bottom: 16px; background: #f8fafc; padding: 12px 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 12px;">
            <div><span>Nama:</span> <strong>${item.worker_name_snapshot}</strong></div>
            <div><span>ID:</span> <strong>${worker?.worker_code || `PKR-${item.worker_id}`}</strong></div>
            <div><span>Bagian:</span> <strong>${worker?.department || worker?.position || "-"}</strong></div>
            <div><span>Sistem:</span> <strong>${item.pay_system_snapshot}</strong></div>
            <div><span>Kehadiran:</span> <strong>${num(item.full_days)} Full • ${num(item.half_days)} Half</strong></div>
            <div><span>NIK:</span> <strong>${worker?.identity_no || "-"}</strong></div>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 13px;">
            <tbody>
              <tr><td style="padding: 6px 0; border-bottom: 1px solid #f1f5f9;">Upah / Gaji Pokok</td><td style="text-align: right; font-weight: 600;">${money(item.base_amount)}</td></tr>
              ${num(item.meal_amount) > 0 ? `<tr><td style="padding: 6px 0; border-bottom: 1px solid #f1f5f9;">Uang Makan</td><td style="text-align: right; font-weight: 600;">${money(item.meal_amount)}</td></tr>` : ""}
              ${num(item.overtime_amount) > 0 ? `<tr><td style="padding: 6px 0; border-bottom: 1px solid #f1f5f9;">Upah Lembur (${otHours} jam)</td><td style="text-align: right; font-weight: 600;">${money(item.overtime_amount)}</td></tr>` : ""}
              ${bonus > 0 ? `<tr><td style="padding: 6px 0; border-bottom: 1px solid #f1f5f9;">Bonus</td><td style="text-align: right; font-weight: 600;">${money(bonus)}</td></tr>` : ""}
              <tr style="font-weight: 700; border-top: 1.5px solid #94a3b8; border-bottom: 1.5px solid #94a3b8;"><td style="padding: 6px 0;">Total Bruto</td><td style="text-align: right;">${money(num(item.base_amount) + num(item.meal_amount) + num(item.overtime_amount) + bonus)}</td></tr>
              ${num(item.deduction_amount) > 0 ? `<tr><td style="padding: 6px 0; color: #dc2626;">Potongan Kasbon</td><td style="text-align: right; font-weight: 600; color: #dc2626;">-${money(item.deduction_amount)}</td></tr>` : ""}
            </tbody>
          </table>

          <div style="background: #ecfdf5; border: 1.5px solid #10b981; border-radius: 8px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 13px; font-weight: 700; color: #065f46;">TOTAL DITERIMA (NET)</div>
            <div style="font-size: 20px; font-weight: 800; color: #065f46;">${money(item.net_amount)}</div>
          </div>
        </div>
      `;
      })
      .join("");

    const printWin = window.open("", "_blank", "width=850,height=900");
    if (printWin) {
      printWin.document.open();
      printWin.document.write(`
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Semua Slip - ${selectedRun.payroll_code}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #1e293b; margin: 0; padding: 20px; background: #fff; }
            .slip { max-width: 680px; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 10px; padding: 22px; box-sizing: border-box; }
            @media print { body { padding: 0; } .slip { border: 0; padding: 0; } }
          </style>
        </head>
        <body>${slipsHtml}</body>
        </html>
      `);
      printWin.document.close();
      setTimeout(() => {
        printWin.focus();
        printWin.print();
      }, 350);
    }
  };

  return (
    <div className="space-y-4">
      {/* Selector Run Payroll */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Rincian Slip Gaji Karyawan (Harian & Bulanan)</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pilih finalisasi payroll untuk mencetak slip atau mengirimkan slip gaji langsung ke WhatsApp pekerja.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedRun?.id ?? 0}
              onChange={(e) => setSelectedRunId(Number(e.target.value))}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.payroll_code} • {r.payroll_type} ({r.period_start} s/d {r.period_end})
                </option>
              ))}
            </select>

            {runItems.length > 0 ? (
              <button
                type="button"
                onClick={handlePrintAll}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-xs"
              >
                🖨️ Cetak Semua Slip ({runItems.length})
              </button>
            ) : null}
          </div>
        </div>

        {selectedRun ? (
          <div className="mt-4 grid gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3.5 text-xs sm:grid-cols-4">
            <div>
              <span className="text-slate-400 font-medium">No. Payout:</span>
              <div className="font-bold text-slate-800">{selectedRun.payroll_code}</div>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Jenis & Periode:</span>
              <div className="font-bold text-slate-800">{selectedRun.payroll_type} ({selectedRun.period_start} s/d {selectedRun.period_end})</div>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Total Bruto:</span>
              <div className="font-bold text-slate-800">{money(selectedRun.total_gross)}</div>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Total Bersih (Net):</span>
              <div className="font-bold text-emerald-600 text-sm">{money(selectedRun.total_net)}</div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Tabel Pekerja dalam Run */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <h4 className="font-bold text-slate-900 text-sm mb-3">Daftar Penerima Upah ({runItems.length} Pekerja)</h4>

        {runItems.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Tidak ada data detail pekerja pada run payroll ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 text-left">
                <tr>
                  <th className="px-3.5 py-2.5">Pekerja</th>
                  <th className="px-3.5 py-2.5">Bagian & Sistem</th>
                  <th className="px-3.5 py-2.5">Kehadiran</th>
                  <th className="px-3.5 py-2.5 text-right">Gaji Pokok</th>
                  <th className="px-3.5 py-2.5 text-right">Lembur/Bonus</th>
                  <th className="px-3.5 py-2.5 text-right">Kasbon</th>
                  <th className="px-3.5 py-2.5 text-right">Diterima (Net)</th>
                  <th className="px-3.5 py-2.5 text-center">Aksi Slip & WhatsApp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {runItems.map((item) => {
                  const w = workerMap.get(item.worker_id);
                  const bonus = num(item.overtime_bonus) + num(item.holiday_bonus) + num(item.holiday_manual_amount) + num(item.overtime_amount);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-3.5 py-2.5">
                        <div className="font-bold text-slate-900">{item.worker_name_snapshot}</div>
                        <div className="text-[11px] text-slate-400">{w?.worker_code || `ID #${item.worker_id}`}{w?.phone ? ` • 📞 ${w.phone}` : " • ⚠️ Tanpa No. HP"}</div>
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-700">
                        <div>{w?.department || w?.position || "Produksi"}</div>
                        <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          {item.pay_system_snapshot}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-slate-600">
                        {num(item.full_days)} Full • {num(item.half_days)} Half
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-medium text-slate-800">
                        {money(item.base_amount)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-slate-600">
                        {bonus > 0 ? money(bonus) : "-"}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-medium text-rose-600">
                        {num(item.deduction_amount) > 0 ? `-${money(item.deduction_amount)}` : "-"}
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-bold text-emerald-600 text-sm">
                        {money(item.net_amount)}
                      </td>
                      <td className="px-3.5 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openSlip(item)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                            title="Lihat & Cetak Slip"
                          >
                            📄 Slip
                          </button>
                          <button
                            type="button"
                            onClick={() => openWaDialog(item)}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-2xs"
                            title="Bagikan ke WhatsApp"
                          >
                            💬 Share WA
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Preview Slip Gaji Formal */}
      {activeItem && !waModalOpen && selectedRun ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">Pratinjau Slip Gaji</h3>
                <p className="text-xs text-slate-500">{getSlipTitle(selectedRun, activeItem)}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveItem(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Slip Container Box */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-4">
              <div className="flex justify-between items-start border-b border-slate-200 pb-3">
                <div>
                  <div className="font-black text-slate-900 text-base">PT Kreasi Dinamika Maju Bersama</div>
                  <div className="text-xs font-bold text-blue-600 tracking-wider uppercase mt-0.5">{getSlipTitle(selectedRun, activeItem)}</div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>Kode: <span className="font-bold text-slate-800">{selectedRun.payroll_code}</span></div>
                  <div>{selectedRun.period_start} s/d {selectedRun.period_end}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-white p-3 rounded-lg border border-slate-200/80">
                <div><span className="text-slate-400">Pekerja:</span> <span className="font-bold text-slate-800">{activeItem.worker_name_snapshot}</span></div>
                <div><span className="text-slate-400">ID / Sistem:</span> <span className="font-bold text-slate-800">{workerMap.get(activeItem.worker_id)?.worker_code || `PKR-${activeItem.worker_id}`} ({activeItem.pay_system_snapshot})</span></div>
                <div><span className="text-slate-400">Bagian:</span> <span className="font-bold text-slate-800">{workerMap.get(activeItem.worker_id)?.department || workerMap.get(activeItem.worker_id)?.position || "-"}</span></div>
                <div><span className="text-slate-400">Kehadiran:</span> <span className="font-bold text-slate-800">{num(activeItem.full_days)} Full • {num(activeItem.half_days)} Half</span></div>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/70">
                  <span className="text-slate-600">Upah / Gaji Pokok</span>
                  <span className="font-semibold text-slate-900">{money(activeItem.base_amount)}</span>
                </div>
                {num(activeItem.meal_amount) > 0 ? (
                  <div className="flex justify-between py-1 border-b border-slate-200/70">
                    <span className="text-slate-600">Uang Makan</span>
                    <span className="font-semibold text-slate-900">{money(activeItem.meal_amount)}</span>
                  </div>
                ) : null}
                {num(activeItem.overtime_amount) > 0 ? (
                  <div className="flex justify-between py-1 border-b border-slate-200/70">
                    <span className="text-slate-600">Lembur ({(num(activeItem.overtime_minutes) / 60).toFixed(1)} jam)</span>
                    <span className="font-semibold text-slate-900">{money(activeItem.overtime_amount)}</span>
                  </div>
                ) : null}
                {num(activeItem.overtime_bonus) + num(activeItem.holiday_bonus) + num(activeItem.holiday_manual_amount) > 0 ? (
                  <div className="flex justify-between py-1 border-b border-slate-200/70">
                    <span className="text-slate-600">Bonus / Libur</span>
                    <span className="font-semibold text-slate-900">{money(num(activeItem.overtime_bonus) + num(activeItem.holiday_bonus) + num(activeItem.holiday_manual_amount))}</span>
                  </div>
                ) : null}
                <div className="flex justify-between py-1.5 font-bold text-slate-900 border-t border-b border-slate-300">
                  <span>Total Bruto</span>
                  <span>{money(num(activeItem.base_amount) + num(activeItem.meal_amount) + num(activeItem.overtime_amount) + num(activeItem.overtime_bonus) + num(activeItem.holiday_bonus) + num(activeItem.holiday_manual_amount))}</span>
                </div>
                {num(activeItem.deduction_amount) > 0 ? (
                  <div className="flex justify-between py-1 text-rose-600 font-semibold">
                    <span>Potongan Kasbon / Lainnya</span>
                    <span>-{money(activeItem.deduction_amount)}</span>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 flex justify-between items-center">
                <div>
                  <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Total Diterima (Net)</div>
                  <div className="text-[11px] text-emerald-600">Upah bersih yang dibayarkan</div>
                </div>
                <div className="text-xl font-black text-emerald-700">{money(activeItem.net_amount)}</div>
              </div>
            </div>

            {/* Aksi Modal */}
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleDownloadPng}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
              >
                🖼️ Simpan Gambar PNG
              </button>
              <button
                type="button"
                onClick={() => handlePrintSlip(activeItem)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
              >
                🖨️ Cetak Slip
              </button>
              <button
                type="button"
                onClick={() => openWaDialog(activeItem)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-xs"
              >
                💬 Kirim ke WhatsApp
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal Dialog WhatsApp */}
      {waModalOpen && activeItem && selectedRun ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Kirim Slip ke WhatsApp</h3>
                <p className="text-xs text-slate-500">Pekerja: <span className="font-bold text-slate-800">{activeItem.worker_name_snapshot}</span></p>
              </div>
              <button
                type="button"
                onClick={() => setWaModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor WhatsApp Penerima (Contoh: 08123456789 atau 628123456789)
                </label>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={waPhone}
                    onChange={(e) => setWaPhone(e.target.value)}
                    placeholder="Masukkan nomor WhatsApp..."
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>
                {!waPhone ? (
                  <p className="mt-1 text-[11px] text-amber-600">
                    ⚠️ Nomor belum tercatat di Master Pekerja. Masukkan nomor tujuan di atas atau gunakan tombol Salin Teks.
                  </p>
                ) : null}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pratinjau Pesan WhatsApp
                </label>
                <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-mono text-slate-700 leading-relaxed">
                  {generateWhatsAppText(selectedRun, activeItem, workerMap.get(activeItem.worker_id))}
                </pre>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                >
                  {copied ? "✅ Teks Disalin!" : "📋 Salin Teks Slip"}
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    disabled={isSharing}
                    className="rounded-xl border border-emerald-600 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition shadow-2xs"
                    title="Buka menu Share di HP dengan melampirkan gambar slip"
                  >
                    📱 Share di HP (Gambar + Teks)
                  </button>

                  <button
                    type="button"
                    onClick={handleSendWhatsAppWeb}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-xs"
                  >
                    💬 Buka WhatsApp
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
