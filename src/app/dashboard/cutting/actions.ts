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

import { createClient } from "@/lib/supabase/server";

export async function recordResult(f: FormData) {
  await requirePermission("cutting.write");
  const compId = getId(f, "component_id");
  const goodQty = getNumber(f, "good_qty", { min: 0 });
  const rejectQty = getNumber(f, "reject_qty", { min: 0 });
  const officer = getText(f, "officer");
  const notes = getText(f, "notes") || null;

  try {
    const d = getOptionalDate(f, "result_date");
    if (!d) throw new Error("Tanggal wajib diisi.");

    await callRpc("record_cutting_result", {
      p_result_date: d,
      p_cutting_component_id: compId,
      p_good_qty: goodQty,
      p_reject_qty: rejectQty,
      p_officer: officer,
      p_notes: notes,
    });

    // Otomatisasi pemotongan bahan kain di cutting berdasarkan rasio kebutuhan BOM
    if (goodQty > 0) {
      try {
        const s = await createClient();
        const { data: comp } = await s
          .from("cutting_components")
          .select("project_id, product_id, qty_per_product")
          .eq("id", compId)
          .single();

        if (comp?.product_id && Number(comp.qty_per_product) > 0) {
          const { data: boms } = await s
            .from("bom_requirements")
            .select("id, material_id, qty_per_unit")
            .eq("product_id", comp.product_id)
            .eq("component_type", "BAHAN")
            .eq("status", "AKTIF");

          const { data: cutLoc } = await s
            .from("stock_locations")
            .select("id")
            .eq("code", "CUTTING")
            .maybeSingle();

          const cutLocId = cutLoc?.id ?? 3;

          if (boms && boms.length > 0) {
            for (const b of boms) {
              const neededQty = Number(((goodQty / Number(comp.qty_per_product)) * Number(b.qty_per_unit)).toFixed(4));
              if (neededQty > 0) {
                const { data: balance } = await s
                  .from("stock_balances")
                  .select("quantity")
                  .eq("location_id", cutLocId)
                  .eq("material_id", b.material_id)
                  .eq("project_id", comp.project_id)
                  .maybeSingle();

                if (balance && Number(balance.quantity) > 0) {
                  const consumeQty = Math.min(neededQty, Number(balance.quantity));
                  await callRpc("record_cutting_material_usage", {
                    p_usage_date: d,
                    p_project_id: comp.project_id,
                    p_product_id: comp.product_id,
                    p_bom_requirement_id: b.id,
                    p_quantity: consumeQty,
                    p_officer: officer,
                    p_notes: `Konsumsi otomatis dari hasil potong (${goodQty} pcs)`,
                  });
                }
              }
            }
          }
        }
      } catch (autoErr) {
        console.warn("Auto-deduct cutting material skipped:", autoErr);
      }
    }
  } catch (e) {
    redirectWithMessage(PATH, "error", errorMessage(e, "Hasil Cutting gagal."));
  }
  refresh();
  redirectWithMessage(PATH, "success", "Hasil Cutting tersimpan; hasil baik otomatis masuk Gudang Hasil dan bahan terpotong proporsional.");
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

export async function updateResult(f: FormData) {
  await requirePermission("cutting.write");
  const resultId = getId(f, "result_id");
  const compId = getId(f, "component_id");
  const goodQty = getNumber(f, "good_qty", { min: 0 });
  const rejectQty = getNumber(f, "reject_qty", { min: 0 });
  const officer = getText(f, "officer");
  const notes = getText(f, "notes") || null;
  const resultDate = getOptionalDate(f, "result_date");
  if (!resultDate) throw new Error("Tanggal wajib diisi.");

  try {
    // 1. Reversal previous record
    await callRpc("cancel_cutting_result", { p_result_id: resultId });

    // 2. Re-record revised result
    await callRpc("record_cutting_result", {
      p_result_date: resultDate,
      p_cutting_component_id: compId,
      p_good_qty: goodQty,
      p_reject_qty: rejectQty,
      p_officer: officer,
      p_notes: notes || undefined,
    });
  } catch (e) {
    redirectWithMessage(PATH, "error", errorMessage(e, "Hasil Cutting gagal diperbarui."));
  }
  refresh();
  redirectWithMessage(PATH, "success", "Hasil Cutting berhasil diperbarui.");
}

