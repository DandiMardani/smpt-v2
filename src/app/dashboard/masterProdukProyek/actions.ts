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

const PATH = "/dashboard/masterProdukProyek";
const STATUSES = ["AKTIF", "NONAKTIF"] as const;

export async function createProjectProduct(formData: FormData) {
  await requirePermission("master_produk_proyek.write");

  try {
    const projectId = getId(formData, "project_id");
    const name = getText(formData, "name");
    const targetProduction = getNumber(formData, "target_production", { min: 0.0001 });
    const unit = getText(formData, "unit") || "pcs";
    const status = requireOneOf(
      getText(formData, "status") || "AKTIF",
      STATUSES,
      "Status Produk/Tas",
    );
    const notes = getText(formData, "notes");

    if (!name) throw new Error("Nama Produk/Tas wajib diisi.");

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
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Gagal menambah Produk/Tas."));
  }

  revalidatePath(PATH);
  redirectWithMessage(PATH, "success", "Produk/Tas berhasil ditambahkan.");
}

export async function updateProjectProduct(formData: FormData) {
  await requirePermission("master_produk_proyek.write");

  try {
    const id = getId(formData, "id");
    const projectId = getId(formData, "project_id");
    const name = getText(formData, "name");
    const targetProduction = getNumber(formData, "target_production", { min: 0.0001 });
    const unit = getText(formData, "unit") || "pcs";
    const status = requireOneOf(
      getText(formData, "status") || "AKTIF",
      STATUSES,
      "Status Produk/Tas",
    );
    const notes = getText(formData, "notes");

    if (!name) throw new Error("Nama Produk/Tas wajib diisi.");

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
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Gagal memperbarui Produk/Tas."));
  }

  revalidatePath(PATH);
  redirectWithMessage(PATH, "success", "Produk/Tas berhasil diperbarui.");
}

export async function deleteProjectProduct(formData: FormData) {
  await requirePermission("master_produk_proyek.write");

  try {
    const id = getId(formData, "id");
    const supabase = await createClient();

    const [wiRes, spkRes, bomRes] = await Promise.all([
      supabase.from("work_items").select("id").eq("product_id", id).limit(1),
      supabase.from("production_orders").select("id").eq("product_id", id).limit(1),
      supabase.from("bom_requirements").select("id").eq("product_id", id).limit(1),
    ]);

    const inUse = (wiRes.data?.length ?? 0) > 0 || (spkRes.data?.length ?? 0) > 0 || (bomRes.data?.length ?? 0) > 0;

    if (inUse) {
      const { error } = await supabase.from("project_products").update({ status: "NONAKTIF" }).eq("id", id);
      if (error) throw error;
      revalidatePath(PATH);
      redirectWithMessage(PATH, "success", "Produk/Tas dinonaktifkan karena telah memiliki SPK / Item Pekerjaan.");
    } else {
      const { error } = await supabase.from("project_products").delete().eq("id", id);
      if (error) throw error;
      revalidatePath(PATH);
      redirectWithMessage(PATH, "success", "Produk/Tas berhasil dihapus.");
    }
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Gagal menghapus Produk/Tas."));
  }
}

