"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/access/current-user";
import { errorMessage, getBoolean, getId, getText, redirectWithMessage } from "@/lib/master/action-utils";
import { callRpc } from "@/lib/operations/ops-utils";

const PATH = "/dashboard/setupTest";

type RpcResult = {
  run_code?: string;
  status?: string;
  backup_code?: string;
  dummy_run_code?: string;
  failed_step?: string;
  error?: string;
};

async function maintenanceRpc(name: string, args: Record<string, unknown>, fallback: string, success: (result: RpcResult) => string) {
  await requirePermission("setup_test.admin");
  let result: RpcResult;
  try {
    result = await callRpc<RpcResult>(name, args);
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, fallback));
  }
  revalidatePath(PATH);
  if (result.status === "FAIL") {
    redirectWithMessage(PATH, "error", `${result.run_code || "Run"} gagal di ${result.failed_step || "step tidak diketahui"}: ${result.error || "Lihat detail diagnostic."}`);
  }
  redirectWithMessage(PATH, "success", success(result));
}

export async function runDiagnostic() {
  return maintenanceRpc(
    "smpt_run_system_diagnostic",
    {},
    "Diagnostic gagal dijalankan.",
    (r) => `${r.run_code || "Diagnostic"} selesai: ${r.status || "UNKNOWN"}.`,
  );
}

export async function runDummyFull() {
  return maintenanceRpc(
    "smpt_run_dummy_full",
    {},
    "Dummy Full gagal dijalankan.",
    (r) => `${r.run_code || "Dummy Full"} selesai PASS. Data test siap diperiksa atau dihapus per run.`,
  );
}


export async function runRepeatOrderTest() {
  return maintenanceRpc(
    "smpt_run_repeat_order_test",
    {},
    "Runtime test Repeat Order gagal dijalankan.",
    (r) => `${r.run_code || "Repeat Order Test"} selesai PASS. Clone master/config, transaksi=0, trace, dan usability sudah diuji runtime.`,
  );
}

export async function runManualBoronganTest() {
  return maintenanceRpc(
    "smpt_run_manual_borongan_test",
    {},
    "Runtime test Manipulasi HARIAN → BORONGAN gagal dijalankan.",
    (r) => `${r.run_code || "Manipulasi Payroll Test"} selesai PASS. Progress, pengajuan BORONGAN, payroll HARIAN terpisah, dan no double-pay sudah diuji runtime.`,
  );
}

export async function createBackup(formData: FormData) {
  const label = getText(formData, "label");
  return maintenanceRpc(
    "smpt_create_data_backup",
    { p_label: label || null },
    "Backup gagal dibuat.",
    (r) => `Backup ${r.backup_code || "baru"} berhasil dibuat.`,
  );
}

export async function restoreBackup(formData: FormData) {
  const backupId = getId(formData, "backup_id");
  const confirmation = getText(formData, "confirmation");
  return maintenanceRpc(
    "smpt_restore_data_backup",
    { p_backup_id: backupId, p_confirmation: confirmation },
    "Restore backup gagal.",
    (r) => `Restore ${r.backup_code || "backup"} selesai PASS (${r.run_code || "run"}).`,
  );
}

export async function resetDummyRun(formData: FormData) {
  const runId = getId(formData, "run_id");
  const confirmation = getText(formData, "confirmation");
  return maintenanceRpc(
    "smpt_reset_dummy_run",
    { p_run_id: runId, p_confirmation: confirmation },
    "Reset Dummy Run gagal.",
    (r) => `${r.dummy_run_code || "Dummy run"} berhasil dibersihkan (${r.run_code || "reset"}).`,
  );
}

export async function resetSelected(formData: FormData) {
  const allowed = ["PROCUREMENT", "RAW_MATERIAL_FLOW", "PRODUCTION_QC_LOGISTICS", "HR_FINANCE"] as const;
  const groups = allowed.filter((group) => formData.getAll("groups").map(String).includes(group));
  if (!groups.length) redirectWithMessage(PATH, "error", "Pilih minimal satu kelompok data untuk Selective Reset.");
  const confirmation = getText(formData, "confirmation");
  const backupBefore = getBoolean(formData, "backup_before");
  return maintenanceRpc(
    "smpt_reset_business_data",
    { p_groups: groups, p_confirmation: confirmation, p_backup_before: backupBefore },
    "Selective Reset gagal.",
    (r) => `Selective Reset selesai PASS (${r.run_code || "reset"}). Backup otomatis dibuat bila opsi aktif.`,
  );
}

export async function fullDevReset(formData: FormData) {
  const confirmation = getText(formData, "confirmation");
  const backupBefore = getBoolean(formData, "backup_before");
  return maintenanceRpc(
    "smpt_reset_business_data",
    { p_groups: ["ALL"], p_confirmation: confirmation, p_backup_before: backupBefore },
    "Full Dev Reset gagal.",
    (r) => `Full Dev Reset selesai PASS (${r.run_code || "reset"}). Security/config inti tetap dilindungi.`,
  );
}
