import SecureAttendanceImport from "@/components/attendance/secure-attendance-import";
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
import { addAttendanceAction, verifyAttendanceAction } from "@/lib/final/actions";

type Props = { searchParams: Promise<SearchParams> };

type WorkerRow = {
  id: number;
  worker_code: string;
  finger_id: string | null;
  name: string;
  pay_system: string | null;
  status: string;
};

type AttendanceRow = {
  id: number;
  attendance_code: string;
  worker_id: number;
  attendance_date: string;
  attendance_status: string;
  actual_in: string | null;
  actual_out: string | null;
  verification_status: string;
};

export default async function Page({ searchParams }: Props) {
  const access = await requirePermission("absensi.view");
  const canWrite = access.permissionCodes.includes("absensi.write");
  const query = await searchParams;
  const supabase = await createClient();

  const [workerResult, attendanceResult] = await Promise.all([
    supabase
      .from("workers")
      .select("id,worker_code,finger_id,name,pay_system,status")
      .eq("status", "AKTIF")
      .order("name")
      .limit(1000),
    supabase
      .from("attendance_records")
      .select("id,attendance_code,worker_id,attendance_date,attendance_status,actual_in,actual_out,verification_status")
      .order("attendance_date", { ascending: false })
      .limit(500),
  ]);

  const error = [workerResult.error, attendanceResult.error].find(Boolean);
  if (error) throw new Error(error.message);

  const workers = (workerResult.data ?? []) as WorkerRow[];
  const attendance = (attendanceResult.data ?? []) as AttendanceRow[];
  const workerMap = new Map(workers.map((worker) => [worker.id, worker]));

  return (
    <PageShell
      eyebrow="SDM & Payroll"
      title="Absensi"
      description="Import Secure fingerprint, input manual, review, dan verifikasi sebagai sumber Payroll."
    >
      <Notice success={param(query, "success")} error={param(query, "error")} />
      {!canWrite ? <ReadOnly /> : null}
      <Flow>
        Secure fingerprint → preview/match Fingerprint ID → review Admin → TERVERIFIKASI → Payroll.
        DRAFT/PERLU PERBAIKAN tidak dihitung Payroll.
      </Flow>

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

      <Card title="Data Absensi">
        <div className="space-y-2">
          {attendance.map((row) => (
            <div key={row.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
              <div className="flex flex-wrap justify-between items-center gap-3">
                <div>
                  <b className="font-bold text-slate-900 text-sm">
                    {row.attendance_code} · {workerMap.get(row.worker_id)?.name || `#${row.worker_id}`}
                  </b>
                  <span className="ml-2 text-xs text-slate-500">
                    {row.attendance_date} · {row.attendance_status} · {row.actual_in || "-"}—{row.actual_out || "-"}
                  </span>
                </div>
                <Badge>{row.verification_status}</Badge>
              </div>

              {canWrite && row.verification_status !== "TERVERIFIKASI" ? (
                <form action={verifyAttendanceAction} className="mt-3 grid gap-2 md:grid-cols-4 border-t border-slate-100 pt-3">
                  <input type="hidden" name="attendance_id" value={row.id} />
                  <select name="day_class" required className={inputClass}>
                    <option value="FULL_DAY">FULL DAY</option>
                    <option value="HALF_DAY">HALF DAY</option>
                  </select>
                  <input
                    name="overtime_minutes"
                    type="number"
                    min="0"
                    defaultValue="0"
                    className={inputClass}
                    placeholder="Menit lembur"
                  />
                  <input name="notes" className={inputClass} placeholder="Catatan verifikasi" />
                  <button className={secondaryClass}>Verifikasi</button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </PageShell>
  );
}
