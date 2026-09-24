"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/access/current-user";
import {
  errorMessage,
  getId,
  getNumber,
  getOptionalDate,
  getText,
  redirectWithMessage,
} from "@/lib/master/action-utils";
import { callRpc, optionalId } from "@/lib/operations/ops-utils";

const PATH = "/dashboard/produksi";

function refresh() {
  [PATH, "/dashboard/stokGudang", "/dashboard/bahan", "/dashboard/hasilProduksi"].forEach((path) => revalidatePath(path));
}

export async function recordReadyUsage(formData: FormData) {
  await requirePermission("produksi.write");
  try {
    const date = getOptionalDate(formData, "usage_date");
    if (!date) throw new Error("Tanggal wajib diisi.");
    await callRpc("record_ready_production_usage", {
      p_usage_date: date,
      p_item_kind: getText(formData, "item_kind"),
      p_reference_id: getId(formData, "reference_id"),
      p_project_id: getId(formData, "project_id"),
      p_product_id: optionalId(formData.get("product_id")),
      p_quantity: getNumber(formData, "quantity", { min: 0.0001 }),
      p_officer: getText(formData, "officer"),
      p_notes: getText(formData, "notes") || null,
    });
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Pemakaian Siap Produksi gagal."));
  }
  refresh();
  redirectWithMessage(PATH, "success", "Pemakaian internal Siap Produksi tercatat.");
}

export async function recordReadyLotUsage(formData: FormData) {
  await requirePermission("produksi.write");
  try {
    const date = getOptionalDate(formData, "usage_date");
    if (!date) throw new Error("Tanggal wajib diisi.");
    await callRpc("consume_material_lot", {
      p_usage_date: date,
      p_material_lot_id: getId(formData, "material_lot_id"),
      p_quantity: getNumber(formData, "quantity", { min: 0.0001 }),
      p_unit: getText(formData, "unit"),
      p_process: "PRODUKSI",
      p_work_item_id: optionalId(formData.get("work_item_id")),
      p_officer: getText(formData, "officer"),
      p_notes: getText(formData, "notes") || null,
    });
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Pemakaian Roll/Lot gagal."));
  }
  refresh();
  redirectWithMessage(PATH, "success", "Pemakaian Roll/Lot tercatat dan sisa fisik roll diperbarui.");
}

export async function cancelReadyLotUsage(formData: FormData) {
  await requirePermission("produksi.write");
  try {
    await callRpc("cancel_ready_production_lot_usage", {
      p_usage_id: getId(formData, "usage_id"),
    });
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Pemakaian Roll/Lot gagal dibatalkan."));
  }
  refresh();
  redirectWithMessage(PATH, "success", "Pemakaian Roll/Lot dibatalkan dengan reversal dan sisa roll dipulihkan.");
}
