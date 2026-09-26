"use client";

import { useState } from "react";
import { finalizePayrollAction } from "@/lib/final/actions";

export default function PayrollFinalizeForm() {
  const [payrollType, setPayrollType] = useState<"BULANAN" | "MINGGUAN">("BULANAN");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  const applyPreset = (type: "BULANAN" | "MINGGUAN", start: string, end: string, noteLabel: string) => {
    setPayrollType(type);
    setStartDate(start);
    setEndDate(end);
    setNotes(noteLabel);
  };

  // Helper date calculations
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();

  // Bulan ini: 01 s/d tgl terakhir bulan ini
  const monthStart = new Date(Date.UTC(curYear, curMonth, 1)).toISOString().slice(0, 10);
  const lastDay = new Date(Date.UTC(curYear, curMonth + 1, 0)).getDate();
  const monthEnd = new Date(Date.UTC(curYear, curMonth, lastDay)).toISOString().slice(0, 10);
  const monthName = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(now);

  // Bulan lalu
  const prevMonthStart = new Date(Date.UTC(curYear, curMonth - 1, 1)).toISOString().slice(0, 10);
  const prevMonthLastDay = new Date(Date.UTC(curYear, curMonth, 0)).getDate();
  const prevMonthEnd = new Date(Date.UTC(curYear, curMonth - 1, prevMonthLastDay)).toISOString().slice(0, 10);

  return (
    <form action={finalizePayrollAction} className="space-y-4">
      {/* Tab Jenis Payroll */}
      <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
        <button
          type="button"
          onClick={() => {
            setPayrollType("BULANAN");
            setStartDate(monthStart);
            setEndDate(monthEnd);
            setNotes(`Gaji Bulanan ${monthName}`);
          }}
          className={`flex-1 rounded-lg py-2 transition text-center ${
            payrollType === "BULANAN"
              ? "bg-white text-blue-700 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          💼 Gaji Bulanan (Staf / Karyawan)
        </button>
        <button
          type="button"
          onClick={() => {
            setPayrollType("MINGGUAN");
            setStartDate("2026-09-19");
            setEndDate("2026-09-25");
            setNotes("Upah Mingguan Pekerja Harian (19-25 Sep 2026)");
          }}
          className={`flex-1 rounded-lg py-2 transition text-center ${
            payrollType === "MINGGUAN"
              ? "bg-white text-emerald-700 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          ⏱️ Gaji Mingguan (Pekerja Harian)
        </button>
      </div>

      <input type="hidden" name="payroll_type" value={payrollType} />

      {/* Preset Tombol Pintas */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-slate-500">Pilih Periode Cepat (1-Klik):</div>
        <div className="flex flex-wrap gap-2 text-xs">
          {payrollType === "BULANAN" ? (
            <>
              <button
                type="button"
                onClick={() => applyPreset("BULANAN", monthStart, monthEnd, `Gaji Bulanan ${monthName}`)}
                className="rounded-lg border border-blue-200 bg-blue-50/70 px-2.5 py-1 font-semibold text-blue-700 hover:bg-blue-100 transition"
              >
                ⚡ Bulan Ini ({monthStart} s/d {monthEnd})
              </button>
              <button
                type="button"
                onClick={() => applyPreset("BULANAN", prevMonthStart, prevMonthEnd, `Gaji Bulanan Bulan Lalu`)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                Bulan Lalu ({prevMonthStart} s/d {prevMonthEnd})
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => applyPreset("MINGGUAN", "2026-09-19", "2026-09-25", "Upah Mingguan (19 - 25 Sep 2026)")}
                className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-1 font-semibold text-emerald-700 hover:bg-emerald-100 transition"
              >
                ⚡ Minggu Ini (19 s/d 25 Sep 2026)
              </button>
              <button
                type="button"
                onClick={() => applyPreset("MINGGUAN", "2026-09-12", "2026-09-18", "Upah Mingguan (12 - 18 Sep 2026)")}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                Minggu Lalu (12 s/d 18 Sep 2026)
              </button>
              <button
                type="button"
                onClick={() => applyPreset("MINGGUAN", "2026-09-26", "2026-10-02", "Upah Mingguan (26 Sep - 02 Okt 2026)")}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                Minggu Depan (26 Sep s/d 02 Okt 2026)
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
          placeholder="Cth: Gaji Bulanan September 2026"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Penjelasan Ringkas & Transparan */}
      <div className="rounded-xl border border-slate-200/60 bg-slate-50 p-3 text-[11px] text-slate-600 space-y-1">
        <div className="font-bold text-slate-800">
          {payrollType === "BULANAN" ? "ℹ️ Ketentuan Payroll Bulanan:" : "ℹ️ Ketentuan Payroll Mingguan:"}
        </div>
        {payrollType === "BULANAN" ? (
          <div>
            • Gaji pokok bulanan tetap otomatis dihitung.<br />
            • Lembur per jam dihitung dengan rumus: <b>Gaji Pokok ÷ 190</b>.<br />
            • Bonus lembur minimal 4 jam: <b>+Rp 17.500</b>.<br />
            • Uang makan lembur/hadir hari Minggu: <b>+Rp 50.000</b>.<br />
            • Otomatis memotong cicilan kasbon kantor bulan berjalan.
          </div>
        ) : (
          <div>
            • Upah harian dihitung berdasarkan kehadiran fisik.<br />
            • Lembur per jam dihitung dengan rumus: <b>Upah Pokok ÷ 8</b>.<br />
            • Bonus lembur minimal 4 jam: <b>+Rp 5.000</b>.<br />
            • Hadir hari Minggu: <b>+Rp 20.000</b>.<br />
            • Otomatis memotong cicilan kasbon kantor & hutang warung mitra.
          </div>
        )}
      </div>

      <button
        type="submit"
        className={`w-full rounded-xl py-2.5 text-xs font-bold text-white shadow-xs transition ${
          payrollType === "BULANAN"
            ? "bg-blue-600 hover:bg-blue-700"
            : "bg-emerald-600 hover:bg-emerald-700"
        }`}
      >
        🚀 Finalisasi Gaji {payrollType === "BULANAN" ? "Bulanan" : "Mingguan"} Sekarang
      </button>
    </form>
  );
}
