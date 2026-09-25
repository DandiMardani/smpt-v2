import SecureAttendanceImport from "@/components/attendance/secure-attendance-import";
import AttendanceManager, {
  type AttendanceRecordItem,
  type WorkerItem,
} from "@/components/attendance/attendance-manager";
import PayrollSettingsModal, {
  type PayrollSettingsMap,
} from "@/components/payroll/payroll-settings-modal";
import {
  Badge,
  Card,
  Field,
  Flow,
  Notice,
  PageShell,
  ReadOnly,
  buttonClass,
  inputClass,
  secondaryClass,
} from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { param, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { addAttendanceAction } from "@/lib/final/actions";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const access = await requirePermission("absensi.view");
  const canWrite = access.permissionCodes.includes("absensi.write");
  const query = await searchParams;
  const supabase = await createClient();

  const [workerResult, attendanceResult, settingsResult] = await Promise.all([
    supabase
      .from("workers")
      .select("id,worker_code,finger_id,name,pay_system,status,department,position,daily_wage,monthly_salary")
      .eq("status", "AKTIF")
      .order("name")
      .limit(1000),
    supabase
      .from("attendance_records")
      .select(
        "id,attendance_code,worker_id,attendance_date,attendance_status,day_class,schedule_in,schedule_out,actual_in,actual_out,overtime_minutes,verification_status,notes"
      )
      .order("attendance_date", { ascending: false })
      .limit(1000),
    supabase.from("payroll_settings").select("key, value_numeric, value_text"),
  ]);

  const error = [workerResult.error, attendanceResult.error].find(Boolean);
  if (error) throw new Error(error.message);

  const workers = (workerResult.data ?? []) as WorkerItem[];
  const attendance = (attendanceResult.data ?? []) as AttendanceRecordItem[];
  const settingsRows = (settingsResult.data ?? []) as Array<{ key: string; value_numeric: number | null; value_text: string | null }>;
  const settingsMap: PayrollSettingsMap = {};
  settingsRows.forEach((r) => {
    (settingsMap as any)[r.key] = r.value_numeric ?? r.value_text;
  });

  return (
    <PageShell
      eyebrow="SDM & Payroll"
      title="Absensi"
      description="Import Secure fingerprint, input manual, review, dan verifikasi sebagai sumber Payroll."
    >
      <Notice success={param(query, "success")} error={param(query, "error")} />
      {!canWrite ? <ReadOnly /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Flow>
          Secure fingerprint → preview/match Fingerprint ID → review Admin → TERVERIFIKASI → Payroll.
          DRAFT/PERLU PERBAIKAN tidak dihitung Payroll.
        </Flow>
        {canWrite ? (
          <div className="shrink-0">
            <PayrollSettingsModal initialSettings={settingsMap} canWrite={canWrite} returnPath="/dashboard/absensi" />
          </div>
        ) : null}
      </div>

      <SecureAttendanceImport canWrite={canWrite} />

      {canWrite ? (
        <Card title="Input Manual / Koreksi">
          <form action={addAttendanceAction} className="grid gap-3 md:grid-cols-4">
            <Field label="Pekerja">
              <select name="worker_id" required className={inputClass}>
                <option value="">Pilih</option>
                {workers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.name} · Finger {worker.finger_id || "-"} · {worker.pay_system || "-"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tanggal"><input name="attendance_date" type="date" required className={inputClass} /></Field>
            <Field label="Jadwal Masuk"><input name="schedule_in" type="time" className={inputClass} /></Field>
            <Field label="Jadwal Keluar"><input name="schedule_out" type="time" className={inputClass} /></Field>
            <Field label="Masuk Aktual"><input name="actual_in" type="time" className={inputClass} /></Field>
            <Field label="Keluar Aktual"><input name="actual_out" type="time" className={inputClass} /></Field>
            <Field label="Status">
              <select name="attendance_status" className={inputClass}>
                <option>HADIR</option>
                <option>SAKIT</option>
                <option>IZIN</option>
                <option>CUTI</option>
                <option>ALPHA</option>
                <option>LIBUR</option>
                <option>DINAS_LUAR</option>
              </select>
            </Field>
            <Field label="Lembur Manual (Menit)">
              <input name="overtime_minutes" type="number" min="0" defaultValue="0" placeholder="Menit (cth: 120 = 2 jam)" className={inputClass} />
            </Field>
            <Field label="Catatan"><input name="notes" className={inputClass} placeholder="Keterangan opsional" /></Field>
            <div className="flex items-end"><button className={buttonClass}>Simpan DRAFT</button></div>
          </form>
        </Card>
      ) : null}

      <Card title="Data & Verifikasi Absensi">
        <AttendanceManager records={attendance} workers={workers} canWrite={canWrite} shiftSettings={settingsMap} />
      </Card>
    </PageShell>
  );
}
