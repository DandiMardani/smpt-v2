"use client";

import React, { useState } from "react";
import { money } from "@/lib/final/final-utils";
import type { PayrollItemRow, PayrollRunRow, WorkerInfo } from "./payroll-slip-manager";
import type { PayrollSettingsMap } from "./payroll-settings-modal";
import {
  updateBulananItemAction,
  markBulananPaidFormAction,
  revertBulananPaidFormAction,
} from "@/app/dashboard/payroll/actions";

interface PayrollAccordionTableProps {
  items: PayrollItemRow[];
  workerMap: Map<number | undefined, WorkerInfo>;
  activeRun: PayrollRunRow;
  settings?: PayrollSettingsMap;
  canWrite: boolean;
  type: "HARIAN" | "BULANAN" | "UANG_MAKAN";
  title?: string;
  subtitle?: string;
  badgeLabel?: string;
  badgeColor?: string;
  syncAction?: (formData: FormData) => Promise<void>;
  totBase: number;
  totOt: number;
  totGross: number;
  totKp: number;
  totKw: number;
  totDed: number;
  totNet: number;
}

const ChevronRight = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

export function AdaptivePayrollDetail({
  item,
  worker,
  settings,
  type = "HARIAN",
}: {
  item: PayrollItemRow;
  worker?: WorkerInfo;
  settings?: PayrollSettingsMap;
  type?: "HARIAN" | "BULANAN" | "UANG_MAKAN";
}) {
  const isBulanan =
    type === "BULANAN" ||
    String(item.pay_system_snapshot || worker?.pay_system || "").toUpperCase() === "BULANAN";
  const isUangMakan = type === "UANG_MAKAN";

  const fullDays = Number(item.full_days || 0);
  const halfDays = Number(item.half_days || 0);
  const totalDays = fullDays + halfDays * 0.5;

  const base = Number(item.base_amount || 0);
  const meal = Number(item.meal_amount || 0);
  const overtimeBase = Number(item.overtime_amount || 0);
  const manualOt = Number(item.manual_overtime_amount || item.overtime_manual_amount || 0);
  const manualOtHours = Number(item.manual_overtime_hours || item.overtime_manual_hours || 0);
  const otBonus = Number(item.overtime_bonus || 0);
  const holidayBonus = Number(item.holiday_bonus || 0);
  const totalBonus = otBonus + holidayBonus;
  const totalOvertime = overtimeBase + manualOt;

  const otMinutes = Number(item.overtime_minutes || 0);
  const otHours = Math.round((otMinutes / 60) * 10) / 10;

  const otDivisor = isBulanan
    ? Number(settings?.OT_DIVISOR_BULANAN ?? 190)
    : Number(settings?.OT_DIVISOR_HARIAN ?? 8);
  const otBonusRate = isBulanan
    ? Number(settings?.OT_BONUS_BULANAN_4H ?? 17500)
    : Number(settings?.OT_BONUS_HARIAN_4H ?? 5000);
  const holidayBonusRate = Number(settings?.HARIAN_HOLIDAY_BONUS_FULL ?? 20000);

  const dailyRate = Number(
    item.daily_wage_snapshot ||
      worker?.daily_salary ||
      worker?.daily_wage ||
      (totalDays > 0 ? Math.round(base / totalDays) : 0)
  );

  const kp = Number.isFinite(Number(item.kasbon_perusahaan_amount)) ? Math.max(0, Number(item.kasbon_perusahaan_amount)) : 0;
  const kw = Number.isFinite(Number(item.kasbon_warung_amount)) ? Math.max(0, Number(item.kasbon_warung_amount)) : 0;
  const denda = Number.isFinite(
    Number(item.late_deduction_amount || item.denda_amount || item.late_deduction)
  )
    ? Math.max(0, Number(item.late_deduction_amount || item.denda_amount || item.late_deduction))
    : 0;
  const rawDed = item.deduction_amount ?? (kp + kw + denda);
  const totalDed = Number.isFinite(Number(rawDed)) ? Math.max(0, Number(rawDed)) : (kp + kw + denda);
  const gross = isUangMakan
    ? meal + totalOvertime + totalBonus
    : base + totalOvertime + totalBonus + meal;
  const net = isUangMakan
    ? meal + totalOvertime + totalBonus
    : Math.max(0, gross - totalDed);

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs space-y-4 text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
            Rincian Perhitungan Adaptif
          </span>
          <h4 className="text-sm font-black text-slate-800">
            {item.worker_name_snapshot || worker?.name} · {worker?.worker_code || worker?.code || "-"}
          </h4>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
            {isBulanan ? "💼 Karyawan Bulanan" : isUangMakan ? "🍱 Uang Makan" : "⏱️ Upah Harian"}
          </span>
          <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-800">
            THP: {money(net)}
          </span>
        </div>
      </div>

      <div className="w-full overflow-x-auto pb-2 scrollbar-thin">
        <div className="flex flex-nowrap sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3 min-w-[720px] sm:min-w-0">
        <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 space-y-1.5 min-w-[210px] sm:min-w-0 flex-1 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-blue-700">1. Upah / Gaji Pokok</span>
            <span className="text-[11px] font-black text-blue-900">{money(isUangMakan ? meal : base)}</span>
          </div>
          {isBulanan ? (
            <p className="text-[11px] text-slate-600">
              Gaji Pokok Bulanan Tetap. Total kehadiran aktif: <b>{totalDays} hari</b>.
            </p>
          ) : isUangMakan ? (
            <p className="text-[11px] text-slate-600">
              <b>{totalDays} Hari Aktif</b> × Rp 50.000 / hari kehadiran staf.
            </p>
          ) : (
            <div className="text-[11px] text-slate-600 space-y-0.5">
              <div>
                Hari Kerja: <b>{totalDays} Hari</b> ({fullDays} Full
                {halfDays > 0 ? `, ${halfDays} Half` : ""})
              </div>
              <div>
                Tarif Harian: <b>{money(dailyRate)}</b> / hari
              </div>
              <div className="text-[10px] text-slate-400 font-semibold">
                Formula: {totalDays} × {money(dailyRate)} = {money(base)}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-1.5 min-w-[210px] sm:min-w-0 flex-1 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-indigo-700">2. Lembur Dasar</span>
            <span className="text-[11px] font-black text-indigo-900">{money(overtimeBase)}</span>
          </div>
          <div className="text-[11px] text-slate-600 space-y-0.5">
            <div>
              Total Durasi: <b>{otHours} Jam</b> ({otMinutes} mnt)
            </div>
            <div className="text-[10px] text-slate-500">
              Divisor Sistem: <b>{otDivisor} Jam</b>
            </div>
            {manualOt > 0 && (
              <div className="text-[10px] font-bold text-indigo-700 pt-0.5">
                + Lembur Koreksi Manual: {money(manualOt)} {manualOtHours > 0 ? `(${manualOtHours} Jam)` : ""}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 space-y-1.5 min-w-[210px] sm:min-w-0 flex-1 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-amber-800">3. Bonus & Insentif</span>
            <span className="text-[11px] font-black text-amber-900">
              {money(otBonus + holidayBonus)}
            </span>
          </div>
          <div className="text-[11px] text-slate-600 space-y-1">
            {otBonus > 0 ? (
              <div className="rounded-md bg-amber-100/70 p-1.5 text-amber-900 font-medium">
                <span className="font-bold block">✨ Bonus Lembur Shift (≥ 4 Jam):</span>
                <span>
                  Memenuhi syarat lembur panjang. Nilai: <b>+{money(otBonus)}</b> (Tarif sistem: {money(otBonusRate)}/shift)
                </span>
              </div>
            ) : (
              <div className="text-[10px] text-slate-400">
                Bonus lembur shift ≥ 4 jam: <i>Belum memenuhi ambang batas ({money(otBonusRate)}/shift)</i>
              </div>
            )}

            {holidayBonus > 0 && (
              <div className="rounded-md bg-emerald-100/70 p-1.5 text-emerald-900 font-medium text-[10px]">
                <span className="font-bold block">🎉 Insentif Hadir Minggu/Libur:</span>
                <span>+{money(holidayBonus)} (Tarif: {money(holidayBonusRate)}/kehadiran)</span>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-3 space-y-1.5 min-w-[210px] sm:min-w-0 flex-1 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-rose-700">4. Rincian Potongan</span>
            <span className="text-[11px] font-black text-rose-800">
              {totalDed > 0 ? `-${money(totalDed)}` : "Rp 0"}
            </span>
          </div>
          <div className="text-[11px] text-slate-600 space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Kasbon Kantor:</span>
              <span className={`font-bold ${kp > 0 ? "text-rose-700" : "text-slate-700"}`}>
                {kp > 0 ? `-${money(kp)}` : "Rp 0"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Kasbon Warung:</span>
              <span className={`font-bold ${kw > 0 ? "text-amber-700" : "text-slate-700"}`}>
                {kw > 0 ? `-${money(kw)}` : "Rp 0"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Denda:</span>
              <span className={`font-bold ${denda > 0 ? "text-rose-700" : "text-slate-700"}`}>
                {denda > 0 ? `-${money(denda)}` : "Rp 0"}
              </span>
            </div>
            {totalDed > (kp + kw + denda) && (
              <div className="flex justify-between items-center text-[10px] text-rose-600">
                <span>Potongan Lainnya:</span>
                <span className="font-bold">-{money(totalDed - (kp + kw + denda))}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl bg-slate-50 p-3 border border-slate-200">
        <div className="text-slate-600 text-xs font-medium">
          Formula THP: <b>Total Bruto ({money(gross)})</b> - <b>Total Potongan ({money(totalDed)})</b>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Gaji Bersih Diterima:</span>
            <span className="text-sm font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
              {money(net)}
            </span>
          </div>
          
          <div className="h-6 w-px bg-slate-300 hidden sm:block"></div>
          
          <div className="flex items-center gap-2">
            <a
              href={`/api/export/pdf?report=slip_gaji&item_id=${item.id}`}
              target="_blank"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition cursor-pointer"
            >
              🖨️ Cetak Bukti
            </a>
            <a
              href={`https://wa.me/${worker?.phone?.replace(/^0/, "62") || ""}?text=${encodeURIComponent(`Halo ${worker?.name || ""}, ini rincian gaji Anda untuk periode ini dengan nilai THP sebesar ${money(net)}.`)}`}
              target="_blank"
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-700 transition cursor-pointer"
            >
              💬 Kirim WA
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PayrollAccordionTable({
  items,
  workerMap,
  activeRun,
  settings,
  canWrite,
  type,
  title,
  subtitle,
  badgeLabel,
  badgeColor = "emerald",
  syncAction,
  totBase,
  totOt,
  totGross,
  totKp,
  totKw,
  totDed,
  totNet,
}: PayrollAccordionTableProps) {
  const [expandedRowIds, setExpandedRowIds] = useState<Set<number>>(new Set());

  const toggleRow = (id: number) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleAll = () => {
    if (expandedRowIds.size === items.length) {
      setExpandedRowIds(new Set());
    } else {
      setExpandedRowIds(new Set(items.map((i) => i.id)));
    }
  };

  const isAllExpanded = items.length > 0 && expandedRowIds.size === items.length;

  return (
    <div className={`rounded-2xl border ${badgeColor === "emerald" ? "border-emerald-200" : badgeColor === "blue" ? "border-blue-200" : "border-amber-200"} bg-white p-4 shadow-sm space-y-3.5`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-lg px-2.5 py-0.5 text-xs font-black text-white ${
              badgeColor === "emerald"
                ? "bg-emerald-600"
                : badgeColor === "blue"
                ? "bg-blue-600"
                : "bg-amber-600"
            }`}
          >
            {badgeLabel || (type === "HARIAN" ? "HARIAN" : type === "BULANAN" ? "BULANAN" : "UANG MAKAN")}
          </span>
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              {title || (type === "HARIAN" ? `⏱️ Rekapitulasi Upah Pekerja Harian (${items.length} Pekerja)` : `Rekapitulasi Gaji Karyawan (${items.length} Pekerja)`)}
            </h3>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {items.length > 0 && (
            <button
              type="button"
              onClick={handleToggleAll}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-100 transition cursor-pointer"
            >
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isAllExpanded ? "rotate-90 text-blue-600" : ""}`} />
              <span>{isAllExpanded ? "Tutup Semua Rincian" : "Buka Semua Rincian (Accordion)"}</span>
            </button>
          )}

          {canWrite && syncAction && (
            <form action={syncAction}>
              <input type="hidden" name="run_id" value={activeRun.id} />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 transition cursor-pointer"
                title="Sinkronkan ulang lembur dan potongan"
              >
                🔄 Sinkronkan
              </button>
            </form>
          )}

          <div className="text-left sm:text-right pl-1">
            <div className="text-[10px] uppercase font-bold text-slate-400">Total Cair Bersih</div>
            <div className={`text-base font-black ${badgeColor === "emerald" ? "text-emerald-700" : badgeColor === "blue" ? "text-blue-900" : "text-amber-700"}`}>
              {money(totNet)}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-600 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2.5 w-10 text-center">Buka</th>
              <th className="px-3 py-2.5">Pekerja</th>
              <th className="px-3 py-2.5 text-center">Hari Kerja</th>
              <th className="px-3 py-2.5 text-right">{type === "UANG_MAKAN" ? "Uang Makan" : "Gaji/Upah Pokok"}</th>
              <th className="px-3 py-2.5 text-right">Lembur</th>
              <th className="px-3 py-2.5 text-right bg-blue-50/50">Total Bruto</th>
              <th className="px-3 py-2.5 text-right text-rose-600">Denda / Kasbon Kantor</th>
              <th className="px-3 py-2.5 text-right text-amber-600">Kasbon Warung</th>
              <th className="px-3 py-2.5 text-right text-rose-700 bg-rose-50/50">Tot. Potongan</th>
              <th className="px-3 py-2.5 text-right bg-emerald-50 text-emerald-700 font-black">Gaji Bersih (THP)</th>
              <th className="px-3 py-2.5 text-center">Status</th>
              {canWrite && <th className="px-3 py-2.5 text-center">Aksi</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {items.map((item) => {
              const w = workerMap.get(item.worker_id);
              const base = Number(item.base_amount || 0);
              const overtime =
                Number(item.overtime_amount || 0) +
                Number(item.manual_overtime_amount || 0);
              const bonuses =
                Number(item.overtime_bonus || 0) +
                Number(item.holiday_bonus || 0);
              const kp = Number(item.kasbon_perusahaan_amount || 0);
              const kw = Number(item.kasbon_warung_amount || 0);
              const ded = kp + kw;
              const gross = base + overtime + bonuses + Number(item.meal_amount || 0);
              const net = type === "UANG_MAKAN"
                ? Number(item.meal_amount || 0) + overtime + bonuses
                : Math.max(0, gross - ded);
              const isPaid = (item as any).payment_status === "PAID";

              const fullDays = Number(item.full_days || 0);
              const halfDays = Number(item.half_days || 0);
              const totalDays = fullDays + halfDays * 0.5;

              const otMinutes = Number(item.overtime_minutes || 0);
              const otHours = Math.round((otMinutes / 60) * 10) / 10;
              const isExpanded = expandedRowIds.has(item.id);

              return (
                <React.Fragment key={item.id}>
                  <tr
                    onClick={() => toggleRow(item.id)}
                    className={`cursor-pointer transition ${
                      isExpanded
                        ? "bg-slate-100/90 font-semibold"
                        : isPaid
                        ? "bg-emerald-50/20 hover:bg-slate-50"
                        : "hover:bg-slate-50/80"
                    }`}
                  >
                    <td className="px-3 py-2.5 text-center" onClick={(e) => { e.stopPropagation(); toggleRow(item.id); }}>
                      <button
                        type="button"
                        className={`p-1 rounded-lg border transition-all cursor-pointer ${
                          isExpanded
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "bg-white border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        }`}
                        title={isExpanded ? "Tutup rincian perhitungan" : "Buka rincian perhitungan adaptif"}
                      >
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? "rotate-90 text-white" : ""}`} />
                      </button>
                    </td>

                    <td className="px-3 py-2.5 font-bold text-slate-900">
                      <div>{item.worker_name_snapshot || w?.name || `Worker #${item.worker_id}`}</div>
                      <div className="text-[10px] font-normal text-slate-400">
                        {w?.worker_code || "-"} · {item.pay_system_snapshot || (type === "HARIAN" ? "HARIAN" : "BULANAN")}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-800 border border-slate-200">
                        📅 {totalDays} Hari
                      </span>
                    </td>

                    <td className="px-3 py-2.5 text-right font-medium">
                      {money(type === "UANG_MAKAN" ? Number(item.meal_amount || 0) : base)}
                    </td>

                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className={`font-semibold ${(overtime + bonuses) > 0 ? "text-blue-700" : "text-slate-500"}`}>
                        {money(overtime + bonuses)}
                      </div>
                      {otMinutes > 0 ? (
                        <div className="text-[10px] font-bold text-blue-600">
                          ⏱️ {otHours} Jam ({otMinutes} mnt)
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400">Tanpa lembur</div>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-right font-bold text-slate-900 bg-blue-50/30">
                      {money(gross)}
                    </td>

                    <td className="px-3 py-2.5 text-right text-rose-600 font-medium">
                      {money(kp)}
                    </td>

                    <td className="px-3 py-2.5 text-right text-amber-600 font-medium">
                      {money(kw)}
                    </td>

                    <td className="px-3 py-2.5 text-right text-rose-700 font-bold bg-rose-50/30">
                      {money(ded)}
                    </td>

                    <td className="px-3 py-2.5 text-right font-black text-emerald-700 bg-emerald-50/60 text-sm">
                      {money(net)}
                    </td>

                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      {isPaid ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                          LUNAS
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          BELUM DIBAYAR
                        </span>
                      )}
                    </td>

                    {canWrite && (
                      <td className="px-3 py-2.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5">
                          {!isPaid ? (
                            <>
                              <details className="relative">
                                <summary className="cursor-pointer list-none rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 shadow-2xs hover:bg-slate-100">
                                  ✏️ Edit
                                </summary>
                                <div className="absolute right-0 z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl text-left">
                                  <form action={updateBulananItemAction} className="space-y-2">
                                    <input type="hidden" name="item_id" value={item.id} />
                                    <input type="hidden" name="run_id" value={activeRun.id} />
                                    <input type="hidden" name="meal_amount" value={item.meal_amount || 0} />
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-600">Gaji/Upah Pokok</label>
                                      <input name="base_amount" type="number" defaultValue={base} className="w-full rounded border px-2 py-1 text-xs" required />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-slate-600">Lembur</label>
                                      <input name="overtime_amount" type="number" defaultValue={overtime} className="w-full rounded border px-2 py-1 text-xs" required />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-rose-600">Denda / Kasbon Kantor</label>
                                      <input name="kasbon_perusahaan_amount" type="number" defaultValue={kp} className="w-full rounded border border-rose-200 px-2 py-1 text-xs" required />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-bold text-amber-600">Kasbon Warung</label>
                                      <input name="kasbon_warung_amount" type="number" defaultValue={kw} className="w-full rounded border border-amber-200 px-2 py-1 text-xs" required />
                                    </div>
                                    <button className="w-full rounded bg-blue-600 py-1 text-xs font-bold text-white hover:bg-blue-700 cursor-pointer">Simpan Koreksi</button>
                                  </form>
                                </div>
                              </details>

                              <form action={markBulananPaidFormAction}>
                                <input type="hidden" name="item_id" value={item.id} />
                                <input type="hidden" name="run_id" value={activeRun.id} />
                                <button type="submit" className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs hover:bg-emerald-700 active:scale-95 cursor-pointer">
                                  Bayar
                                </button>
                              </form>
                            </>
                          ) : (
                            <form action={revertBulananPaidFormAction}>
                              <input type="hidden" name="item_id" value={item.id} />
                              <input type="hidden" name="run_id" value={activeRun.id} />
                              <button type="submit" className="rounded-lg border border-rose-300 bg-white px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50 cursor-pointer">
                                Batal Lunas
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>

                  {isExpanded && (
                    <tr className="bg-slate-50/60 border-b border-emerald-100">
                      <td colSpan={canWrite ? 12 : 11} className="p-3 sm:p-4">
                        <AdaptivePayrollDetail
                          item={item}
                          worker={w}
                          settings={settings}
                          type={type}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-100/90 font-black text-slate-900 border-t-2 border-slate-300">
            <tr>
              <td className="px-3 py-3 text-center text-slate-400">-</td>
              <td className="px-3 py-3 uppercase text-[11px] tracking-wider text-slate-600">
                TOTAL ({items.length} Pekerja)
              </td>
              <td className="px-3 py-3 text-center text-xs text-slate-500">-</td>
              <td className="px-3 py-3 text-right">{money(totBase)}</td>
              <td className="px-3 py-3 text-right text-slate-700">{money(totOt)}</td>
              <td className="px-3 py-3 text-right bg-blue-100/60 text-blue-900">{money(totGross)}</td>
              <td className="px-3 py-3 text-right text-rose-700">{money(totKp)}</td>
              <td className="px-3 py-3 text-right text-amber-700">{money(totKw)}</td>
              <td className="px-3 py-3 text-right text-rose-800 bg-rose-100/60">{money(totDed)}</td>
              <td className="px-3 py-3 text-right bg-emerald-100 text-emerald-800 text-sm">
                {money(totNet)}
              </td>
              <td className="px-3 py-3 text-center">-</td>
              {canWrite && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
