"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";

function t(f: FormData, k: string) {
  return String(f.get(k) ?? "").trim();
}

function num(f: FormData, k: string, nullable = false) {
  let raw = t(f, k).replace(/^rp\.?\s*/i, "").replace(/\s+/g, "");
  if (!raw && nullable) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+(,\d+)$/.test(raw) && !raw.includes(".")) {
    raw = raw.replace(",", ".");
  } else if (raw.includes(".") && (raw.match(/\./g) || []).length > 1) {
    raw = raw.replace(/\./g, "");
  }
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new Error(`${k} tidak valid.`);
  return v;
}

function id(f: FormData, k: string, nullable = false) {
  const v = num(f, k, nullable);
  if (v === null) return null;
  if (!Number.isSafeInteger(v) || v <= 0) throw new Error(`${k} tidak valid.`);
  return v;
}

function date(f: FormData, k: string, nullable = false) {
  const v = t(f, k);
  if (!v && nullable) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${k} tidak valid.`);
  return v;
}

function msg(e: unknown): string {
  if (!e) return "Terjadi kesalahan.";
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.error_description === "string" && o.error_description) return o.error_description;
    if (typeof o.details === "string" && o.details) return o.details;
    if (typeof o.hint === "string" && o.hint) return o.hint;
  }
  return typeof e === "string" ? e : "Terjadi kesalahan.";
}

function go(path: string, type: "success" | "error", message: string) {
  redirect(`${path}?${type}=${encodeURIComponent(message)}`);
}

async function rpc(name: string, args: Record<string, unknown>) {
  const s = await createClient();
  const { data, error } = await s.rpc(name, args);
  if (error) throw error;
  return data;
}

async function mutate(path: string, permission: string, fn: () => Promise<void>, success: string) {
  await requirePermission(permission);
  try {
    await fn();
  } catch (e) {
    go(path, "error", msg(e));
  }
  revalidatePath(path);
  go(path, "success", success);
}

export async function linkWorkerAction(f: FormData) {
  const path = "/dashboard/aksesUser";
  await mutate(
    path,
    "access_control.write",
    async () => {
      await rpc("link_worker_account", {
        p_email: t(f, "email"),
        p_worker_id: id(f, "worker_id"),
      });
    },
    "Akun berhasil dihubungkan ke pekerja."
  );
}

export async function createSpkAction(f: FormData) {
  const path = "/dashboard/spk";
  await requirePermission("spk.write");
  let data: unknown;
  try {
    data = await rpc("create_production_order", {
      p_order_date: date(f, "order_date"),
      p_project_id: id(f, "project_id"),
      p_product_id: id(f, "product_id"),
      p_operator_worker_id: id(f, "operator_worker_id"),
      p_checker_email: t(f, "checker_email"),
      p_supervisor_worker_id: id(f, "supervisor_worker_id", true),
      p_due_date: date(f, "due_date", true),
      p_notes: t(f, "notes") || null,
    });
  } catch (e) {
    go(path, "error", msg(e));
  }
  revalidatePath(path);
  redirect(`${path}?order=${encodeURIComponent(String(data))}&success=${encodeURIComponent("Draft SPK dibuat.")}`);
}

export async function addSpkItemAction(f: FormData) {
  const order = id(f, "order_id");
  const path = `/dashboard/spk?order=${order}`;
  await requirePermission("spk.write");
  try {
    await rpc("add_production_order_item", {
      p_order_id: order,
      p_work_item_id: id(f, "work_item_id"),
      p_assigned_qty: num(f, "assigned_qty"),
    });
  } catch (e) {
    redirect(`${path}&error=${encodeURIComponent(msg(e))}`);
  }
  revalidatePath("/dashboard/spk");
  redirect(`${path}&success=${encodeURIComponent("Item SPK disimpan.")}`);
}

export async function removeSpkItemAction(f: FormData) {
  const order = id(f, "order_id");
  const path = `/dashboard/spk?order=${order}`;
  await requirePermission("spk.write");
  try {
    await rpc("remove_production_order_item", {
      p_order_id: order,
      p_order_item_id: id(f, "order_item_id"),
    });
  } catch (e) {
    redirect(`${path}&error=${encodeURIComponent(msg(e))}`);
  }
  revalidatePath("/dashboard/spk");
  redirect(`${path}&success=${encodeURIComponent("Item dihapus.")}`);
}

export async function publishSpkAction(f: FormData) {
  await mutate(
    "/dashboard/spk",
    "spk.write",
    async () => {
      await rpc("publish_production_order", { p_order_id: id(f, "order_id") });
    },
    "SPK diterbitkan dan snapshot harga/qty terkunci."
  );
}

export async function cancelSpkAction(f: FormData) {
  await mutate(
    "/dashboard/spk",
    "spk.write",
    async () => {
      await rpc("cancel_production_order", { p_order_id: id(f, "order_id") });
    },
    "SPK dibatalkan."
  );
}

export async function checkerResultAction(f: FormData) {
  await mutate(
    "/dashboard/borongan",
    "borongan.operate",
    async () => {
      await rpc("record_checker_result", {
        p_order_item_id: id(f, "order_item_id"),
        p_check_date: date(f, "check_date"),
        p_good_qty: num(f, "good_qty"),
        p_reject_qty: num(f, "reject_qty"),
        p_notes: t(f, "notes") || null,
      });
    },
    "Qty Sah Checker tersimpan."
  );
}

export async function cancelCheckerResultAction(f: FormData) {
  await mutate(
    "/dashboard/borongan",
    "borongan.operate",
    async () => {
      await rpc("cancel_checker_result", { p_check_id: id(f, "check_id") });
    },
    "Input Checker dibatalkan."
  );
}

export async function recordQcAction(f: FormData) {
  await mutate(
    "/dashboard/qc",
    "qc.operate",
    async () => {
      await rpc("record_quality_control", {
        p_production_check_id: id(f, "production_check_id"),
        p_inspection_date: date(f, "inspection_date"),
        p_good_qty: num(f, "good_qty"),
        p_reject_qty: num(f, "reject_qty"),
        p_rework_qty: num(f, "rework_qty"),
        p_notes: t(f, "notes") || null,
      });
    },
    "QC tersimpan. Qty baik masuk stok Barang Jadi PUSAT."
  );
}

export async function cancelQcAction(f: FormData) {
  await mutate(
    "/dashboard/qc",
    "qc.operate",
    async () => {
      await rpc("cancel_quality_control", { p_qc_id: id(f, "qc_id") });
    },
    "QC dibatalkan dan stok direversal."
  );
}

export async function createReworkAction(f: FormData) {
  await mutate(
    "/dashboard/qc",
    "qc.rework",
    async () => {
      await rpc("create_qc_rework", {
        p_qc_id: id(f, "qc_id"),
        p_quantity: num(f, "quantity"),
        p_notes: t(f, "notes") || null,
      });
    },
    "Rework dibuat."
  );
}

export async function completeReworkAction(f: FormData) {
  await mutate(
    "/dashboard/qc",
    "qc.rework",
    async () => {
      await rpc("complete_qc_rework", {
        p_rework_id: id(f, "rework_id"),
        p_good_qty: num(f, "good_qty"),
        p_reject_qty: num(f, "reject_qty"),
        p_notes: t(f, "notes") || null,
      });
    },
    "Rework diselesaikan."
  );
}

export async function saveFinishedGoodAction(f: FormData) {
  await mutate(
    "/dashboard/masterBarangJadi",
    "master_barang_jadi.write",
    async () => {
      const s = await createClient();
      const targetId = id(f, "id", true);
      const payload = {
        project_id: id(f, "project_id", true),
        product_id: id(f, "product_id", true),
        name: t(f, "name"),
        category: t(f, "category"),
        unit: t(f, "unit") || "PCS",
        source: t(f, "source") || "INTERNAL",
        final_work_item_id: id(f, "final_work_item_id", true),
        status: t(f, "status") || "AKTIF",
        notes: t(f, "notes") || null,
      };
      if (targetId) {
        const { error } = await s.from("finished_goods").update(payload).eq("id", targetId);
        if (error) throw error;
      } else {
        const { error } = await s.from("finished_goods").insert(payload);
        if (error) throw error;
      }
    },
    "Master Barang Jadi berhasil disimpan."
  );
}

export async function deleteFinishedGoodAction(f: FormData) {
  await mutate(
    "/dashboard/masterBarangJadi",
    "master_barang_jadi.write",
    async () => {
      const s = await createClient();
      const { error } = await s.from("finished_goods").delete().eq("id", id(f, "id"));
      if (error) throw error;
    },
    "Master Barang Jadi berhasil dihapus."
  );
}

export async function saveLocationAction(f: FormData) {
  await mutate(
    "/dashboard/masterLokasi",
    "master_lokasi.write",
    async () => {
      const s = await createClient();
      const targetId = id(f, "id", true);
      const payload = {
        name: t(f, "name"),
        location_type: t(f, "location_type") || "GUDANG",
        address: t(f, "address") || null,
        pic_name: t(f, "pic_name") || null,
        phone: t(f, "phone") || null,
        status: t(f, "status") || "AKTIF",
        notes: t(f, "notes") || null,
      };
      if (targetId) {
        const { error } = await s.from("locations").update(payload).eq("id", targetId);
        if (error) throw error;
      } else {
        const { error } = await s.from("locations").insert(payload);
        if (error) throw error;
      }
    },
    "Master Lokasi berhasil disimpan."
  );
}

export async function deleteLocationAction(f: FormData) {
  await mutate(
    "/dashboard/masterLokasi",
    "master_lokasi.write",
    async () => {
      const s = await createClient();
      const { error } = await s.from("locations").delete().eq("id", id(f, "id"));
      if (error) throw error;
    },
    "Master Lokasi berhasil dihapus."
  );
}

export async function saveVendorAction(f: FormData) {
  await mutate(
    "/dashboard/masterVendor",
    "master_vendor.write",
    async () => {
      const s = await createClient();
      const targetId = id(f, "id", true);
      const payload = {
        name: t(f, "name"),
        pic_name: t(f, "pic_name") || null,
        phone: t(f, "phone") || null,
        email: t(f, "email") || null,
        address: t(f, "address") || null,
        tax_no: t(f, "tax_no") || null,
        bank_name: t(f, "bank_name") || null,
        bank_account_no: t(f, "bank_account_no") || null,
        bank_account_name: t(f, "bank_account_name") || null,
        status: t(f, "status") || "AKTIF",
        notes: t(f, "notes") || null,
      };
      if (targetId) {
        const { error } = await s.from("vendors").update(payload).eq("id", targetId);
        if (error) throw error;
      } else {
        const { error } = await s.from("vendors").insert(payload);
        if (error) throw error;
      }
    },
    "Master Vendor berhasil disimpan."
  );
}

export async function saveEmbarkationAction(f: FormData) {
  await mutate(
    "/dashboard/masterEmbarkasi",
    "master_embarkasi.write",
    async () => {
      const s = await createClient();
      const targetId = id(f, "id", true);
      const payload = {
        name: t(f, "name"),
        short_code: t(f, "short_code") || null,
        address: t(f, "address") || null,
        pic_name: t(f, "pic_name") || null,
        phone: t(f, "phone") || null,
        status: t(f, "status") || "AKTIF",
        notes: t(f, "notes") || null,
      };
      if (targetId) {
        const { error } = await s.from("embarkations").update(payload).eq("id", targetId);
        if (error) throw error;
      } else {
        const { error } = await s.from("embarkations").insert(payload);
        if (error) throw error;
      }
    },
    "Master Embarkasi berhasil disimpan."
  );
}

export async function deleteEmbarkationAction(f: FormData) {
  await mutate(
    "/dashboard/masterEmbarkasi",
    "master_embarkasi.write",
    async () => {
      const s = await createClient();
      const { error } = await s.from("embarkations").delete().eq("id", id(f, "id"));
      if (error) throw error;
    },
    "Master Embarkasi berhasil dihapus."
  );
}

export async function saveSetAction(f: FormData) {
  await mutate(
    "/dashboard/masterSet",
    "master_set.write",
    async () => {
      const s = await createClient();
      const targetId = id(f, "id", true);
      const payload = {
        project_id: id(f, "project_id"),
        name: t(f, "name"),
        unit: t(f, "unit") || "SET",
        status: t(f, "status") || "AKTIF",
        notes: t(f, "notes") || null,
      };
      if (targetId) {
        const { error } = await s.from("product_sets").update(payload).eq("id", targetId);
        if (error) throw error;
      } else {
        const { error } = await s.from("product_sets").insert(payload);
        if (error) throw error;
      }
    },
    "Master Set berhasil disimpan."
  );
}

export async function deleteSetAction(f: FormData) {
  await mutate(
    "/dashboard/masterSet",
    "master_set.write",
    async () => {
      const s = await createClient();
      const { error } = await s.from("product_sets").delete().eq("id", id(f, "id"));
      if (error) throw error;
    },
    "Master Set berhasil dihapus."
  );
}

export async function addSetComponentAction(f: FormData) {
  await mutate(
    "/dashboard/masterSet",
    "master_set.write",
    async () => {
      const s = await createClient();
      const { error } = await s.from("product_set_components").insert({
        set_id: id(f, "set_id"),
        finished_good_id: id(f, "finished_good_id"),
        qty_per_set: num(f, "qty_per_set"),
      });
      if (error) throw error;
    },
    "Komponen Set ditambahkan."
  );
}

export async function deleteSetComponentAction(f: FormData) {
  await mutate(
    "/dashboard/masterSet",
    "master_set.write",
    async () => {
      const s = await createClient();
      const { error } = await s.from("product_set_components").delete().eq("id", id(f, "id"));
      if (error) throw error;
    },
    "Komponen Set berhasil dihapus."
  );
}

export async function transferFinishedGoodAction(f: FormData) {
  await mutate(
    "/dashboard/transferBarangJadi",
    "transfer_barang_jadi.write",
    async () => {
      const transferId = await rpc("transfer_finished_good", {
        p_date: date(f, "transfer_date"),
        p_finished_good_id: id(f, "finished_good_id"),
        p_source_location_id: id(f, "source_location_id"),
        p_destination_location_id: id(f, "destination_location_id"),
        p_quantity: num(f, "quantity"),
        p_notes: t(f, "notes") || null,
      });

      const documentNo = t(f, "document_no") || null;
      const driverName = t(f, "driver_name") || null;
      const vehicleNo = t(f, "vehicle_no") || null;

      if (transferId && (documentNo || driverName || vehicleNo)) {
        const s = await createClient();
        await s
          .from("finished_goods_transfers")
          .update({
            document_no: documentNo,
            driver_name: driverName,
            vehicle_no: vehicleNo,
            delivery_status: "DIKIRIM",
          })
          .eq("id", transferId);
      }
    },
    "Transfer Barang Jadi tersimpan."
  );
}

export async function receiveExternalAction(f: FormData) {
  await mutate(
    "/dashboard/barangLuar",
    "barang_luar.receive",
    async () => {
      await rpc("receive_external_finished_good", {
        p_date: date(f, "receipt_date"),
        p_finished_good_id: id(f, "finished_good_id"),
        p_vendor_id: id(f, "vendor_id", true),
        p_location_id: id(f, "location_id"),
        p_quantity: num(f, "quantity"),
        p_document_no: t(f, "document_no") || null,
        p_notes: t(f, "notes") || null,
      });
    },
    "Barang luar diterima dan stok bertambah."
  );
}

export async function packSetAction(f: FormData) {
  await mutate(
    "/dashboard/packingSet",
    "packing_set.write",
    async () => {
      await rpc("pack_product_set", {
        p_date: date(f, "packing_date"),
        p_set_id: id(f, "set_id"),
        p_location_id: id(f, "location_id"),
        p_set_qty: num(f, "set_qty"),
        p_notes: t(f, "notes") || null,
      });
    },
    "Packing Set selesai. Komponen PCS berkurang dan stok SET bertambah."
  );
}

export async function processBundlingIsianAction(f: FormData) {
  const returnPath = t(f, "return_path") || "/dashboard/bundlingIsian";
  await mutate(
    returnPath,
    "bundling_isian.write",
    async () => {
      const componentsRaw = t(f, "components_json");
      let components = [];
      try {
        components = JSON.parse(componentsRaw || "[]");
      } catch {
        throw new Error("Data komponen bundling tidak valid.");
      }

      await rpc("process_bundling_isian", {
        p_date: date(f, "bundling_date"),
        p_bundle_fg_id: id(f, "bundle_finished_good_id"),
        p_location_id: id(f, "location_id") || 1, // default Pabrik Pusat
        p_bundle_qty: num(f, "bundle_qty"),
        p_notes: t(f, "notes") || null,
        p_components: components,
      });
    },
    "Bundling Isian berhasil! Komponen satuan terpotong dan stok Paket Isian Koper bertambah di Pabrik Pusat."
  );
}

export async function saveBundleRecipeAction(f: FormData) {
  const returnPath = t(f, "return_path") || "/dashboard/bundlingIsian";
  await mutate(
    returnPath,
    "bundling_isian.write",
    async () => {
      const s = await createClient();
      const bundleFgId = id(f, "bundle_finished_good_id");
      const itemsRaw = t(f, "recipe_items_json");
      let items: Array<{ component_finished_good_id: number; qty_per_bundle: number }> = [];
      try {
        items = JSON.parse(itemsRaw || "[]");
      } catch {
        throw new Error("Format data komponen resep tidak valid.");
      }

      if (!items.length) {
        throw new Error("Pilih minimal satu barang komponen untuk dimasukkan ke resep paket.");
      }

      // Bersihkan susunan lama paket ini, lalu simpan susunan yang baru
      const { error: delErr } = await s
        .from("bundle_recipes")
        .delete()
        .eq("bundle_finished_good_id", bundleFgId);
      if (delErr) throw delErr;

      const payload = items.map((it) => ({
        bundle_finished_good_id: bundleFgId,
        component_finished_good_id: it.component_finished_good_id,
        qty_per_bundle: it.qty_per_bundle,
      }));

      const { error: insErr } = await s.from("bundle_recipes").insert(payload);
      if (insErr) throw insErr;
    },
    "Resep susunan paket isian berhasil disimpan!"
  );
}

export async function deleteBundleRecipeAction(f: FormData) {
  const returnPath = t(f, "return_path") || "/dashboard/bundlingIsian";
  await mutate(
    returnPath,
    "bundling_isian.write",
    async () => {
      const s = await createClient();
      const bundleFgId = id(f, "bundle_finished_good_id");
      const { error } = await s
        .from("bundle_recipes")
        .delete()
        .eq("bundle_finished_good_id", bundleFgId);
      if (error) throw error;
    },
    "Resep paket isian berhasil dihapus."
  );
}

export async function recordMrWuDailyPackingAction(f: FormData) {
  const returnPath = t(f, "return_path") || "/dashboard/mitraMrWu";
  await mutate(
    returnPath,
    "packing_set.write",
    async () => {
      await rpc("pack_product_set", {
        p_date: date(f, "packing_date"),
        p_set_id: id(f, "set_id"),
        p_location_id: id(f, "location_id"),
        p_set_qty: num(f, "set_qty"),
        p_notes: t(f, "notes") || "Packing Harian Pabrik Mitra MR WU",
      });
    },
    "Berhasil mencatat hasil packing SET koper di MR WU! Saldo Stok SET bertambah dan siap kirim ke Embarkasi."
  );
}

export async function createTargetAction(f: FormData) {
  await mutate(
    "/dashboard/targetEmbarkasi",
    "target_embarkasi.write",
    async () => {
      const ref = t(f, "item_ref");
      const [kind, rawId] = ref.split(":");
      const itemId = Number(rawId);
      if (!["FINISHED_GOOD", "SET"].includes(kind) || !Number.isSafeInteger(itemId) || itemId <= 0) {
        throw new Error("Item target tidak valid.");
      }
      const s = await createClient();
      const { error } = await s.from("embarkation_targets").insert({
        embarkation_id: id(f, "embarkation_id"),
        item_kind: kind,
        finished_good_id: kind === "FINISHED_GOOD" ? itemId : null,
        set_id: kind === "SET" ? itemId : null,
        target_qty: num(f, "target_qty"),
        status: "AKTIF",
        notes: t(f, "notes") || null,
      });
      if (error) throw error;
    },
    "Target Embarkasi ditambahkan."
  );
}

export async function createShipmentAction(f: FormData) {
  await mutate(
    "/dashboard/pengirimanEmbarkasi",
    "pengiriman_embarkasi.operate",
    async () => {
      const deliveryDeadline = t(f, "delivery_deadline");
      const rawNotes = t(f, "notes") || "";
      const finalNotes = deliveryDeadline
        ? `[DATELINE: ${deliveryDeadline}] ${rawNotes}`.trim()
        : rawNotes || null;

      await rpc("create_embarkation_shipment", {
        p_target_id: id(f, "target_id"),
        p_date: date(f, "shipment_date"),
        p_source_location_id: id(f, "source_location_id"),
        p_quantity: num(f, "quantity"),
        p_document_no: t(f, "document_no") || null,
        p_driver: t(f, "driver_name") || null,
        p_vehicle: t(f, "vehicle_no") || null,
        p_notes: finalNotes,
      });
    },
    "Draft pengiriman dibuat. Stok belum berubah."
  );
}

export async function sendShipmentAction(f: FormData) {
  await mutate(
    "/dashboard/pengirimanEmbarkasi",
    "pengiriman_embarkasi.operate",
    async () => {
      await rpc("send_embarkation_shipment", { p_shipment_id: id(f, "shipment_id") });
    },
    "Pengiriman DIKIRIM. Stok sumber berkurang."
  );
}

export async function receiveShipmentAction(f: FormData) {
  await mutate(
    "/dashboard/pengirimanEmbarkasi",
    "pengiriman_embarkasi.operate",
    async () => {
      await rpc("receive_embarkation_shipment", {
        p_shipment_id: id(f, "shipment_id"),
        p_received: num(f, "received_qty"),
        p_reject: num(f, "reject_qty"),
        p_damaged: num(f, "damaged_qty"),
        p_missing: num(f, "missing_qty"),
        p_notes: t(f, "notes") || null,
      });
    },
    "Penerimaan Embarkasi dikonfirmasi."
  );
}

export async function cancelShipmentAction(f: FormData) {
  await mutate(
    "/dashboard/pengirimanEmbarkasi",
    "pengiriman_embarkasi.operate",
    async () => {
      await rpc("cancel_embarkation_shipment", { p_shipment_id: id(f, "shipment_id") });
    },
    "Pengiriman dibatalkan. Jika sudah dikirim, stok direversal."
  );
}

export async function createEmbarkationIssueAction(f: FormData) {
  await mutate(
    "/dashboard/rejectEmbarkasi",
    "reject_embarkasi.write",
    async () => {
      const s = await createClient();

      const itemKey = t(f, "item_key");
      const qtyVal = Number(num(f, "quantity") || 0);
      const daerah = t(f, "daerah") || "Asrama Haji";
      const embarkasi = t(f, "embarkasi") || "JKS";
      const keterangan = t(f, "keterangan") || t(f, "description") || "Reject / Klaim Fisik";
      const tglKirim = t(f, "tgl_kirim") || new Date().toLocaleDateString("id-ID");
      const noDokumen = t(f, "no_dokumen") || "-";
      const statusInput = t(f, "status") || "PROSES";
      const resolution = t(f, "resolution") || (statusInput === "SELESAI" ? "Sudah Terkirim" : "Menunggu Pengganti");

      const { count } = await s.from("embarkation_issues").select("id", { count: "exact", head: true });
      const nextNo = (count || 0) + 1;

      const itemQuantities: Record<string, number> = {
        tambahan_set: 0,
        koper_bagasi: 0,
        koper_kabin: 0,
        kardus: 0,
        paket_isian: 0,
        cover_bagasi: 0,
        cover_kabin: 0,
        tas_pasport: 0,
        tas_ransel: 0,
        hangtag: 0,
        logo_kemenag: 0,
        logo_aybe: 0,
        logo_saudi: 0,
        sticker: 0,
      };

      if (itemKey && itemQuantities.hasOwnProperty(itemKey)) {
        itemQuantities[itemKey] = qtyVal;
      } else {
        for (const k of Object.keys(itemQuantities)) {
          const val = Number(f.get(k) || 0);
          if (val > 0) itemQuantities[k] = val;
        }
      }

      const totalQty = Object.values(itemQuantities).reduce((a, b) => a + b, 0) || qtyVal || 1;

      const descriptionJson = JSON.stringify({
        no: nextNo,
        daerah,
        embarkasi,
        ...itemQuantities,
        tgl_kirim: tglKirim,
        no_dokumen: noDokumen,
        keterangan,
      });

      let shipmentId = id(f, "shipment_id", true);
      if (!shipmentId) {
        const { data: latestShipment } = await s
          .from("embarkation_shipments")
          .select("id")
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();
        shipmentId = latestShipment?.id;
      }

      if (!shipmentId) throw new Error("Surat jalan pengiriman terkait tidak ditemukan.");

      const issueCode = `SAUDI-${String(nextNo).padStart(3, "0")}`;

      const { error } = await s.from("embarkation_issues").insert({
        issue_code: issueCode,
        shipment_id: shipmentId,
        issue_type: t(f, "issue_type") || "REJECT",
        quantity: totalQty,
        description: descriptionJson,
        status: statusInput,
        resolution: resolution,
      });
      if (error) throw error;
    },
    "Data reject & return embarkasi berhasil dicatat."
  );
}

export async function updateEmbarkationIssueReturnAction(f: FormData) {
  await mutate(
    "/dashboard/rejectEmbarkasi",
    "reject_embarkasi.write",
    async () => {
      const s = await createClient();
      const issueId = id(f, "issue_id");
      const noDokumen = t(f, "no_dokumen") || "-";
      const tglKirim = t(f, "tgl_kirim") || new Date().toLocaleDateString("id-ID");
      const statusInput = t(f, "status") || "SELESAI";
      const resolution = t(f, "resolution") || "Sudah Terkirim / Masuk Embarkasi";

      const { data: issue, error: fetchErr } = await s
        .from("embarkation_issues")
        .select("*")
        .eq("id", issueId)
        .single();
      if (fetchErr || !issue) throw new Error("Data klaim tidak ditemukan.");

      let descObj: any = {};
      try {
        if (issue.description && issue.description.startsWith("{")) {
          descObj = JSON.parse(issue.description);
        } else {
          descObj = { keterangan: issue.description };
        }
      } catch {
        descObj = { keterangan: issue.description };
      }

      descObj.no_dokumen = noDokumen;
      descObj.tgl_kirim = tglKirim;

      const { error: updErr } = await s
        .from("embarkation_issues")
        .update({
          status: statusInput,
          resolution: resolution,
          description: JSON.stringify(descObj),
        })
        .eq("id", issueId);

      if (updErr) throw updErr;
    },
    "Pengiriman return pengganti berhasil diperbarui."
  );
}

export async function deleteEmbarkationIssueAction(f: FormData) {
  await mutate(
    "/dashboard/rejectEmbarkasi",
    "reject_embarkasi.write",
    async () => {
      const s = await createClient();
      const issueId = id(f, "issue_id");
      const { error } = await s.from("embarkation_issues").delete().eq("id", issueId);
      if (error) throw error;
    },
    "Catatan reject/klaim berhasil dihapus."
  );
}

export async function addAttendanceAction(f: FormData) {
  await mutate(
    "/dashboard/absensi",
    "absensi.write",
    async () => {
      const s = await createClient();
      const otMin = num(f, "overtime_minutes", true) ?? 0;
      const attStatus = t(f, "attendance_status") || "HADIR";
      const payload: any = {
        worker_id: id(f, "worker_id"),
        attendance_date: date(f, "attendance_date"),
        schedule_in: t(f, "schedule_in") || null,
        schedule_out: t(f, "schedule_out") || null,
        actual_in: t(f, "actual_in") || null,
        actual_out: t(f, "actual_out") || null,
        attendance_status: attStatus,
        overtime_minutes: otMin,
        source: "MANUAL",
        notes: t(f, "notes") || null,
        verification_status: attStatus === "HADIR" ? "DRAFT" : "TERVERIFIKASI",
      };
      const { error } = await s.from("attendance_records").upsert(payload, { onConflict: "worker_id,attendance_date" });
      if (error) throw error;
    },
    "Absensi disimpan."
  );
}

export async function addBulkAttendanceAction(f: FormData) {
  await mutate(
    "/dashboard/absensi",
    "absensi.write",
    async () => {
      const s = await createClient();
      const raw = f.get("items");
      if (!raw || typeof raw !== "string") throw new Error("Data absensi tidak valid.");
      const items = JSON.parse(raw);
      if (!Array.isArray(items) || items.length === 0) return;

      const payload = items.map((it: any) => ({
        worker_id: it.worker_id,
        attendance_date: it.attendance_date,
        schedule_in: it.schedule_in || null,
        schedule_out: it.schedule_out || null,
        actual_in: it.actual_in || null,
        actual_out: it.actual_out || null,
        day_class: it.day_class || null,
        attendance_status: it.attendance_status || "HADIR",
        overtime_minutes: Number(it.overtime_minutes || 0),
        source: it.source || "MANUAL",
        notes: it.notes || null,
        verification_status: it.attendance_status === "HADIR" ? "DRAFT" : "TERVERIFIKASI",
      }));

      for (let i = 0; i < payload.length; i += 100) {
        const chunk = payload.slice(i, i + 100);
        const { error } = await s
          .from("attendance_records")
          .upsert(chunk, { onConflict: "worker_id,attendance_date" });
        if (error) throw error;
      }
    },
    "Data absensi berhasil disimpan secara massal."
  );
}

export async function verifyAttendanceAction(f: FormData) {
  await mutate(
    "/dashboard/absensi",
    "absensi.write",
    async () => {
      await rpc("verify_attendance", {
        p_attendance_id: id(f, "attendance_id"),
        p_day_class: t(f, "day_class"),
        p_overtime_minutes: num(f, "overtime_minutes"),
        p_notes: t(f, "notes") || null,
      });
    },
    "Absensi diverifikasi."
  );
}

export async function autoFixMissingOutAttendanceAction(f: FormData) {
  const path = "/dashboard/absensi";
  await mutate(
    path,
    "absensi.write",
    async () => {
      const s = await createClient();
      const startDate = date(f, "start_date", true);
      const endDate = date(f, "end_date", true);

      let query = s.from("attendance_records").select("id, actual_in, actual_out, attendance_date, attendance_status, day_class");
      if (startDate) query = query.gte("attendance_date", startDate);
      if (endDate) query = query.lte("attendance_date", endDate);

      const { data: records, error } = await query;
      if (error) throw error;

      const now = new Date().toISOString();

      const absentIds: number[] = [];
      const weekdayFixIds: number[] = [];
      const saturdayFixIds: number[] = [];

      for (const r of (records || [])) {
        const hasIn = r.actual_in && r.actual_in !== "--:--" && r.actual_in.trim() !== "";
        const hasOut = r.actual_out && r.actual_out !== "--:--" && r.actual_out.trim() !== "";

        const d = new Date(r.attendance_date + "T00:00:00Z");
        const dayOfWeek = d.getUTCDay();

        if (!hasIn) {
          if (r.attendance_status === "HADIR" || r.day_class || hasOut) {
            absentIds.push(r.id);
          }
        } else {
          if (dayOfWeek === 6) {
            if (!hasOut || r.actual_out === "17:00:00" || r.actual_out === "17:00") {
              saturdayFixIds.push(r.id);
            }
          } else if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            if (!hasOut) {
              weekdayFixIds.push(r.id);
            }
          }
        }
      }

      for (let i = 0; i < absentIds.length; i += 100) {
        const chunk = absentIds.slice(i, i + 100);
        await s.from("attendance_records").update({
          actual_in: null,
          actual_out: null,
          day_class: null,
          overtime_minutes: 0,
          attendance_status: "ALPHA",
          verification_status: "TERVERIFIKASI",
          notes: "Otomatis Alpha (tidak ada scan masuk)",
          updated_at: now,
        }).in("id", chunk);
      }

      for (let i = 0; i < saturdayFixIds.length; i += 100) {
        const chunk = saturdayFixIds.slice(i, i + 100);
        await s.from("attendance_records").update({
          actual_out: "15:00:00",
          day_class: "FULL_DAY",
          overtime_minutes: 0,
          attendance_status: "HADIR",
          notes: "Pulang normal Sabtu 15:00 (lupa finger)",
          updated_at: now,
        }).in("id", chunk);
      }

      for (let i = 0; i < weekdayFixIds.length; i += 100) {
        const chunk = weekdayFixIds.slice(i, i + 100);
        await s.from("attendance_records").update({
          actual_out: "17:00:00",
          day_class: "FULL_DAY",
          overtime_minutes: 0,
          attendance_status: "HADIR",
          notes: "Pulang normal 17:00 (lupa finger)",
          updated_at: now,
        }).in("id", chunk);
      }
    },
    "Absensi diperbaiki: Sabtu diset 15:00 (lembur 0), dan yang tidak scan masuk otomatis Alpha!"
  );
}

export async function verifyBulkAttendanceAction(f: FormData) {
  const path = "/dashboard/absensi";
  await mutate(
    path,
    "absensi.write",
    async () => {
      const s = await createClient();
      const {
        data: { user },
      } = await s.auth.getUser();
      const rawItems = t(f, "items");
      let itemsToVerify: Array<{
        id: number;
        day_class?: string;
        overtime_minutes?: number;
        notes?: string;
      }> = [];

      if (rawItems) {
        try {
          itemsToVerify = JSON.parse(rawItems);
        } catch {
          throw new Error("Format data verifikasi massal tidak valid.");
        }
      } else {
        const rawIds = t(f, "attendance_ids");
        const ids = rawIds
          .split(",")
          .map((x) => Number(x.trim()))
          .filter((x) => x > 0);
        const defaultDayClass = t(f, "default_day_class") || "FULL_DAY";
        const defaultOt = num(f, "default_overtime_minutes", true) ?? 0;
        itemsToVerify = ids.map((attId) => ({
          id: attId,
          day_class: defaultDayClass,
          overtime_minutes: defaultOt,
        }));
      }

      if (!itemsToVerify.length) {
        throw new Error("Pilih minimal satu data absensi untuk diverifikasi.");
      }

      const now = new Date().toISOString();
      const groups = new Map<string, { dayClass: string; otMin: number; ids: number[] }>();

      for (const it of itemsToVerify) {
        const dClass = (it.day_class || "FULL_DAY").toUpperCase();
        const ot = Math.max(0, Math.round(Number(it.overtime_minutes || 0)));
        const key = `${dClass}__${ot}`;

        if (!groups.has(key)) {
          groups.set(key, { dayClass: dClass, otMin: ot, ids: [] });
        }
        groups.get(key)!.ids.push(it.id);
      }

      for (const grp of groups.values()) {
        for (let i = 0; i < grp.ids.length; i += 100) {
          const chunk = grp.ids.slice(i, i + 100);
          const { error: batchErr } = await s
            .from("attendance_records")
            .update({
              day_class: grp.dayClass,
              overtime_minutes: grp.otMin,
              verification_status: "TERVERIFIKASI",
              verified_by: user?.id,
              verified_at: now,
              updated_at: now,
            })
            .in("id", chunk);

          if (batchErr) throw batchErr;
        }
      }
    },
    "Berhasil memverifikasi seluruh data absensi sekaligus."
  );
}

export async function unverifyAttendanceAction(f: FormData) {
  const path = "/dashboard/absensi";
  await mutate(
    path,
    "absensi.write",
    async () => {
      const s = await createClient();
      const attId = id(f, "attendance_id");
      const { error } = await s
        .from("attendance_records")
        .update({
          verification_status: "DRAFT",
          verified_by: null,
          verified_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", attId);

      if (error) throw error;
    },
    "Status absensi dikembalikan ke DRAFT."
  );
}

export async function deleteAttendanceAction(f: FormData) {
  const path = "/dashboard/absensi";
  await mutate(
    path,
    "absensi.write",
    async () => {
      const s = await createClient();
      const attId = id(f, "attendance_id");

      const { data: att, error: fetchErr } = await s
        .from("attendance_records")
        .select("id, attendance_date")
        .eq("id", attId)
        .single();
      if (fetchErr || !att) throw new Error("Data absensi tidak ditemukan.");

      const { data: finalRuns } = await s
        .from("payroll_runs")
        .select("id, payroll_code, period_start, period_end")
        .eq("status", "FINAL")
        .lte("period_start", att.attendance_date)
        .gte("period_end", att.attendance_date);

      if (finalRuns && finalRuns.length > 0) {
        throw new Error(
          `Data absensi tidak dapat dihapus karena sudah masuk payroll final (${finalRuns[0].payroll_code}).`
        );
      }

      const { error: delErr } = await s.from("attendance_records").delete().eq("id", attId);
      if (delErr) throw delErr;
    },
    "Data absensi berhasil dihapus."
  );
}

export async function deleteBulkAttendanceAction(f: FormData) {
  const path = "/dashboard/absensi";
  await mutate(
    path,
    "absensi.write",
    async () => {
      const s = await createClient();
      const rawIds = t(f, "attendance_ids");
      const ids = rawIds
        ? rawIds
            .split(",")
            .map((x) => Number(x.trim()))
            .filter((x) => x > 0)
        : [];
      if (!ids.length) throw new Error("Pilih data absensi yang ingin dihapus.");

      const { data: recs, error: rErr } = await s
        .from("attendance_records")
        .select("id, attendance_date")
        .in("id", ids);
      if (rErr || !recs || !recs.length) throw new Error("Data absensi tidak ditemukan.");

      const dates = recs.map((r) => r.attendance_date);
      const minDate = dates.reduce((a, b) => (a < b ? a : b));
      const maxDate = dates.reduce((a, b) => (a > b ? a : b));

      const { data: finalRuns } = await s
        .from("payroll_runs")
        .select("id, payroll_code, period_start, period_end")
        .eq("status", "FINAL")
        .lte("period_start", maxDate)
        .gte("period_end", minDate);

      const lockedDates = new Set<string>();
      (finalRuns || []).forEach((run) => {
        recs.forEach((r) => {
          if (r.attendance_date >= run.period_start && r.attendance_date <= run.period_end) {
            lockedDates.add(r.attendance_date);
          }
        });
      });

      const deletableIds = recs.filter((r) => !lockedDates.has(r.attendance_date)).map((r) => r.id);
      if (deletableIds.length === 0) {
        throw new Error("Semua data yang dipilih sudah terkunci dalam payroll yang sudah dibayar.");
      }

      const { error: delErr } = await s.from("attendance_records").delete().in("id", deletableIds);
      if (delErr) throw delErr;
    },
    "Data absensi terpilih berhasil dihapus."
  );
}

export async function finalizePayrollAction(f: FormData) {
  await mutate(
    "/dashboard/payroll",
    "payroll.write",
    async () => {
      await rpc("finalize_general_payroll", {
        p_type: t(f, "payroll_type"),
        p_start: date(f, "period_start"),
        p_end: date(f, "period_end"),
        p_notes: t(f, "notes") || null,
      });
    },
    "Payroll berhasil dibuat dari absensi terverifikasi."
  );
}

export async function finalizeOperatorPayrollAction(f: FormData) {
  await mutate(
    "/dashboard/payroll",
    "payroll.write",
    async () => {
      await rpc("finalize_operator_payroll", {
        p_start: date(f, "period_start"),
        p_end: date(f, "period_end"),
        p_notes: t(f, "notes") || null,
      });
    },
    "Payroll Operator difinalisasi dari Qty Sah Checker + hasil manual HARIAN."
  );
}

export async function updatePayrollItemAction(f: FormData) {
  const path = "/dashboard/payroll";
  await mutate(
    path,
    "payroll.write",
    async () => {
      const s = await createClient();
      const itemId = id(f, "item_id");
      const { data: item, error: fetchErr } = await s
        .from("payroll_run_items")
        .select("*")
        .eq("id", itemId)
        .single();
      if (fetchErr || !item) throw new Error("Item payroll tidak ditemukan.");

      const baseAmount = num(f, "base_amount", true) ?? Number(item.base_amount || 0);
      const mealAmount = num(f, "meal_amount", true) ?? Number(item.meal_amount || 0);
      const overtimeAmount = num(f, "overtime_amount", true) ?? Number(item.overtime_amount || 0);
      const manualOt = num(f, "manual_overtime_amount", true) ?? Number(item.manual_overtime_amount || 0);
      const bonus = num(f, "overtime_bonus", true) ?? Number(item.overtime_bonus || 0);
      const holidayBonus = num(f, "holiday_bonus", true) ?? Number(item.holiday_bonus || 0);
      const kasbonPerusahaan = num(f, "kasbon_perusahaan_amount", true) ?? Number(item.kasbon_perusahaan_amount || 0);
      const kasbonWarung = num(f, "kasbon_warung_amount", true) ?? Number(item.kasbon_warung_amount || 0);
      const totalDeduction = num(f, "deduction_amount", true) ?? (kasbonPerusahaan + kasbonWarung);
      const otMinRaw = num(f, "overtime_minutes", true);
      const overtimeMinutes = otMinRaw !== null ? Math.round(otMinRaw) : (item.overtime_minutes ?? 0);
      const manualOtHoursRaw = num(f, "manual_overtime_hours", true);
      const manualOvertimeHours = manualOtHoursRaw !== null ? manualOtHoursRaw : Number(item.manual_overtime_hours || 0);

      await rpc("update_payroll_item_manual", {
        p_item_id: itemId,
        p_base_amount: baseAmount,
        p_meal_amount: mealAmount,
        p_overtime_amount: overtimeAmount,
        p_manual_overtime_amount: manualOt,
        p_overtime_bonus: bonus,
        p_holiday_bonus: holidayBonus,
        p_kasbon_perusahaan_amount: kasbonPerusahaan,
        p_kasbon_warung_amount: kasbonWarung,
        p_deduction_amount: totalDeduction,
        p_overtime_minutes: overtimeMinutes,
        p_manual_overtime_hours: manualOvertimeHours,
      });
    },
    "Koreksi upah dan rincian payroll berhasil disimpan."
  );
}

export async function syncPayrollAdvancesAction(f: FormData) {
  const path = "/dashboard/payroll";
  await mutate(
    path,
    "payroll.write",
    async () => {
      const s = await createClient();
      const runId = id(f, "run_id");

      const { data: run, error: rErr } = await s
        .from("payroll_runs")
        .select("*")
        .eq("id", runId)
        .single();
      if (rErr || !run) throw new Error("Data payroll run tidak ditemukan.");

      const { data: runItems, error: itemsErr } = await s
        .from("payroll_run_items")
        .select("*")
        .eq("payroll_run_id", runId);

      if (itemsErr || !runItems || !runItems.length) {
        throw new Error(itemsErr?.message || "Rincian payroll tidak ditemukan.");
      }

      const workerIds = runItems.map((i) => i.worker_id);

      const { data: workersList } = await s
        .from("workers")
        .select("*")
        .in("id", workerIds);

      const workerMap = new Map((workersList ?? []).map((w: any) => [w.id, w]));

      const { data: attRecords } = await s
        .from("attendance_records")
        .select("worker_id, day_class, overtime_minutes, attendance_date, attendance_status")
        .gte("attendance_date", run.period_start)
        .lte("attendance_date", run.period_end)
        .eq("verification_status", "TERVERIFIKASI");

      const attList = attRecords ?? [];

      const { data: advances } = await s
        .from("cash_advances")
        .select("id, worker_id, amount, paid_amount, category, installment_amount, status")
        .in("worker_id", workerIds)
        .eq("status", "AKTIF");

      const advList = advances ?? [];
      let totalRunGross = 0;
      let totalRunDeduction = 0;
      let totalRunNet = 0;

      for (const it of runItems) {
        const w = workerMap.get(it.worker_id);
        const paySystem = String(w?.pay_system || it.pay_system_snapshot || "").toUpperCase();

        const workerAtts = attList.filter((a) => a.worker_id === it.worker_id && a.attendance_status === "HADIR");
        const fullDays = workerAtts.filter((a) => a.day_class === "FULL_DAY").length;
        const halfDays = workerAtts.filter((a) => a.day_class === "HALF_DAY").length;
        const totalOtMinutes = workerAtts.reduce((sum, a) => sum + (Number(a.overtime_minutes) || 0), 0);

        let baseAmt = 0;
        let mealAmt = Number(it.meal_amount || 0);
        let otAmt = 0;
        let otBonus = 0;
        let holidayBonus = 0;

        if (paySystem === "BULANAN") {
          if (run.payroll_type === "BULANAN") {
            baseAmt = Number(w?.monthly_salary ?? w?.base_salary ?? it.base_amount ?? 0);
          } else {
            baseAmt = 0;
            mealAmt = fullDays * 50000;
          }
          const hourlyRate = baseAmt > 0 ? Math.round((baseAmt / 190) * 100) / 100 : 0;
          otAmt = Math.round((totalOtMinutes / 60) * hourlyRate * 100) / 100;
          if (totalOtMinutes >= 240) otBonus = 17500;
        } else {
          const dailyRate = Number(w?.daily_salary ?? w?.daily_rate ?? w?.rate_per_day ?? it.daily_wage_snapshot ?? 0);
          if (fullDays > 0 || halfDays > 0) {
            baseAmt = Math.round((fullDays + halfDays * 0.5) * dailyRate);
          } else {
            baseAmt = 0;
          }

          const hourlyRate = dailyRate > 0 ? Math.round((dailyRate / 8) * 100) / 100 : 0;
          otAmt = Math.round((totalOtMinutes / 60) * hourlyRate * 100) / 100;
          if (totalOtMinutes >= 240) otBonus = 5000;

          const sundayCount = workerAtts.filter((a) => {
            const d = new Date(a.attendance_date + "T00:00:00Z");
            return d.getUTCDay() === 0;
          }).length;
          holidayBonus = sundayCount * 20000;
        }

        const workerAdvs = advList.filter((a) => a.worker_id === it.worker_id);
        const kasbonP = workerAdvs
          .filter((a) => a.category === "KASBON_PERUSAHAAN")
          .reduce((sum, a) => {
            const rem = Math.max(0, Number(a.amount) - Number(a.paid_amount));
            const inst = Number(a.installment_amount || 0);
            return sum + (inst > 0 ? Math.min(inst, rem) : rem);
          }, 0);

        const kasbonW = workerAdvs
          .filter((a) => a.category === "KASBON_WARUNG")
          .reduce((sum, a) => sum + Math.max(0, Number(a.amount) - Number(a.paid_amount)), 0);

        const gross = baseAmt + mealAmt + otAmt + Number(it.manual_overtime_amount || 0) + otBonus + holidayBonus;
        const deduction = kasbonP + kasbonW;
        const net = Math.max(0, Math.round((gross - deduction) * 100) / 100);

        totalRunGross += gross;
        totalRunDeduction += deduction;
        totalRunNet += net;

        await s
          .from("payroll_run_items")
          .update({
            full_days: fullDays,
            half_days: halfDays,
            overtime_minutes: totalOtMinutes,
            base_amount: baseAmt,
            meal_amount: mealAmt,
            overtime_amount: otAmt,
            overtime_bonus: otBonus,
            holiday_bonus: holidayBonus,
            kasbon_perusahaan_amount: kasbonP,
            kasbon_warung_amount: kasbonW,
            deduction_amount: deduction,
            net_amount: net,
          })
          .eq("id", it.id);
      }

      await s
        .from("payroll_runs")
        .update({
          total_gross: totalRunGross,
          total_deduction: totalRunDeduction,
          total_net: totalRunNet,
        })
        .eq("id", runId);
    },
    "Sinkronisasi berhasil: data kehadiran, uang makan, dan kasbon telah dihitung ulang."
  );
}

export async function syncPayrollMasterSalaryAction(f: FormData) {
  return syncPayrollAdvancesAction(f);
}

export async function updateOperatorPayrollItemAction(f: FormData) {
  const path = "/dashboard/payroll";
  await mutate(
    path,
    "payroll.write",
    async () => {
      const s = await createClient();
      const itemId = id(f, "item_id");
      const { data: item, error: fetchErr } = await s
        .from("operator_payroll_items")
        .select("*")
        .eq("id", itemId)
        .single();
      if (fetchErr || !item) throw new Error("Item payroll operator tidak ditemukan.");

      const qtyApproved = num(f, "qty_approved", true) ?? Number(item.qty_approved || 0);
      const opPrice = num(f, "operator_price", true) ?? Number(item.operator_price_snapshot || 0);
      const subPrice = num(f, "submission_price", true) ?? Number(item.submission_price_snapshot || 0);
      const opVal = num(f, "operator_value", true) ?? Math.round(qtyApproved * opPrice * 100) / 100;
      const subVal = num(f, "submission_value", true) ?? Math.round(qtyApproved * subPrice * 100) / 100;

      const { error: updateErr } = await s
        .from("operator_payroll_items")
        .update({
          qty_approved: qtyApproved,
          operator_price_snapshot: opPrice,
          submission_price_snapshot: subPrice,
          operator_value: opVal,
          submission_value: subVal,
        })
        .eq("id", itemId);
      if (updateErr) throw updateErr;

      const { data: runItems, error: rItemsErr } = await s
        .from("operator_payroll_items")
        .select("operator_value, submission_value")
        .eq("run_id", item.run_id);
      if (!rItemsErr && runItems) {
        const totOp = runItems.reduce((acc, x) => acc + Number(x.operator_value || 0), 0);
        const totSub = runItems.reduce((acc, x) => acc + Number(x.submission_value || 0), 0);
        await s.from("operator_payroll_runs").update({
          total_operator_value: Math.round(totOp * 100) / 100,
          total_submission_value: Math.round(totSub * 100) / 100,
        }).eq("id", item.run_id);
      }
    },
    "Koreksi payroll operator borongan berhasil disimpan."
  );
}

export async function togglePayrollPaymentStatusAction(f: FormData) {
  const returnPath = t(f, "return_path") || "/dashboard/payroll";
  await mutate(
    returnPath,
    "payroll.write",
    async () => {
      const s = await createClient();
      const runType = t(f, "run_type");
      const runId = id(f, "run_id");
      const targetStatus = t(f, "payment_status") || "SUDAH_DIBAYAR";

      if (runType === "OPERATOR") {
        const { data: run, error: rErr } = await s.from("operator_payroll_runs").select("*").eq("id", runId).single();
        if (rErr || !run) throw new Error("Run operator tidak ditemukan.");
        let notes = run.notes || "";
        notes = notes.replace(/\[STATUS:\s*(SUDAH_DIBAYAR|BELUM_DIBAYAR|SUDAH DIBAYAR|BELUM DIBAYAR)\]/gi, "").trim();
        const newNotes = `[STATUS: ${targetStatus}] ${notes}`.trim();
        const { error } = await s.from("operator_payroll_runs").update({ notes: newNotes }).eq("id", runId);
        if (error) throw error;
      } else {
        const { data: run, error: rErr } = await s.from("payroll_runs").select("*").eq("id", runId).single();
        if (rErr || !run) throw new Error("Run payroll tidak ditemukan.");
        const cfg = typeof run.config_snapshot === "object" && run.config_snapshot !== null ? { ...run.config_snapshot } : {};
        const normalizedStatus = targetStatus.replace(/_/g, " ").trim();
        cfg.payment_status = normalizedStatus;
        cfg.payment_status_code = targetStatus;
        cfg.payment_updated_at = new Date().toISOString();
        const { error } = await s.from("payroll_runs").update({ config_snapshot: cfg }).eq("id", runId);
        if (error) throw error;
      }
    },
    "Status pembayaran payroll berhasil diubah."
  );
}

export async function savePayrollShiftSettingsAction(f: FormData) {
  const returnPath = t(f, "return_path") || "/dashboard/payroll";
  await mutate(
    returnPath,
    "payroll.write",
    async () => {
      const rawSettings = t(f, "settings_json");
      let settings: Record<string, unknown> = {};
      if (rawSettings) {
        try {
          settings = JSON.parse(rawSettings);
        } catch {
          throw new Error("Format pengaturan tidak valid.");
        }
      } else {
        const keys = [
          "SHIFT_WEEKDAY_IN",
          "SHIFT_WEEKDAY_OUT",
          "SHIFT_SATURDAY_OUT",
          "SHIFT_SUNDAY_IN",
          "SHIFT_SUNDAY_OUT",
          "OT_DIVISOR_HARIAN",
          "OT_BONUS_HARIAN_4H",
          "HARIAN_HOLIDAY_BONUS_FULL",
          "HARIAN_HOLIDAY_BONUS_HALF",
          "OT_DIVISOR_BULANAN",
          "OT_BONUS_BULANAN_4H",
          "MEAL_FULL",
          "MEAL_HALF",
          "BULANAN_SUNDAY_MEAL",
          "FRIDAY_OVERTIME_NEXT_WEEK",
        ];
        for (const k of keys) {
          const val = f.get(k);
          if (val !== null && val !== undefined) {
            settings[k] = String(val).trim();
          }
        }
      }

      await rpc("save_payroll_shift_settings", { p_settings: settings });
    },
    "Pengaturan jam kerja & tarif lembur berhasil disimpan."
  );
}

export async function addCashAdvanceAction(f: FormData) {
  await mutate(
    "/dashboard/kasbon",
    "kasbon.write",
    async () => {
      const s = await createClient();
      const cat = "KASBON_PERUSAHAAN";
      const amt = Number(num(f, "amount") ?? 0);
      const rawInst = num(f, "installment_count", true);
      const instCount = rawInst && rawInst > 0 ? Math.round(rawInst) : 1;
      const instAmt = instCount > 1 ? Math.round((amt / instCount) * 100) / 100 : amt;
      const { error } = await s.from("cash_advances").insert({
        worker_id: id(f, "worker_id"),
        advance_date: date(f, "advance_date"),
        amount: amt,
        category: cat,
        warung_name: null,
        installment_count: instCount,
        installment_amount: instAmt,
        installments_paid: 0,
        notes: t(f, "notes") || null,
      });
      if (error) throw error;
    },
    "Kasbon perusahaan berhasil ditambahkan."
  );
}

export async function recordWarungDebtAction(f: FormData) {
  const path = "/dashboard/warung";
  await requirePermission("warung.write");
  try {
    const s = await createClient();
    const amt = Number(num(f, "amount") ?? 0);
    const warung = t(f, "warung_name") || "Warung Luar";
    const wId = id(f, "worker_id");
    const advDate = date(f, "advance_date") || new Date().toISOString().slice(0, 10);
    const notes = t(f, "notes") || null;
    const { error } = await s.from("cash_advances").insert({
      worker_id: wId,
      advance_date: advDate,
      amount: amt,
      paid_amount: 0,
      category: "KASBON_WARUNG",
      warung_name: warung,
      installment_count: 1,
      installment_amount: amt,
      installments_paid: 0,
      status: "AKTIF",
      notes,
    });
    if (error) throw error;
  } catch (e) {
    go(path, "error", msg(e));
  }
  revalidatePath(path);
  revalidatePath("/dashboard/kasbon");
  redirect(`${path}?success=${encodeURIComponent("Hutang warung berhasil dicatat.")}`);
}

export async function payCashAdvanceAction(f: FormData) {
  await mutate(
    "/dashboard/kasbon",
    "kasbon.write",
    async () => {
      await rpc("pay_cash_advance", {
        p_advance_id: id(f, "advance_id"),
        p_date: date(f, "payment_date"),
        p_amount: num(f, "amount"),
        p_source: t(f, "source") || "MANUAL",
        p_reference: t(f, "reference") || null,
        p_notes: t(f, "notes") || null,
      });
    },
    "Pembayaran Kasbon tersimpan."
  );
}

export async function deletePettyCashAction(f: FormData) {
  await mutate(
    "/dashboard/kasKecil",
    "kas_kecil.write",
    async () => {
      const s = await createClient();
      const targetId = id(f, "id");
      if (!targetId) throw new Error("ID transaksi tidak valid.");
      
      const { error } = await s.from("petty_cash_transactions").delete().eq("id", targetId);
      if (error) {
        const { error: updErr } = await s.from("petty_cash_transactions").update({ status: "DIBATALKAN" }).eq("id", targetId);
        if (updErr) throw updErr;
      }
    },
    "Transaksi Kas Kecil berhasil dihapus."
  );
}

export async function addPettyCashAction(f: FormData) {
  await mutate(
    "/dashboard/kasKecil",
    "kas_kecil.write",
    async () => {
      const s = await createClient();

      const file = (f.get("receipt_file") as File | null) || (f.get("receipt_file_gallery") as File | null);
      const base64Data = t(f, "receipt_base64");
      let receiptUrl: string | null = null;

      if (base64Data && base64Data.startsWith("data:image")) {
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const contentType = matches[1];
          const buffer = Buffer.from(matches[2], "base64");
          const ext = contentType.split("/")[1] || "jpg";
          const filePath = `nota_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

          const { error: uploadError } = await s.storage
            .from("nota-kas-kecil")
            .upload(filePath, buffer, {
              contentType,
              upsert: false,
            });

          if (!uploadError) {
            const { data: publicUrlData } = s.storage
              .from("nota-kas-kecil")
              .getPublicUrl(filePath);
            receiptUrl = publicUrlData.publicUrl;
          }
        }
      }

      if (!receiptUrl && file && typeof file === "object" && file.size > 0 && file.name) {
        const ext = file.name.split(".").pop() || "jpg";
        const filePath = `nota_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

        const { error: uploadError } = await s.storage
          .from("nota-kas-kecil")
          .upload(filePath, file, {
            contentType: file.type || "image/jpeg",
            upsert: false,
          });

        if (!uploadError) {
          const { data: publicUrlData } = s.storage
            .from("nota-kas-kecil")
            .getPublicUrl(filePath);
          receiptUrl = publicUrlData.publicUrl;
        }
      }

      const { error } = await s.from("petty_cash_transactions").insert({
        transaction_date: date(f, "transaction_date"),
        direction: t(f, "direction"),
        category: t(f, "category"),
        amount: num(f, "amount"),
        description: t(f, "description"),
        document_no: t(f, "document_no") || null,
        receipt_url: receiptUrl,
        status: "AKTIF",
      });
      if (error) throw error;
    },
    "Transaksi Kas Kecil tersimpan."
  );
}

export async function addFinanceAction(f: FormData) {
  await mutate(
    "/dashboard/keuangan",
    "keuangan.write",
    async () => {
      const s = await createClient();
      const { error } = await s.from("finance_transactions").insert({
        transaction_date: date(f, "transaction_date"),
        direction: t(f, "direction"),
        category: t(f, "category"),
        amount: num(f, "amount"),
        description: t(f, "description"),
        document_no: t(f, "document_no") || null,
      });
      if (error) throw error;
    },
    "Transaksi Keuangan tersimpan."
  );
}

export async function addManufacturingAction(f: FormData) {
  const flow = t(f, "flow_type").toUpperCase();
  const permission =
    flow === "TITIPAN"
      ? "manufaktur.titipan.write"
      : flow === "BARANG_LUAR"
      ? "manufaktur.barang_luar.write"
      : flow === "PENGIRIMAN"
      ? "manufaktur.pengiriman.write"
      : "manufaktur.view";

  await mutate(
    "/dashboard/manufaktur",
    permission,
    async () => {
      const rawQty = num(f, "quantity");
      const quantity = Number(rawQty ?? 0);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Jumlah Qty harus lebih dari 0.");
      }

      const materialId = id(f, "material_id", true);
      const finishedGoodId = id(f, "finished_good_id", true);

      if (!materialId && !finishedGoodId) {
        throw new Error("Pilih Bahan Baku atau Barang Jadi terlebih dahulu.");
      }

      const description = t(f, "description");
      if (!description) {
        throw new Error("Keterangan / Catatan transaksi wajib diisi.");
      }

      await rpc("record_manufacturing_transaction", {
        p_flow_type: flow,
        p_date: date(f, "transaction_date"),
        p_project_id: id(f, "project_id", true),
        p_product_id: id(f, "product_id", true),
        p_material_id: materialId,
        p_finished_good_id: finishedGoodId,
        p_vendor_id: id(f, "vendor_id", true),
        p_quantity: quantity,
        p_unit: t(f, "unit") || null,
        p_document_no: t(f, "document_no") || null,
        p_description: description,
      });
    },
    "Transaksi Manufaktur tersimpan."
  );
}

export async function resolveEmbarkationIssueAction(f: FormData) {
  await mutate(
    "/dashboard/rejectEmbarkasi",
    "reject_embarkasi.write",
    async () => {
      const s = await createClient();
      const { error } = await s
        .from("embarkation_issues")
        .update({
          status: "SELESAI",
          resolution: t(f, "resolution") || "Diselesaikan",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", id(f, "issue_id"))
        .eq("status", "OPEN");
      if (error) throw error;
    },
    "Masalah Embarkasi diselesaikan."
  );
}

export async function cancelExternalReceiptAction(f: FormData) {
  await mutate(
    "/dashboard/barangLuar",
    "barang_luar.receive",
    async () => {
      await rpc("cancel_external_finished_receipt", {
        p_receipt_id: id(f, "receipt_id"),
        p_reason: t(f, "reason") || "Dibatalkan manual oleh user",
      });
    },
    "Penerimaan barang luar dibatalkan & stok dikembalikan."
  );
}

export async function editExternalReceiptAction(f: FormData) {
  await mutate(
    "/dashboard/barangLuar",
    "barang_luar.receive",
    async () => {
      await rpc("edit_external_finished_receipt", {
        p_receipt_id: id(f, "receipt_id"),
        p_document_no: t(f, "document_no") || null,
        p_notes: t(f, "notes") || null,
      });
    },
    "Data penerimaan barang luar diperbarui."
  );
}

export async function cancelManufacturingAction(f: FormData) {
  await mutate(
    "/dashboard/manufaktur",
    "manufaktur.view",
    async () => {
      await rpc("cancel_manufacturing_transaction", {
        p_id: id(f, "transaction_id"),
        p_reason: t(f, "reason") || "Dibatalkan manual oleh user",
      });
    },
    "Transaksi manufaktur dibatalkan."
  );
}

export async function editManufacturingAction(f: FormData) {
  await mutate(
    "/dashboard/manufaktur",
    "manufaktur.view",
    async () => {
      await rpc("edit_manufacturing_transaction", {
        p_id: id(f, "transaction_id"),
        p_document_no: t(f, "document_no") || null,
        p_description: t(f, "description") || null,
      });
    },
    "Data transaksi manufaktur diperbarui."
  );
}

export async function confirmTransferReceiptAction(f: FormData) {
  const returnPath = t(f, "return_path") || "/dashboard/transferBarangJadi";
  await mutate(
    returnPath,
    "mr_wu.confirm",
    async () => {
      const transferId = id(f, "transfer_id");
      const receivedQty = num(f, "received_qty");
      const rejectQty = num(f, "reject_qty") || 0;
      const damagedQty = num(f, "damaged_qty") || 0;
      const notes = t(f, "received_notes") || null;
      const photoUrl = t(f, "surat_jalan_photo_url") || null;

      await rpc("confirm_transfer_receipt", {
        p_transfer_id: transferId,
        p_received_qty: receivedQty,
        p_reject_qty: rejectQty,
        p_damaged_qty: damagedQty,
        p_notes: notes,
        p_photo_url: photoUrl,
      });
    },
    "Penerimaan barang dan foto surat jalan berhasil dikonfirmasi!"
  );
}

export async function updateShipmentSuratJalanPhotoAction(f: FormData) {
  const returnPath = t(f, "return_path") || "/dashboard/pengirimanEmbarkasi";
  await mutate(
    returnPath,
    "pengiriman_embarkasi.view",
    async () => {
      const shipmentId = id(f, "shipment_id");
      const photoUrl = t(f, "surat_jalan_photo_url");
      await rpc("update_shipment_surat_jalan_photo", {
        p_shipment_id: shipmentId,
        p_photo_url: photoUrl,
      });
    },
    "Foto fisik surat jalan berhasil disimpan."
  );
}

export async function processBundlePackagePackingAction(f: FormData) {
  const returnPath = t(f, "return_path") || "/dashboard/bundlingIsian";
  await mutate(
    returnPath,
    "bundling_isian.write",
    async () => {
      const componentsRaw = t(f, "components_json");
      let components = [];
      try {
        components = JSON.parse(componentsRaw || "[]");
      } catch {
        throw new Error("Data komponen packing tidak valid.");
      }

      await rpc("process_bundle_package_packing", {
        p_date: date(f, "packing_date"),
        p_package_id: id(f, "package_id"),
        p_location_id: id(f, "location_id") || 1, // Gudang Pusat
        p_quantity: num(f, "quantity"),
        p_notes: t(f, "notes") || null,
        p_components: components,
      });
    },
    "Hasil packing harian berhasil disimpan! Stok komponen satuan terpotong dan stok Paket Isian bertambah di Gudang Pusat."
  );
}

export async function savePackageRecipeAction(f: FormData) {
  const returnPath = t(f, "return_path") || "/dashboard/bundlingIsian";
  await mutate(
    returnPath,
    "bundling_isian.write",
    async () => {
      const s = await createClient();
      const packageId = id(f, "package_id");
      const itemsRaw = t(f, "recipe_items_json");
      let items: Array<{ finished_good_id: number; qty_per_bundle: number }> = [];
      try {
        items = JSON.parse(itemsRaw || "[]");
      } catch {
        throw new Error("Format data resep tidak valid.");
      }

      if (!items.length) {
        throw new Error("Pilih minimal satu barang untuk dimasukkan ke resep paket.");
      }

      const { error: delErr } = await s
        .from("bundle_package_recipes")
        .delete()
        .eq("package_id", packageId);
      if (delErr) throw delErr;

      const payload = items.map((it) => ({
        package_id: packageId,
        finished_good_id: it.finished_good_id,
        qty_per_bundle: it.qty_per_bundle,
      }));

      const { error: insErr } = await s.from("bundle_package_recipes").insert(payload);
      if (insErr) throw insErr;
    },
    "Resep paket isian berhasil disimpan!"
  );
}

export async function createBundlePackageAction(f: FormData) {
  const returnPath = t(f, "return_path") || "/dashboard/bundlingIsian";
  await mutate(
    returnPath,
    "bundling_isian.write",
    async () => {
      const s = await createClient();
      const code = t(f, "package_code").toUpperCase();
      const name = t(f, "name");
      const description = t(f, "description") || null;

      if (!code || !name) throw new Error("Kode dan nama paket wajib diisi.");

      const { error } = await s.from("bundle_packages").insert({
        package_code: code,
        name: name,
        description: description,
        status: "AKTIF",
      });
      if (error) throw error;
    },
    "Jenis paket baru berhasil dibuat."
  );
}


export async function updateBundlePackageAction(f: FormData) {
  const returnPath = t(f, "return_path") || "/dashboard/bundlingIsian";
  await mutate(
    returnPath,
    "bundling_isian.write",
    async () => {
      const s = await createClient();
      const targetId = id(f, "package_id");
      const code = t(f, "package_code").toUpperCase();
      const name = t(f, "name");
      const description = t(f, "description") || null;

      if (!code || !name) throw new Error("Kode dan nama paket wajib diisi.");

      const { error } = await s
        .from("bundle_packages")
        .update({
          package_code: code,
          name: name,
          description: description,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId);
      if (error) throw error;
    },
    "Nama dan data paket berhasil diperbarui!"
  );
}

export async function deleteBundlePackageAction(f: FormData) {
  const returnPath = t(f, "return_path") || "/dashboard/bundlingIsian";
  await mutate(
    returnPath,
    "bundling_isian.write",
    async () => {
      const s = await createClient();
      const targetId = id(f, "package_id");

      // Cegah hapus jika sudah ada transaksi packing harian yang tercatat
      const { data: packings } = await s
        .from("bundle_package_packings")
        .select("id")
        .eq("package_id", targetId)
        .limit(1);

      if (packings && packings.length > 0) {
        throw new Error("Paket tidak bisa dihapus karena sudah ada riwayat transaksi packing harian yang menggunakan paket ini.");
      }

      const { error } = await s.from("bundle_packages").delete().eq("id", targetId);
      if (error) throw error;
    },
    "Paket isian berhasil dihapus."
  );
}



