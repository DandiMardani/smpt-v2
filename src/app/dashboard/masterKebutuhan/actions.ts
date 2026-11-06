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

function contextPath(formData: FormData) {
  const project = getText(formData, "return_project") || getText(formData, "project_id");
  const product = getText(formData, "return_product") || getText(formData, "product_id");
  const q = getText(formData, "return_q");
  const params = new URLSearchParams();
  if (project) params.set("project", project);
  if (product) params.set("product", product);
  if (q) params.set("q", q);
  const query = params.toString();
  return `${PATH}${query ? `?${query}` : ""}`;
}

export async function saveBomRequirement(formData: FormData): Promise<any> {
  await requirePermission("master_kebutuhan.write");
  const isClientSubmit = formData.get("client_submit") === "true";
  const targetPath = contextPath(formData);

  const handleError = (errorMsg: string) => {
    if (isClientSubmit) {
      return { success: false, error: errorMsg };
    }
    redirectWithMessage(targetPath, "error", errorMsg);
  };

  try {
    const requirementId = getOptionalId(formData, "id");
    const rawProjectId = getText(formData, "project_id");
    const rawProductId = getText(formData, "product_id");

    const projectId = Number(rawProjectId);
    const productId = Number(rawProductId);

    if (!rawProjectId || !Number.isSafeInteger(projectId) || projectId <= 0) {
      return handleError("Proyek wajib dipilih (project_id tidak boleh kosong).");
    }
    if (!rawProductId || !Number.isSafeInteger(productId) || productId <= 0) {
      return handleError("Produk/Tas wajib dipilih (product_id tidak boleh kosong).");
    }

    const materialId = getOptionalId(formData, "material_id");
    const componentType = requireOneOf(getText(formData, "component_type") || "BAHAN", TYPES, "Jenis komponen");
    let componentName = getText(formData, "component_name");
    let unit = getText(formData, "unit");

    // Parsing Float angka desimal
    const rawQtyInput = getText(formData, "qty_per_unit");
    const parsedQty = parseFloat(rawQtyInput.replace(",", "."));
    if (!Number.isFinite(parsedQty) || parsedQty < 0) {
      return handleError("Kebutuhan per unit harus berupa angka valid (minimal 0).");
    }

    const unitPrice = getNumber(formData, "unit_price", { min: 0 });
    const status = requireOneOf(getText(formData, "status") || "AKTIF", STATUSES, "Status kebutuhan");
    const source = requireOneOf(getText(formData, "fulfillment_source") || "COMPANY_PURCHASE", SOURCES, "Sumber pemenuhan");
    const method = requireOneOf(getText(formData, "calculation_method") || "MANUAL", METHODS, "Metode perhitungan");

    // Fleksibel untuk BAHAN, JASA, dan BIAYA tanpa pembulatan otomatis (Float)
    const rawNetUsage = getText(formData, "net_usage_per_product");
    const netUsageInput = rawNetUsage ? parseFloat(rawNetUsage.replace(",", ".")) : null;
    const netUsage = netUsageInput !== null && Number.isFinite(netUsageInput) && netUsageInput > 0 ? netUsageInput : parsedQty;

    const rawAllowance = getText(formData, "allowance_percent");
    const parsedAllowance = rawAllowance ? parseFloat(rawAllowance.replace(",", ".")) : 0;
    const allowancePercent = Number.isFinite(parsedAllowance) ? parsedAllowance : 0;

    const rawWaste = getText(formData, "waste_percent");
    const parsedWaste = rawWaste ? parseFloat(rawWaste.replace(",", ".")) : 0;
    const wastePercent = Number.isFinite(parsedWaste) ? parsedWaste : 0;

    // Hitung total qty per unit = Net Usage * (1 + Allowance / 100) sebagai float
    const calculatedGrossQty = parseFloat((netUsage * (1 + allowancePercent / 100)).toFixed(6));
    const qtyPerUnit = calculatedGrossQty;

    const rawFinal = getText(formData, "final_requirement");
    const parsedFinal = rawFinal ? parseFloat(rawFinal.replace(",", ".")) : null;
    const finalRequirement = parsedFinal !== null && Number.isFinite(parsedFinal) ? parsedFinal : null;
    const snapshot = calculationSnapshot(formData);

    if (componentType === "BAHAN" && !materialId) {
      return handleError("Komponen BAHAN wajib dipilih dari Master Bahan.");
    }
    if (componentType !== "BAHAN" && !componentName) {
      return handleError("Nama komponen wajib diisi untuk JASA/BIAYA.");
    }
    if (componentType !== "BAHAN" && !unit) {
      return handleError("Satuan wajib diisi untuk JASA/BIAYA.");
    }

    const supabase = await createClient();

    // Resolusi nama material dan unit jika belum terisi pada komponen BAHAN
    if (componentType === "BAHAN" && (!componentName || !unit) && materialId) {
      const { data: mat, error: matErr } = await supabase
        .from("materials")
        .select("name, standard_unit")
        .eq("id", materialId)
        .maybeSingle();

      if (matErr) {
        console.error("Error fetching material info:", matErr);
      }
      if (mat) {
        if (!componentName) componentName = mat.name;
        if (!unit) unit = mat.standard_unit;
      }
    }

    if (!requirementId) {
      // Logic Backend Insert Database: supabase.from('bom_requirements').insert(...)
      const insertPayload = {
        project_id: projectId,
        product_id: productId,
        material_id: componentType === "BAHAN" ? materialId : null,
        component_type: componentType,
        component_name: componentName || "Bahan Baku",
        unit: unit || "pcs",
        qty_per_unit: qtyPerUnit,
        unit_price: unitPrice,
        status: status,
        fulfillment_source: source,
        calculation_method: method,
        net_usage_per_product: netUsage,
        allowance_percent: allowancePercent,
        waste_percent: wastePercent,
        final_requirement: finalRequirement,
        calculation_input_snapshot: snapshot,
      };

      const { error } = await supabase
        .from("bom_requirements")
        .insert(insertPayload);

      // DILARANG MENELAN ERROR: Jika balasan dari Supabase mengandung error, kembalikan ke UI
      if (error) {
        console.error("Supabase insert error on bom_requirements:", error);
        return handleError(error.message || error.details || error.hint || JSON.stringify(error));
      }
    } else {
      // Update logic jika requirementId sudah ada (edit mode)
      const updatePayload = {
        project_id: projectId,
        product_id: productId,
        material_id: componentType === "BAHAN" ? materialId : null,
        component_type: componentType,
        component_name: componentName || "Bahan Baku",
        unit: unit || "pcs",
        qty_per_unit: qtyPerUnit,
        unit_price: unitPrice,
        status: status,
        fulfillment_source: source,
        calculation_method: method,
        net_usage_per_product: netUsage,
        allowance_percent: allowancePercent,
        waste_percent: wastePercent,
        final_requirement: finalRequirement,
        calculation_input_snapshot: snapshot,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("bom_requirements")
        .update(updatePayload)
        .eq("id", requirementId);

      if (error) {
        console.error("Supabase update error on bom_requirements:", error);
        return handleError(error.message || error.details || error.hint || JSON.stringify(error));
      }
    }

    revalidatePath(PATH);
    if (isClientSubmit) {
      return { success: true, message: "Master Kebutuhan/BOM berhasil disimpan." };
    }
    redirectWithMessage(targetPath, "success", "Master Kebutuhan/BOM berhasil disimpan.");
  } catch (error: unknown) {
    console.error("Error in saveBomRequirement:", error);
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as any).message)
          : "Gagal menyimpan kebutuhan/BOM.";
    return handleError(message);
  }
}

export async function deleteBomRequirement(formData: FormData) {
  await requirePermission("master_kebutuhan.write");
  const targetPath = contextPath(formData);

  try {
    const id = getId(formData, "id");
    const supabase = await createClient();
    const { error } = await supabase.from("bom_requirements").delete().eq("id", id);
    if (error) throw error;
  } catch (error) {
    redirectWithMessage(targetPath, "error", errorMessage(error, "Gagal menghapus kebutuhan/BOM."));
  }

  revalidatePath(PATH);
  redirectWithMessage(targetPath, "success", "Kebutuhan/BOM berhasil dihapus.");
}
