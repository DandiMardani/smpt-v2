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
import { createClient } from "@/lib/supabase/server";

const PATH = "/dashboard/stokGudang";

export async function moveWip(f: FormData) {
  await requirePermission("stok_gudang.write");
  try {
    const d = getOptionalDate(f, "transaction_date");
    if (!d) throw new Error("Tanggal wajib diisi.");
    await callRpc("move_wip_stock", {
      p_transaction_date: d,
      p_cutting_component_id: getId(f, "component_id"),
      p_product_id: optionalId(f.get("product_id")),
      p_quantity: getNumber(f, "quantity", { min: 0.0001 }),
      p_action: getText(f, "action"),
      p_notes: getText(f, "notes") || null,
    });
  } catch (e) {
    redirectWithMessage(PATH, "error", errorMessage(e, "Mutasi WIP gagal."));
  }
  [PATH, "/dashboard/sablon", "/dashboard/produksi", "/dashboard/bahan"].forEach((path) =>
    revalidatePath(path)
  );
  redirectWithMessage(PATH, "success", "Mutasi WIP berhasil.");
}

export async function adjustMaterialStock(f: FormData) {
  await requirePermission("stok_gudang.write");
  try {
    const balanceId = getId(f, "balance_id");
    const materialId = getId(f, "material_id");
    const locationId = getId(f, "location_id");
    const currentQty = getNumber(f, "current_quantity", { min: 0 });
    const actualQty = getNumber(f, "actual_quantity", { min: 0 });
    const unit = getText(f, "unit") || "";
    const notes = getText(f, "notes") || "Stock Opname Gudang Bahan";

    const delta = actualQty - currentQty;
    const s = await createClient();

    // 1. Update saldo di stock_balances
    const { error: be } = await s
      .from("stock_balances")
      .update({
        quantity: actualQty,
        updated_at: new Date().toISOString(),
      })
      .eq("id", balanceId);

    if (be) throw be;

    // 2. Catat audit trail ke stock_ledger_entries
    const { error: le } = await s
      .from("stock_ledger_entries")
      .insert({
        item_kind: "MATERIAL",
        material_id: materialId,
        location_id: locationId,
        movement_kind: "ADJUSTMENT",
        quantity_delta: delta,
        unit_snapshot: unit,
        notes: `[STOCK OPNAME] ${notes} (Fisik: ${actualQty}, Sistem: ${currentQty})`,
      });

    if (le) throw le;
  } catch (e) {
    redirectWithMessage(PATH, "error", errorMessage(e, "Penyesuaian stok opname gagal."));
  }

  [PATH, "/dashboard/bahan"].forEach((path) => revalidatePath(path));
  redirectWithMessage(PATH, "success", "Penyesuaian stok opname berhasil disimpan.");
}
