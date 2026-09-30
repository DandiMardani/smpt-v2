import { requirePermission } from "@/lib/access/current-user";
import { param, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { AttendancePageClient } from "./page-client";
import type { AttendanceRecordItem, WorkerItem } from "@/components/attendance/attendance-manager";
import type { PayrollSettingsMap } from "@/components/payroll/payroll-settings-modal";

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
      .limit(1500),
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
    <AttendancePageClient
      workers={workers}
      attendance={attendance}
      settingsMap={settingsMap}
      canWrite={canWrite}
      successParam={param(query, "success")}
      errorParam={param(query, "error")}
    />
  );
}
