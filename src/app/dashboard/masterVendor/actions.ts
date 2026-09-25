"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAnyPermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";

const PATH = "/dashboard/masterVendor";
const text = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
const numberValue = (f: FormData, key: string, nullable = true) => {
  const raw = text(f, key);
  if (!raw && nullable) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${key} tidak valid.`);
  return value;
};
const idValue = (f: FormData, key: string) => {
  const value = Number(text(f, key));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} tidak valid.`);
  return value;
};
function go(type: "success" | "error", message: string): never {
  redirect(`${PATH}?${type}=${encodeURIComponent(message)}`);
}
function message(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message || "Terjadi kesalahan.");
  return error instanceof Error ? error.message : "Terjadi kesalahan.";
}

export async function saveSupplierAction(formData: FormData) {
  await requireAnyPermission(["master_vendor.write", "supplier.manage"]);
  try {
    const supplierIdRaw = text(formData, "id");
    const supplierId = supplierIdRaw ? idValue(formData, "id") : null;
    const payload = {
      name: text(formData, "name"),
      pic_name: text(formData, "pic_name") || null,
      phone: text(formData, "phone") || null,
      whatsapp: text(formData, "whatsapp") || null,
      email: text(formData, "email") || null,
      address: text(formData, "address") || null,
      city: text(formData, "city") || null,
      province: text(formData, "province") || null,
      tax_no: text(formData, "tax_no") || null,
      payment_terms: text(formData, "payment_terms") || null,
      default_currency: (text(formData, "default_currency") || "IDR").toUpperCase(),
      lead_time_days: numberValue(formData, "lead_time_days"),
      rating: numberValue(formData, "rating"),
      bank_name: text(formData, "bank_name") || null,
      bank_account_no: text(formData, "bank_account_no") || null,
      bank_account_name: text(formData, "bank_account_name") || null,
      status: text(formData, "status") || "AKTIF",
      notes: text(formData, "notes") || null,
      internal_notes: text(formData, "internal_notes") || null,
    };
    if (!payload.name) throw new Error("Nama Supplier/Vendor wajib diisi.");
    const supabase = await createClient();
    const result = supplierId
      ? await supabase.from("vendors").update(payload).eq("id", supplierId)
      : await supabase.from("vendors").insert(payload);
    if (result.error) throw result.error;
  } catch (error) {
    go("error", message(error));
  }
  revalidatePath(PATH);
  go("success", "Master Supplier/Vendor berhasil disimpan.");
}

export async function saveMaterialSupplierAction(formData: FormData) {
  await requireAnyPermission(["master_vendor.write", "supplier.manage"]);
  try {
    const materialId = idValue(formData, "material_id");
    const supplierId = idValue(formData, "supplier_id");
    const payload = {
      material_id: materialId,
      supplier_id: supplierId,
      supplier_material_code: text(formData, "supplier_material_code") || null,
      supplier_material_name: text(formData, "supplier_material_name") || null,
      supplier_unit: text(formData, "supplier_unit") || null,
      conversion_factor: numberValue(formData, "conversion_factor") ?? 1,
      last_price: numberValue(formData, "last_price"),
      preferred: ["1", "true", "on", "yes"].includes(text(formData, "preferred").toLowerCase()),
      moq: numberValue(formData, "moq"),
      estimated_lead_time_days: numberValue(formData, "estimated_lead_time_days"),
      default_purchase_unit: text(formData, "default_purchase_unit") || null,
      notes: text(formData, "notes") || null,
      status: text(formData, "status") || "AKTIF",
    };
    const supabase = await createClient();
    const { error } = await supabase.rpc("save_material_supplier", {
      p_material_id: payload.material_id,
      p_supplier_id: payload.supplier_id,
      p_supplier_material_code: payload.supplier_material_code,
      p_supplier_material_name: payload.supplier_material_name,
      p_supplier_unit: payload.supplier_unit,
      p_conversion_factor: payload.conversion_factor,
      p_last_price: payload.last_price,
      p_preferred: payload.preferred,
      p_moq: payload.moq,
      p_estimated_lead_time_days: payload.estimated_lead_time_days,
      p_default_purchase_unit: payload.default_purchase_unit,
      p_notes: payload.notes,
      p_status: payload.status,
    });
    if (error) throw error;
  } catch (error) {
    go("error", message(error));
  }
  revalidatePath(PATH);
  go("success", "Relasi Material ↔ Supplier berhasil disimpan.");
}

export async function deleteSupplierAction(formData: FormData) {
  await requireAnyPermission(["master_vendor.write", "supplier.manage"]);
  try {
    const id = idValue(formData, "id");
    const supabase = await createClient();
    const { error } = await supabase.from("vendors").delete().eq("id", id);
    if (error) throw error;
  } catch (error) {
    go("error", message(error));
  }
  revalidatePath(PATH);
  go("success", "Supplier/Vendor berhasil dihapus.");
}

export async function deleteMaterialSupplierAction(formData: FormData) {
  await requireAnyPermission(["master_vendor.write", "supplier.manage"]);
  try {
    const id = idValue(formData, "id");
    const supabase = await createClient();
    const { error } = await supabase.from("material_suppliers").delete().eq("id", id);
    if (error) throw error;
  } catch (error) {
    go("error", message(error));
  }
  revalidatePath(PATH);
  go("success", "Relasi Material ↔ Supplier berhasil dihapus.");
}

