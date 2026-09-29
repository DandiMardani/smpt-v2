"use client";

import { useMemo, useState, useTransition } from "react";
import {
  calculateShiftOvertime,
  formatMinutesToHours,
  type ShiftOvertimeResult,
} from "@/lib/attendance/overtime-calculator";
import {
  verifyAttendanceAction,
  verifyBulkAttendanceAction,
  unverifyAttendanceAction,
  autoFixMissingOutAttendanceAction,
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

type Props = {
  records: AttendanceRecordItem[];
  workers: WorkerItem[];
  canWrite: boolean;
  shiftSettings?: Record<string, any>;
};

export default function AttendanceManager({ records, workers, canWrite, shiftSettings }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "ANOMALI" | "TERVERIFIKASI">("DRAFT");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [defaultDayClass, setDefaultDayClass] = useState<"FULL_DAY" | "HALF_DAY">("FULL_DAY");
  const [useAutoOvertime, setUseAutoOvertime] = useState<boolean>(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();

  const workerMap = useMemo(() => {
    return new Map(workers.map((w) => [w.id, w]));
  }, [workers]);

  // Pre-calculate shift overtimes & deteksi anomali jam bolong
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
      const isAnomaly = (isMissingIn || isMissingOut) && rec.attendance_status === "HADIR";

      return {
        ...rec,
        worker,
        calc,
        isMissingIn,
        isMissingOut,
        isAnomaly,
      };
    });
  }, [records, workerMap, shiftSettings]);

  // Hitungan metrik
  const totalCount = records.length;
  const draftCount = records.filter((r) => r.verification_status !== "TERVERIFIKASI").length;
  const verifiedCount = records.filter((r) => r.verification_status === "TERVERIFIKASI").length;
  const anomalyCount = enrichedRecords.filter((r) => r.isAnomaly && r.verification_status !== "TERVERIFIKASI").length;

  // Filter records berdasarkan status & filter anomali
  const filteredRecords = useMemo(() => {
    return enrichedRecords.filter((rec) => {
      if (statusFilter === "DRAFT" && rec.verification_status === "TERVERIFIKASI") {
        return false;
      }
      if (statusFilter === "TERVERIFIKASI" && rec.verification_status !== "TERVERIFIKASI") {
        return false;
      }
      if (statusFilter === "ANOMALI") {
        if (!rec.isAnomaly || rec.verification_status === "TERVERIFIKASI") {
          return false;
        }
      }
      if (dateFilter && rec.attendance_date !== dateFilter) {
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
  }, [enrichedRecords, statusFilter, dateFilter, searchQuery]);

  const selectableRecords = filteredRecords.filter((r) => r.verification_status !== "TERVERIFIKASI");
  const isAllSelected =
    selectableRecords.length > 0 &&
    selectableRecords.every((r) => selectedIds.has(r.id));

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

  function handleBulkVerifySelected() {
    if (selectedIds.size === 0) return;
    const items = Array.from(selectedIds).map((attId) => {
      const row = enrichedRecords.find((r) => r.id === attId);
      const ot = useAutoOvertime && row ? row.calc.overtimeMinutes : row?.overtime_minutes || 0;
      return {
        id: attId,
        day_class: defaultDayClass,
        overtime_minutes: ot,
        notes: row?.notes || undefined,
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
    if (selectableRecords.length === 0) return;
    const items = selectableRecords.map((row) => {
      const ot = useAutoOvertime ? row.calc.overtimeMinutes : row.overtime_minutes || 0;
      return {
        id: row.id,
        day_class: defaultDayClass,
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
          onClick={() => setStatusFilter("ALL")}
          className={`cursor-pointer rounded-2xl border p-3 sm:p-3.5 transition shadow-2xs ${
            statusFilter === "ALL"
              ? "border-blue-500 bg-blue-50/50 text-blue-900 ring-2 ring-blue-300"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
          }`}
        >
          <p className="text-[11px] font-medium text-slate-500">Semua Presensi</p>
          <p className="mt-1 text-xl sm:text-2xl font-black text-slate-900">{totalCount}</p>
        </div>

        {/* Tab Filter Anomali / Jam Bolong */}
        <div
          onClick={() => setStatusFilter("ANOMALI")}
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
          onClick={() => setStatusFilter("DRAFT")}
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
          onClick={() => setStatusFilter("TERVERIFIKASI")}
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

      {/* 3. Filter Controls & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama pekerja, kode, atau finger..."
            className="w-full sm:w-64 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
          />

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
          />

          {dateFilter ? (
            <button
              type="button"
              onClick={() => setDateFilter("")}
              className="text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Reset Tgl
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl text-xs font-semibold overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`px-2.5 py-1.5 rounded-lg transition whitespace-nowrap ${
              statusFilter === "ALL" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Semua ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ANOMALI")}
            className={`px-2.5 py-1.5 rounded-lg transition whitespace-nowrap ${
              statusFilter === "ANOMALI" ? "bg-rose-600 text-white shadow-2xs font-bold" : "text-rose-700 hover:text-rose-900"
            }`}
          >
            ⚠️ Jam Bolong ({anomalyCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("DRAFT")}
            className={`px-2.5 py-1.5 rounded-lg transition whitespace-nowrap ${
              statusFilter === "DRAFT" ? "bg-amber-500 text-white shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ⏳ Draft ({draftCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("TERVERIFIKASI")}
            className={`px-2.5 py-1.5 rounded-lg transition whitespace-nowrap ${
              statusFilter === "TERVERIFIKASI" ? "bg-emerald-600 text-white shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ✅ Terverifikasi ({verifiedCount})
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
                <span>Pilih Semua Draft ({selectableRecords.length})</span>
              </label>

              {selectedIds.size > 0 && (
                <span className="rounded-full bg-amber-400 text-amber-950 font-black px-2.5 py-0.5 text-xs shadow-2xs animate-pulse">
                  {selectedIds.size} dipilih
                </span>
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
                <option value="FULL_DAY" className="text-slate-900">FULL DAY</option>
                <option value="HALF_DAY" className="text-slate-900">HALF DAY</option>
              </select>

              {selectedIds.size > 0 ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleBulkVerifySelected}
                  className="rounded-xl bg-white px-4 py-2 font-black text-blue-900 shadow-md hover:bg-blue-50 transition active:scale-95 disabled:opacity-50"
                >
                  {isPending ? "Memproses..." : `⚡ Sahkan ${selectedIds.size} Item`}
                </button>
              ) : selectableRecords.length > 0 ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleBulkVerifyAllDrafts}
                  className="rounded-xl bg-amber-400 px-3.5 py-2 font-black text-amber-950 shadow-md hover:bg-amber-300 transition active:scale-95 disabled:opacity-50"
                >
                  {isPending ? "Memproses..." : `⚡ Sahkan Semua Draft (${selectableRecords.length})`}
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
                    {canWrite && !isVerified ? (
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
                        {rec.isMissingOut && !isVerified && (
                          <span className="rounded-full bg-rose-100 border border-rose-300 px-2 py-0.5 text-[10px] font-black text-rose-800 animate-pulse">
                            ⚠️ Lupa Scan Pulang
                          </span>
                        )}
                        {rec.isMissingIn && !isVerified && (
                          <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-black text-amber-800">
                            ⚠️ Scan Masuk Kosong
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span className="font-semibold text-slate-900">
                          {calc.dayName}, {rec.attendance_date}
                        </span>
                        <span>•</span>
                        <span className="font-bold text-slate-700">
                          Jam: <span className={rec.isMissingIn ? "text-rose-600 font-black" : ""}>{rec.actual_in || "--:--"}</span> s/d{" "}
                          <span className={rec.isMissingOut ? "text-rose-600 font-black" : ""}>{rec.actual_out || "--:--"}</span>
                        </span>
                        <span>•</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">
                          {rec.attendance_status}
                        </span>
                        {rec.day_class ? (
                          <span className="rounded bg-blue-50 text-blue-700 px-1.5 py-0.5 text-[11px] font-bold border border-blue-200">
                            {rec.day_class}
                          </span>
                        ) : null}
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
                    {isVerified ? (
                      <span className="rounded-full bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-900">
                        ✅ TERVERIFIKASI
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-900">
                        ⏳ DRAFT
                      </span>
                    )}

                    {/* Toggle Edit Button */}
                    {canWrite ? (
                      <button
                        type="button"
                        onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                      >
                        {expandedId === rec.id ? "Tutup ✕" : "Koreksi ▾"}
                      </button>
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
                            defaultValue={rec.day_class || "FULL_DAY"}
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

                        <div>
                          <button
                            type="submit"
                            className="w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition cursor-pointer"
                          >
                            ✓ Sahkan Baris Ini
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <div className="text-xs text-slate-600">
                          Data ini sudah diverifikasi dengan klasifikasi: <b>{rec.day_class || "FULL_DAY"}</b>, lembur: <b>{formatMinutesToHours(rec.overtime_minutes)}</b> ({rec.overtime_minutes} menit).
                        </div>
                        <form action={unverifyAttendanceAction}>
                          <input type="hidden" name="attendance_id" value={rec.id} />
                          <button
                            type="submit"
                            className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition shadow-2xs cursor-pointer"
                          >
                            ↺ Batalkan Verifikasi (Kembali ke DRAFT)
                          </button>
                        </form>
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
