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

const PATH = "/dashboard/pengirimanKlien";

export async function createClientShipmentAction(formData: FormData) {
  await requirePermission("stok_barang_jadi.view");

  try {
    const shipmentDate = getOptionalDate(formData, "shipment_date") || new Date().toISOString().split("T")[0];
    const finishedGoodId = getId(formData, "finished_good_id");
    const quantity = getNumber(formData, "quantity", { min: 1 });
    const customerName = getText(formData, "customer_name");
    const destinationAddress = getText(formData, "destination_address") || "";
    const documentNo = getText(formData, "document_no") || `SJ-${Date.now().toString().slice(-6)}`;
    const driverName = getText(formData, "driver_name") || "Supir / Ekspedisi";
    const vehicleNo = getText(formData, "vehicle_no") || "-";
    const notes = getText(formData, "notes") || "";

    if (!customerName) throw new Error("Nama Klien / Pembeli wajib diisi.");

    const supabase = await createClient();

    // 1. Ambil ID Lokasi PUSAT
    const { data: pusatLoc } = await supabase
      .from("locations")
      .select("id")
      .eq("name", "PUSAT")
      .single();

    const pusatLocationId = pusatLoc?.id ?? 1;

    // 2. Periksa ketersediaan stok di Gudang PUSAT
    const { data: stockBalance } = await supabase
      .from("logistics_stock_balances")
      .select("quantity")
      .eq("item_kind", "FINISHED_GOOD")
      .eq("finished_good_id", finishedGoodId)
      .eq("location_id", pusatLocationId)
      .maybeSingle();

    const availableStock = Number(stockBalance?.quantity || 0);
    if (availableStock < quantity) {
      throw new Error(`Stok di Gudang PUSAT tidak mencukupi. Tersedia: ${availableStock} pcs, diminta kirim: ${quantity} pcs.`);
    }

    // 3. Pastikan alamat tujuan / klien terdaftar sebagai lokasi tujuan
    let clientLocId: number;
    const { data: existingLoc } = await supabase
      .from("locations")
      .select("id")
      .eq("name", customerName)
      .maybeSingle();

    if (existingLoc) {
      clientLocId = existingLoc.id;
    } else {
      const { data: newLoc, error: locErr } = await supabase
        .from("locations")
        .insert({
          name: customerName,
          location_type: "KLIEN",
          address: destinationAddress || null,
          pic_name: driverName || null,
          status: "AKTIF",
          notes: `Tujuan Pengiriman Klien: ${customerName}`,
        })
        .select("id")
        .single();

      if (locErr || !newLoc) {
        throw new Error(`Gagal mencatat alamat tujuan klien: ${locErr?.message}`);
      }
      clientLocId = newLoc.id;
    }

    // 4. Lakukan transfer stok dari PUSAT ke KLIEN via RPC transfer_finished_good
    const transferNote = `Surat Jalan [${documentNo}] ke ${customerName} | Supir: ${driverName} (${vehicleNo}) ${notes ? `| Ket: ${notes}` : ""}`;
    const { error: transferErr } = await supabase.rpc("transfer_finished_good", {
      p_date: shipmentDate,
      p_finished_good_id: finishedGoodId,
      p_source_location_id: pusatLocationId,
      p_destination_location_id: clientLocId,
      p_quantity: quantity,
      p_notes: transferNote,
    });

    if (transferErr) {
      throw new Error(`Gagal memproses pengiriman: ${transferErr.message}`);
    }
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Pengiriman gagal diproses."));
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard/stokBarangJadi");
  redirectWithMessage(PATH, "success", "Surat Jalan berhasil diterbitkan! Stok di Gudang PUSAT telah terpotong.");
}
