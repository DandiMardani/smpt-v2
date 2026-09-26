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
    const [workerRes, productRes, itemRes, locRes] = await Promise.all([
      supabase.from("workers").select("id, name, worker_code, pay_system").eq("id", workerId).single(),
      supabase.from("project_products").select("id, name, product_code, unit").eq("id", productId).single(),
      supabase.from("work_items").select("id, name, operator_price, proposed_price, unit").eq("id", workItemId).single(),
      supabase.from("locations").select("id").eq("name", "PUSAT").maybeSingle(),
    ]);

    if (workerRes.error || !workerRes.data) throw new Error("Pekerja tidak ditemukan.");
    if (productRes.error || !productRes.data) throw new Error("Produk tidak ditemukan.");
    if (itemRes.error || !itemRes.data) throw new Error("Item Pekerjaan jahit tidak ditemukan.");

    const worker = workerRes.data;
    const product = productRes.data;
    const item = itemRes.data;
    const pusatLocationId = locRes.data?.id ?? 1;

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

    // 3. Tambah Item SPK dengan harga operator snapshot
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

    // 4. Catat Qty Sah di production_checks (agar otomatis masuk ke kalkulasi Payroll Operator)
    const { error: checkErr } = await supabase.from("production_checks").insert({
      order_item_id: itemData.id,
      check_date: resultDate,
      good_qty: goodQty,
      reject_qty: rejectQty,
      status: "AKTIF",
      notes: notes || `Setoran Jahit Reguler (${goodQty} pcs)`,
    });

    if (checkErr) {
      throw new Error(`Gagal mencatat setoran upah: ${checkErr.message}`);
    }

    // 5. Pastikan Master Barang Jadi terdaftar untuk produk ini
    let fgId: number;
    let fgUnit = product.unit || "PCS";

    const { data: existingFg } = await supabase
      .from("finished_goods")
      .select("id, unit")
      .eq("product_id", productId)
      .eq("status", "AKTIF")
      .maybeSingle();

    if (existingFg) {
      fgId = existingFg.id;
      fgUnit = existingFg.unit || fgUnit;
    } else {
      const { data: newFg, error: newFgErr } = await supabase.from("finished_goods").insert({
        project_id: projectId,
        product_id: productId,
        name: product.name,
        category: "Tas Jadi",
        unit: fgUnit,
        source: "INTERNAL",
        final_work_item_id: workItemId,
        status: "AKTIF",
        notes: "Auto-created dari Setoran Produksi Reguler",
      }).select("id, unit").single();

      if (newFgErr || !newFg) {
        throw new Error(`Gagal mendaftarkan Barang Jadi: ${newFgErr?.message}`);
      }
      fgId = newFg.id;
    }

    // 6. Masukkan Barang Jadi Lolos ke Gudang PUSAT via Immutable Logistics Ledger
    const { data: eventId, error: eventErr } = await supabase.rpc("smpt_new_logistics_event", {
      p_event_type: "REGULAR_PRODUCTION",
      p_reference_type: "PRODUCTION",
      p_reference_id: orderId,
      p_reference_code: `REG-${orderId}`,
      p_event_date: resultDate,
      p_notes: `Setoran Reguler: ${worker.name} (${goodQty} ${fgUnit})`,
      p_reversal_of: null,
    });

    if (eventErr || !eventId) {
      throw new Error(`Gagal mencatat event logistik: ${eventErr?.message}`);
    }

    const { error: stockErr } = await supabase.rpc("smpt_apply_logistics_stock", {
      p_event_id: eventId,
      p_item_kind: "FINISHED_GOOD",
      p_finished_good_id: fgId,
      p_set_id: null,
      p_location_id: pusatLocationId,
      p_delta: goodQty,
      p_unit: fgUnit,
      p_kind: "HASIL JAHIT REGULER",
      p_notes: notes || `Setoran langsung ${goodQty} pcs`,
    });

    if (stockErr) {
      throw new Error(`Gagal menambah stok Barang Jadi PUSAT: ${stockErr.message}`);
    }
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Gagal mencatat setoran jahit reguler."));
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/stokBarangJadi");
  revalidatePath("/dashboard/payroll");
  revalidatePath("/dashboard/setoran");
  redirectWithMessage(PATH, "success", "Setoran jahit berhasil disimpan! Upah tukang langsung tercatat & stok Barang Jadi PUSAT bertambah.");
}
