"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/access/current-user";
import { errorMessage, getId, getNumber, getOptionalDate, getText, redirectWithMessage } from "@/lib/master/action-utils";
import { callRpc, optionalId } from "@/lib/operations/ops-utils";

const PATH = "/dashboard/cutting";
const refresh = () => [PATH, "/dashboard/stokGudang", "/dashboard/bahan", "/dashboard/sablon", "/dashboard/produksi"].forEach((path) => revalidatePath(path));

export async function saveComponent(f: FormData) {
  const access = await requirePermission("cutting.write");
  const role = (access.role ?? "").toUpperCase();
  const isAdmin = role.includes("ADMIN") || access.permissionCodes.includes("*");
  if (!isAdmin) {
    redirectWithMessage(PATH, "error", "Hanya Administrator yang berwenang menambah atau mengubah komponen cutting.");
    return;
  }
  try {
    await callRpc("save_cutting_component", {
      p_component_id: optionalId(f.get("component_id")),
      p_project_id: getId(f, "project_id"),
      p_product_id: optionalId(f.get("product_id")),
      p_name: getText(f, "name"),
      p_qty_per_product: getNumber(f, "qty_per_product", { min: 0.0001 }),
      p_unit: getText(f, "unit"),
      p_color: getText(f, "color"),
      p_notes: getText(f, "notes") || null,
      p_status: getText(f, "status") || "AKTIF",
    });
  } catch (e) {
    redirectWithMessage(PATH, "error", errorMessage(e, "Komponen Cutting gagal disimpan."));
  }
  refresh();
  redirectWithMessage(PATH, "success", "Komponen Cutting tersimpan.");
}

export async function recordUsage(f: FormData) {
  await requirePermission("cutting.write");
  try {
    const d = getOptionalDate(f, "usage_date");
    if (!d) throw new Error("Tanggal wajib diisi.");
    await callRpc("record_cutting_material_usage", {
      p_usage_date: d,
      p_project_id: getId(f, "project_id"),
      p_product_id: optionalId(f.get("product_id")),
      p_bom_requirement_id: getId(f, "bom_requirement_id"),
      p_quantity: getNumber(f, "quantity", { min: 0.0001 }),
      p_officer: getText(f, "officer"),
      p_notes: getText(f, "notes") || null,
    });
  } catch (e) {
    redirectWithMessage(PATH, "error", errorMessage(e, "Pemakaian Cutting gagal."));
  }
  refresh();
  redirectWithMessage(PATH, "success", "Pemakaian bahan Cutting tercatat.");
}

export async function recordLotUsage(f: FormData) {
  await requirePermission("cutting.write");
  try {
    const d = getOptionalDate(f, "usage_date");
    if (!d) throw new Error("Tanggal wajib diisi.");
    await callRpc("consume_material_lot", {
      p_usage_date: d,
      p_material_lot_id: getId(f, "material_lot_id"),
      p_quantity: getNumber(f, "quantity", { min: 0.0001 }),
      p_unit: getText(f, "unit"),
      p_process: "CUTTING",
      p_work_item_id: null,
      p_officer: getText(f, "officer"),
      p_notes: getText(f, "notes") || null,
    });
  } catch (e) {
    redirectWithMessage(PATH, "error", errorMessage(e, "Pemakaian Roll/Lot Cutting gagal."));
  }
  refresh();
  redirectWithMessage(PATH, "success", "Pemakaian Roll/Lot Cutting tercatat.");
}

export async function cancelUsage(f: FormData) {
  await requirePermission("cutting.write");
  try {
    await callRpc("cancel_cutting_material_usage", { p_usage_id: getId(f, "usage_id") });
  } catch (e) {
    redirectWithMessage(PATH, "error", errorMessage(e, "Pemakaian gagal dibatalkan."));
  }
  refresh();
  redirectWithMessage(PATH, "success", "Pemakaian dibatalkan dan stok dikembalikan.");
}

export async function recordResult(f: FormData) {
  await requirePermission("cutting.write");
  try {
    const d = getOptionalDate(f, "result_date");
    if (!d) throw new Error("Tanggal wajib diisi.");
    await callRpc("record_cutting_result", {
      p_result_date: d,
      p_cutting_component_id: getId(f, "component_id"),
      p_good_qty: getNumber(f, "good_qty", { min: 0 }),
      p_reject_qty: getNumber(f, "reject_qty", { min: 0 }),
      p_officer: getText(f, "officer"),
      p_notes: getText(f, "notes") || null,
    });
  } catch (e) {
    redirectWithMessage(PATH, "error", errorMessage(e, "Hasil Cutting gagal."));
  }
  refresh();
  redirectWithMessage(PATH, "success", "Hasil Cutting tersimpan; hasil baik otomatis masuk Gudang Hasil.");
}

export async function cancelResult(f: FormData) {
  await requirePermission("cutting.write");
  try {
    await callRpc("cancel_cutting_result", { p_result_id: getId(f, "result_id") });
  } catch (e) {
    redirectWithMessage(PATH, "error", errorMessage(e, "Hasil Cutting gagal dibatalkan."));
  }
  refresh();
  redirectWithMessage(PATH, "success", "Hasil Cutting dibatalkan dengan reversal.");
}
