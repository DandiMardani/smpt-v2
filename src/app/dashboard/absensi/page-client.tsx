"use client";

import { useState, useMemo, useTransition } from "react";
import SecureAttendanceImport from "@/components/attendance/secure-attendance-import";
import AttendanceManager, {
  type AttendanceRecordItem,
  type WorkerItem,
} from "@/components/attendance/attendance-manager";
import PayrollSettingsModal, {
  type PayrollSettingsMap,
} from "@/components/payroll/payroll-settings-modal";
import {
  Card,
  Flow,
  Notice,
  PageShell,
  ReadOnly,
} from "@/components/final/final-ui";
import { calculateShiftOvertime } from "@/lib/attendance/overtime-calculator";
import { addAttendanceAction } from "@/lib/final/actions";

const BULANAN_NAMES = ["SURATNO", "DANDI MARDANI", "USMAN ALAMSYAH", "JAJANG ROSADI", "SUHERMANTO", "SUHERMAN", "NEDIH"];

function isBulananWorker(w: WorkerItem): boolean {
  if (w.pay_system === "BULANAN") return true;
  const uname = (w.name || "").toUpperCase();
  return BULANAN_NAMES.some((bn) => uname.includes(bn));
}

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

type RowState = {
  workerId: number;
  isPresent: boolean;
  actualIn: string;
  actualOut: string;
  overtimeOut: string;
  status: string;
  notes: string;
};

function QuickManualAttendanceSheet({
  workers,
  shiftSettings,
}: {
  workers: WorkerItem[];
  shiftSettings?: Record<string, any>;
}) {
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [tab, setTab] = useState<"BULANAN" | "HARIAN">("BULANAN");
  const [isPending, startTransition] = useTransition();
  const [saveSuccess, setSaveSuccess] = useState(false);

  const dayInfo = useMemo(() => {
    const parts = date.split("-");
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    const dow = d.getDay();
    const isSun = dow === 0;
    const isSat = dow === 6;
    const name = DAY_NAMES[dow];

    let defaultIn = (shiftSettings?.SHIFT_WEEKDAY_IN as string) || "08:00";
    let defaultOut = (shiftSettings?.SHIFT_WEEKDAY_OUT as string) || "17:00";
    if (isSat) {
      defaultOut = (shiftSettings?.SHIFT_SATURDAY_OUT as string) || "15:00";
    } else if (isSun) {
      defaultIn = (shiftSettings?.SHIFT_SUNDAY_IN as string) || "08:00";
      defaultOut = (shiftSettings?.SHIFT_SUNDAY_OUT as string) || "17:00";
    }

    return { dow, name, isSun, isSat, defaultIn, defaultOut };
  }, [date, shiftSettings]);

  const bulananWorkers = useMemo(() => workers.filter((w) => isBulananWorker(w)), [workers]);
  const harianWorkers = useMemo(() => workers.filter((w) => !isBulananWorker(w)), [workers]);

  const [rowStates, setRowStates] = useState<Record<number, RowState>>(() => {
    const init: Record<number, RowState> = {};
    for (const w of workers) {
      init[w.id] = {
        workerId: w.id,
        isPresent: true,
        actualIn: "08:00",
        actualOut: "17:00",
        overtimeOut: "",
        status: "HADIR",
        notes: "",
      };
    }
    return init;
  });

  const activeWorkerList = tab === "BULANAN" ? bulananWorkers : harianWorkers;

  const handleApplyDayTemplate = () => {
    setRowStates((prev) => {
      const next = { ...prev };
      for (const w of activeWorkerList) {
        next[w.id] = {
          ...next[w.id],
          isPresent: true,
          actualIn: dayInfo.defaultIn,
          actualOut: dayInfo.defaultOut,
          status: "HADIR",
        };
      }
      return next;
    });
  };

  const handleToggleCheckAll = (present: boolean) => {
    setRowStates((prev) => {
      const next = { ...prev };
      for (const w of activeWorkerList) {
        next[w.id] = {
          ...next[w.id],
          isPresent: present,
          status: present ? "HADIR" : "ALPHA",
        };
      }
      return next;
    });
  };

  const updateRow = (wId: number, partial: Partial<RowState>) => {
    setRowStates((prev) => ({
      ...prev,
      [wId]: { ...prev[wId], ...partial },
    }));
  };

  const handleSaveAll = async () => {
    setSaveSuccess(false);
    startTransition(async () => {
      for (const w of activeWorkerList) {
        const row = rowStates[w.id];
        if (!row) continue;

        const effectiveOut = row.overtimeOut ? row.overtimeOut : row.actualOut;
        const paySystem = isBulananWorker(w) ? "BULANAN" : "HARIAN";
        const calc = calculateShiftOvertime(
          date,
          row.isPresent ? row.actualIn : null,
          row.isPresent ? effectiveOut : null,
          paySystem,
          null,
          shiftSettings
        );

        const fd = new FormData();
        fd.append("worker_id", String(w.id));
        fd.append("attendance_date", date);
        fd.append("schedule_in", dayInfo.defaultIn);
        fd.append("schedule_out", dayInfo.defaultOut);
        fd.append("actual_in", row.isPresent ? row.actualIn : "");
        fd.append("actual_out", row.isPresent ? effectiveOut : "");
        fd.append("attendance_status", row.isPresent ? "HADIR" : row.status);
        fd.append("overtime_minutes", String(row.isPresent ? calc.overtimeMinutes : 0));
        fd.append(
          "notes",
          row.notes || (row.overtimeOut ? `Lembur pulang ${row.overtimeOut}` : "")
        );

        try {
          await addAttendanceAction(fd);
        } catch {
          // ignore
        }
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 5000);
    });
  };

  return (
    <div className="space-y-4">
      {/* Filter Tanggal & Template Hari */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Pilih Tanggal Absensi</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 mt-4 sm:mt-0">
            <span
              className={`rounded-xl px-3 py-1.5 text-xs font-black border ${
                dayInfo.isSun
                  ? "bg-rose-100 text-rose-900 border-rose-300"
                  : dayInfo.isSat
                  ? "bg-amber-100 text-amber-900 border-amber-300"
                  : "bg-blue-100 text-blue-900 border-blue-300"
              }`}
            >
              📅 {dayInfo.name}, {date} {dayInfo.isSun ? "(Hari Libur/Lembur Minggu)" : dayInfo.isSat ? "(Pulang 15:00)" : "(Shift Normal)"}
            </span>

            <button
              type="button"
              onClick={handleApplyDayTemplate}
              className="rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition"
            >
              ⚡ Setel Jam ({dayInfo.defaultIn} – {dayInfo.defaultOut}) ke Semua
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleToggleCheckAll(true)}
            className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition"
          >
            ✓ Ceklis Semua Hadir
          </button>
          <button
            type="button"
            onClick={() => handleToggleCheckAll(false)}
            className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 transition"
          >
            ✕ Kosongkan Semua (Alfa)
          </button>
        </div>
      </div>

      {/* Tab Bulanan vs Harian */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setTab("BULANAN")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition ${
            tab === "BULANAN"
              ? "bg-purple-600 text-white shadow-md ring-2 ring-purple-300"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <span>👔 Karyawan Bulanan ({bulananWorkers.length} Staf)</span>
        </button>

        <button
          type="button"
          onClick={() => setTab("HARIAN")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition ${
            tab === "HARIAN"
              ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-300"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <span>👷‍♂️ Karyawan Harian ({harianWorkers.length} Orang)</span>
        </button>
      </div>

      {/* Tabel Absensi */}
      <div className="max-h-[500px] overflow-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 text-left font-bold text-slate-700 border-b border-slate-200">
            <tr>
              <th className="px-3.5 py-3 w-12 text-center">Hadir</th>
              <th className="px-3.5 py-3">Nama Pekerja</th>
              <th className="px-3.5 py-3">Jam Masuk</th>
              <th className="px-3.5 py-3">Jam Pulang Normal</th>
              <th className="px-3.5 py-3">Jam Pulang Lembur (Opsional)</th>
              <th className="px-3.5 py-3">Estimasi Lembur</th>
              <th className="px-3.5 py-3">Status / Alasan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {activeWorkerList.map((worker) => {
              const row = rowStates[worker.id] || {
                workerId: worker.id,
                isPresent: true,
                actualIn: dayInfo.defaultIn,
                actualOut: dayInfo.defaultOut,
                overtimeOut: "",
                status: "HADIR",
                notes: "",
              };

              const effectiveOut = row.overtimeOut ? row.overtimeOut : row.actualOut;
              const paySystem = isBulananWorker(worker) ? "BULANAN" : "HARIAN";
              const calc = calculateShiftOvertime(
                date,
                row.isPresent ? row.actualIn : null,
                row.isPresent ? effectiveOut : null,
                paySystem,
                null,
                shiftSettings
              );

              return (
                <tr key={worker.id} className={row.isPresent ? "hover:bg-slate-50/70" : "bg-red-50/30"}>
                  <td className="px-3.5 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={row.isPresent}
                      onChange={(e) => updateRow(worker.id, { isPresent: e.target.checked, status: e.target.checked ? "HADIR" : "ALPHA" })}
                      className="h-4 w-4 rounded accent-emerald-600 cursor-pointer"
                    />
                  </td>
                  <td className="px-3.5 py-2.5">
                    <b className="font-extrabold text-slate-900 block">{worker.name}</b>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Finger #{worker.finger_id || "-"} · {worker.position || worker.department || (isBulananWorker(worker) ? "STAF" : "HELPER")}
                    </span>
                  </td>

                  <td className="px-3.5 py-2.5">
                    <input
                      type="time"
                      disabled={!row.isPresent}
                      value={row.actualIn}
                      onChange={(e) => updateRow(worker.id, { actualIn: e.target.value })}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 font-bold disabled:bg-slate-100"
                    />
                  </td>

                  <td className="px-3.5 py-2.5">
                    <input
                      type="time"
                      disabled={!row.isPresent}
                      value={row.actualOut}
                      onChange={(e) => updateRow(worker.id, { actualOut: e.target.value })}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 font-bold disabled:bg-slate-100"
                    />
                  </td>

                  <td className="px-3.5 py-2.5">
                    <input
                      type="time"
                      disabled={!row.isPresent}
                      value={row.overtimeOut}
                      placeholder="Cth: 21:00"
                      onChange={(e) => updateRow(worker.id, { overtimeOut: e.target.value })}
                      className="rounded-lg border border-blue-200 bg-blue-50/30 px-2 py-1 text-xs text-blue-900 font-bold disabled:bg-slate-100"
                    />
                  </td>

                  <td className="px-3.5 py-2.5">
                    {row.isPresent ? (
                      calc.overtimeMinutes > 0 ? (
                        <span className="inline-flex items-center rounded-lg bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-900">
                          ⚡ {calc.overtimeHours} jam ({calc.overtimeMinutes} mnt)
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">0 jam</span>
                      )
                    ) : (
                      <span className="text-red-500 font-bold text-[11px]">Tidak Hadir</span>
                    )}
                  </td>

                  <td className="px-3.5 py-2.5">
                    {!row.isPresent ? (
                      <select
                        value={row.status}
                        onChange={(e) => updateRow(worker.id, { status: e.target.value })}
                        className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-bold text-red-900"
                      >
                        <option value="ALPHA">ALPHA (TIDAK HADIR)</option>
                        <option value="SAKIT">SAKIT</option>
                        <option value="IZIN">IZIN</option>
                        <option value="CUTI">CUTI</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={row.notes}
                        placeholder="Catatan..."
                        onChange={(e) => updateRow(worker.id, { notes: e.target.value })}
                        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 w-full"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tombol Simpan */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div>
          {saveSuccess && (
            <span className="rounded-xl bg-emerald-100 border border-emerald-300 px-3 py-1.5 text-xs font-bold text-emerald-900">
              ✓ Berhasil menyimpan absensi {dayInfo.name}, {date}!
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={handleSaveAll}
          className="rounded-xl bg-blue-600 hover:bg-blue-700 px-6 py-2.5 text-xs font-black text-white shadow-md transition disabled:opacity-50 cursor-pointer"
        >
          {isPending ? "Sedang Menyimpan..." : `💾 Simpan Absensi Hari Ini (${tab === "BULANAN" ? "Staf Bulanan" : "Helper Harian"})`}
        </button>
      </div>
    </div>
  );
}

export function AttendancePageClient({
  workers,
  attendance,
  settingsMap,
  canWrite,
  successParam,
  errorParam,
}: {
  workers: WorkerItem[];
  attendance: AttendanceRecordItem[];
  settingsMap: PayrollSettingsMap;
  canWrite: boolean;
  successParam?: string;
  errorParam?: string;
}) {
  const [inputMode, setInputMode] = useState<"UPLOAD_FINGERPRINT" | "MANUAL_SHEET">("UPLOAD_FINGERPRINT");

  return (
    <PageShell
      eyebrow="SDM & Payroll"
      title="Presensi & Absensi"
      description="Pilih metode pencatatan: Scan Fingerprint atau Lembar Checklist Manual Cepat."
    >
      <Notice success={successParam} error={errorParam} />
      {!canWrite ? <ReadOnly /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Flow>
          Sistem otomatis memilah Karyawan Bulanan vs Helper Harian. Jam kerja normal dan lembur disesuaikan dengan jadwal shift pabrik.
        </Flow>
        {canWrite ? (
          <div className="shrink-0">
            <PayrollSettingsModal initialSettings={settingsMap} canWrite={canWrite} returnPath="/dashboard/absensi" />
          </div>
        ) : null}
      </div>

      {/* SAKELAR METODE INPUT */}
      {canWrite && (
        <div className="flex items-center gap-2 rounded-2xl bg-slate-100/90 p-1.5 border border-slate-200 w-fit">
          <button
            type="button"
            onClick={() => setInputMode("UPLOAD_FINGERPRINT")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition cursor-pointer ${
              inputMode === "UPLOAD_FINGERPRINT"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>📁</span>
            <span>Mode 1: Upload File Fingerprint (Otomatis)</span>
          </button>

          <button
            type="button"
            onClick={() => setInputMode("MANUAL_SHEET")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition cursor-pointer ${
              inputMode === "MANUAL_SHEET"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>📝</span>
            <span>Mode 2: Lembar Checklist Manual Harian</span>
          </button>
        </div>
      )}

      {/* KONTEN SESUAI MODE */}
      {inputMode === "UPLOAD_FINGERPRINT" ? (
        <SecureAttendanceImport canWrite={canWrite} />
      ) : (
        <Card title="Lembar Input Cepat Presensi & Lembur Per Hari">
          <QuickManualAttendanceSheet workers={workers} shiftSettings={settingsMap} />
        </Card>
      )}

      {/* DATA & VERIFIKASI */}
      <Card title="Data & Verifikasi Absensi">
        <AttendanceManager
          records={attendance}
          workers={workers}
          canWrite={canWrite}
          shiftSettings={settingsMap}
        />
      </Card>
    </PageShell>
  );
}
