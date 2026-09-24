"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  errorMessage,
  getId,
  getNumber,
  getOptionalId,
  getText,
  redirectWithMessage,
  requireOneOf,
} from "@/lib/master/action-utils";

const PATH = "/dashboard/masterKebutuhan";
const TYPES = ["BAHAN", "JASA", "BIAYA"] as const;
const STATUSES = ["AKTIF", "NONAKTIF"] as const;
const SOURCES = ["COMPANY_PURCHASE", "CUSTOMER_SUPPLIED", "VENDOR_SUPPLIED", "INTERNAL_STOCK", "OTHER"] as const;
const METHODS = ["MANUAL", "SAMPLE", "CONSUMPTION", "MARKER"] as const;

function optionalNumber(formData: FormData, key: string, min = 0): number | null {
  const raw = getText(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min) throw new Error(`${key} tidak valid.`);
  return value;
}

function calculationSnapshot(formData: FormData): Record<string, unknown> | null {
  const raw = String(formData.get("calculation_input_snapshot") ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    throw new Error("Snapshot kalkulator tidak valid. Jalankan kalkulator ulang atau gunakan input manual.");
  }
}

export async function saveBomRequirement(formData: FormData) {
  await requirePermission("master_kebutuhan.write");

  try {
    const requirementId = getOptionalId(formData, "id");
    const projectId = getId(formData, "project_id");
    const productId = getId(formData, "product_id");
    const materialId = getOptionalId(formData, "material_id");
    const componentType = requireOneOf(getText(formData, "component_type") || "BAHAN", TYPES, "Jenis komponen");
    const componentName = getText(formData, "component_name");
    const unit = getText(formData, "unit");
    const qtyPerUnit = getNumber(formData, "qty_per_unit", { min: 0 });
    const unitPrice = getNumber(formData, "unit_price", { min: 0 });
    const status = requireOneOf(getText(formData, "status") || "AKTIF", STATUSES, "Status kebutuhan");
    const source = requireOneOf(getText(formData, "fulfillment_source") || "COMPANY_PURCHASE", SOURCES, "Sumber pemenuhan");
    const method = requireOneOf(getText(formData, "calculation_method") || "MANUAL", METHODS, "Metode perhitungan");
    const netUsage = optionalNumber(formData, "net_usage_per_product");
    const allowancePercent = optionalNumber(formData, "allowance_percent") ?? 0;
    const wastePercent = optionalNumber(formData, "waste_percent") ?? 0;
    const finalRequirement = optionalNumber(formData, "final_requirement");
    const snapshot = calculationSnapshot(formData);

    if (componentType === "BAHAN" && !materialId) throw new Error("Komponen BAHAN wajib dipilih dari Master Bahan.");
    if (componentType !== "BAHAN" && !componentName) throw new Error("Nama komponen wajib diisi untuk JASA/BIAYA.");
    if (componentType !== "BAHAN" && !unit) throw new Error("Satuan wajib diisi untuk JASA/BIAYA.");

    const supabase = await createClient();
    const { error } = await supabase.rpc("save_bom_requirement_v2", {
      p_requirement_id: requirementId,
      p_project_id: projectId,
      p_product_id: productId,
      p_material_id: materialId,
      p_component_type: componentType,
      p_component_name: componentName,
      p_unit: unit,
      p_qty_per_unit: qtyPerUnit,
      p_unit_price: unitPrice,
      p_status: status,
      p_fulfillment_source: source,
      p_calculation_method: method,
      p_net_usage_per_product: netUsage,
      p_allowance_percent: allowancePercent,
      p_waste_percent: wastePercent,
      p_final_requirement: finalRequirement,
      p_calculation_input_snapshot: snapshot,
    });

    if (error) throw error;
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Gagal menyimpan kebutuhan/BOM."));
  }

  revalidatePath(PATH);
  redirectWithMessage(PATH, "success", "Master Kebutuhan/BOM berhasil disimpan.");
}

export async function deleteBomRequirement(formData: FormData) {
  await requirePermission("master_kebutuhan.write");

  try {
    const id = getId(formData, "id");
    const supabase = await createClient();
    const { error } = await supabase.from("bom_requirements").delete().eq("id", id);
    if (error) throw error;
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Gagal menghapus kebutuhan/BOM."));
  }

  revalidatePath(PATH);
  redirectWithMessage(PATH, "success", "Kebutuhan/BOM berhasil dihapus.");
}
