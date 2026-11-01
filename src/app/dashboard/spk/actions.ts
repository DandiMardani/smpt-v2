"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, getCurrentAccessContext } from "@/lib/access/current-user";
import { errorMessage, getOptionalDate, getText, redirectWithMessage } from "@/lib/master/action-utils";
import { createClient } from "@/lib/supabase/server";
import { createClient as createStandaloneClient } from "@supabase/supabase-js";

const PATH = "/dashboard/spk";

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
    revalidatePath('/dashboard/spk');
  revalidatePath('/dashboard/spk', 'page');
    redirectWithMessage(PATH, "error", errorMessage(e, "Gagal menyimpan rincian item SPK."));
  }

  revalidatePath('/dashboard/spk');
  revalidatePath('/dashboard/spk', 'page');
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

  revalidatePath('/dashboard/spk');
  revalidatePath('/dashboard/spk', 'page');
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

  revalidatePath('/dashboard/spk');
  revalidatePath('/dashboard/spk', 'page');
  revalidatePath("/dashboard/borongan");
  revalidatePath("/dashboard/setoran");
  redirectWithMessage(PATH, "success", "SPK berhasil DIBATALKAN.");
}

export async function editSpkAction(f: FormData) {
  // 1. Validasi Hak Akses:
  // Role ADMIN / SUPERADMIN / ADMINISTRATOR / OWNER selalu diizinkan bypass.
  // Pengguna non-admin wajib memiliki permission spk.write atau produksi.write.
  const access = await getCurrentAccessContext();
  const roleName = String(access.role || "").toUpperCase();
  const isAdmin = ["ADMIN", "ADMINISTRATOR", "SUPERADMIN", "OWNER"].includes(roleName);
  const hasSpkPermission =
    access.permissionCodes.includes("spk.write") ||
    access.permissionCodes.includes("produksi.write");

  if (!isAdmin && !hasSpkPermission) {
    throw new Error("Anda tidak memiliki izin untuk tindakan ini.");
  }

  const s = await createClient();
  const admin = getAdminClient();
  const db = admin || s;

  const orderId = Number(f.get("order_id"));
  if (!orderId) {
    throw new Error("ID SPK tidak valid.");
  }

  // Check order status & rincian item pekerjaan
  const { data: order, error: oErr } = await db
    .from("production_orders")
    .select("id, spk_code, status, project_id, product_id, checker_email, production_order_items(id, work_item_id, assigned_qty)")
    .eq("id", orderId)
    .single();

  if (oErr || !order) {
    throw new Error("Data SPK tidak ditemukan: " + (oErr?.message || "Not found"));
  }

  if (["SELESAI", "DIBATALKAN"].includes(order.status)) {
    throw new Error(`SPK dengan status ${order.status} tidak dapat diedit.`);
  }

  // 1. Process Reassign Checker
  const newCheckerEmail = (getText(f, "checker_email") || String(f.get("checker_email") || "")).trim();
  let checkerUpdated = false;
  if (newCheckerEmail && newCheckerEmail !== order.checker_email) {
    // Menggunakan db (service role) agar update checker tidak dicegat RLS tabel production_orders
    const { data: updatedRows, error: chkErr } = await db
      .from("production_orders")
      .update({ checker_email: newCheckerEmail })
      .eq("id", orderId)
      .select("id, checker_email");

    if (chkErr) {
      throw new Error("Gagal mengalihkan checker SPK: " + (chkErr.message || "Database error"));
    }

    if (!updatedRows || updatedRows.length === 0) {
      throw new Error(`Gagal memperbarui checker SPK #${orderId}. Tidak ada baris yang ter-update di database.`);
    }

    checkerUpdated = true;
  }

  // 2. Process Removed Items (Gunakan client authenticated 's' agar context user auth.uid() valid di RPC)
  const removedItemIds = f.getAll("remove_item_id").map(Number).filter((x) => x > 0);
  for (const rItemId of removedItemIds) {
    const { error: remErr } = await s.rpc("remove_production_order_item", {
      p_order_id: orderId,
      p_order_item_id: rItemId,
    });
    if (remErr) {
      throw new Error(errorMessage(remErr, `Gagal menghapus item #${rItemId}.`));
    }
  }

  // 3. Process Existing Items Qty Updates
  const existingOrderItems = (order.production_order_items ?? []) as Array<{ id: number; work_item_id: number; assigned_qty: number }>;
  const existingItemIds = f.getAll("existing_item_id").map(Number).filter((x) => x > 0);
  for (const itemId of existingItemIds) {
    if (removedItemIds.includes(itemId)) continue;

    const workItemId = Number(f.get(`item_work_id_${itemId}`));
    const newQty = Number(f.get(`item_qty_${itemId}`));

    if (!Number.isFinite(newQty) || newQty <= 0) {
      throw new Error("Jumlah Qty penugasan harus lebih besar dari 0.");
    }

    // Hindari pemanggilan RPC jika kuantiti tidak mengalami perubahan
    const currentItem = existingOrderItems.find((it) => it.id === itemId);
    if (currentItem && Number(currentItem.assigned_qty) === newQty) {
      continue;
    }

    if (workItemId > 0) {
      // Panggil RPC dengan client session authenticated 's'
      const { error: updErr } = await s.rpc("add_production_order_item", {
        p_order_id: orderId,
        p_work_item_id: workItemId,
        p_assigned_qty: newQty,
      });
      if (updErr) {
        throw new Error(errorMessage(updErr, "Gagal memperbarui kuantiti item SPK."));
      }
    }
  }

  // 4. Process Newly Added Item (if any)
  const newWorkItemId = Number(f.get("add_work_item_id"));
  const newWorkItemQty = Number(f.get("add_work_item_qty"));
  if (newWorkItemId > 0 && newWorkItemQty > 0) {
    const { error: addErr } = await s.rpc("add_production_order_item", {
      p_order_id: orderId,
      p_work_item_id: newWorkItemId,
      p_assigned_qty: newWorkItemQty,
    });
    if (addErr) {
      throw new Error(errorMessage(addErr, "Gagal menambahkan item baru ke SPK."));
    }
  }

  revalidatePath("/dashboard/borongan");
  revalidatePath("/dashboard/setoran");
  revalidatePath("/dashboard/produksi");
  revalidatePath("/dashboard/spk");

  return {
    success: true,
    message: checkerUpdated
      ? `SPK ${order.spk_code} berhasil diperbarui dan dialihkan ke Checker ${newCheckerEmail}.`
      : `SPK ${order.spk_code} berhasil diperbarui. Checker terkait telah menerima tanda perubahan.`,
  };
}
