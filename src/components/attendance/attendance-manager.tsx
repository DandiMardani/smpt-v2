"use client";

import { useMemo, useState, useTransition } from "react";
import {
  calculateShiftOvertime,
  formatMinutesToHours,
  timeToMinutes,
  type ShiftOvertimeResult,
} from "@/lib/attendance/overtime-calculator";
import {
  verifyAttendanceAction,
  verifyBulkAttendanceAction,
  unverifyAttendanceAction,
  autoFixMissingOutAttendanceAction,
  deleteAttendanceAction,
  deleteBulkAttendanceAction,
} from "@/lib/final/actions";

export type AttendanceRecordItem = {
  id: number;
  attendance_code: string;
  worker_id: number;
  attendance_date: string;
  attendance_status: string;
  day_class: string | null;
  schedule_in: string | null;
  schedule_out: string | null;
  actual_in: string | null;
  actual_out: string | null;
  overtime_minutes: number;
  verification_status: string;
  notes?: string | null;
};

export type WorkerItem = {
  id: number;
  worker_code: string;
  name: string;
  finger_id?: string | null;
  pay_system?: string | null;
  department?: string | null;
  position?: string | null;
  daily_wage?: number | string | null;
  monthly_salary?: number | string | null;
};

export type FinalizedPayrollRun = {
  id: number;
  payroll_code: string;
  payroll_type: string;
  period_start: string;
  period_end: string;
  status: string;
};

export type AttendanceStatusFilter =
  | "DRAFT"
  | "ANOMALI"
  | "TERVERIFIKASI"
  | "DIBAYAR"
  | "NON_HADIR"
  | "ALL";

type Props = {
  records: AttendanceRecordItem[];
  workers: WorkerItem[];
  canWrite: boolean;
  shiftSettings?: Record<string, any>;
  payrollRuns?: FinalizedPayrollRun[];
};

function checkIsHalfDay(rec: AttendanceRecordItem): boolean {
  if (rec.day_class === "HALF_DAY") return true;
  if (rec.actual_in) {
    const match = rec.actual_in.match(/^(\d{1,2}):/);
    if (match) {
      const h = parseInt(match[1], 10);
      if (h >= 12 || (h >= 1 && h <= 6)) return true;
    }
  }
  if (rec.actual_in && rec.actual_out) {
    const inM = timeToMinutes(rec.actual_in);
    const outM = timeToMinutes(rec.actual_out);
    if (inM !== null && outM !== null && outM > inM && outM - inM <= 300) {
      return true;
    }
  }
  return false;
}

export default function AttendanceManager({
  records,
  workers,
  canWrite,
  shiftSettings,
  payrollRuns,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState<AttendanceStatusFilter>("DRAFT");
  const [payTypeFilter, setPayTypeFilter] = useState<"ALL" | "BULANAN" | "HARIAN">("ALL");

  const latestDateInRecords = useMemo(() => {
    return records.length > 0 ? records[0].attendance_date : "";
  }, [records]);

  const [dateFilter, setDateFilter] = useState<string>(() => {
    return records.length > 0 ? records[0].attendance_date : "";
  });

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [defaultDayClass, setDefaultDayClass] = useState<"FULL_DAY" | "HALF_DAY">("FULL_DAY");
  const [useAutoOvertime, setUseAutoOvertime] = useState<boolean>(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const workerMap = useMemo(() => {
    return new Map(workers.map((w) => [w.id, w]));
  }, [workers]);

  const enrichedRecords = useMemo(() => {
    return records.map((rec) => {
      const worker = workerMap.get(rec.worker_id);
      const paySystem = worker?.pay_system || "HARIAN";
      const calc = calculateShiftOvertime(
        rec.attendance_date,
        rec.actual_in,
        rec.actual_out,
        paySystem,
        rec.overtime_minutes > 0 && rec.verification_status === "TERVERIFIKASI"
          ? rec.overtime_minutes
          : null,
        shiftSettings
      );

      const isMissingIn = !rec.actual_in || rec.actual_in === "--:--" || rec.actual_in.trim() === "";
      const isMissingOut = !rec.actual_out || rec.actual_out === "--:--" || rec.actual_out.trim() === "";
      const isHadir = rec.attendance_status === "HADIR";
      const isAnomaly = (isMissingIn || isMissingOut) && isHadir;
      const isHalfDay = isHadir && checkIsHalfDay(rec);

      const matchingPayrollRun = (payrollRuns || []).find((run) => {
        const isTypeMatch =
          (run.payroll_type === "MINGGUAN" && paySystem === "HARIAN") ||
          (run.payroll_type === "BULANAN" && paySystem === "BULANAN");
        return (
          isTypeMatch &&
          rec.attendance_date >= run.period_start &&
          rec.attendance_date <= run.period_end
        );
      });
      const isPaid = Boolean(matchingPayrollRun);

      return {
        ...rec,
        worker,
        paySystem,
        calc,
        isMissingIn,
        isMissingOut,
        isHadir,
        isAnomaly,
        isHalfDay,
        effectiveDayClass: isHalfDay ? "HALF_DAY" : rec.day_class || "FULL_DAY",
        isPaid,
        matchingPayrollRun,
      };
    });
  }, [records, workerMap, shiftSettings, payrollRuns]);

  // Scope records mengikuti filter tanggal & tipe pekerja untuk perhitungan metrik
  const currentScopedRecords = useMemo(() => {
    return enrichedRecords.filter((r) => {
      if (dateFilter && r.attendance_date !== dateFilter) return false;
      if (payTypeFilter !== "ALL" && r.paySystem !== payTypeFilter) return false;
      return true;
    });
  }, [enrichedRecords, dateFilter, payTypeFilter]);

  const totalCount = currentScopedRecords.length;
  const draftCount = currentScopedRecords.filter(
    (r) =>
      !r.isPaid &&
      r.verification_status !== "TERVERIFIKASI" &&
      r.isHadir &&
      !r.isMissingIn &&
      !r.isMissingOut
  ).length;
  const anomalyCount = currentScopedRecords.filter(
    (r) => !r.isPaid && r.verification_status !== "TERVERIFIKASI" && r.isAnomaly
  ).length;
  const verifiedCount = currentScopedRecords.filter(
    (r) => !r.isPaid && r.verification_status === "TERVERIFIKASI" && r.isHadir
  ).length;
  const paidCount = currentScopedRecords.filter((r) => r.isPaid).length;
  const nonHadirCount = currentScopedRecords.filter((r) => !r.isHadir).length;

  const filteredRecords = useMemo(() => {
    return enrichedRecords.filter((rec) => {
      if (statusFilter === "DRAFT") {
        if (rec.isPaid) return false;
        if (rec.verification_status === "TERVERIFIKASI") return false;
        if (!rec.isHadir) return false;
        if (rec.isMissingIn || rec.isMissingOut) return false;
      }
      if (statusFilter === "ANOMALI") {
        if (rec.isPaid) return false;
        if (!rec.isAnomaly || rec.verification_status === "TERVERIFIKASI") return false;
      }
      if (statusFilter === "TERVERIFIKASI") {
        if (rec.isPaid) return false;
        if (rec.verification_status !== "TERVERIFIKASI" || !rec.isHadir) return false;
      }
      if (statusFilter === "DIBAYAR") {
        if (!rec.isPaid) return false;
      }
      if (statusFilter === "NON_HADIR") {
        if (rec.isHadir) return false;
      }
      if (dateFilter && rec.attendance_date !== dateFilter) {
        return false;
      }
      if (payTypeFilter !== "ALL" && rec.paySystem !== payTypeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const wName = rec.worker?.name?.toLowerCase() || "";
        const wCode = rec.worker?.worker_code?.toLowerCase() || "";
        const fId = rec.worker?.finger_id?.toLowerCase() || "";
        const attCode = rec.attendance_code.toLowerCase();
        if (!wName.includes(q) && !wCode.includes(q) && !fId.includes(q) && !attCode.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [enrichedRecords, statusFilter, dateFilter, payTypeFilter, searchQuery]);

  const selectableRecords = filteredRecords.filter((r) => !r.isPaid);
  const isAllSelected =
    selectableRecords.length > 0 &&
    selectableRecords.every((r) => selectedIds.has(r.id));

  const selectedDrafts = filteredRecords.filter(
    (r) => selectedIds.has(r.id) && !r.isPaid && r.verification_status !== "TERVERIFIKASI" && r.isHadir && !r.isMissingIn
  );

  const allDraftsInFilter = filteredRecords.filter(
    (r) => !r.isPaid && r.verification_status !== "TERVERIFIKASI" && r.isHadir && !r.isMissingIn
  );

  function handleTabChange(tab: AttendanceStatusFilter) {
    setStatusFilter(tab);
    setSelectedIds(new Set());
  }

  function handleStepDate(days: number) {
    const base = dateFilter || latestDateInRecords || new Date().toISOString().slice(0, 10);
    const d = new Date(base + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    setDateFilter(d.toISOString().slice(0, 10));
    setSelectedIds(new Set());
  }

  function handleToggleSelectAll() {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set<number>();
      selectableRecords.forEach((r) => next.add(r.id));
      setSelectedIds(next);
    }
  }

  function handleToggleRow(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  }

  function handleDeleteSingle(id: number, workerName: string, date: string) {
    if (!window.confirm(`Yakin ingin menghapus data absensi ${workerName} tanggal ${date}?`)) {
      return;
    }
    const fd = new FormData();
    fd.append("attendance_id", String(id));
    startTransition(async () => {
      await deleteAttendanceAction(fd);
      if (selectedIds.has(id)) {
        const next = new Set(selectedIds);
        next.delete(id);
        setSelectedIds(next);
      }
    });
  }

  function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Yakin ingin menghapus ${selectedIds.size} data absensi yang dipilih?`)) {
      return;
    }
    const fd = new FormData();
    fd.append("attendance_ids", Array.from(selectedIds).join(","));
    startTransition(async () => {
      await deleteBulkAttendanceAction(fd);
      setSelectedIds(new Set());
    });
  }

  function handleBulkVerifySelected() {
    if (selectedDrafts.length === 0) return;
    const items = selectedDrafts.map((row) => {
      const ot = useAutoOvertime ? row.calc.overtimeMinutes : row.overtime_minutes || 0;
      const assignedDayClass = row.isHalfDay ? "HALF_DAY" : (row.day_class || defaultDayClass);
      return {
        id: row.id,
        day_class: assignedDayClass,
        overtime_minutes: ot,
        notes: row.notes || undefined,
      };
    });

    const fd = new FormData();
    fd.append("items", JSON.stringify(items));

    startTransition(async () => {
      await verifyBulkAttendanceAction(fd);
      setSelectedIds(new Set());
    });
  }

  function handleBulkVerifyAllDrafts() {
    if (allDraftsInFilter.length === 0) return;
    const items = allDraftsInFilter.map((row) => {
      const ot = useAutoOvertime ? row.calc.overtimeMinutes : row.overtime_minutes || 0;
      const assignedDayClass = row.isHalfDay ? "HALF_DAY" : (row.day_class || defaultDayClass);
      return {
        id: row.id,
        day_class: assignedDayClass,
        overtime_minutes: ot,
        notes: row.notes || undefined,
      };
    });

    const fd = new FormData();
    fd.append("items", JSON.stringify(items));

    startTransition(async () => {
      await verifyBulkAttendanceAction(fd);
      setSelectedIds(new Set());
    });
  }

  return (
    <div className="space-y-4">
      {/* 1. KPI & Quick Filter Header */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {/* Total */}
        <div
          onClick={() => handleTabChange("ALL")}
          className={`cursor-pointer rounded-2xl border p-3 sm:p-3.5 transition shadow-2xs ${
            statusFilter === "ALL"
              ? "border-blue-500 bg-blue-50/50 text-blue-900 ring-2 ring-blue-300"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
          }`}
        >
          <p className="text-[11px] font-medium text-slate-500">
            {dateFilter ? "Total Hari Ini" : "Semua Presensi"}
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-black text-slate-900">{totalCount}</p>
        </div>

        {/* Tab Filter Anomali / Jam Bolong */}
        <div
          onClick={() => handleTabChange("ANOMALI")}
          className={`cursor-pointer rounded-2xl border p-3 sm:p-3.5 transition shadow-2xs ${
            statusFilter === "ANOMALI"
              ? "border-rose-500 bg-rose-50 text-rose-950 ring-2 ring-rose-400"
              : anomalyCount > 0
              ? "border-rose-300 bg-rose-50/50 text-rose-900 hover:border-rose-400"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-rose-700 flex items-center gap-1">
              <span>⚠️ Jam Bolong</span>
            </p>
            {anomalyCount > 0 ? (
              <span className="inline-flex h-2 w-2 rounded-full bg-rose-500 animate-ping" />
            ) : null}
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-rose-900">{anomalyCount}</span>
            <span className="text-[10px] text-rose-700 font-medium">perlu dicek</span>
          </div>
        </div>

        {/* Draft */}
        <div
          onClick={() => handleTabChange("DRAFT")}
          className={`cursor-pointer rounded-2xl border p-3 sm:p-3.5 transition shadow-2xs ${
            statusFilter === "DRAFT"
              ? "border-amber-500 bg-amber-50/70 text-amber-950 ring-2 ring-amber-300"
              : "border-slate-200 bg-white text-slate-700 hover:border-amber-300"
          }`}
        >
          <p className="text-[11px] font-semibold text-amber-800">⏳ Belum Verif (Draft)</p>
          <p className="mt-1 text-xl sm:text-2xl font-black text-amber-900">{draftCount}</p>
        </div>

        {/* Terverifikasi */}
        <div
          onClick={() => handleTabChange("TERVERIFIKASI")}
          className={`cursor-pointer rounded-2xl border p-3 sm:p-3.5 transition shadow-2xs ${
            statusFilter === "TERVERIFIKASI"
              ? "border-emerald-500 bg-emerald-50/70 text-emerald-950 ring-2 ring-emerald-300"
              : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300"
          }`}
        >
          <p className="text-[11px] font-semibold text-emerald-800">✅ Terverifikasi</p>
          <p className="mt-1 text-xl sm:text-2xl font-black text-emerald-900">{verifiedCount}</p>
        </div>
      </div>

      {/* 2. Banner Solusi Cepat Jam Bolong */}
      {canWrite && anomalyCount > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 via-amber-50 to-orange-50 p-3.5 sm:p-4 text-xs shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="font-black text-rose-900 flex items-center gap-1.5">
              <span>⚠️</span>
              <span>Ditemukan {anomalyCount} data absensi yang lupa scan pulang!</span>
            </div>
            <p className="text-slate-600 text-[11px]">
              Klik tombol di samping untuk mengisi jam pulang otomatis jam 17:00 (Full Day, Lembur 0) serentak.
            </p>
          </div>

          <form action={autoFixMissingOutAttendanceAction} className="shrink-0">
            <input type="hidden" name="start_date" value={dateFilter} />
            <input type="hidden" name="end_date" value={dateFilter} />
            <button
              type="submit"
              className="w-full sm:w-auto rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 font-black text-white shadow-xs transition active:scale-95 text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>⚡</span>
              <span>Set Semua Pulang 17:00 (Lembur 0)</span>
            </button>
          </form>
        </div>
      )}

      {/* 3. Filter Controls: Pencarian, Tanggal & Filter Tipe Pekerja */}
      <div className="space-y-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama pekerja, kode, atau finger..."
              className="w-full sm:w-52 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
            />

            {/* Quick Date Stepper (Per Hari) */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => handleStepDate(-1)}
                className="px-2 py-1 bg-white hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-black shadow-2xs cursor-pointer"
                title="Hari Sebelumnya"
              >
                ◀ H-1
              </button>

              <input
                type="date"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setSelectedIds(new Set());
                }}
                className="rounded-lg bg-transparent px-2 py-1 text-xs font-bold text-slate-800 outline-none"
              />

              <button
                type="button"
                onClick={() => handleStepDate(1)}
                className="px-2 py-1 bg-white hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-black shadow-2xs cursor-pointer"
                title="Hari Berikutnya"
              >
                H+1 ▶
              </button>
            </div>

            {dateFilter ? (
              <button
                type="button"
                onClick={() => setDateFilter("")}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer px-1"
              >
                Semua Tgl
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setDateFilter(latestDateInRecords)}
                className="text-xs font-semibold text-slate-600 hover:text-slate-800 underline cursor-pointer px-1"
              >
                Hari Ini
              </button>
            )}
          </div>

          {/* Filter Tipe Pekerja (Bulanan vs Harian) */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setPayTypeFilter("ALL");
                setSelectedIds(new Set());
              }}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                payTypeFilter === "ALL" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Semua Tipe
            </button>
            <button
              type="button"
              onClick={() => {
                setPayTypeFilter("BULANAN");
                setSelectedIds(new Set());
              }}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                payTypeFilter === "BULANAN" ? "bg-purple-600 text-white shadow-2xs" : "text-purple-800 hover:text-purple-950"
              }`}
            >
              👔 Bulanan
            </button>
            <button
              type="button"
              onClick={() => {
                setPayTypeFilter("HARIAN");
                setSelectedIds(new Set());
              }}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                payTypeFilter === "HARIAN" ? "bg-blue-600 text-white shadow-2xs" : "text-blue-800 hover:text-blue-950"
              }`}
            >
              👷‍♂️ Harian
            </button>
          </div>
        </div>

        {/* Tab Status Presensi */}
        <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl text-xs font-semibold overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => handleTabChange("DRAFT")}
            className={`px-2.5 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
              statusFilter === "DRAFT" ? "bg-amber-500 text-white shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ⏳ Draft ({draftCount})
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("ANOMALI")}
            className={`px-2.5 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
              statusFilter === "ANOMALI" ? "bg-rose-600 text-white shadow-2xs font-bold" : "text-rose-700 hover:text-rose-900"
            }`}
          >
            ⚠️ Jam Bolong ({anomalyCount})
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("TERVERIFIKASI")}
            className={`px-2.5 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
              statusFilter === "TERVERIFIKASI" ? "bg-emerald-600 text-white shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ✅ Terverifikasi ({verifiedCount})
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("DIBAYAR")}
            className={`px-2.5 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
              statusFilter === "DIBAYAR" ? "bg-slate-900 text-white shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            💳 Sudah Dibayar ({paidCount})
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("NON_HADIR")}
            className={`px-2.5 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
              statusFilter === "NON_HADIR" ? "bg-purple-700 text-white shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            🔴 Alpha/Izin ({nonHadirCount})
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("ALL")}
            className={`px-2.5 py-1.5 rounded-lg transition whitespace-nowrap cursor-pointer ${
              statusFilter === "ALL" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Semua ({totalCount})
          </button>
        </div>
      </div>

      {/* 4. Bulk Action Toolbar */}
      {canWrite && (
        <div className="sticky top-2 z-20 rounded-2xl border-2 border-blue-400 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 p-3.5 sm:p-4 text-white shadow-lg transition-all">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-xs sm:text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl border border-white/20 transition select-none">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleToggleSelectAll}
                  disabled={selectableRecords.length === 0}
                  className="h-4 w-4 rounded accent-blue-400"
                />
                <span>Pilih Semua ({selectableRecords.length})</span>
              </label>

              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-400 text-amber-950 font-black px-2.5 py-0.5 text-xs shadow-2xs animate-pulse">
                    {selectedIds.size} dipilih
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="text-[11px] font-bold text-blue-100 hover:text-white underline cursor-pointer"
                  >
                    Batal Pilih
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5 bg-black/20 px-2.5 py-1.5 rounded-xl border border-white/10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useAutoOvertime}
                  onChange={(e) => setUseAutoOvertime(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-emerald-400"
                />
                <span className="font-semibold text-[11px]">Hitung Lembur Otomatis</span>
              </label>

              <select
                value={defaultDayClass}
                onChange={(e) => setDefaultDayClass(e.target.value as "FULL_DAY" | "HALF_DAY")}
                className="rounded-xl border border-white/20 bg-black/20 px-2.5 py-1.5 font-bold text-white outline-none cursor-pointer text-xs"
              >
                <option value="FULL_DAY" className="text-slate-900">FULL DAY (Default)</option>
                <option value="HALF_DAY" className="text-slate-900">HALF DAY</option>
              </select>

              {/* Action Buttons */}
              {selectedIds.size > 0 ? (
                <>
                  {selectedDrafts.length > 0 && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={handleBulkVerifySelected}
                      className="rounded-xl bg-white px-3.5 py-2 font-black text-blue-900 shadow-md hover:bg-blue-50 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      {isPending ? "Memproses..." : `⚡ Sahkan ${selectedDrafts.length} Draft`}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleBulkDelete}
                    className="rounded-xl bg-rose-500 hover:bg-rose-600 px-3.5 py-2 font-black text-white shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    <span>🗑️</span>
                    <span>{isPending ? "Menghapus..." : `Hapus ${selectedIds.size} Terpilih`}</span>
                  </button>
                </>
              ) : allDraftsInFilter.length > 0 ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleBulkVerifyAllDrafts}
                  className="rounded-xl bg-amber-400 px-3.5 py-2 font-black text-amber-950 shadow-md hover:bg-amber-300 transition active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? "Memproses..." : `⚡ Sahkan Semua Draft (${allDraftsInFilter.length})`}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* 5. Daftar Kartu Absensi */}
      <div className="space-y-2.5">
        {filteredRecords.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 shadow-2xs">
            {statusFilter === "ANOMALI"
              ? "🎉 Tidak ada data jam bolong! Semua jam masuk & pulang tercatat lengkap."
              : "Tidak ada data absensi yang sesuai filter."}
          </div>
        ) : (
          filteredRecords.map((rec) => {
            const isSelected = selectedIds.has(rec.id);
            const isVerified = rec.verification_status === "TERVERIFIKASI";
            const calc = rec.calc;
            const worker = rec.worker;
            const dayClass = rec.effectiveDayClass;

            return (
              <div
                key={rec.id}
                className={`rounded-2xl border transition-all p-3.5 sm:p-4 shadow-2xs ${
                  isSelected
                    ? "border-blue-400 bg-blue-50/40 ring-2 ring-blue-400/30"
                    : rec.isAnomaly && !isVerified
                    ? "border-rose-300 bg-rose-50/40 ring-1 ring-rose-200"
                    : isVerified
                    ? "border-slate-200/90 bg-white hover:border-slate-300"
                    : "border-amber-200/90 bg-gradient-to-r from-amber-50/40 to-white hover:border-amber-300"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Left: Checkbox + Worker Info + Date */}
                  <div className="flex items-start sm:items-center gap-3">
                    {canWrite && !rec.isPaid ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleRow(rec.id)}
                        className="mt-1 sm:mt-0 h-4 w-4 rounded accent-blue-600 cursor-pointer"
                      />
                    ) : null}

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="font-extrabold text-slate-900 text-sm">
                          {worker?.name || `Pekerja #${rec.worker_id}`}
                        </b>
                        <span className="font-mono text-[11px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                          {rec.attendance_code}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            worker?.pay_system === "BULANAN"
                              ? "bg-purple-100 text-purple-800 border border-purple-200"
                              : "bg-blue-100 text-blue-800 border border-blue-200"
                          }`}
                        >
                          {worker?.pay_system || "HARIAN"}
                        </span>
                        {worker?.finger_id ? (
                          <span className="text-[10px] text-slate-500 font-medium">
                            Finger #{worker.finger_id}
                          </span>
                        ) : null}

                        {/* Tag Khusus jika Jam Pulang Bolong */}
                        {rec.isHadir && rec.isMissingOut && !isVerified && !rec.isPaid && (
                          <span className="rounded-full bg-rose-100 border border-rose-300 px-2 py-0.5 text-[10px] font-black text-rose-800 animate-pulse">
                            ⚠️ Lupa Scan Pulang
                          </span>
                        )}
                        {rec.isHadir && rec.isMissingIn && !isVerified && !rec.isPaid && (
                          <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-black text-amber-800">
                            ⚠️ Scan Masuk Kosong
                          </span>
                        )}
                        {!rec.isHadir && (
                          <span className="rounded-full bg-rose-100 border border-rose-300 px-2 py-0.5 text-[10px] font-black text-rose-800">
                            🔴 {rec.attendance_status || "ALPHA"}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span className="font-semibold text-slate-900">
                          {calc.dayName}, {rec.attendance_date}
                        </span>
                        <span>•</span>
                        <span className="font-bold text-slate-700">
                          Jam: <span className={rec.isHadir && rec.isMissingIn ? "text-rose-600 font-black" : ""}>{rec.actual_in || "--:--"}</span> s/d{" "}
                          <span className={rec.isHadir && rec.isMissingOut ? "text-rose-600 font-black" : ""}>{rec.actual_out || "--:--"}</span>
                        </span>
                        <span>•</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                          {rec.attendance_status}
                        </span>
                        {rec.isHadir && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-bold border ${
                              dayClass === "HALF_DAY"
                                ? "bg-amber-100 text-amber-900 border-amber-300"
                                : "bg-blue-50 text-blue-700 border-blue-200"
                            }`}
                          >
                            {dayClass}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Badges & Actions */}
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end border-t border-slate-100 pt-2 sm:border-t-0 sm:pt-0">
                    {/* Sunday Indicator */}
                    {calc.isSunday ? (
                      <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                        🌞 Minggu Masuk
                      </span>
                    ) : null}

                    {/* Calculated Overtime Badge */}
                    {calc.overtimeMinutes > 0 ? (
                      <span className="rounded-full bg-blue-100 border border-blue-300 px-2.5 py-0.5 text-[11px] font-bold text-blue-900">
                        ⚡ Lembur {formatMinutesToHours(calc.overtimeMinutes)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                        Tanpa Lembur
                      </span>
                    )}

                    {/* Status Badge */}
                    {rec.isPaid ? (
                      <span className="rounded-full bg-slate-900 text-white px-2.5 py-0.5 text-[11px] font-black shadow-xs">
                        💳 SUDAH DIBAYAR ({rec.matchingPayrollRun?.payroll_code || "Payroll"})
                      </span>
                    ) : isVerified ? (
                      <span className="rounded-full bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-900">
                        ✅ TERVERIFIKASI
                      </span>
                    ) : !rec.isHadir ? (
                      <span className="rounded-full bg-slate-100 border border-slate-300 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                        TIDAK HADIR
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-900">
                        ⏳ DRAFT
                      </span>
                    )}

                    {/* Toggle Edit Button & Delete Button */}
                    {canWrite && !rec.isPaid ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                        >
                          {expandedId === rec.id ? "Tutup ✕" : "Koreksi ▾"}
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleDeleteSingle(rec.id, worker?.name || `Pekerja #${rec.worker_id}`, rec.attendance_date)}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-100 hover:text-rose-700 transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                          title="Hapus data absensi ini"
                        >
                          <span>🗑️</span>
                          <span className="hidden sm:inline">Hapus</span>
                        </button>
                      </div>
                    ) : rec.isPaid ? (
                      <span className="text-[10px] text-slate-400 font-semibold italic">Terkunci (Payroll)</span>
                    ) : null}
                  </div>
                </div>

                {/* Expanded Individual Verification & Edit Drawer */}
                {expandedId === rec.id && canWrite ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                      <b className="text-xs font-bold text-slate-900">
                        Koreksi Individual: {worker?.name} ({rec.attendance_date})
                      </b>
                      <span className="text-[11px] text-slate-500 font-medium">
                        Kalkulasi sistem: {calc.description}
                      </span>
                    </div>

                    {!isVerified ? (
                      <form action={verifyAttendanceAction} className="grid gap-2.5 sm:grid-cols-4 items-end">
                        <input type="hidden" name="attendance_id" value={rec.id} />
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Klasifikasi Hari</label>
                          <select
                            name="day_class"
                            defaultValue={dayClass}
                            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 font-semibold"
                          >
                            <option value="FULL_DAY">FULL DAY</option>
                            <option value="HALF_DAY">HALF DAY</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Menit Lembur (Default: {calc.overtimeMinutes} mnt)
                          </label>
                          <input
                            name="overtime_minutes"
                            type="number"
                            min="0"
                            defaultValue={calc.overtimeMinutes}
                            placeholder="Menit lembur"
                            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 font-bold"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Catatan</label>
                          <input
                            name="notes"
                            defaultValue={rec.notes || (rec.isMissingOut ? "Lupa finger pulang" : "")}
                            placeholder="Keterangan opsional"
                            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition cursor-pointer"
                          >
                            ✓ Sahkan
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleDeleteSingle(rec.id, worker?.name || `Pekerja #${rec.worker_id}`, rec.attendance_date)}
                            className="rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                            title="Hapus data ini"
                          >
                            <span>🗑️</span>
                            <span>Hapus</span>
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <div className="text-xs text-slate-600">
                          Data ini sudah diverifikasi dengan klasifikasi: <b>{dayClass}</b>, lembur: <b>{formatMinutesToHours(rec.overtime_minutes)}</b> ({rec.overtime_minutes} menit).
                        </div>
                        <div className="flex items-center gap-2">
                          <form action={unverifyAttendanceAction}>
                            <input type="hidden" name="attendance_id" value={rec.id} />
                            <button
                              type="submit"
                              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition shadow-2xs cursor-pointer"
                            >
                              ↺ Batalkan Verifikasi (Kembali ke DRAFT)
                            </button>
                          </form>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleDeleteSingle(rec.id, worker?.name || `Pekerja #${rec.worker_id}`, rec.attendance_date)}
                            className="rounded-lg border border-rose-300 bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-200 transition shadow-2xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <span>🗑️️</span>
                            <span>Hapus Data</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
