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
