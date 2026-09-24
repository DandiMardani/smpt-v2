"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  errorMessage,
  getId,
  getNumber,
  getOptionalDate,
  getText,
  redirectWithMessage,
  requireOneOf,
} from "@/lib/master/action-utils";

const PATH = "/dashboard/masterProyek";
const PROJECT_STATUSES = ["Pending", "Berjalan", "Selesai"] as const;

export async function createProject(formData: FormData) {
  await requirePermission("master_proyek.write");

  try {
    const projectCode = getText(formData, "project_code");
    const name = getText(formData, "name");
    const productCategory = getText(formData, "product_category");
    const customerName = getText(formData, "customer_name");
    const contractValue = getNumber(formData, "contract_value", { min: 0 });
    const startDate = getOptionalDate(formData, "start_date");
    const endDate = getOptionalDate(formData, "end_date");
    const status = requireOneOf(
      getText(formData, "status") || "Pending",
      PROJECT_STATUSES,
      "Status proyek",
    );

    if (!projectCode) throw new Error("ID Proyek wajib diisi.");
    if (!name) throw new Error("Nama Proyek wajib diisi.");
    if (startDate && endDate && endDate < startDate) {
      throw new Error("Tanggal selesai tidak boleh sebelum tanggal mulai.");
    }

    const supabase = await createClient();
    const { error } = await supabase.from("projects").insert({
      project_code: projectCode,
      name,
      product_category: productCategory || null,
      customer_name: customerName || null,
      contract_value: contractValue,
      legacy_target_production: 0,
      start_date: startDate,
      end_date: endDate,
      status,
    });

    if (error) throw error;
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Gagal menambah proyek."));
  }

  revalidatePath(PATH);
  redirectWithMessage(PATH, "success", "Master Proyek berhasil ditambahkan.");
}

export async function updateProject(formData: FormData) {
  await requirePermission("master_proyek.write");

  try {
    const id = getId(formData, "id");
    const name = getText(formData, "name");
    const productCategory = getText(formData, "product_category");
    const customerName = getText(formData, "customer_name");
    const contractValue = getNumber(formData, "contract_value", { min: 0 });
    const startDate = getOptionalDate(formData, "start_date");
    const endDate = getOptionalDate(formData, "end_date");
    const status = getText(formData, "status");

    if (!name) throw new Error("Nama Proyek wajib diisi.");
    if (!status) throw new Error("Status Proyek wajib diisi.");
    if (startDate && endDate && endDate < startDate) {
      throw new Error("Tanggal selesai tidak boleh sebelum tanggal mulai.");
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("projects")
      .update({
        name,
        product_category: productCategory || null,
        customer_name: customerName || null,
        contract_value: contractValue,
        start_date: startDate,
        end_date: endDate,
        status,
      })
      .eq("id", id);

    if (error) throw error;
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Gagal memperbarui proyek."));
  }

  revalidatePath(PATH);
  redirectWithMessage(PATH, "success", "Master Proyek berhasil diperbarui.");
}

export async function deleteProject(formData: FormData) {
  await requirePermission("master_proyek.write");

  try {
    const id = getId(formData, "id");
    const supabase = await createClient();
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) throw error;
  } catch (error) {
    redirectWithMessage(
      PATH,
      "error",
      errorMessage(error, "Gagal menghapus proyek. Pastikan proyek belum dipakai data lain."),
    );
  }

  revalidatePath(PATH);
  redirectWithMessage(PATH, "success", "Master Proyek berhasil dihapus.");
}


export async function repeatProject(formData: FormData) {
  const access = await requirePermission("master_proyek.write");

  try {
    const required = [
      "master_produk_proyek.write",
      "master_item.write",
      "master_kebutuhan.write",
    ];
    if (!required.every((permission) => access.permissionCodes.includes(permission))) {
      throw new Error("Repeat Order memerlukan izin tulis Proyek, Produk/Tas, Item Pekerjaan, dan Kebutuhan/BOM.");
    }

    const sourceProjectId = getId(formData, "source_project_id");
    const projectCode = getText(formData, "project_code");
    const name = getText(formData, "name");
    const productCategory = getText(formData, "product_category");
    const customerName = getText(formData, "customer_name");
    const contractValue = getNumber(formData, "contract_value", { min: 0 });
    const startDate = getOptionalDate(formData, "start_date");
    const endDate = getOptionalDate(formData, "end_date");
    const status = requireOneOf(getText(formData, "status") || "Pending", PROJECT_STATUSES, "Status proyek");
    const repeatNote = getText(formData, "repeat_note");

    if (!projectCode) throw new Error("ID Proyek baru wajib diisi.");
    if (!name) throw new Error("Nama Proyek baru wajib diisi.");
    if (startDate && endDate && endDate < startDate) {
      throw new Error("Tanggal selesai tidak boleh sebelum tanggal mulai.");
    }

    const productTargets: Record<string, number> = {};
    for (const [key, rawValue] of formData.entries()) {
      if (!key.startsWith("target_")) continue;
      const sourceProductId = key.slice("target_".length);
      if (!/^\d+$/.test(sourceProductId)) continue;
      const target = Number(String(rawValue ?? "").trim());
      if (!Number.isFinite(target) || target <= 0) {
        throw new Error("Semua target Produk/Tas Repeat Order harus lebih dari 0.");
      }
      productTargets[sourceProductId] = target;
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("smpt_create_repeat_order", {
      p_source_project_id: sourceProjectId,
      p_project_code: projectCode,
      p_name: name,
      p_product_category: productCategory || null,
      p_customer_name: customerName || null,
      p_contract_value: contractValue,
      p_start_date: startDate,
      p_end_date: endDate,
      p_status: status,
      p_repeat_note: repeatNote || null,
      p_product_targets: productTargets,
    });
    if (error) throw error;

    const result = (data ?? {}) as {
      products_copied?: number;
      work_items_copied?: number;
      bom_copied?: number;
      routing_copied?: number;
      transactions_copied?: number;
    };

    revalidatePath(PATH);
    revalidatePath("/dashboard/masterProdukProyek");
    revalidatePath("/dashboard/masterItem");
    revalidatePath("/dashboard/masterKebutuhan");
    revalidatePath("/dashboard/spk");
    redirectWithMessage(
      PATH,
      "success",
      `Repeat Order berhasil. Produk ${result.products_copied ?? 0}, Item ${result.work_items_copied ?? 0}, BOM ${result.bom_copied ?? 0}, Routing ${result.routing_copied ?? 0}, transaksi tercopy ${result.transactions_copied ?? 0}.`,
    );
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Repeat Order gagal dibuat."));
  }
}
