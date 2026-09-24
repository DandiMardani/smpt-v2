"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access/current-user";
import { errorMessage, getId, getNumber, getText } from "@/lib/master/action-utils";
import { callRpc } from "@/lib/operations/ops-utils";

const PATH = "/dashboard/masterItem/routing";

function routeUrl(formData: FormData) {
  const project = getText(formData, "return_project");
  const product = getText(formData, "return_product");
  const qs = new URLSearchParams();
  if (project) qs.set("project", project);
  if (product) qs.set("product", product);
  const query = qs.toString();
  return `${PATH}${query ? `?${query}` : ""}`;
}

function go(path: string, type: "success" | "error", message: string): never {
  const url = new URL(path, "http://smpt.local");
  url.searchParams.set(type, message);
  redirect(`${url.pathname}?${url.searchParams.toString()}`);
}

export async function saveWorkItemFlow(formData: FormData) {
  await requirePermission("master_item.write");
  const back = routeUrl(formData);
  try {
    const flowMode = (getText(formData, "flow_mode") || "MANDIRI").toUpperCase();
    const rawOrder = getText(formData, "flow_order");
    const flowOrder = flowMode === "BERANTAI"
      ? getNumber(formData, "flow_order", { min: 1 })
      : null;

    if (flowMode === "BERANTAI" && !rawOrder) {
      throw new Error("Item BERANTAI wajib mempunyai Nomor Alur.");
    }

    await callRpc("set_work_item_flow", {
      p_work_item_id: getId(formData, "work_item_id"),
      p_flow_mode: flowMode,
      p_flow_order: flowOrder,
      p_validation_mode: getText(formData, "validation_mode") || "WARNING",
    });
  } catch (error) {
    go(back, "error", errorMessage(error, "Alur Item Pekerjaan gagal disimpan."));
  }
  revalidatePath(PATH);
  revalidatePath("/dashboard/masterItem");
  go(back, "success", "Alur item tersimpan dan dependency otomatis sudah disinkronkan.");
}

export async function saveDependency(formData: FormData) {
  await requirePermission("master_item.write");
  const back = routeUrl(formData);
  try {
    const predecessor = getId(formData, "predecessor_work_item_id");
    const successor = getId(formData, "successor_work_item_id");
    if (predecessor === successor) throw new Error("Predecessor dan successor tidak boleh sama.");

    await callRpc("upsert_special_work_item_dependency", {
      p_product_id: getId(formData, "product_id"),
      p_predecessor_work_item_id: predecessor,
      p_successor_work_item_id: successor,
      p_dependency_type: getText(formData, "dependency_type") || "SEQUENTIAL",
      p_validation_mode: getText(formData, "validation_mode") || "WARNING",
      p_notes: getText(formData, "notes") || null,
    });
  } catch (error) {
    go(back, "error", errorMessage(error, "Routing Khusus gagal disimpan."));
  }
  revalidatePath(PATH);
  go(back, "success", "Routing Khusus tersimpan.");
}

export async function deactivateDependency(formData: FormData) {
  await requirePermission("master_item.write");
  const back = routeUrl(formData);
  try {
    await callRpc("deactivate_work_item_dependency", {
      p_dependency_id: getId(formData, "dependency_id"),
    });
  } catch (error) {
    go(back, "error", errorMessage(error, "Routing Khusus gagal dinonaktifkan."));
  }
  revalidatePath(PATH);
  go(back, "success", "Routing Khusus dinonaktifkan tanpa menghapus histori.");
}
