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
} from "@/lib/master/action-utils";

const PATH = "/dashboard/produksiReguler";

export async function recordDirectSewingResultAction(formData: FormData) {
  await requirePermission("hasil_produksi.write");

  try {
    const resultDate = getOptionalDate(formData, "result_date") || new Date().toISOString().split("T")[0];
    const projectId = getId(formData, "project_id");
    const productId = getId(formData, "product_id");
    const workerId = getId(formData, "worker_id");
    const workItemId = getId(formData, "work_item_id");
    const goodQty = getNumber(formData, "good_qty", { min: 1 });
    const rejectQty = Number(formData.get("reject_qty") ?? 0) || 0;
    const notes = getText(formData, "notes") || "";

    const supabase = await createClient();

    // 1. Ambil detail Pekerja, Produk, dan Item Pekerjaan
    const [workerRes, productRes, itemRes] = await Promise.all([
      supabase.from("workers").select("id, name, worker_code, pay_system").eq("id", workerId).single(),
      supabase.from("project_products").select("id, name, product_code, unit").eq("id", productId).single(),
      supabase.from("work_items").select("id, name, operator_price, proposed_price, unit").eq("id", workItemId).single(),
    ]);

    if (workerRes.error || !workerRes.data) throw new Error("Pekerja tidak ditemukan.");
    if (productRes.error || !productRes.data) throw new Error("Produk tidak ditemukan.");
    if (itemRes.error || !itemRes.data) throw new Error("Item Pekerjaan jahit tidak ditemukan.");

    const worker = workerRes.data;
    const product = productRes.data;
    const item = itemRes.data;

    // 2. Buat SPK Ringkas (Auto-Generated) khusus setoran reguler
    const { data: orderData, error: orderErr } = await supabase.from("production_orders").insert({
      order_date: resultDate,
      project_id: projectId,
      product_id: productId,
      operator_worker_id: workerId,
      status: "SELESAI",
      notes: `Setoran Reguler: ${product.name} oleh ${worker.name}`,
    }).select("id").single();

    if (orderErr || !orderData) {
      throw new Error(`Gagal membuat order produksi: ${orderErr?.message || "Unknown error"}`);
    }

    const orderId = orderData.id;

    // 3. Tambah Item SPK dengan is_final_output_snapshot = true agar otomatis masuk antrean QC
    const operatorPrice = Number(item.operator_price || 0);
    const submissionPrice = Number(item.proposed_price || operatorPrice);

    const { data: itemData, error: itemErr } = await supabase.from("production_order_items").insert({
      order_id: orderId,
      work_item_id: workItemId,
      work_item_name_snapshot: item.name,
      assigned_qty: goodQty + rejectQty,
      operator_price_snapshot: operatorPrice,
      submission_price_snapshot: submissionPrice,
      is_final_output_snapshot: true,
      status: "SELESAI",
    }).select("id").single();

    if (itemErr || !itemData) {
      throw new Error(`Gagal menyimpan rincian pekerjaan: ${itemErr?.message || "Unknown error"}`);
    }

    // 4. Catat Qty ke production_checks (masuk antrean Menunggu QC & antrean Payroll)
    const { error: checkErr } = await supabase.from("production_checks").insert({
      order_item_id: itemData.id,
      check_date: resultDate,
      good_qty: goodQty,
      reject_qty: rejectQty,
      status: "AKTIF",
      notes: notes || `Setoran Jahit Reguler (${goodQty} pcs)`,
    });

    if (checkErr) {
      throw new Error(`Gagal mencatat setoran: ${checkErr.message}`);
    }

    // 5. Pastikan Master Barang Jadi siap untuk produk ini saat QC meloloskan fisik barang
    const { data: existingFg } = await supabase
      .from("finished_goods")
      .select("id")
      .eq("product_id", productId)
      .eq("status", "AKTIF")
      .maybeSingle();

    if (!existingFg) {
      await supabase.from("finished_goods").insert({
        project_id: projectId,
        product_id: productId,
        name: product.name,
        category: "Tas Jadi",
        unit: product.unit || "PCS",
        source: "INTERNAL",
        final_work_item_id: workItemId,
        status: "AKTIF",
        notes: "Auto-created dari Setoran Produksi Reguler",
      });
    }

    // CATATAN ALUR BARU:
    // Pemanggilan smpt_apply_logistics_stock di sini SUDAH DIHAPUS.
    // Stok Barang Jadi Gudang PUSAT kini hanya bertambah saat petugas menekan tombol
    // 'Simpan QC' pada menu Quality Control (recordQcAction).
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Gagal mencatat setoran jahit reguler."));
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/qc");
  revalidatePath("/dashboard/stokBarangJadi");
  revalidatePath("/dashboard/payroll");
  revalidatePath("/dashboard/setoran");
  redirectWithMessage(
    PATH,
    "success",
    "Setoran jahit berhasil disimpan dan diteruskan ke antrean QC! Stok fisik akan bertambah setelah diverifikasi tim QC."
  );
}
