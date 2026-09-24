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
import { callRpc } from "@/lib/operations/ops-utils";

const PATH = "/dashboard/barangMasukGudang";

function refresh() {
  [PATH, "/dashboard/stokGudang", "/dashboard/bahan"].forEach((path) =>
    revalidatePath(path),
  );
}

function optionalFactor(formData: FormData) {
  const raw = getText(formData, "conversion_factor");
  return raw ? getNumber(formData, "conversion_factor", { min: 0.00000001 }) : null;
}

export async function createReceipt(formData: FormData) {
  await requirePermission("barang_masuk_gudang.write");
  try {
    const date = getOptionalDate(formData, "receipt_date");
    if (!date) throw new Error("Tanggal wajib diisi.");

    await callRpc("create_warehouse_receipt", {
      p_receipt_date: date,
      p_material_id: getId(formData, "material_id"),
      p_quantity: getNumber(formData, "quantity", { min: 0.0001 }),
      p_input_unit: getText(formData, "input_unit") || null,
      p_conversion_factor: optionalFactor(formData),
      p_supplier: getText(formData, "supplier") || null,
      p_document_no: getText(formData, "document_no") || null,
      p_notes: getText(formData, "notes") || null,
    });
  } catch (error) {
    redirectWithMessage(
      PATH,
      "error",
      errorMessage(error, "Gagal menyimpan Barang Masuk."),
    );
  }

  refresh();
  redirectWithMessage(
    PATH,
    "success",
    "Barang Masuk tersimpan. Qty otomatis dikonversi ke satuan stok bahan.",
  );
}

export async function updateReceipt(formData: FormData) {
  await requirePermission("barang_masuk_gudang.write");
  try {
    const date = getOptionalDate(formData, "receipt_date");
    if (!date) throw new Error("Tanggal wajib diisi.");

    await callRpc("update_warehouse_receipt", {
      p_receipt_id: getId(formData, "id"),
      p_receipt_date: date,
      p_quantity: getNumber(formData, "quantity", { min: 0.0001 }),
      p_input_unit: getText(formData, "input_unit") || null,
      p_conversion_factor: optionalFactor(formData),
      p_supplier: getText(formData, "supplier") || null,
      p_document_no: getText(formData, "document_no") || null,
      p_notes: getText(formData, "notes") || null,
    });
  } catch (error) {
    redirectWithMessage(
      PATH,
      "error",
      errorMessage(error, "Gagal memperbarui Barang Masuk."),
    );
  }

  refresh();
  redirectWithMessage(
    PATH,
    "success",
    "Barang Masuk diperbarui melalui adjustment ledger.",
  );
}

export async function cancelReceipt(formData: FormData) {
  await requirePermission("barang_masuk_gudang.write");
  try {
    await callRpc("cancel_warehouse_receipt", {
      p_receipt_id: getId(formData, "id"),
    });
  } catch (error) {
    redirectWithMessage(
      PATH,
      "error",
      errorMessage(error, "Gagal membatalkan Barang Masuk."),
    );
  }

  refresh();
  redirectWithMessage(
    PATH,
    "success",
    "Barang Masuk dibatalkan dengan reversal stok.",
  );
}

export async function receivePoReceipt(formData: FormData) {
  await requirePermission("procurement.receive");
  try {
    const date = getOptionalDate(formData, "receipt_date");
    if (!date) throw new Error("Tanggal wajib diisi.");
    await callRpc("smpt_receive_purchase_order_line", {
      p_purchase_order_line_id: getId(formData, "purchase_order_line_id"),
      p_receipt_date: date,
      p_quantity: getNumber(formData, "quantity", { min: 0.0001 }),
      p_input_unit: getText(formData, "input_unit") || null,
      p_conversion_factor: optionalFactor(formData),
      p_document_no: getText(formData, "document_no") || null,
      p_roll_number: getText(formData, "roll_number") || null,
      p_supplier_lot_no: getText(formData, "supplier_lot_no") || null,
      p_notes: getText(formData, "notes") || null,
      p_idempotency_key: getText(formData, "idempotency_key") || null,
    });
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Gagal menerima barang dari PO."));
  }
  [PATH, "/dashboard/stokGudang", "/dashboard/bahan", "/dashboard/procurement"].forEach((path) => revalidatePath(path));
  redirectWithMessage(PATH, "success", "Penerimaan PO tercatat dan stok Gudang bertambah sesuai qty aktual.");
}

export async function cancelPoReceipt(formData: FormData) {
  await requirePermission("procurement.receive");
  try {
    await callRpc("smpt_cancel_po_receipt", {
      p_receipt_id: getId(formData, "id"),
      p_reason: getText(formData, "reason") || null,
    });
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Reversal penerimaan PO gagal."));
  }
  [PATH, "/dashboard/stokGudang", "/dashboard/bahan", "/dashboard/procurement"].forEach((path) => revalidatePath(path));
  redirectWithMessage(PATH, "success", "Penerimaan PO dibatalkan dengan reversal ledger dan outstanding PO dikembalikan.");
}
