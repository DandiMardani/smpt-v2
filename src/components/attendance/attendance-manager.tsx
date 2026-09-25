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
};

export default function AttendanceManager({ records, workers, canWrite }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "TERVERIFIKASI">("DRAFT");
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

  // Pre-calculate shift overtimes for each record
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
          : null
      );
      return {
        ...rec,
        worker,
        calc,
      };
    });
  }, [records, workerMap]);

  // Filter records
  const filteredRecords = useMemo(() => {
    return enrichedRecords.filter((rec) => {
      if (statusFilter === "DRAFT" && rec.verification_status === "TERVERIFIKASI") {
        return false;
      }
      if (statusFilter === "TERVERIFIKASI" && rec.verification_status !== "TERVERIFIKASI") {
        return false;
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

  // Counts
  const totalCount = records.length;
  const draftCount = records.filter((r) => r.verification_status !== "TERVERIFIKASI").length;
  const verifiedCount = records.filter((r) => r.verification_status === "TERVERIFIKASI").length;

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

  // Bulk verify selected
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

  // Bulk verify all drafts currently visible
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
      {/* 1. KPI & Guide Header */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div
          onClick={() => setStatusFilter("ALL")}
          className={`cursor-pointer rounded-2xl border p-3.5 transition shadow-2xs ${
            statusFilter === "ALL"
              ? "border-blue-500 bg-blue-50/50 text-blue-900"
              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
          }`}
        >
          <p className="text-xs font-medium text-slate-500">Total Absensi</p>
          <p className="mt-1 text-2xl font-extrabold">{totalCount}</p>
        </div>

        <div
          onClick={() => setStatusFilter("DRAFT")}
          className={`cursor-pointer rounded-2xl border p-3.5 transition shadow-2xs ${
            statusFilter === "DRAFT"
              ? "border-amber-500 bg-amber-50/70 text-amber-950"
              : "border-amber-200/80 bg-amber-50/30 text-slate-700 hover:border-amber-400"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-amber-800">⏳ Belum Verifikasi (DRAFT)</p>
            {draftCount > 0 ? (
              <span className="inline-flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            ) : null}
          </div>
          <p className="mt-1 text-2xl font-black text-amber-900">{draftCount}</p>
        </div>

        <div
          onClick={() => setStatusFilter("TERVERIFIKASI")}
          className={`cursor-pointer rounded-2xl border p-3.5 transition shadow-2xs ${
            statusFilter === "TERVERIFIKASI"
              ? "border-emerald-500 bg-emerald-50/70 text-emerald-950"
              : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300"
          }`}
        >
          <p className="text-xs font-semibold text-emerald-800">✅ Terverifikasi</p>
          <p className="mt-1 text-2xl font-black text-emerald-900">{verifiedCount}</p>
        </div>

        <div
          onClick={() => setShowGuide(!showGuide)}
          className="cursor-pointer rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-blue-50/60 p-3.5 text-indigo-950 shadow-2xs hover:border-indigo-400 transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-900">📘 Rumus Lembur</span>
            <span className="text-xs font-bold text-indigo-600">{showGuide ? "Tutup ▲" : "Buka ▼"}</span>
          </div>
          <p className="mt-1 text-xs text-indigo-800/90 leading-relaxed line-clamp-2">
            Senin-Jumat (&gt;17), Sabtu (&gt;15), Minggu (+20rb/50rb). Klik untuk panduan lengkap.
          </p>
        </div>
      </div>

      {/* 2. Overtime Rules & Guide Drawer (Collapsible) */}
      {showGuide && (
        <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/60 p-4 sm:p-5 shadow-sm text-xs text-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-indigo-200/80 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">⏱️</span>
              <h3 className="font-extrabold text-sm text-indigo-950">
                Panduan Jam Kerja & Rumus Hitungan Lembur Resmi
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="text-xs font-bold text-indigo-700 hover:underline"
            >
              Tutup Panduan ✕
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {/* Box 1: Jadwal Shift */}
            <div className="rounded-xl border border-indigo-200/90 bg-white p-3.5 shadow-2xs space-y-1.5">
              <b className="block text-indigo-950 font-bold border-b border-slate-100 pb-1">
                📅 Jadwal Shift & Batas Lembur
              </b>
              <p>• <b>Senin – Jumat:</b> 08:00 – 17:00. Lewat jam 17:00 dihitung lembur.</p>
              <p>• <b>Sabtu:</b> 08:00 – 15:00. Lewat jam 15:00 dihitung lembur.</p>
              <p>• <b>Minggu:</b> 08:00 – 17:00. Hari libur/lembur penuh (8 jam kerja efektif).</p>
            </div>

            {/* Box 2: Pekerja Harian */}
            <div className="rounded-xl border border-indigo-200/90 bg-white p-3.5 shadow-2xs space-y-1.5">
              <b className="block text-indigo-950 font-bold border-b border-slate-100 pb-1">
                👷 Pekerja Harian (HARIAN)
              </b>
              <p>• <b>Tarif Lembur / Jam:</b> <code className="bg-slate-100 px-1 rounded text-blue-700 font-mono">Gaji Harian / 8</code></p>
              <p>• <b>Lembur &ge; 4 Jam:</b> Tambahan <b>Rp 5.000</b> per hari.</p>
              <p>• <b>Hadir Minggu:</b> Tambahan bonus <b>Rp 20.000</b>.</p>
              <p className="text-amber-800 font-semibold">• <b>Cutoff Jumat:</b> Lembur Jumat malam (&gt;17:00) masuk slip minggu berikutnya.</p>
            </div>

            {/* Box 3: Karyawan Bulanan */}
            <div className="rounded-xl border border-indigo-200/90 bg-white p-3.5 shadow-2xs space-y-1.5">
              <b className="block text-indigo-950 font-bold border-b border-slate-100 pb-1">
                👔 Karyawan Bulanan (BULANAN)
              </b>
              <p>• <b>Tarif Lembur / Jam:</b> <code className="bg-slate-100 px-1 rounded text-blue-700 font-mono">Gaji Bulanan / 190</code></p>
              <p>• <b>Lembur &ge; 4 Jam:</b> Tambahan <b>Rp 17.500</b> per hari.</p>
              <p>• <b>Minggu Masuk:</b> Lembur 8 jam + Uang Makan <b>Rp 50.000</b>.</p>
              <p>• <b>Uang Makan Mingguan:</b> Rp 50.000 / hari kehadiran Full Day.</p>
            </div>
          </div>
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

        <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg transition ${
              statusFilter === "ALL" ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Semua ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("DRAFT")}
            className={`px-3 py-1.5 rounded-lg transition ${
              statusFilter === "DRAFT" ? "bg-amber-500 text-white shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ⏳ DRAFT ({draftCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("TERVERIFIKASI")}
            className={`px-3 py-1.5 rounded-lg transition ${
              statusFilter === "TERVERIFIKASI" ? "bg-emerald-600 text-white shadow-2xs font-bold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ✅ Terverifikasi ({verifiedCount})
          </button>
        </div>
      </div>

      {/* 4. Bulk Action Toolbar (When Write Access Available) */}
      {canWrite && (
        <div className="sticky top-2 z-20 rounded-2xl border-2 border-blue-400 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 p-4 text-white shadow-lg transition-all">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl border border-white/20 transition select-none">
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
              <label className="flex items-center gap-1.5 bg-black/20 px-3 py-1.5 rounded-xl border border-white/10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useAutoOvertime}
                  onChange={(e) => setUseAutoOvertime(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-emerald-400"
                />
                <span className="font-semibold">⚡ Hitung Lembur Otomatis dari Jam Pulang</span>
              </label>

              <select
                value={defaultDayClass}
                onChange={(e) => setDefaultDayClass(e.target.value as "FULL_DAY" | "HALF_DAY")}
                className="rounded-xl border border-white/20 bg-black/20 px-2.5 py-1.5 font-bold text-white outline-none cursor-pointer"
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
                  {isPending ? "Memproses..." : `⚡ Verifikasi ${selectedIds.size} Item`}
                </button>
              ) : selectableRecords.length > 0 ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleBulkVerifyAllDrafts}
                  className="rounded-xl bg-amber-400 px-3.5 py-2 font-black text-amber-950 shadow-md hover:bg-amber-300 transition active:scale-95 disabled:opacity-50"
                >
                  {isPending ? "Memproses..." : `⚡ Verifikasi Semua Draft (${selectableRecords.length})`}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* 5. Records Cards List */}
      <div className="space-y-2.5">
        {filteredRecords.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 shadow-2xs">
            Tidak ada data absensi yang sesuai filter.
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
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span className="font-semibold text-slate-900">
                          {calc.dayName}, {rec.attendance_date}
                        </span>
                        <span>•</span>
                        <span className="font-bold text-slate-700">
                          Jam: {rec.actual_in || "--:--"} s/d {rec.actual_out || "--:--"}
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
                        🌞 Minggu Masuk {worker?.pay_system === "BULANAN" ? "(+Rp 50rb makan)" : "(+Rp 20rb)"}
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

                    {/* 4 Hours Bonus Badge */}
                    {calc.qualifies4hBonus ? (
                      <span className="rounded-full bg-purple-100 border border-purple-300 px-2 py-0.5 text-[10px] font-black text-purple-900">
                        ✨ Bonus 4 Jam ({worker?.pay_system === "BULANAN" ? "+17.5rb" : "+5rb"})
                      </span>
                    ) : null}

                    {/* Friday Rollover Note */}
                    {calc.fridayOvertimeNextWeek ? (
                      <span className="rounded-full bg-cyan-100 border border-cyan-300 px-2 py-0.5 text-[10px] font-bold text-cyan-900">
                        🗓️ Lembur Jumat (Slip Depan)
                      </span>
                    ) : null}

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
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                      >
                        {expandedId === rec.id ? "Tutup ✕" : "Opsi ▾"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Expanded Individual Verification & Edit Drawer */}
                {expandedId === rec.id && canWrite ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                      <b className="text-xs font-bold text-slate-900">
                        Koreksi / Verifikasi Individual: {worker?.name} ({rec.attendance_date})
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
                            defaultValue={rec.notes || ""}
                            placeholder="Keterangan opsional"
                            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                          />
                        </div>

                        <div>
                          <button
                            type="submit"
                            className="w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition"
                          >
                            ✓ Verifikasi Baris Ini
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
                            className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition shadow-2xs"
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
