"use client";

import { useState } from "react";
import SecureAttendanceImport from "@/components/attendance/secure-attendance-import";
import AttendanceManager, {
  type AttendanceRecordItem,
  type WorkerItem,
} from "@/components/attendance/attendance-manager";
import QuickManualAttendanceSheet from "@/components/attendance/quick-manual-attendance-sheet";
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

type PageContentProps = {
  workers: WorkerItem[];
  attendance: AttendanceRecordItem[];
  settingsMap: PayrollSettingsMap;
  canWrite: boolean;
  successParam?: string;
  errorParam?: string;
};

export function AttendancePageClient({
  workers,
  attendance,
  settingsMap,
  canWrite,
  successParam,
  errorParam,
}: PageContentProps) {
  // Pilihan metode admin: SCAN FINGERPRINT vs CHECKLIST MANUAL HARIAN
  const [inputMode, setInputMode] = useState<"UPLOAD_FINGERPRINT" | "MANUAL_SHEET">("UPLOAD_FINGERPRINT");

  return (
    <PageShell
      eyebrow="SDM & Payroll"
      title="Presensi & Absensi"
      description="Pilih metode pencatatan: Scan Fingerprint (1 File otomatis dipilah) atau Lembar Checklist Manual Cepat."
    >
      <Notice success={successParam} error={errorParam} />
      {!canWrite ? <ReadOnly /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Flow>
          Sistem otomatis memilah Karyawan Bulanan vs Helper Harian. Jam masuk & pulang disesuaikan dengan jadwal shift pabrik dan batas toleransi lembur.
        </Flow>
        {canWrite ? (
          <div className="shrink-0">
            <PayrollSettingsModal initialSettings={settingsMap} canWrite={canWrite} returnPath="/dashboard/absensi" />
          </div>
        ) : null}
      </div>

      {/* SAKELAR METODE INPUT ABSENSI */}
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

      {/* TAMPILAN SESUAI MODE YANG DIPILIH */}
      {inputMode === "UPLOAD_FINGERPRINT" ? (
        <SecureAttendanceImport canWrite={canWrite} />
      ) : (
        <Card title="Lembar Input Cepat Presensi & Lembur Per Hari">
          <QuickManualAttendanceSheet workers={workers} shiftSettings={settingsMap} />
        </Card>
      )}

      {/* DAFTAR VERIFIKASI & MONITORING (TAB BULANAN VS HARIAN) */}
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
