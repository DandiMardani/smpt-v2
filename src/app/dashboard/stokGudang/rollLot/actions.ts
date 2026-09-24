"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access/current-user";
import {
  errorMessage,
  getId,
  getNumber,
  getOptionalDate,
  getText,
} from "@/lib/master/action-utils";
import { callRpc, optionalId } from "@/lib/operations/ops-utils";

const PATH = "/dashboard/stokGudang/rollLot";

function go(type: "success" | "error", message: string): never {
  redirect(`${PATH}?${type}=${encodeURIComponent(message)}`);
}

function refresh() {
  [PATH, "/dashboard/stokGudang", "/dashboard/barangMasukGudang", "/dashboard/barangKeluarGudang", "/dashboard/cutting", "/dashboard/produksi"].forEach((path) => revalidatePath(path));
}

export async function setLotModeAction(formData: FormData) {
  await requirePermission("master_bahan.write");
  try {
    await callRpc("set_material_lot_tracking_mode", {
      p_material_id: getId(formData, "material_id"),
      p_mode: getText(formData, "mode"),
    });
  } catch (error) {
    go("error", errorMessage(error, "Mode tracking material gagal disimpan."));
  }
  refresh();
  go("success", "Mode tracking material diperbarui.");
}

export async function createLotAction(formData: FormData) {
  await requirePermission("barang_masuk_gudang.write");
  try {
    await callRpc("create_material_lot", {
      p_receipt_id: getId(formData, "receipt_id"),
      p_roll_number: getText(formData, "roll_number"),
      p_original_quantity: getNumber(formData, "original_quantity", { min: 0.0001 }),
      p_original_unit: getText(formData, "original_unit"),
      p_supplier_lot_no: getText(formData, "supplier_lot_no") || null,
      p_notes: getText(formData, "notes") || null,
    });
  } catch (error) {
    go("error", errorMessage(error, "Roll/Lot gagal dibuat."));
  }
  refresh();
  go("success", "Roll/Lot fisik dibuat dari Barang Masuk tanpa menambah stok kedua kali.");
}

export async function issueWholeLotAction(formData: FormData) {
  await requirePermission("barang_keluar_gudang.write");
  try {
    const date = getOptionalDate(formData, "issue_date");
    if (!date) throw new Error("Tanggal wajib diisi.");
    await callRpc("issue_material_lot_whole", {
      p_issue_date: date,
      p_material_lot_id: getId(formData, "material_lot_id"),
      p_project_id: getId(formData, "project_id"),
      p_product_id: getId(formData, "product_id"),
      p_bom_requirement_id: getId(formData, "bom_requirement_id"),
      p_purpose: getText(formData, "purpose"),
      p_recipient_worker_id: optionalId(formData.get("recipient_worker_id")),
      p_recipient_name: getText(formData, "recipient_name") || null,
      p_notes: getText(formData, "notes") || null,
    });
  } catch (error) {
    go("error", errorMessage(error, "Roll/Lot gagal dikeluarkan dari Gudang."));
  }
  refresh();
  go("success", "Roll/Lot utuh keluar melalui Barang Keluar Gudang dan berpindah lokasi.");
}


export async function fulfillRequestWithLotAction(formData: FormData) {
  await requirePermission("barang_keluar_gudang.write");
  await requirePermission("permintaan_produksi.fulfill");
  try {
    const date = getOptionalDate(formData, "issue_date");
    if (!date) throw new Error("Tanggal wajib diisi.");
    await callRpc("fulfill_material_request_with_lot", {
      p_issue_date: date,
      p_request_item_id: getId(formData, "request_item_id"),
      p_material_lot_id: getId(formData, "material_lot_id"),
      p_recipient_worker_id: optionalId(formData.get("recipient_worker_id")),
      p_recipient_name: getText(formData, "recipient_name") || null,
      p_notes: getText(formData, "notes") || null,
    });
  } catch (error) {
    go("error", errorMessage(error, "Permintaan Barang gagal dipenuhi dengan Roll/Lot."));
  }
  refresh();
  go("success", "Roll/Lot utuh keluar melalui Permintaan Barang; progress permintaan ikut diperbarui.");
}
