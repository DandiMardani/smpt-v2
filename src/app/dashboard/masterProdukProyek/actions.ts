"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  errorMessage,
  getId,
  getNumber,
  getText,
  redirectWithMessage,
  requireOneOf,
} from "@/lib/master/action-utils";

const PATH = "/dashboard/masterProdukProyek";
const STATUSES = ["AKTIF", "NONAKTIF"] as const;

export async function createProjectProduct(formData: FormData) {
  await requirePermission("master_produk_proyek.write");

  let redirectType: "success" | "error" = "success";
  let message = "";

  try {
    const projectId = getId(formData, "project_id");
    const name = getText(formData, "name");
    const targetProduction = getNumber(formData, "target_production", { min: 0.0001 });
    const unit = getText(formData, "unit") || "pcs";
    const status = requireOneOf(
      getText(formData, "status") || "AKTIF",
      STATUSES,
      "Status Produk",
    );
    const notes = getText(formData, "notes");

    if (!name) throw new Error("Nama Produk wajib diisi.");

    const supabase = await createClient();
    const { error } = await supabase.from("project_products").insert({
      project_id: projectId,
      name,
      target_production: targetProduction,
      unit,
      status,
      notes: notes || null,
    });

    if (error) throw error;
    message = "Produk berhasil ditambahkan.";
  } catch (error) {
    redirectType = "error";
    message = errorMessage(error, "Gagal menambah Produk.");
  }

  revalidatePath(PATH);
  redirectWithMessage(PATH, redirectType, message);
}

export async function updateProjectProduct(formData: FormData) {
  await requirePermission("master_produk_proyek.write");

  let redirectType: "success" | "error" = "success";
  let message = "";

  try {
    const id = getId(formData, "id");
    const projectId = getId(formData, "project_id");
    const name = getText(formData, "name");
    const targetProduction = getNumber(formData, "target_production", { min: 0.0001 });
    const unit = getText(formData, "unit") || "pcs";
    const status = requireOneOf(
      getText(formData, "status") || "AKTIF",
      STATUSES,
      "Status Produk",
    );
    const notes = getText(formData, "notes");

    if (!name) throw new Error("Nama Produk wajib diisi.");

    const supabase = await createClient();
    const { error } = await supabase
      .from("project_products")
      .update({
        project_id: projectId,
        name,
        target_production: targetProduction,
        unit,
        status,
        notes: notes || null,
      })
      .eq("id", id);

    if (error) throw error;
    message = "Produk berhasil diperbarui.";
  } catch (error) {
    redirectType = "error";
    message = errorMessage(error, "Gagal memperbarui Produk.");
  }

  revalidatePath(PATH);
  redirectWithMessage(PATH, redirectType, message);
}

export async function deleteProjectProduct(formData: FormData) {
  await requirePermission("master_produk_proyek.write");

  let redirectType: "success" | "error" = "success";
  let message = "";

  try {
    const id = getId(formData, "id");
    const supabase = await createClient();

    // Cek apakah produk sudah digunakan dalam SPK produksi aktif
    const { data: spkRows } = await supabase
      .from("production_orders")
      .select("id")
      .eq("product_id", id)
      .limit(1);

    const hasSpk = (spkRows?.length ?? 0) > 0;

    if (hasSpk) {
      const { error } = await supabase.from("project_products").update({ status: "NONAKTIF" }).eq("id", id);
      if (error) throw error;
      message = "Produk dinonaktifkan (status: NONAKTIF) karena telah tercatat dalam SPK Produksi.";
    } else {
      // Jika salah input dan belum masuk SPK, bersihkan draft kebutuhan & item terlebih dahulu agar bersih tuntas
      await supabase.from("bom_requirements").delete().eq("product_id", id);
      await supabase.from("work_items").delete().eq("product_id", id);
      await supabase.from("cutting_components").delete().eq("product_id", id);

      const { error } = await supabase.from("project_products").delete().eq("id", id);
      if (error) throw error;
      message = "Produk berhasil dihapus.";
    }
  } catch (error) {
    redirectType = "error";
    message = errorMessage(error, "Gagal menghapus Produk.");
  }

  revalidatePath(PATH);
  redirectWithMessage(PATH, redirectType, message);
}

export async function addProductBomAction(formData: FormData) {
  await requirePermission("master_produk_proyek.write");
  const returnUrl = getText(formData, "return_url") || PATH;

  try {
    const projectId = getId(formData, "project_id");
    const productId = getId(formData, "product_id");
    const materialId = getId(formData, "material_id");
    const quantity = getNumber(formData, "quantity", { min: 0.0001 });
    const unit = getText(formData, "unit") || "pcs";
    const componentName = getText(formData, "component_name") || "Bahan Baku";

    const supabase = await createClient();
    const { data: mat } = await supabase
      .from("materials")
      .select("name, standard_unit")
      .eq("id", materialId)
      .maybeSingle();

    const resolvedName = componentName && componentName !== "Bahan Baku" ? componentName : (mat?.name || "Bahan Baku");
    const resolvedUnit = unit && unit !== "pcs" ? unit : (mat?.standard_unit || "pcs");

    const { error } = await supabase.rpc("save_bom_requirement_v2", {
      p_requirement_id: null,
      p_project_id: projectId,
      p_product_id: productId,
      p_material_id: materialId,
      p_component_type: "BAHAN",
      p_component_name: resolvedName,
      p_unit: resolvedUnit,
      p_qty_per_unit: quantity,
      p_unit_price: 0,
      p_status: "AKTIF",
      p_fulfillment_source: "COMPANY_PURCHASE",
      p_calculation_method: "MANUAL",
    });

    if (error) throw error;
  } catch (error) {
    redirectWithMessage(returnUrl, "error", errorMessage(error, "Gagal menambah kebutuhan BOM bahan."));
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/masterKebutuhan");
  redirectWithMessage(returnUrl, "success", "Bahan BOM berhasil ditambahkan ke produk.");
}

export async function deleteProductBomAction(formData: FormData) {
  await requirePermission("master_produk_proyek.write");
  const returnUrl = getText(formData, "return_url") || PATH;

  try {
    const id = getId(formData, "id");
    const supabase = await createClient();
    const { error } = await supabase.from("bom_requirements").delete().eq("id", id);
    if (error) throw error;
  } catch (error) {
    redirectWithMessage(returnUrl, "error", errorMessage(error, "Gagal menghapus BOM bahan."));
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/masterKebutuhan");
  redirectWithMessage(returnUrl, "success", "Bahan BOM berhasil dihapus.");
}

export async function addProductCuttingComponentAction(formData: FormData) {
  await requirePermission("master_produk_proyek.write");
  const returnUrl = getText(formData, "return_url") || PATH;

  try {
    const projectId = getId(formData, "project_id");
    const productId = getId(formData, "product_id");
    const name = getText(formData, "name");
    const qtyPerProduct = getNumber(formData, "qty_per_product", { min: 0.0001 });
    const unit = getText(formData, "unit") || "pcs";
    const color = getText(formData, "color") || "";
    const notes = getText(formData, "notes") || null;

    if (!name) throw new Error("Nama komponen potong wajib diisi.");

    const supabase = await createClient();
    const { error } = await supabase.rpc("save_cutting_component", {
      p_component_id: null,
      p_project_id: projectId,
      p_product_id: productId,
      p_name: name,
      p_qty_per_product: qtyPerProduct,
      p_unit: unit,
      p_color: color,
      p_notes: notes,
      p_status: "AKTIF",
    });

    if (error) throw error;
  } catch (error) {
    redirectWithMessage(returnUrl, "error", errorMessage(error, "Gagal menambah komponen cutting."));
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/cutting");
  redirectWithMessage(returnUrl, "success", "Komponen cutting berhasil ditambahkan.");
}

export async function deleteProductCuttingComponentAction(formData: FormData) {
  await requirePermission("master_produk_proyek.write");
  const returnUrl = getText(formData, "return_url") || PATH;

  try {
    const id = getId(formData, "id");
    const supabase = await createClient();
    const { error } = await supabase.from("cutting_components").delete().eq("id", id);
    if (error) throw error;
  } catch (error) {
    redirectWithMessage(returnUrl, "error", errorMessage(error, "Gagal menghapus komponen cutting."));
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/cutting");
  redirectWithMessage(returnUrl, "success", "Komponen cutting berhasil dihapus.");
}

export async function addProductWorkItemAction(formData: FormData) {
  await requirePermission("master_produk_proyek.write");
  const returnUrl = getText(formData, "return_url") || PATH;

  try {
    const projectId = getId(formData, "project_id");
    const productId = getId(formData, "product_id");
    const name = getText(formData, "name");
    const unit = getText(formData, "unit") || "pcs";
    const qtyPerProduct = Math.max(1, Math.round(getNumber(formData, "qty_per_product", { min: 1 })));
    const operatorPrice = Math.max(0, Math.round(getNumber(formData, "operator_price", { min: 0 })));
    const proposedPrice = Math.max(0, Math.round(getNumber(formData, "proposed_price", { min: 0 })));

    if (!name) throw new Error("Nama pekerjaan jahit wajib diisi.");

    const supabase = await createClient();
    const { error } = await supabase.rpc("save_work_item", {
      p_item_id: null,
      p_project_id: projectId,
      p_product_id: productId,
      p_name: name,
      p_unit: unit,
      p_qty_per_product: qtyPerProduct,
      p_operator_price: operatorPrice,
      p_proposed_price: proposedPrice,
      p_status: "AKTIF",
      p_output_final: false,
    });

    if (error) throw error;
  } catch (error) {
    redirectWithMessage(returnUrl, "error", errorMessage(error, "Gagal menambah ongkos pekerjaan jahit."));
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/masterItem");
  redirectWithMessage(returnUrl, "success", "Item ongkos jahit berhasil ditambahkan.");
}

export async function deleteProductWorkItemAction(formData: FormData) {
  await requirePermission("master_produk_proyek.write");
  const returnUrl = getText(formData, "return_url") || PATH;

  try {
    const id = getId(formData, "id");
    const supabase = await createClient();
    const { error } = await supabase.from("work_items").delete().eq("id", id);
    if (error) throw error;
  } catch (error) {
    redirectWithMessage(returnUrl, "error", errorMessage(error, "Gagal menghapus item pekerjaan jahit."));
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/masterItem");
  redirectWithMessage(returnUrl, "success", "Item pekerjaan jahit berhasil dihapus.");
}
