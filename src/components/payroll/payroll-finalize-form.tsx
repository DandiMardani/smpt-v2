"use client";

import { useMemo, useState } from "react";
import { finalizePayrollAction } from "@/lib/final/actions";

export default function PayrollFinalizeForm() {
  const [payrollType, setPayrollType] = useState<"BULANAN" | "MINGGUAN">("MINGGUAN");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  const applyPreset = (type: "BULANAN" | "MINGGUAN", start: string, end: string, noteLabel: string) => {
    setPayrollType(type);
    setStartDate(start);
    setEndDate(end);
    setNotes(noteLabel);
  };

  // ==========================================
  // KALKULASI TANGGAL OTOMATIS (TANPA HARDCODE)
  // ==========================================
  const datePresets = useMemo(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    // 1. Perhitungan Bulanan
    const mStart = new Date(Date.UTC(curYear, curMonth, 1)).toISOString().slice(0, 10);
    const lastDay = new Date(Date.UTC(curYear, curMonth + 1, 0)).getDate();
    const mEnd = new Date(Date.UTC(curYear, curMonth, lastDay)).toISOString().slice(0, 10);
    const mName = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(now);

    const prevMStart = new Date(Date.UTC(curYear, curMonth - 1, 1)).toISOString().slice(0, 10);
    const prevMLastDay = new Date(Date.UTC(curYear, curMonth, 0)).getDate();
    const prevMEnd = new Date(Date.UTC(curYear, curMonth - 1, prevMLastDay)).toISOString().slice(0, 10);

    // 2. Perhitungan Siklus Mingguan Pabrik: SABTU s/d JUMAT
    const dayOfWeek = now.getDay(); // 0=Min, 1=Sen, ..., 5=Jum, 6=Sab
    const diffToSat = (dayOfWeek + 1) % 7; // Jarak mundur ke hari Sabtu terdekat

    const thisSat = new Date(now);
    thisSat.setDate(now.getDate() - diffToSat);
    const thisFri = new Date(thisSat);
    thisFri.setDate(thisSat.getDate() + 6);

    const toIso = (d: Date) => d.toISOString().slice(0, 10);
    const toFmt = (d: Date) =>
      new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(d);

    // Minggu Ini (Sabtu - Jumat berjalan)
    const thisWeekStart = toIso(thisSat);
    const thisWeekEnd = toIso(thisFri);
    const thisWeekLabel = `${toFmt(thisSat)} s/d ${toFmt(thisFri)} ${thisFri.getFullYear()}`;

    // Minggu Lalu
    const lastSat = new Date(thisSat);
    lastSat.setDate(thisSat.getDate() - 7);
    const lastFri = new Date(thisFri);
    lastFri.setDate(thisFri.getDate() - 7);
    const lastWeekStart = toIso(lastSat);
    const lastWeekEnd = toIso(lastFri);
    const lastWeekLabel = `${toFmt(lastSat)} s/d ${toFmt(lastFri)} ${lastFri.getFullYear()}`;

    // Minggu Depan
    const nextSat = new Date(thisSat);
    nextSat.setDate(thisSat.getDate() + 7);
    const nextFri = new Date(thisFri);
    nextFri.setDate(thisFri.getDate() + 7);
    const nextWeekStart = toIso(nextSat);
    const nextWeekEnd = toIso(nextFri);
    const nextWeekLabel = `${toFmt(nextSat)} s/d ${toFmt(nextFri)} ${nextFri.getFullYear()}`;

    return {
      monthStart: mStart,
      monthEnd: mEnd,
      monthName: mName,
      prevMonthStart: prevMStart,
      prevMonthEnd: prevMEnd,
      thisWeekStart,
      thisWeekEnd,
      thisWeekLabel,
      lastWeekStart,
      lastWeekEnd,
      lastWeekLabel,
      nextWeekStart,
      nextWeekEnd,
      nextWeekLabel,
    };
  }, []);

  return (
    <form action={finalizePayrollAction} className="space-y-4">
      {/* Tab Jenis Payroll */}
      <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
        <button
          type="button"
          onClick={() => {
            setPayrollType("MINGGUAN");
            setStartDate(datePresets.thisWeekStart);
            setEndDate(datePresets.thisWeekEnd);
            setNotes(`Upah Harian & Uang Makan Staf (${datePresets.thisWeekLabel})`);
          }}
          className={`flex-1 rounded-lg py-2 transition text-center ${
            payrollType === "MINGGUAN"
              ? "bg-white text-emerald-700 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          ⚡ Mingguan (Upah Harian & Uang Makan Staf)
        </button>
        <button
          type="button"
          onClick={() => {
            setPayrollType("BULANAN");
            setStartDate(datePresets.monthStart);
            setEndDate(datePresets.monthEnd);
            setNotes(`Gaji Bulanan ${datePresets.monthName}`);
          }}
          className={`flex-1 rounded-lg py-2 transition text-center ${
            payrollType === "BULANAN"
              ? "bg-white text-blue-700 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          💼 Gaji Bulanan (Staf Akhir Bulan)
        </button>
      </div>

      <input type="hidden" name="payroll_type" value={payrollType} />

      {/* Preset Tombol Pintas 1-Klik */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-slate-500">Pilih Periode Cepat (1-Klik):</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {payrollType === "MINGGUAN" ? (
            <>
              <button
                type="button"
                onClick={() =>
                  applyPreset(
                    "MINGGUAN",
                    datePresets.thisWeekStart,
                    datePresets.thisWeekEnd,
                    `Upah Harian & Uang Makan Staf (${datePresets.thisWeekLabel})`
                  )
                }
                className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-1 font-semibold text-emerald-700 hover:bg-emerald-100 transition"
              >
                ⚡ Minggu Ini ({datePresets.thisWeekLabel})
              </button>
              <button
                type="button"
                onClick={() =>
                  applyPreset(
                    "MINGGUAN",
                    datePresets.lastWeekStart,
                    datePresets.lastWeekEnd,
                    `Upah Harian & Uang Makan Staf (${datePresets.lastWeekLabel})`
                  )
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                Minggu Lalu ({datePresets.lastWeekLabel})
              </button>
              <button
                type="button"
                onClick={() =>
                  applyPreset(
                    "MINGGUAN",
                    datePresets.nextWeekStart,
                    datePresets.nextWeekEnd,
                    `Upah Harian & Uang Makan Staf (${datePresets.nextWeekLabel})`
                  )
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                Minggu Depan ({datePresets.nextWeekLabel})
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() =>
                  applyPreset(
                    "BULANAN",
                    datePresets.monthStart,
                    datePresets.monthEnd,
                    `Gaji Bulanan ${datePresets.monthName}`
                  )
                }
                className="rounded-lg border border-blue-200 bg-blue-50/70 px-2.5 py-1 font-semibold text-blue-700 hover:bg-blue-100 transition"
              >
                ⚡ Bulan Ini ({datePresets.monthStart} s/d {datePresets.monthEnd})
              </button>
              <button
                type="button"
                onClick={() =>
                  applyPreset(
                    "BULANAN",
                    datePresets.prevMonthStart,
                    datePresets.prevMonthEnd,
                    "Gaji Bulanan Bulan Lalu"
                  )
                }
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                Bulan Lalu ({datePresets.prevMonthStart} s/d {datePresets.prevMonthEnd})
              </button>
            </>
          )}
        </div>
      </div>

      {/* Input Tanggal */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Periode Mulai</label>
          <input
            name="period_start"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Periode Selesai</label>
          <input
            name="period_end"
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Catatan Payout (Opsional)</label>
        <input
          name="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Cth: Upah Harian & Uang Makan Staf (03 - 09 Okt 2026)"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Ketentuan Transparan */}
      <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3 text-[11px] text-slate-600 space-y-1">
        <div className="font-bold text-slate-800">
          {payrollType === "MINGGUAN" ? "📌 Ketentuan Payroll Mingguan:" : "📌 Ketentuan Payroll Bulanan:"}
        </div>
        {payrollType === "MINGGUAN" ? (
          <div>
            • <b>Pekerja Harian:</b> Dihitung otomatis kehadiran fisik + lembur normal (potong kasbon).<br />
            • <b>Staf Bulanan:</b> Cair otomatis <b>Uang Makan Mingguan</b> (Rp 50.000 / hari masuk aktif, tanpa potong kasbon).<br />
            • Gaji pokok staf bulanan tetap utuh dicairkan pada akhir bulan.
          </div>
        ) : (
          <div>
            • Gaji pokok bulanan tetap otomatis dihitung untuk seluruh staf bulanan.<br />
            • Lembur dihitung per jam dengan rumus: <b>Gaji Pokok ÷ 190</b>.<br />
            • Otomatis memotong cicilan kasbon kantor & hutang warung mitra di akhir bulan.
          </div>
        )}
      </div>

      <button
        type="submit"
        className={`w-full rounded-xl py-2.5 text-xs font-bold text-white shadow-xs transition ${
          payrollType === "MINGGUAN"
            ? "bg-emerald-600 hover:bg-emerald-700"
            : "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        🚀 Finalisasi {payrollType === "MINGGUAN" ? "Upah Harian & Uang Makan Staf" : "Gaji Bulanan Sekarang"}
      </button>
    </form>
  );
}
