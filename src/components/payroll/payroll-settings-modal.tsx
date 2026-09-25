"use client";

import { useState } from "react";
import { savePayrollShiftSettingsAction } from "@/lib/final/actions";

export type PayrollSettingsMap = {
  SHIFT_WEEKDAY_IN?: string;
  SHIFT_WEEKDAY_OUT?: string;
  SHIFT_SATURDAY_OUT?: string;
  SHIFT_SUNDAY_IN?: string;
  SHIFT_SUNDAY_OUT?: string;
  OT_DIVISOR_HARIAN?: number | string;
  OT_BONUS_HARIAN_4H?: number | string;
  HARIAN_HOLIDAY_BONUS_FULL?: number | string;
  HARIAN_HOLIDAY_BONUS_HALF?: number | string;
  OT_DIVISOR_BULANAN?: number | string;
  OT_BONUS_BULANAN_4H?: number | string;
  MEAL_FULL?: number | string;
  MEAL_HALF?: number | string;
  BULANAN_SUNDAY_MEAL?: number | string;
  FRIDAY_OVERTIME_NEXT_WEEK?: string;
};

type Props = {
  initialSettings: PayrollSettingsMap;
  canWrite: boolean;
  returnPath?: string;
};

export default function PayrollSettingsModal({
  initialSettings,
  canWrite,
  returnPath = "/dashboard/payroll",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);

  // Form states
  const [weekdayIn, setWeekdayIn] = useState(initialSettings.SHIFT_WEEKDAY_IN || "08:00");
  const [weekdayOut, setWeekdayOut] = useState(initialSettings.SHIFT_WEEKDAY_OUT || "17:00");
  const [saturdayOut, setSaturdayOut] = useState(initialSettings.SHIFT_SATURDAY_OUT || "15:00");
  const [sundayIn, setSundayIn] = useState(initialSettings.SHIFT_SUNDAY_IN || "08:00");
  const [sundayOut, setSundayOut] = useState(initialSettings.SHIFT_SUNDAY_OUT || "17:00");

  const [otDivHarian, setOtDivHarian] = useState(initialSettings.OT_DIVISOR_HARIAN ?? 8);
  const [otBonus4hHarian, setOtBonus4hHarian] = useState(initialSettings.OT_BONUS_HARIAN_4H ?? 5000);
  const [harianSundayBonus, setHarianSundayBonus] = useState(initialSettings.HARIAN_HOLIDAY_BONUS_FULL ?? 20000);
  const [fridayNextWeek, setFridayNextWeek] = useState(initialSettings.FRIDAY_OVERTIME_NEXT_WEEK !== "FALSE");

  const [otDivBulanan, setOtDivBulanan] = useState(initialSettings.OT_DIVISOR_BULANAN ?? 190);
  const [otBonus4hBulanan, setOtBonus4hBulanan] = useState(initialSettings.OT_BONUS_BULANAN_4H ?? 17500);
  const [mealFull, setMealFull] = useState(initialSettings.MEAL_FULL ?? 50000);
  const [mealHalf, setMealHalf] = useState(initialSettings.MEAL_HALF ?? 25000);
  const [sundayMealBulanan, setSundayMealBulanan] = useState(initialSettings.BULANAN_SUNDAY_MEAL ?? 50000);

  if (!canWrite) return null;

  return (
    <div>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-400 transition cursor-pointer"
      >
        <span>⚙️</span>
        <span>Atur Jam Kerja & Tarif Lembur</span>
      </button>

      {/* Modal Dialog */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <span>⚙️</span>
                  <span>Pengaturan Jam Kerja, Shift & Tarif Lembur</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sesuaikan jadwal jam pulang normal, rumus pembagi lembur, bonus $\ge$ 4 jam, dan insentif hari Minggu.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <form action={savePayrollShiftSettingsAction} className="space-y-6">
              <input type="hidden" name="return_path" value={returnPath} />

              {/* 1. JADWAL SHIFT KERJA PABRIK */}
              <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-extrabold text-blue-950 uppercase tracking-wider">
                  <span>📅</span>
                  <span>1. Jadwal Shift Normal & Batas Lembur</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Senin – Jumat: Jam Masuk
                    </label>
                    <input
                      name="SHIFT_WEEKDAY_IN"
                      type="time"
                      value={weekdayIn}
                      onChange={(e) => setWeekdayIn(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 font-bold outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Senin – Jumat: Jam Pulang Normal
                    </label>
                    <input
                      name="SHIFT_WEEKDAY_OUT"
                      type="time"
                      value={weekdayOut}
                      onChange={(e) => setWeekdayOut(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 font-bold outline-none focus:border-blue-500"
                    />
                    <span className="text-[10px] text-slate-500">Lewat jam ini dihitung lembur</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Sabtu: Jam Pulang Normal
                    </label>
                    <input
                      name="SHIFT_SATURDAY_OUT"
                      type="time"
                      value={saturdayOut}
                      onChange={(e) => setSaturdayOut(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 font-bold outline-none focus:border-blue-500"
                    />
                    <span className="text-[10px] text-slate-500">Lewat jam ini dihitung lembur</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Minggu: Jam Masuk Lembur
                    </label>
                    <input
                      name="SHIFT_SUNDAY_IN"
                      type="time"
                      value={sundayIn}
                      onChange={(e) => setSundayIn(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 font-bold outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Minggu: Jam Pulang Lembur
                    </label>
                    <input
                      name="SHIFT_SUNDAY_OUT"
                      type="time"
                      value={sundayOut}
                      onChange={(e) => setSundayOut(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 font-bold outline-none focus:border-blue-500"
                    />
                    <span className="text-[10px] text-slate-500">Standar 8 jam kerja efektif</span>
                  </div>
                </div>
              </div>

              {/* 2. ATURAN UPAH & LEMBUR PEKERJA HARIAN */}
              <div className="rounded-2xl border border-amber-100 bg-amber-50/30 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-extrabold text-amber-950 uppercase tracking-wider">
                  <span>👷</span>
                  <span>2. Ketentuan Upah Lembur Pekerja Harian (HARIAN)</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Pembagi Upah Lembur Harian
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500">Gaji Harian /</span>
                      <input
                        name="OT_DIVISOR_HARIAN"
                        type="number"
                        min="1"
                        step="any"
                        value={otDivHarian}
                        onChange={(e) => setOtDivHarian(Number(e.target.value) || 8)}
                        className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 font-bold outline-none focus:border-blue-500"
                      />
                      <span className="text-xs text-slate-500">jam</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Bonus Lembur &ge; 4 Jam (Rp)
                    </label>
                    <input
                      name="OT_BONUS_HARIAN_4H"
                      type="number"
                      min="0"
                      step="any"
                      value={otBonus4hHarian}
                      onChange={(e) => setOtBonus4hHarian(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 font-bold outline-none focus:border-blue-500"
                    />
                    <span className="text-[10px] text-slate-500">Tambahan per hari lembur &ge; 4 jam</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Tambahan Hadir Hari Minggu (Rp)
                    </label>
                    <input
                      name="HARIAN_HOLIDAY_BONUS_FULL"
                      type="number"
                      min="0"
                      step="any"
                      value={harianSundayBonus}
                      onChange={(e) => setHarianSundayBonus(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 font-bold outline-none focus:border-blue-500"
                    />
                    <span className="text-[10px] text-slate-500">Uang kehadiran hari Minggu/libur</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-amber-200/60">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 select-none">
                    <input
                      type="checkbox"
                      name="FRIDAY_OVERTIME_NEXT_WEEK"
                      value="TRUE"
                      checked={fridayNextWeek}
                      onChange={(e) => setFridayNextWeek(e.target.checked)}
                      className="h-4 w-4 rounded accent-amber-600"
                    />
                    <span>
                      <b>Cutoff Jumat:</b> Lembur Jumat malam (&gt;17:00) pekerja harian dialihkan ke slip gaji periode minggu berikutnya.
                    </span>
                  </label>
                </div>
              </div>

              {/* 3. ATURAN UPAH & LEMBUR KARYAWAN BULANAN */}
              <div className="rounded-2xl border border-purple-100 bg-purple-50/30 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-extrabold text-purple-950 uppercase tracking-wider">
                  <span>👔</span>
                  <span>3. Ketentuan Lembur & Uang Makan Karyawan Bulanan (BULANAN)</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Pembagi Upah Lembur Bulanan
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500">Gaji /</span>
                      <input
                        name="OT_DIVISOR_BULANAN"
                        type="number"
                        min="1"
                        step="any"
                        value={otDivBulanan}
                        onChange={(e) => setOtDivBulanan(Number(e.target.value) || 190)}
                        className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 font-bold outline-none focus:border-blue-500"
                      />
                      <span className="text-xs text-slate-500">jam/bulan</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Bonus Lembur &ge; 4 Jam (Rp)
                    </label>
                    <input
                      name="OT_BONUS_BULANAN_4H"
                      type="number"
                      min="0"
                      step="any"
                      value={otBonus4hBulanan}
                      onChange={(e) => setOtBonus4hBulanan(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 font-bold outline-none focus:border-blue-500"
                    />
                    <span className="text-[10px] text-slate-500">Tambahan per hari lembur &ge; 4 jam</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Uang Makan Hari Minggu (Rp)
                    </label>
                    <input
                      name="BULANAN_SUNDAY_MEAL"
                      type="number"
                      min="0"
                      step="any"
                      value={sundayMealBulanan}
                      onChange={(e) => setSundayMealBulanan(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 font-bold outline-none focus:border-blue-500"
                    />
                    <span className="text-[10px] text-slate-500">Tambahan uang makan masuk Minggu</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Uang Makan Full Day (Rp)
                    </label>
                    <input
                      name="MEAL_FULL"
                      type="number"
                      min="0"
                      step="any"
                      value={mealFull}
                      onChange={(e) => setMealFull(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 font-bold outline-none focus:border-blue-500"
                    />
                    <span className="text-[10px] text-slate-500">Per hari kehadiran penuh</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Uang Makan Half Day (Rp)
                    </label>
                    <input
                      name="MEAL_HALF"
                      type="number"
                      min="0"
                      step="any"
                      value={mealHalf}
                      onChange={(e) => setMealHalf(Number(e.target.value) || 0)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 font-bold outline-none focus:border-blue-500"
                    />
                    <span className="text-[10px] text-slate-500">Per hari kehadiran setengah hari</span>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white shadow-md hover:bg-blue-700 transition"
                >
                  💾 Simpan Pengaturan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
