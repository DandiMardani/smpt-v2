"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  errorMessage,
  getBoolean,
  getId,
  getInteger,
  getOptionalId,
  getText,
  requireOneOf,
} from "@/lib/master/action-utils";

const PATH = "/dashboard/masterItem";
const ROUTING_PATH = "/dashboard/masterItem/routing";
const STATUSES = ["AKTIF", "NONAKTIF"] as const;
const FLOW_MODES = ["MANDIRI", "BERANTAI", "KHUSUS"] as const;
const VALIDATION_MODES = ["WARNING", "HARD"] as const;

async function requireAdminItemWrite() {
  const access = await requirePermission("master_item.write");
  return access;
}

function contextPath(formData: FormData) {
  const project = getText(formData, "return_project");
  const product = getText(formData, "return_product");
  const q = getText(formData, "return_q");
  const params = new URLSearchParams();
  if (project) params.set("project", project);
  if (product) params.set("product", product);
  if (q) params.set("q", q);
  const query = params.toString();
  return `${PATH}${query ? `?${query}` : ""}`;
}

function go(path: string, type: "success" | "error", message: string): never {
  const url = new URL(path, "http://smpt.local");
  url.searchParams.set(type, message);
  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

export async function saveWorkItem(formData: FormData) {
  await requireAdminItemWrite();
  const back = contextPath(formData);

  try {
    const itemId = getOptionalId(formData, "id") ?? getOptionalId(formData, "work_item_id");
    const projectId = getOptionalId(formData, "project_id") ?? getId(formData, "return_project");
    const productId = getOptionalId(formData, "product_id") ?? getId(formData, "return_product");
    const name = getText(formData, "name");
    const unit = getText(formData, "unit");
    const qtyPerProduct = getInteger(formData, "qty_per_product", { min: 1 });
    const operatorPrice = getInteger(formData, "operator_price", { min: 0 });
    const proposedPrice = getInteger(formData, "proposed_price", { min: 0 });
    const status = requireOneOf(getText(formData, "status") || "AKTIF", STATUSES, "Status item");
    const outputFinal = getBoolean(formData, "output_final");

    if (!name) throw new Error("Nama pekerjaan wajib diisi.");
    if (!unit) throw new Error("Satuan wajib dipilih.");

    const supabase = await createClient();
    const { error } = await supabase.rpc("save_work_item", {
      p_item_id: itemId,
      p_project_id: projectId,
      p_product_id: productId,
      p_name: name,
      p_unit: unit,
      p_qty_per_product: qtyPerProduct,
      p_operator_price: operatorPrice,
      p_proposed_price: proposedPrice,
      p_status: status,
      p_output_final: outputFinal,
    });

    if (error) throw error;
  } catch (error) {
    go(back, "error", errorMessage(error, "Gagal menyimpan item pekerjaan."));
  }

  revalidatePath(PATH);
  revalidatePath(ROUTING_PATH);
  go(back, "success", "Master Item Pekerjaan berhasil disimpan.");
}

export async function saveWorkItemFlowInline(formData: FormData) {
  await requireAdminItemWrite();
  const back = contextPath(formData);

  try {
    const flowMode = requireOneOf(
      (getText(formData, "flow_mode") || "MANDIRI").toUpperCase(),
      FLOW_MODES,
      "Tipe alur",
    );
    const validationMode = requireOneOf(
      (getText(formData, "validation_mode") || "WARNING").toUpperCase(),
      VALIDATION_MODES,
      "Mode validasi",
    );
    const rawOrder = getText(formData, "flow_order");
    const flowOrder = flowMode === "BERANTAI"
      ? getInteger(formData, "flow_order", { min: 1 })
      : null;

    if (flowMode === "BERANTAI" && !rawOrder) {
      throw new Error("Item BERANTAI wajib mempunyai Nomor Alur.");
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("set_work_item_flow", {
      p_work_item_id: getId(formData, "work_item_id"),
      p_flow_mode: flowMode,
      p_flow_order: flowOrder,
      p_validation_mode: validationMode,
    });
    if (error) throw error;
  } catch (error) {
    go(back, "error", errorMessage(error, "Alur Item Pekerjaan gagal disimpan."));
  }

  revalidatePath(PATH);
  revalidatePath(ROUTING_PATH);
  go(back, "success", "Alur item berhasil disimpan dan dependency otomatis sudah disinkronkan.");
}



export async function saveWorkItemPayrollProfile(formData: FormData) {
  await requireAdminItemWrite();
  const back = contextPath(formData);

  try {
    const executorScope = requireOneOf(
      (getText(formData, "executor_scope") || "OPERATOR_BORONGAN").toUpperCase(),
      ["OPERATOR_BORONGAN", "PEKERJA_HARIAN", "KEDUANYA"] as const,
      "Pelaksana",
    );
    const submissionCategory = requireOneOf(
      (getText(formData, "submission_category") || "BORONGAN").toUpperCase(),
      ["BORONGAN", "TIDAK_ADA"] as const,
      "Kategori pengajuan",
    );

    const supabase = await createClient();
    const { error } = await supabase.rpc("set_work_item_payroll_profile", {
      p_work_item_id: getId(formData, "work_item_id"),
      p_executor_scope: executorScope,
      p_submission_category: submissionCategory,
    });
    if (error) throw error;
  } catch (error) {
    go(back, "error", errorMessage(error, "Profil pelaksana/pengajuan Item Pekerjaan gagal disimpan."));
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/hasilProduksi");
  revalidatePath("/dashboard/spk");
  go(back, "success", "Profil pelaksana dan kategori pengajuan berhasil disimpan.");
}

export async function setWorkItemStatus(formData: FormData) {
  await requireAdminItemWrite();
  const back = contextPath(formData);

  try {
    const id = getOptionalId(formData, "id") ?? getId(formData, "work_item_id");
    const status = requireOneOf(getText(formData, "status"), STATUSES, "Status item");
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_work_item_status", {
      p_item_id: id,
      p_status: status,
    });
    if (error) throw error;
  } catch (error) {
    go(back, "error", errorMessage(error, "Gagal mengubah status item pekerjaan."));
  }

  revalidatePath(PATH);
  revalidatePath(ROUTING_PATH);
  go(back, "success", "Status Item Pekerjaan berhasil diperbarui.");
}

export async function deleteWorkItem(formData: FormData) {
  await requireAdminItemWrite();
  const back = contextPath(formData);

  try {
    const id = getOptionalId(formData, "id") ?? getId(formData, "work_item_id");
    const supabase = await createClient();

    // Cek apakah item pekerjaan sudah pernah digunakan dalam SPK produksi
    const { data: spkItems } = await supabase
      .from("production_order_items")
      .select("id")
      .eq("work_item_id", id)
      .limit(1);

    if (spkItems && spkItems.length > 0) {
      const { error } = await supabase.rpc("set_work_item_status", {
        p_item_id: id,
        p_status: "NONAKTIF",
      });
      if (error) throw error;
      revalidatePath(PATH);
      revalidatePath(ROUTING_PATH);
      go(back, "success", "Item dinonaktifkan (status: NONAKTIF) karena sudah digunakan dalam SPK Produksi.");
    } else {
      const { error } = await supabase.from("work_items").delete().eq("id", id);
      if (error) throw error;
      revalidatePath(PATH);
      revalidatePath(ROUTING_PATH);
      go(back, "success", "Item Pekerjaan berhasil dihapus.");
    }
  } catch (error) {
    go(back, "error", errorMessage(error, "Gagal menghapus Item Pekerjaan."));
  }
}
