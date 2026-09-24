"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  errorMessage,
  getId,
  getNumber,
  getOptionalDate,
  getText,
  redirectWithMessage,
} from "@/lib/master/action-utils";

const PATH = "/dashboard/hasilProduksi";

export async function recordManualResultAction(formData: FormData) {
  await requirePermission("hasil_produksi.write");

  try {
    const resultDate = getOptionalDate(formData, "result_date");
    const reason = getText(formData, "reason");
    if (!resultDate) throw new Error("Tanggal hasil wajib diisi.");
    if (!reason) throw new Error("Alasan/catatan manipulasi wajib diisi.");

    const supabase = await createClient();
    const { error } = await supabase.rpc("record_manual_production_result", {
      p_result_date: resultDate,
      p_project_id: getId(formData, "project_id"),
      p_product_id: getId(formData, "product_id"),
      p_work_item_id: getId(formData, "work_item_id"),
      p_worker_id: getId(formData, "worker_id"),
      p_qty: getNumber(formData, "qty", { min: 0.0001 }),
      p_reason: reason,
    });
    if (error) throw error;
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Hasil pekerjaan manual gagal disimpan."));
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/payroll");
  redirectWithMessage(PATH, "success", "Qty hasil HARIAN tersimpan, progress diperbarui, dan pengajuan BORONGAN siap masuk Payroll Operator.");
}

export async function cancelManualResultAction(formData: FormData) {
  await requirePermission("hasil_produksi.write");

  try {
    const reason = getText(formData, "cancellation_reason");
    if (!reason) throw new Error("Alasan pembatalan wajib diisi.");

    const supabase = await createClient();
    const { error } = await supabase.rpc("cancel_manual_production_result", {
      p_result_id: getId(formData, "result_id"),
      p_reason: reason,
    });
    if (error) throw error;
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Hasil pekerjaan manual gagal dibatalkan."));
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/payroll");
  redirectWithMessage(PATH, "success", "Hasil pekerjaan manual dibatalkan. Audit trail tetap tersimpan dan progress direversal dari ledger aktif.");
}
