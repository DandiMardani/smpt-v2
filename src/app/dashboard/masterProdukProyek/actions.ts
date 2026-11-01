"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, getCurrentAccessContext } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import { createClient as createStandaloneClient } from "@supabase/supabase-js";
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

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serverKey) return null;
  return createStandaloneClient(url, serverKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

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

export async function updateProjectProductAction(formData: FormData) {
  // 1. Validasi Hak Akses:
  // Role ADMIN / SUPERADMIN / ADMINISTRATOR / OWNER secara otomatis memiliki akses bypass.
  // Pengguna lain wajib memiliki permission master_produk_proyek.write.
  const access = await getCurrentAccessContext();
  const roleName = String(access.role || "").toUpperCase();
  const isAdmin = ["ADMIN", "ADMINISTRATOR", "SUPERADMIN", "OWNER"].includes(roleName);
  const hasPermission = access.permissionCodes.includes("master_produk_proyek.write");

  if (!isAdmin && !hasPermission) {
    throw new Error("Anda tidak memiliki izin untuk mengubah produk proyek.");
  }

  const s = await createClient();
  const admin = getAdminClient();
  const db = admin || s;

  const id = getId(formData, "id");
  const projectId = getId(formData, "project_id");
  const name = getText(formData, "name");
  const productCode = getText(formData, "product_code");
  const targetProduction = getNumber(formData, "target_production", { min: 0.0001 });
  const unit = getText(formData, "unit") || "pcs";
  const status = requireOneOf(
    getText(formData, "status") || "AKTIF",
    STATUSES,
    "Status Produk",
  );
  const notes = getText(formData, "notes");

  if (!id) throw new Error("ID Produk tidak valid.");
  if (!projectId) throw new Error("Pilihan Proyek Induk wajib dipilih.");
  if (!name) throw new Error("Nama Produk wajib diisi.");

  // Fetch data produk saat ini untuk memverifikasi keberadaan dan mendeteksi perubahan proyek induk
  const { data: currentProduct, error: fetchErr } = await db
    .from("project_products")
    .select("id, project_id, product_code, name")
    .eq("id", id)
    .single();

  if (fetchErr || !currentProduct) {
    throw new Error("Data produk tidak ditemukan: " + (fetchErr?.message || "Not found"));
  }

  const payload: Record<string, any> = {
    project_id: projectId,
    name,
    target_production: targetProduction,
    unit,
    status,
    notes: notes || null,
  };

  if (productCode && productCode.trim()) {
    payload.product_code = productCode.trim().toUpperCase();
  }

  // 2. Eksekusi Update pada tabel project_products
  const { data: updatedRows, error: updErr } = await db
    .from("project_products")
    .update(payload)
    .eq("id", id)
    .select("id, project_id, product_code, name");

  if (updErr) {
    throw new Error("Gagal memperbarui data produk: " + updErr.message);
  }

  if (!updatedRows || updatedRows.length === 0) {
    throw new Error("Gagal memperbarui data produk. Tidak ada baris yang ter-update di database.");
  }

  // 3. Foreign Key Safety Handling:
  // Jika produk dipindahkan ke Proyek Induk yang berbeda, pastikan relasi data turunan
  // (BOM, Ongkos Jahit, Komponen Potong) tetap sinkron dan utuh tanpa merusak relasi.
  if (currentProduct.project_id !== projectId) {
    await db.from("bom_requirements").update({ project_id: projectId }).eq("product_id", id);
    await db.from("work_items").update({ project_id: projectId }).eq("product_id", id);
    await db.from("cutting_components").update({ project_id: projectId }).eq("product_id", id);
  }

  // 4. Invalidation Cache
  revalidatePath(PATH);
  revalidatePath("/dashboard/masterProdukProyek");
  revalidatePath("/dashboard/masterKebutuhan");
  revalidatePath("/dashboard/cutting");
  revalidatePath("/dashboard/masterItem");
  revalidatePath("/dashboard/spk");

  return {
    success: true,
    message: `Produk ${name} (${productCode || currentProduct.product_code}) berhasil diperbarui.`,
  };
}

export const updateProjectProduct = updateProjectProductAction;

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
