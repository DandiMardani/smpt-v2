"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/access/current-user";
import { errorMessage, getOptionalDate, getText, redirectWithMessage } from "@/lib/master/action-utils";
import { createClient } from "@/lib/supabase/server";

const PATH = "/dashboard/spk";

export async function createSpkUnifiedAction(f: FormData) {
  await requirePermission("spk.write");
  const s = await createClient();

  const orderDate = getText(f, "order_date");
  const projectId = Number(f.get("project_id"));
  const productId = Number(f.get("product_id"));
  const operatorWorkerId = Number(f.get("operator_worker_id"));
  const checkerEmail = getText(f, "checker_email");
  const supervisorWorkerId = Number(f.get("supervisor_worker_id")) || null;
  const dueDate = getOptionalDate(f, "due_date");
  const notes = getText(f, "notes") || null;
  const publishNow = getText(f, "publish_now") === "1";

  if (!orderDate) redirectWithMessage(PATH, "error", "Tanggal SPK wajib diisi.");
  if (!projectId) redirectWithMessage(PATH, "error", "Proyek wajib dipilih.");
  if (!productId) redirectWithMessage(PATH, "error", "Produk wajib dipilih.");
  if (!operatorWorkerId) redirectWithMessage(PATH, "error", "Operator Borongan wajib dipilih.");
  if (!checkerEmail) redirectWithMessage(PATH, "error", "Checker wajib dipilih.");

  const selectedItemIds = f.getAll("selected_items").map(Number).filter((x) => Number.isSafeInteger(x) && x > 0);
  if (selectedItemIds.length === 0) {
    redirectWithMessage(PATH, "error", "Pilih minimal 1 item pekerjaan untuk ditugaskan pada SPK.");
  }

  let orderId: number;

  // 1. Buat header order SPK
  try {
    const { data: createdOrderId, error: orderError } = await s.rpc("create_production_order", {
      p_order_date: orderDate,
      p_project_id: projectId,
      p_product_id: productId,
      p_operator_worker_id: operatorWorkerId,
      p_checker_email: checkerEmail,
      p_supervisor_worker_id: supervisorWorkerId,
      p_due_date: dueDate,
      p_notes: notes,
    });
    if (orderError) throw orderError;
    orderId = Number(createdOrderId);
  } catch (e) {
    redirectWithMessage(PATH, "error", errorMessage(e, "Gagal membuat SPK."));
  }

  // 2. Tambahkan item pekerjaan yang dipilih ke SPK
  try {
    for (const itemId of selectedItemIds) {
      const rawQty = f.get(`qty_${itemId}`);
      const assignedQty = Number(rawQty);
      if (!Number.isFinite(assignedQty) || assignedQty <= 0) {
        throw new Error(`Qty penugasan untuk item #${itemId} harus lebih besar dari 0.`);
      }

      const { error: itemError } = await s.rpc("add_production_order_item", {
        p_order_id: orderId,
        p_work_item_id: itemId,
        p_assigned_qty: assignedQty,
      });
      if (itemError) throw itemError;
    }

    // 3. Jika user klik "Simpan & Terbitkan", langsung terbitkan SPK
    if (publishNow) {
      const { error: pubError } = await s.rpc("publish_production_order", {
        p_order_id: orderId,
      });
      if (pubError) throw pubError;
    }
  } catch (e) {
    revalidatePath(PATH);
    redirectWithMessage(PATH, "error", errorMessage(e, "Gagal menyimpan rincian item SPK."));
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/borongan");
  revalidatePath("/dashboard/setoran");
  revalidatePath("/dashboard/produksi");

  const successMsg = publishNow
    ? "Surat Perintah Kerja (SPK) berhasil dibuat dan langsung DITERBITKAN (Status: AKTIF)!"
    : "Draft SPK berhasil disimpan. Anda dapat menerbitkannya kapan saja.";
  redirectWithMessage(PATH, "success", successMsg);
}

export async function publishSpkAction(f: FormData) {
  await requirePermission("spk.write");
  const s = await createClient();
  const orderId = Number(f.get("order_id"));
  if (!orderId) redirectWithMessage(PATH, "error", "ID SPK tidak valid.");

  try {
    const { error } = await s.rpc("publish_production_order", { p_order_id: orderId });
    if (error) throw error;
  } catch (e) {
    redirectWithMessage(PATH, "error", errorMessage(e, "Gagal menerbitkan SPK."));
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/borongan");
  revalidatePath("/dashboard/setoran");
  redirectWithMessage(PATH, "success", "SPK berhasil DITERBITKAN dan siap dikerjakan operator.");
}

export async function cancelSpkAction(f: FormData) {
  await requirePermission("spk.write");
  const s = await createClient();
  const orderId = Number(f.get("order_id"));
  if (!orderId) redirectWithMessage(PATH, "error", "ID SPK tidak valid.");

  try {
    const { error } = await s.rpc("cancel_production_order", { p_order_id: orderId });
    if (error) throw error;
  } catch (e) {
    redirectWithMessage(PATH, "error", errorMessage(e, "Gagal membatalkan SPK."));
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/borongan");
  revalidatePath("/dashboard/setoran");
  redirectWithMessage(PATH, "success", "SPK berhasil DIBATALKAN.");
}

export async function editSpkAction(f: FormData) {
  await requirePermission("spk.write");
  const s = await createClient();

  const orderId = Number(f.get("order_id"));
  if (!orderId) redirectWithMessage(PATH, "error", "ID SPK tidak valid.");

  // Check order status
  const { data: order, error: oErr } = await s
    .from("production_orders")
    .select("id, spk_code, status, project_id, product_id")
    .eq("id", orderId)
    .single();

  if (oErr || !order) {
    redirectWithMessage(PATH, "error", "Data SPK tidak ditemukan.");
  }

  if (["SELESAI", "DIBATALKAN"].includes(order.status)) {
    redirectWithMessage(PATH, "error", `SPK dengan status ${order.status} tidak dapat diedit.`);
  }

  // 1. Process Removed Items
  const removedItemIds = f.getAll("remove_item_id").map(Number).filter((x) => x > 0);
  for (const rItemId of removedItemIds) {
    const { error: remErr } = await s.rpc("remove_production_order_item", {
      p_order_id: orderId,
      p_order_item_id: rItemId,
    });
    if (remErr) {
      redirectWithMessage(PATH, "error", errorMessage(remErr, `Gagal menghapus item #${rItemId}.`));
    }
  }

  // 2. Process Existing Items Qty Updates
  const existingItemIds = f.getAll("existing_item_id").map(Number).filter((x) => x > 0);
  for (const itemId of existingItemIds) {
    if (removedItemIds.includes(itemId)) continue;

    const workItemId = Number(f.get(`item_work_id_${itemId}`));
    const newQty = Number(f.get(`item_qty_${itemId}`));

    if (!Number.isFinite(newQty) || newQty <= 0) {
      redirectWithMessage(PATH, "error", "Jumlah Qty penugasan harus lebih besar dari 0.");
    }

    if (workItemId > 0) {
      const { error: updErr } = await s.rpc("add_production_order_item", {
        p_order_id: orderId,
        p_work_item_id: workItemId,
        p_assigned_qty: newQty,
      });
      if (updErr) {
        redirectWithMessage(PATH, "error", errorMessage(updErr, "Gagal memperbarui kuantiti item SPK."));
      }
    }
  }

  // 3. Process Newly Added Item (if any)
  const newWorkItemId = Number(f.get("add_work_item_id"));
  const newWorkItemQty = Number(f.get("add_work_item_qty"));
  if (newWorkItemId > 0 && newWorkItemQty > 0) {
    const { error: addErr } = await s.rpc("add_production_order_item", {
      p_order_id: orderId,
      p_work_item_id: newWorkItemId,
      p_assigned_qty: newWorkItemQty,
    });
    if (addErr) {
      redirectWithMessage(PATH, "error", errorMessage(addErr, "Gagal menambahkan item baru ke SPK."));
    }
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/borongan");
  revalidatePath("/dashboard/setoran");
  revalidatePath("/dashboard/produksi");

  redirectWithMessage(
    PATH,
    "success",
    `SPK ${order.spk_code} berhasil diperbarui. Checker terkait telah menerima tanda perubahan.`
  );
}
