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

const PATH = "/dashboard/barangKeluarGudang";

function refresh() {
  [
    PATH,
    "/dashboard/stokGudang",
    "/dashboard/bahan",
    "/dashboard/cutting",
    "/dashboard/sablon",
    "/dashboard/produksi",
    "/dashboard/permintaanProduksi",
  ].forEach((path) => revalidatePath(path));
}

function optionalFactor(formData: FormData) {
  const raw = getText(formData, "conversion_factor");
  return raw ? getNumber(formData, "conversion_factor", { min: 0.00000001 }) : null;
}

export async function fulfillRequest(formData: FormData) {
  await requirePermission("barang_keluar_gudang.write");
  try {
    const date = getOptionalDate(formData, "issue_date");
    if (!date) throw new Error("Tanggal wajib diisi.");

    await callRpc("fulfill_material_request_item", {
      p_request_item_id: getId(formData, "request_item_id"),
      p_issue_date: date,
      p_quantity: getNumber(formData, "quantity", { min: 0.0001 }),
      p_recipient_worker_id: optionalId(formData.get("recipient_worker_id")),
      p_recipient_name: getText(formData, "recipient_name") || null,
      p_conversion_factor: optionalFactor(formData),
      p_wip_source_state: getText(formData, "wip_source_state") || null,
      p_notes: getText(formData, "notes") || null,
    });
  } catch (error) {
    redirectWithMessage(
      PATH,
      "error",
      errorMessage(error, "Pemenuhan Barang Keluar gagal."),
    );
  }

  refresh();
  redirectWithMessage(
    PATH,
    "success",
    "Barang Keluar berhasil. Qty bahan otomatis dikonversi ke satuan stok.",
  );
}

export async function directIssue(formData: FormData) {
  await requirePermission("barang_keluar_gudang.write");
  try {
    const date = getOptionalDate(formData, "issue_date");
    if (!date) throw new Error("Tanggal wajib diisi.");

    await callRpc("direct_warehouse_issue_material", {
      p_issue_date: date,
      p_project_id: getId(formData, "project_id"),
      p_product_id: optionalId(formData.get("product_id")),
      p_bom_requirement_id: getId(formData, "bom_requirement_id"),
      p_purpose: getText(formData, "purpose"),
      p_quantity: getNumber(formData, "quantity", { min: 0.0001 }),
      p_unit: getText(formData, "input_unit") || null,
      p_conversion_factor: optionalFactor(formData),
      p_recipient_worker_id: optionalId(formData.get("recipient_worker_id")),
      p_recipient_name: getText(formData, "recipient_name") || null,
      p_notes: getText(formData, "notes") || null,
    });
  } catch (error) {
    redirectWithMessage(
      PATH,
      "error",
      errorMessage(error, "Barang Keluar langsung gagal."),
    );
  }

  refresh();
  redirectWithMessage(PATH, "success", "Barang Keluar langsung berhasil dicatat.");
}

export async function issueWipDirectly(formData: FormData) {
  await requirePermission("barang_keluar_gudang.write");
  try {
    const date = getOptionalDate(formData, "issue_date");
    if (!date) throw new Error("Tanggal wajib diisi.");

    const action = getText(formData, "action");
    const componentId = getId(formData, "component_id");
    const productId = optionalId(formData.get("product_id"));
    const quantity = getNumber(formData, "quantity", { min: 0.0001 });
    const notes = getText(formData, "notes") || null;

    if (action === "KIRIM_SABLON_LANGSUNG") {
      // 1-pintu: otomatis tandai untuk sablon lalu kirim ke sablon
      await callRpc("move_wip_stock", {
        p_transaction_date: date,
        p_cutting_component_id: componentId,
        p_product_id: productId,
        p_quantity: quantity,
        p_action: "TANDAI_SABLON",
        p_notes: notes,
      });
      await callRpc("move_wip_stock", {
        p_transaction_date: date,
        p_cutting_component_id: componentId,
        p_product_id: productId,
        p_quantity: quantity,
        p_action: "KIRIM_SABLON",
        p_notes: notes,
      });
    } else {
      await callRpc("move_wip_stock", {
        p_transaction_date: date,
        p_cutting_component_id: componentId,
        p_product_id: productId,
        p_quantity: quantity,
        p_action: action,
        p_notes: notes,
      });
    }
  } catch (error) {
    redirectWithMessage(
      PATH,
      "error",
      errorMessage(error, "Pengeluaran komponen hasil potong/sablon gagal."),
    );
  }

  refresh();
  redirectWithMessage(
    PATH,
    "success",
    "Pengeluaran komponen hasil potong/sablon berhasil dicatat.",
  );
}
