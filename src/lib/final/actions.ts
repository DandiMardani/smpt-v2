"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access/current-user";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { createClient as createStandaloneClient } from "@supabase/supabase-js";
import { logActionFailure } from "@/lib/logger";
import { checkIsCashAdvanceLocked } from "@/lib/kasbon/lock-guard";

function getAdminClient() {
  const helper = createAdminClient();
  if (helper) return helper;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serverKey) return null;
  return createStandaloneClient(url, serverKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function t(f: FormData, k: string) {
  return String(f.get(k) ?? "").trim();
}

function computeDayClassification(
  checkIn: string | null | undefined,
  checkOut: string | null | undefined
): "FULL_DAY" | "HALF_DAY" {
  if (!checkIn || !checkOut) return "FULL_DAY";
  const parseMins = (tStr: string): number | null => {
    const clean = tStr.trim();
    if (!clean || clean === "--:--") return null;
    const parts = clean.split(":");
    if (parts.length < 2) return null;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };
  const inM = parseMins(checkIn);
  const outM = parseMins(checkOut);
  if (inM === null || outM === null) return "FULL_DAY";
  const duration = outM - inM;
  if (duration <= 0) return "FULL_DAY";
  if (inM <= 9 * 60 + 30 && outM >= 11 * 60 + 30 && outM <= 14 * 60) return "HALF_DAY";
  if (inM >= 11 * 60 && inM <= 13 * 60 + 30 && outM >= 15 * 60 + 30) return "HALF_DAY";
  if (duration < 360) return "HALF_DAY";
  return "FULL_DAY";
}

function num(f: FormData, k: string, nullable = false) {
  let raw = t(f, k).replace(/^rp\.?\s*/i, "").replace(/\s+/g, "");
  if (!raw && nullable) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d+)$/.test(raw) && !raw.includes(".")) raw = raw.replace(",", ".");
  else if (raw.includes(".") && (raw.match(/\./g) || []).length > 1) raw = raw.replace(/\./g, "");
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

function go(path: string, type: "success" | "error", message: string, payload?: unknown, error?: unknown) {
  if (type === "error") {
    logActionFailure(`final/actions:${path}`, payload, error ?? message);
  }
  redirect(`${path}?${type}=${encodeURIComponent(message)}`);
}

async function rpc(name: string, args: Record<string, unknown>) {
  const s = await createClient();
  const { data, error } = await s.rpc(name, args);
  if (error) throw error;
  return data;
}

async function mutate(path: string, permission: string, fn: () => Promise<void>, success: string, payload?: unknown) {
  await requirePermission(permission);
  try {
    await fn();
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      (("digest" in e && String((e as any).digest).startsWith("NEXT_REDIRECT")) ||
        ("message" in e && (e as any).message === "NEXT_REDIRECT"))
    ) {
      throw e;
    }
    logActionFailure(`mutate:${permission}@${path}`, payload, e);
    go(path, "error", msg(e), payload, e);
  }
  revalidatePath(path);
  go(path, "success", success);
}

// === GENERAL ACTIONS ===
export async function linkWorkerAction(f: FormData) { await mutate("/dashboard/aksesUser", "access_control.write", async () => { await rpc("link_worker_account", { p_email: t(f, "email"), p_worker_id: id(f, "worker_id") }); }, "Akun berhasil dihubungkan ke pekerja."); }
export async function createSpkAction(f: FormData) { const path = "/dashboard/spk"; await requirePermission("spk.write"); let data: unknown; try { data = await rpc("create_production_order", { p_order_date: date(f, "order_date"), p_project_id: id(f, "project_id"), p_product_id: id(f, "product_id"), p_operator_worker_id: id(f, "operator_worker_id"), p_checker_email: t(f, "checker_email"), p_supervisor_worker_id: id(f, "supervisor_worker_id", true), p_due_date: date(f, "due_date", true), p_notes: t(f, "notes") || null }); } catch (e) { go(path, "error", msg(e)); } revalidatePath(path); redirect(`${path}?order=${encodeURIComponent(String(data))}&success=${encodeURIComponent("Draft SPK dibuat.")}`); }
export async function addSpkItemAction(f: FormData) { let order: number | null = null; let path = "/dashboard/spk"; try { order = id(f, "order_id"); path = `/dashboard/spk?order=${order}`; await requirePermission("spk.write"); await rpc("add_production_order_item", { p_order_id: order, p_work_item_id: id(f, "work_item_id"), p_assigned_qty: num(f, "assigned_qty") }); } catch (e) { if (e && typeof e === "object" && (("digest" in e && String((e as any).digest).startsWith("NEXT_REDIRECT")) || ("message" in e && (e as any).message === "NEXT_REDIRECT"))) throw e; logActionFailure("addSpkItemAction", f, e); redirect(order ? `${path}&error=${encodeURIComponent(msg(e))}` : `${path}?error=${encodeURIComponent(msg(e))}`); } revalidatePath("/dashboard/spk"); redirect(`${path}&success=${encodeURIComponent("Item SPK disimpan.")}`); }
export async function removeSpkItemAction(f: FormData) { let order: number | null = null; let path = "/dashboard/spk"; try { order = id(f, "order_id"); path = `/dashboard/spk?order=${order}`; await requirePermission("spk.write"); await rpc("remove_production_order_item", { p_order_id: order, p_order_item_id: id(f, "order_item_id") }); } catch (e) { if (e && typeof e === "object" && (("digest" in e && String((e as any).digest).startsWith("NEXT_REDIRECT")) || ("message" in e && (e as any).message === "NEXT_REDIRECT"))) throw e; logActionFailure("removeSpkItemAction", f, e); redirect(order ? `${path}&error=${encodeURIComponent(msg(e))}` : `${path}?error=${encodeURIComponent(msg(e))}`); } revalidatePath("/dashboard/spk"); redirect(`${path}&success=${encodeURIComponent("Item dihapus.")}`); }
export async function publishSpkAction(f: FormData) { await mutate("/dashboard/spk", "spk.write", async () => { await rpc("publish_production_order", { p_order_id: id(f, "order_id") }); }, "SPK diterbitkan dan snapshot harga/qty terkunci."); }
export async function cancelSpkAction(f: FormData) { await mutate("/dashboard/spk", "spk.write", async () => { await rpc("cancel_production_order", { p_order_id: id(f, "order_id") }); }, "SPK dibatalkan."); }
export async function checkerResultAction(f: FormData) { await mutate("/dashboard/borongan", "borongan.operate", async () => { await rpc("record_checker_result", { p_order_item_id: id(f, "order_item_id"), p_check_date: date(f, "check_date"), p_good_qty: num(f, "good_qty"), p_reject_qty: num(f, "reject_qty"), p_notes: t(f, "notes") || null }); }, "Qty Sah Checker tersimpan."); }
export async function cancelCheckerResultAction(f: FormData) { await mutate("/dashboard/borongan", "borongan.operate", async () => { await rpc("cancel_checker_result", { p_check_id: id(f, "check_id") }); }, "Input Checker dibatalkan."); }
export async function recordQcAction(f: FormData) { await mutate("/dashboard/qc", "qc.operate", async () => { await rpc("record_quality_control", { p_production_check_id: id(f, "production_check_id"), p_inspection_date: date(f, "inspection_date"), p_good_qty: num(f, "good_qty"), p_reject_qty: num(f, "reject_qty"), p_rework_qty: num(f, "rework_qty"), p_notes: t(f, "notes") || null }); }, "QC tersimpan. Qty baik masuk stok Barang Jadi PUSAT."); }
export async function cancelQcAction(f: FormData) { await mutate("/dashboard/qc", "qc.operate", async () => { await rpc("cancel_quality_control", { p_qc_id: id(f, "qc_id") }); }, "QC dibatalkan dan stok direversal."); }
export async function createReworkAction(f: FormData) { await mutate("/dashboard/qc", "qc.rework", async () => { await rpc("create_qc_rework", { p_qc_id: id(f, "qc_id"), p_quantity: num(f, "quantity"), p_notes: t(f, "notes") || null }); }, "Rework dibuat."); }
export async function completeReworkAction(f: FormData) { await mutate("/dashboard/qc", "qc.rework", async () => { await rpc("complete_qc_rework", { p_rework_id: id(f, "rework_id"), p_good_qty: num(f, "good_qty"), p_reject_qty: num(f, "reject_qty"), p_notes: t(f, "notes") || null }); }, "Rework diselesaikan."); }

export async function saveFinishedGoodAction(f: FormData) { await mutate("/dashboard/masterBarangJadi", "master_barang_jadi.write", async () => { const s = await createClient(); const targetId = id(f, "id", true); const payload = { project_id: id(f, "project_id", true), product_id: id(f, "product_id", true), name: t(f, "name"), category: t(f, "category"), unit: t(f, "unit") || "PCS", source: t(f, "source") || "INTERNAL", final_work_item_id: id(f, "final_work_item_id", true), status: t(f, "status") || "AKTIF", notes: t(f, "notes") || null }; if (targetId) { const { error } = await s.from("finished_goods").update(payload).eq("id", targetId); if (error) throw error; } else { const { error } = await s.from("finished_goods").insert(payload); if (error) throw error; } }, "Master Barang Jadi berhasil disimpan."); }
export async function deleteFinishedGoodAction(f: FormData) { await mutate("/dashboard/masterBarangJadi", "master_barang_jadi.write", async () => { const s = await createClient(); const { error } = await s.from("finished_goods").delete().eq("id", id(f, "id")); if (error) throw error; }, "Master Barang Jadi berhasil dihapus."); }
export async function saveLocationAction(f: FormData) { await mutate("/dashboard/masterLokasi", "master_lokasi.write", async () => { const s = await createClient(); const targetId = id(f, "id", true); const payload = { name: t(f, "name"), location_type: t(f, "location_type") || "GUDANG", address: t(f, "address") || null, pic_name: t(f, "pic_name") || null, phone: t(f, "phone") || null, status: t(f, "status") || "AKTIF", notes: t(f, "notes") || null }; if (targetId) { const { error } = await s.from("locations").update(payload).eq("id", targetId); if (error) throw error; } else { const { error } = await s.from("locations").insert(payload); if (error) throw error; } }, "Master Lokasi berhasil disimpan."); }
export async function deleteLocationAction(f: FormData) { await mutate("/dashboard/masterLokasi", "master_lokasi.write", async () => { const s = await createClient(); const { error } = await s.from("locations").delete().eq("id", id(f, "id")); if (error) throw error; }, "Master Lokasi berhasil dihapus."); }
export async function saveVendorAction(f: FormData) { await mutate("/dashboard/masterVendor", "master_vendor.write", async () => { const s = await createClient(); const targetId = id(f, "id", true); const payload = { name: t(f, "name"), pic_name: t(f, "pic_name") || null, phone: t(f, "phone") || null, email: t(f, "email") || null, address: t(f, "address") || null, tax_no: t(f, "tax_no") || null, bank_name: t(f, "bank_name") || null, bank_account_no: t(f, "bank_account_no") || null, bank_account_name: t(f, "bank_account_name") || null, status: t(f, "status") || "AKTIF", notes: t(f, "notes") || null }; if (targetId) { const { error } = await s.from("vendors").update(payload).eq("id", targetId); if (error) throw error; } else { const { error } = await s.from("vendors").insert(payload); if (error) throw error; } }, "Master Vendor berhasil disimpan."); }
export async function saveEmbarkationAction(f: FormData) { await mutate("/dashboard/masterEmbarkasi", "master_embarkasi.write", async () => { const s = await createClient(); const targetId = id(f, "id", true); const payload = { name: t(f, "name"), short_code: t(f, "short_code") || null, address: t(f, "address") || null, pic_name: t(f, "pic_name") || null, phone: t(f, "phone") || null, status: t(f, "status") || "AKTIF", notes: t(f, "notes") || null }; if (targetId) { const { error } = await s.from("embarkations").update(payload).eq("id", targetId); if (error) throw error; } else { const { error } = await s.from("embarkations").insert(payload); if (error) throw error; } }, "Master Embarkasi berhasil disimpan."); }
export async function deleteEmbarkationAction(f: FormData) { await mutate("/dashboard/masterEmbarkasi", "master_embarkasi.write", async () => { const s = await createClient(); const { error } = await s.from("embarkations").delete().eq("id", id(f, "id")); if (error) throw error; }, "Master Embarkasi berhasil dihapus."); }
export async function saveSetAction(f: FormData) { await mutate("/dashboard/masterSet", "master_set.write", async () => { const s = await createClient(); const targetId = id(f, "id", true); const payload = { project_id: id(f, "project_id"), name: t(f, "name"), unit: t(f, "unit") || "SET", status: t(f, "status") || "AKTIF", notes: t(f, "notes") || null }; if (targetId) { const { error } = await s.from("product_sets").update(payload).eq("id", targetId); if (error) throw error; } else { const { error } = await s.from("product_sets").insert(payload); if (error) throw error; } }, "Master Set berhasil disimpan."); }
export async function deleteSetAction(f: FormData) { await mutate("/dashboard/masterSet", "master_set.write", async () => { const s = await createClient(); const { error } = await s.from("product_sets").delete().eq("id", id(f, "id")); if (error) throw error; }, "Master Set berhasil dihapus."); }
export async function addSetComponentAction(f: FormData) { await mutate("/dashboard/masterSet", "master_set.write", async () => { const s = await createClient(); const { error } = await s.from("product_set_components").insert({ set_id: id(f, "set_id"), finished_good_id: id(f, "finished_good_id"), qty_per_set: num(f, "qty_per_set") }); if (error) throw error; }, "Komponen Set ditambahkan."); }
export async function deleteSetComponentAction(f: FormData) { await mutate("/dashboard/masterSet", "master_set.write", async () => { const s = await createClient(); const { error } = await s.from("product_set_components").delete().eq("id", id(f, "id")); if (error) throw error; }, "Komponen Set berhasil dihapus."); }

export async function transferFinishedGoodAction(f: FormData) { await mutate("/dashboard/transferBarangJadi", "transfer_barang_jadi.write", async () => { const ref = t(f, "item_ref") || (f.get("finished_good_id") ? `FINISHED_GOOD:${t(f, "finished_good_id")}` : ""); const [kind, rawId] = ref.split(":"); const itemId = Number(rawId); if (!["FINISHED_GOOD", "PACKAGE"].includes(kind) || !Number.isSafeInteger(itemId) || itemId <= 0) { throw new Error("Pilih barang satuan atau paket isian yang akan ditransfer."); } const transferDate = date(f, "transfer_date"); if (!transferDate) throw new Error("Tanggal transfer tidak valid."); const srcLoc = id(f, "source_location_id"); if (!srcLoc) throw new Error("Lokasi asal tidak valid."); const destLoc = id(f, "destination_location_id"); if (!destLoc) throw new Error("Lokasi tujuan tidak valid."); const quantity = num(f, "quantity"); if (quantity === null || quantity <= 0) throw new Error("Jumlah quantity tidak valid."); const notes = t(f, "notes") || null; if (kind === "PACKAGE") { await rpc("transfer_bundle_package", { p_date: transferDate, p_package_id: itemId, p_source_location_id: srcLoc, p_destination_location_id: destLoc, p_quantity: quantity, p_notes: notes }); } else { await rpc("transfer_finished_good", { p_date: transferDate, p_finished_good_id: itemId, p_source_location_id: srcLoc, p_destination_location_id: destLoc, p_quantity: quantity, p_notes: notes }); } }, "Transfer tersimpan. Saldo tujuan untuk paket bertambah setelah penerimaan dikonfirmasi."); }
export async function receiveExternalAction(f: FormData) { await mutate("/dashboard/barangLuar", "barang_luar.receive", async () => { await rpc("receive_external_finished_good", { p_date: date(f, "receipt_date"), p_finished_good_id: id(f, "finished_good_id"), p_vendor_id: id(f, "vendor_id", true), p_location_id: id(f, "location_id"), p_quantity: num(f, "quantity"), p_document_no: t(f, "document_no") || null, p_notes: t(f, "notes") || null }); }, "Barang luar diterima dan stok bertambah."); }
export async function packSetAction(f: FormData) { await mutate("/dashboard/packingSet", "packing_set.write", async () => { await rpc("pack_product_set", { p_date: date(f, "packing_date"), p_set_id: id(f, "set_id"), p_location_id: id(f, "location_id"), p_set_qty: num(f, "set_qty"), p_notes: t(f, "notes") || null }); }, "Packing Set selesai. Komponen PCS berkurang dan stok SET bertambah."); }
export async function processBundlingIsianAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/bundlingIsian"; await mutate(returnPath, "bundling_isian.write", async () => { const componentsRaw = t(f, "components_json"); let components: any[] = []; try { components = JSON.parse(componentsRaw || "[]"); } catch { throw new Error("Data komponen bundling tidak valid."); } if (components.length > 100) { throw new Error("Maksimal 100 komponen per transaksi bundling."); } const validatedComponents = components.map((c: any) => { if (!c || typeof c !== "object") throw new Error("Struktur data komponen bundling tidak valid."); const compId = Number(c.component_finished_good_id || c.finished_good_id); const qty = Number(c.qty_used || c.qty || c.qty_per_bundle); if (!Number.isSafeInteger(compId) || compId <= 0 || !Number.isFinite(qty) || qty <= 0) { throw new Error("Komponen bundling memuat ID atau kuantiti yang tidak valid."); } return { ...c, component_finished_good_id: compId, qty_used: qty }; }); await rpc("process_bundling_isian", { p_date: date(f, "bundling_date"), p_bundle_fg_id: id(f, "bundle_finished_good_id"), p_location_id: id(f, "location_id") || 1, p_bundle_qty: num(f, "bundle_qty"), p_notes: t(f, "notes") || null, p_components: validatedComponents }); }, "Bundling Isian berhasil! Komponen satuan terpotong dan stok Paket Isian Koper bertambah di Pabrik Pusat."); }
export async function saveBundleRecipeAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/bundlingIsian"; await mutate(returnPath, "bundling_isian.write", async () => { const s = await createClient(); const bundleFgId = id(f, "bundle_finished_good_id"); const itemsRaw = t(f, "recipe_items_json"); let items: any[] = []; try { items = JSON.parse(itemsRaw || "[]"); } catch { throw new Error("Format data komponen resep tidak valid."); } if (!items.length) { throw new Error("Pilih minimal satu barang komponen untuk dimasukkan ke resep paket."); } if (items.length > 100) { throw new Error("Maksimal 100 komponen per resep paket."); } const { error: delErr } = await s.from("bundle_recipes").delete().eq("bundle_finished_good_id", bundleFgId); if (delErr) throw delErr; const payload = items.map((it: any) => { if (!it || typeof it !== "object") throw new Error("Struktur komponen resep tidak valid."); const compId = Number(it.component_finished_good_id); const qty = Number(it.qty_per_bundle); if (!Number.isSafeInteger(compId) || compId <= 0 || !Number.isFinite(qty) || qty <= 0) { throw new Error("Komponen resep memuat ID atau kuantiti yang tidak valid."); } return { bundle_finished_good_id: bundleFgId, component_finished_good_id: compId, qty_per_bundle: qty }; }); const { error: insErr } = await s.from("bundle_recipes").insert(payload); if (insErr) throw insErr; }, "Resep susunan paket isian berhasil disimpan!"); }
export async function deleteBundleRecipeAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/bundlingIsian"; await mutate(returnPath, "bundling_isian.write", async () => { const s = await createClient(); const bundleFgId = id(f, "bundle_finished_good_id"); const { error } = await s.from("bundle_recipes").delete().eq("bundle_finished_good_id", bundleFgId); if (error) throw error; }, "Resep paket isian berhasil dihapus."); }
export async function recordMrWuDailyPackingAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/mitraMrWu"; await mutate(returnPath, "packing_set.write", async () => { await rpc("pack_product_set", { p_date: date(f, "packing_date"), p_set_id: id(f, "set_id"), p_location_id: id(f, "location_id"), p_set_qty: num(f, "set_qty"), p_notes: t(f, "notes") || "Packing Harian Pabrik Mitra MR WU" }); }, "Berhasil mencatat hasil packing SET koper di MR WU! Saldo Stok SET bertambah dan siap kirim ke Embarkasi."); }
export async function createTargetAction(f: FormData) { await mutate("/dashboard/targetEmbarkasi", "target_embarkasi.write", async () => { const ref = t(f, "item_ref"); const [kind, rawId] = ref.split(":"); const itemId = Number(rawId); if (!["FINISHED_GOOD", "SET"].includes(kind) || !Number.isSafeInteger(itemId) || itemId <= 0) { throw new Error("Item target tidak valid."); } const s = await createClient(); const { error } = await s.from("embarkation_targets").insert({ embarkation_id: id(f, "embarkation_id"), item_kind: kind, finished_good_id: kind === "FINISHED_GOOD" ? itemId : null, set_id: kind === "SET" ? itemId : null, target_qty: num(f, "target_qty"), status: "AKTIF", notes: t(f, "notes") || null }); if (error) throw error; }, "Target Embarkasi ditambahkan."); }
export async function createShipmentAction(f: FormData) { await mutate("/dashboard/pengirimanEmbarkasi", "pengiriman_embarkasi.operate", async () => { const deliveryDeadline = t(f, "delivery_deadline"); const rawNotes = t(f, "notes") || ""; const finalNotes = deliveryDeadline ? `[DATELINE: ${deliveryDeadline}] ${rawNotes}`.trim() : rawNotes || null; await rpc("create_embarkation_shipment", { p_target_id: id(f, "target_id"), p_date: date(f, "shipment_date"), p_source_location_id: id(f, "source_location_id"), p_quantity: num(f, "quantity"), p_document_no: t(f, "document_no") || null, p_driver: t(f, "driver_name") || null, p_vehicle: t(f, "vehicle_no") || null, p_notes: finalNotes }); }, "Draft pengiriman dibuat. Stok belum berubah."); }
export async function sendShipmentAction(f: FormData) { await mutate("/dashboard/pengirimanEmbarkasi", "pengiriman_embarkasi.operate", async () => { await rpc("send_embarkation_shipment", { p_shipment_id: id(f, "shipment_id") }); }, "Pengiriman DIKIRIM. Stok sumber berkurang."); }
export async function receiveShipmentAction(f: FormData) { await mutate("/dashboard/pengirimanEmbarkasi", "pengiriman_embarkasi.operate", async () => { await rpc("receive_embarkation_shipment", { p_shipment_id: id(f, "shipment_id"), p_received: num(f, "received_qty"), p_reject: num(f, "reject_qty"), p_damaged: num(f, "damaged_qty"), p_missing: num(f, "missing_qty"), p_notes: t(f, "notes") || null }); }, "Penerimaan Embarkasi dikonfirmasi."); }
export async function cancelShipmentAction(f: FormData) { await mutate("/dashboard/pengirimanEmbarkasi", "pengiriman_embarkasi.operate", async () => { await rpc("cancel_embarkation_shipment", { p_shipment_id: id(f, "shipment_id") }); }, "Pengiriman dibatalkan. Jika sudah dikirim, stok direversal."); }
export async function createEmbarkationIssueAction(f: FormData) { await mutate("/dashboard/rejectEmbarkasi", "reject_embarkasi.write", async () => { const s = await createClient(); const itemKey = t(f, "item_key"); const qtyVal = Number(num(f, "quantity") || 0); const daerah = t(f, "daerah") || "Asrama Haji"; const embarkasi = t(f, "embarkasi") || "JKS"; const keterangan = t(f, "keterangan") || t(f, "description") || "Reject / Klaim Fisik"; const tglKirim = t(f, "tgl_kirim") || new Date().toLocaleDateString("id-ID"); const noDokumen = t(f, "no_dokumen") || "-"; const statusInput = t(f, "status") || "PROSES"; const resolution = t(f, "resolution") || (statusInput === "SELESAI" ? "Sudah Terkirim" : "Menunggu Pengganti"); const { count } = await s.from("embarkation_issues").select("id", { count: "exact", head: true }); const nextNo = (count || 0) + 1; const itemQuantities: Record<string, number> = { tambahan_set: 0, koper_bagasi: 0, koper_kabin: 0, kardus: 0, paket_isian: 0, cover_bagasi: 0, cover_kabin: 0, tas_pasport: 0, tas_ransel: 0, hangtag: 0, logo_kemenag: 0, logo_aybe: 0, logo_saudi: 0, sticker: 0 }; if (itemKey && itemQuantities.hasOwnProperty(itemKey)) { itemQuantities[itemKey] = qtyVal; } else { for (const k of Object.keys(itemQuantities)) { const val = Number(f.get(k) || 0); if (val > 0) itemQuantities[k] = val; } } const totalQty = Object.values(itemQuantities).reduce((a, b) => a + b, 0) || qtyVal || 1; const descriptionJson = JSON.stringify({ no: nextNo, daerah, embarkasi, ...itemQuantities, tgl_kirim: tglKirim, no_dokumen: noDokumen, keterangan }); let shipmentId = id(f, "shipment_id", true); if (!shipmentId) { const { data: latestShipment } = await s.from("embarkation_shipments").select("id").order("id", { ascending: false }).limit(1).maybeSingle(); shipmentId = latestShipment?.id; } if (!shipmentId) throw new Error("Surat jalan pengiriman terkait tidak ditemukan."); const issueCode = `SAUDI-${String(nextNo).padStart(3, "0")}`; const { error } = await s.from("embarkation_issues").insert({ issue_code: issueCode, shipment_id: shipmentId, issue_type: t(f, "issue_type") || "REJECT", quantity: totalQty, description: descriptionJson, status: statusInput, resolution: resolution }); if (error) throw error; }, "Data reject & return embarkasi berhasil dicatat."); }
export async function updateEmbarkationIssueReturnAction(f: FormData) { await mutate("/dashboard/rejectEmbarkasi", "reject_embarkasi.write", async () => { const s = await createClient(); const issueId = id(f, "issue_id"); const noDokumen = t(f, "no_dokumen") || "-"; const tglKirim = t(f, "tgl_kirim") || new Date().toLocaleDateString("id-ID"); const statusInput = t(f, "status") || "SELESAI"; const resolution = t(f, "resolution") || "Sudah Terkirim / Masuk Embarkasi"; const { data: issue, error: fetchErr } = await s.from("embarkation_issues").select("*").eq("id", issueId).single(); if (fetchErr || !issue) throw new Error("Data klaim tidak ditemukan."); let descObj: any = {}; try { if (issue.description && issue.description.startsWith("{")) { descObj = JSON.parse(issue.description); } else { descObj = { keterangan: issue.description }; } } catch { descObj = { keterangan: issue.description }; } descObj.no_dokumen = noDokumen; descObj.tgl_kirim = tglKirim; const { error: updErr } = await s.from("embarkation_issues").update({ status: statusInput, resolution: resolution, description: JSON.stringify(descObj) }).eq("id", issueId); if (updErr) throw updErr; }, "Pengiriman return pengganti berhasil diperbarui."); }
export async function deleteEmbarkationIssueAction(f: FormData) { await mutate("/dashboard/rejectEmbarkasi", "reject_embarkasi.write", async () => { const s = await createClient(); const issueId = id(f, "issue_id"); const { error } = await s.from("embarkation_issues").delete().eq("id", issueId); if (error) throw error; }, "Catatan reject/klaim berhasil dihapus."); }

export async function addAttendanceAction(f: FormData) { const path = t(f, "return_path") || "/dashboard/absensi"; await requirePermission("absensi.write"); const s = await createClient(); const otMin = num(f, "overtime_minutes", true) ?? 0; const attStatus = t(f, "attendance_status") || "HADIR"; const actualIn = t(f, "actual_in") || null; const actualOut = t(f, "actual_out") || null; const payload: any = { worker_id: id(f, "worker_id"), attendance_date: date(f, "attendance_date"), schedule_in: t(f, "schedule_in") || null, schedule_out: t(f, "schedule_out") || null, actual_in: actualIn, actual_out: actualOut, day_class: computeDayClassification(actualIn, actualOut), attendance_status: attStatus, overtime_minutes: otMin, source: "MANUAL", notes: t(f, "notes") || null, verification_status: attStatus === "HADIR" ? "DRAFT" : "TERVERIFIKASI" }; const { error } = await s.from("attendance_records").upsert(payload, { onConflict: "worker_id,attendance_date" }); if (error) throw new Error(error.message); revalidatePath(path); }
export async function addBulkAttendanceAction(f: FormData) { const path = t(f, "return_path") || "/dashboard/absensi"; await requirePermission("absensi.write"); const s = await createClient(); const raw = f.get("items"); if (!raw || typeof raw !== "string") throw new Error("Data absensi tidak valid."); let items: any[] = []; try { const parsed = JSON.parse(raw); if (!Array.isArray(parsed)) throw new Error(); items = parsed; } catch { throw new Error("Format JSON data absensi tidak valid."); } if (items.length === 0) return; if (items.length > 500) { throw new Error("Maksimal 500 baris data absensi dalam satu kali pengiriman."); } const payload = items.map((it: any, idx: number) => { if (!it || typeof it !== "object") { throw new Error(`Data absensi baris ke-${idx + 1} tidak valid.`); } const workerId = Number(it.worker_id); if (!Number.isSafeInteger(workerId) || workerId <= 0) { throw new Error(`Baris ke-${idx + 1}: ID pekerja (worker_id) tidak valid.`); } if (!it.attendance_date || typeof it.attendance_date !== "string") { throw new Error(`Baris ke-${idx + 1}: tanggal absensi tidak valid.`); } return { worker_id: workerId, attendance_date: it.attendance_date, schedule_in: it.schedule_in || null, schedule_out: it.schedule_out || null, actual_in: it.actual_in || null, actual_out: it.actual_out || null, day_class: computeDayClassification(it.actual_in, it.actual_out), attendance_status: it.attendance_status || "HADIR", overtime_minutes: Number(it.overtime_minutes || 0), late_minutes: Number(it.late_minutes || 0), late_deduction: Number(it.late_deduction || 0), source: it.source || "MANUAL", notes: it.notes || null, verification_status: it.verification_status || (it.attendance_status === "HADIR" ? "DRAFT" : "TERVERIFIKASI") }; }); for (let i = 0; i < payload.length; i += 100) { const chunk = payload.slice(i, i + 100); const { error } = await s.from("attendance_records").upsert(chunk, { onConflict: "worker_id,attendance_date" }); if (error) throw new Error(error.message); } revalidatePath(path); }
export async function verifyAttendanceAction(f: FormData) { const path = t(f, "return_path") || "/dashboard/absensi"; await requirePermission("absensi.write"); const attId = id(f, "attendance_id"); const s = await createClient(); const { data: rec } = await s.from("attendance_records").select("actual_in, actual_out").eq("id", attId).single(); const computedDayClass = computeDayClassification(rec?.actual_in, rec?.actual_out); await rpc("verify_attendance", { p_attendance_id: attId, p_day_class: computedDayClass, p_overtime_minutes: num(f, "overtime_minutes"), p_notes: t(f, "notes") || null }); revalidatePath(path); }
export async function autoFixMissingOutAttendanceAction(f: FormData) { const path = t(f, "return_path") || "/dashboard/absensi"; await mutate(path, "absensi.write", async () => { const s = await createClient(); const startDate = date(f, "start_date", true); const endDate = date(f, "end_date", true); let query = s.from("attendance_records").select("id, actual_in, actual_out, attendance_date, attendance_status, day_class"); if (startDate) query = query.gte("attendance_date", startDate); if (endDate) query = query.lte("attendance_date", endDate); const { data: records, error } = await query; if (error) throw error; const now = new Date().toISOString(); const absentIds: number[] = []; const weekdayFixes: Array<{ id: number; dayClass: string }> = []; const saturdayFixes: Array<{ id: number; dayClass: string }> = []; for (const r of (records || [])) { const hasIn = r.actual_in && r.actual_in !== "--:--" && r.actual_in.trim() !== ""; const hasOut = r.actual_out && r.actual_out !== "--:--" && r.actual_out.trim() !== ""; const d = new Date(r.attendance_date + "T00:00:00Z"); const dayOfWeek = d.getUTCDay(); if (!hasIn) { if (r.attendance_status === "HADIR" || r.day_class || hasOut) { absentIds.push(r.id); } } else { if (dayOfWeek === 6) { if (!hasOut || r.actual_out === "17:00:00" || r.actual_out === "17:00") { saturdayFixes.push({ id: r.id, dayClass: computeDayClassification(r.actual_in, "15:00:00") }); } } else if (dayOfWeek >= 1 && dayOfWeek <= 5) { if (!hasOut) { weekdayFixes.push({ id: r.id, dayClass: computeDayClassification(r.actual_in, "17:00:00") }); } } } } for (let i = 0; i < absentIds.length; i += 100) { const chunk = absentIds.slice(i, i + 100); await s.from("attendance_records").update({ actual_in: null, actual_out: null, day_class: null, overtime_minutes: 0, attendance_status: "ALPHA", verification_status: "TERVERIFIKASI", notes: "Otomatis Alpha (tidak ada scan masuk)", updated_at: now }).in("id", chunk); } for (const fix of saturdayFixes) { await s.from("attendance_records").update({ actual_out: "15:00:00", day_class: fix.dayClass, overtime_minutes: 0, attendance_status: "HADIR", notes: "Pulang normal Sabtu 15:00 (lupa finger)", updated_at: now }).eq("id", fix.id); } for (const fix of weekdayFixes) { await s.from("attendance_records").update({ actual_out: "17:00:00", day_class: fix.dayClass, overtime_minutes: 0, attendance_status: "HADIR", notes: "Pulang normal 17:00 (lupa finger)", updated_at: now }).eq("id", fix.id); } }, "Absensi diperbaiki otomatis!"); }
export async function verifyBulkAttendanceAction(f: FormData) { const path = t(f, "return_path") || "/dashboard/absensi"; await requirePermission("absensi.write"); const s = await createClient(); const { data: { user } } = await s.auth.getUser(); const rawItems = t(f, "items"); let itemsToVerify: Array<{ id: number; day_class?: string; overtime_minutes?: number; notes?: string }> = []; if (rawItems) { try { const parsed = JSON.parse(rawItems); if (!Array.isArray(parsed)) throw new Error(); itemsToVerify = parsed; } catch { throw new Error("Format data verifikasi massal tidak valid."); } if (itemsToVerify.length > 500) { throw new Error("Maksimal 500 data absensi dalam sekali verifikasi massal."); } for (const it of itemsToVerify) { if (!it || typeof it !== "object" || !Number.isSafeInteger(Number(it.id)) || Number(it.id) <= 0) { throw new Error("Data verifikasi memuat ID absensi yang tidak valid."); } } } else { const rawIds = t(f, "attendance_ids"); const ids = rawIds.split(",").map((x) => Number(x.trim())).filter((x) => x > 0); const defaultOt = num(f, "default_overtime_minutes", true) ?? 0; itemsToVerify = ids.map((attId) => ({ id: attId, overtime_minutes: defaultOt })); } if (!itemsToVerify.length) throw new Error("Pilih minimal satu data absensi untuk diverifikasi."); const allIds = itemsToVerify.map((it) => it.id); const { data: dbRecords, error: fetchErr } = await s.from("attendance_records").select("id, actual_in, actual_out").in("id", allIds); if (fetchErr) throw new Error(fetchErr.message); const dbMap = new Map<number, { actual_in: string | null; actual_out: string | null }>(); for (const r of (dbRecords || [])) { dbMap.set(r.id, { actual_in: r.actual_in, actual_out: r.actual_out }); } const now = new Date().toISOString(); for (let i = 0; i < itemsToVerify.length; i += 100) { const chunk = itemsToVerify.slice(i, i + 100); for (const it of chunk) { const dbRec = dbMap.get(it.id); const computedDayClass = computeDayClassification(dbRec?.actual_in, dbRec?.actual_out); const ot = Math.max(0, Math.round(Number(it.overtime_minutes || 0))); const { error: batchErr } = await s.from("attendance_records").update({ day_class: computedDayClass, overtime_minutes: ot, verification_status: "TERVERIFIKASI", verified_by: user?.id, verified_at: now, updated_at: now }).eq("id", it.id); if (batchErr) throw new Error(batchErr.message); } } revalidatePath(path); }
export async function unverifyAttendanceAction(f: FormData) { const path = t(f, "return_path") || "/dashboard/absensi"; await requirePermission("absensi.write"); const s = await createClient(); const attId = id(f, "attendance_id"); const { error } = await s.from("attendance_records").update({ verification_status: "DRAFT", verified_by: null, verified_at: null, updated_at: new Date().toISOString() }).eq("id", attId); if (error) throw new Error(error.message); revalidatePath(path); }
export async function deleteAttendanceAction(f: FormData) { const path = t(f, "return_path") || "/dashboard/absensi"; await requirePermission("absensi.write"); const s = await createClient(); const attId = id(f, "attendance_id"); const { data: att, error: fetchErr } = await s.from("attendance_records").select("id, attendance_date").eq("id", attId).single(); if (fetchErr || !att) throw new Error("Data absensi tidak ditemukan."); const { data: finalRuns } = await s.from("payroll_runs").select("id, payroll_code, period_start, period_end").eq("status", "FINAL").lte("period_start", att.attendance_date).gte("period_end", att.attendance_date); if (finalRuns && finalRuns.length > 0) { throw new Error(`Data absensi tidak dapat dihapus karena sudah masuk payroll final (${finalRuns[0].payroll_code}).`); } const { error: delErr } = await s.from("attendance_records").delete().eq("id", attId); if (delErr) throw new Error(delErr.message); revalidatePath(path); }
export async function deleteBulkAttendanceAction(f: FormData) { const path = t(f, "return_path") || "/dashboard/absensi"; await requirePermission("absensi.write"); const s = await createClient(); const rawIds = t(f, "attendance_ids"); const ids = rawIds ? rawIds.split(",").map((x) => Number(x.trim())).filter((x) => x > 0) : []; if (!ids.length) throw new Error("Pilih data absensi yang ingin dihapus."); const { data: recs, error: rErr } = await s.from("attendance_records").select("id, attendance_date").in("id", ids); if (rErr || !recs || !recs.length) throw new Error("Data absensi tidak ditemukan."); const dates = recs.map((r) => r.attendance_date); const minDate = dates.reduce((a, b) => (a < b ? a : b)); const maxDate = dates.reduce((a, b) => (a > b ? a : b)); const { data: finalRuns } = await s.from("payroll_runs").select("id, payroll_code, period_start, period_end").eq("status", "FINAL").lte("period_start", maxDate).gte("period_end", minDate); const lockedDates = new Set<string>(); (finalRuns || []).forEach((run) => { recs.forEach((r) => { if (r.attendance_date >= run.period_start && r.attendance_date <= run.period_end) lockedDates.add(r.attendance_date); }); }); const deletableIds = recs.filter((r) => !lockedDates.has(r.attendance_date)).map((r) => r.id); if (deletableIds.length === 0) throw new Error("Semua data yang dipilih sudah terkunci dalam payroll yang sudah dibayar."); const { error: delErr } = await s.from("attendance_records").delete().in("id", deletableIds); if (delErr) throw new Error(delErr.message); revalidatePath(path); }

// =========================================================================
// FINAL CORE SINKRONISASI (ANTI-NYASAR & SUPER KILAT)
// =========================================================================

const KNOWN_PAYROLL_RUN_ITEM_COLUMNS = new Set([
  "payroll_run_id", "worker_id", "worker_name_snapshot", "pay_system_snapshot", "daily_wage_snapshot",
  "monthly_salary_snapshot", "full_days", "half_days", "overtime_minutes", "base_amount", "meal_amount",
  "overtime_amount", "overtime_bonus", "holiday_bonus", "holiday_manual_amount", "pending_count",
  "kasbon_perusahaan_amount", "kasbon_warung_amount", "manual_overtime_hours", "manual_overtime_amount",
  "deduction_amount", "net_amount", "payment_status"
]);

function filterValidPayrollItemColumns(payload: Record<string, any>, allowedSet?: Set<string>): Record<string, any> {
  const allowed = allowedSet && allowedSet.size > 0 ? allowedSet : KNOWN_PAYROLL_RUN_ITEM_COLUMNS;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (allowed.has(key)) result[key] = value;
  }
  return result;
}

export async function syncPayrollAdvancesCore(runId: number) {
  await requirePermission("payroll.write");
  const s = await createClient();
  const admin = getAdminClient();
  const db = admin || s;

  const { data: run, error: rErr } = await db.from("payroll_runs").select("*").eq("id", runId).single();
  if (rErr || !run) throw new Error("Data payroll run tidak ditemukan.");

  const { data: existingItems } = await db.from("payroll_run_items").select("*").eq("payroll_run_id", runId);
  const allowedDbCols = existingItems && existingItems.length > 0 ? new Set(Object.keys(existingItems[0])) : KNOWN_PAYROLL_RUN_ITEM_COLUMNS;

  const { data: allWorkers } = await db.from("workers").select("*");
  const workerMap = new Map<number, any>((allWorkers ?? []).map((w: any) => [w.id, w]));

  const { data: settingsRows } = await db.from("payroll_settings").select("key, value_numeric, value_text");
  const settingsMap = new Map<string, any>();
  (settingsRows ?? []).forEach((r: any) => { if (r.key) settingsMap.set(String(r.key).toLowerCase().trim(), r.value_numeric ?? r.value_text); });

  const monthlyDivider = Number(settingsMap.get("monthly_overtime_divider") || settingsMap.get("overtime_divider_monthly") || 190);
  const bulananOt4hBonus = Number(settingsMap.get("monthly_overtime_bonus_rate") || settingsMap.get("overtime_bonus_bulanan") || 17500);
  const mealFullDayRate = Number(settingsMap.get("meal_allowance_daily") || settingsMap.get("uang_makan_full_day") || 50000);
  const mealHalfDayRate = Number(settingsMap.get("meal_allowance_half_day") || settingsMap.get("uang_makan_half_day") || 25000);
  const mealSundayRate = Number(settingsMap.get("sunday_meal_allowance") || settingsMap.get("uang_makan_minggu") || 50000);

  const bulananReferenceNames = ["SURATNO", "DANDI MARDANI", "USMAN ALAMSYAH", "JAJANG ROSADI", "SUHERMANTO", "SUHERMAN", "NEDIH"];
  const bulananWorkers = (allWorkers ?? []).filter((w: any) => {
    const ps = String(w.pay_system || "").toUpperCase().trim();
    if (ps === "BULANAN") return true;
    return bulananReferenceNames.some((bn) => String(w.name || "").toUpperCase().trim().includes(bn));
  });

  if (bulananWorkers.length > 0) {
    const bulananIds = bulananWorkers.map((w: any) => w.id);
    const { data: bulananAtts } = await db.from("attendance_records").select("worker_id").in("worker_id", bulananIds).gte("attendance_date", run.period_start).lte("attendance_date", run.period_end).eq("attendance_status", "HADIR").neq("verification_status", "DITOLAK");
    const activeBulananIds = new Set((bulananAtts ?? []).map((a: any) => a.worker_id));
    if (activeBulananIds.size > 0) {
      const existingWorkerIds = new Set((existingItems ?? []).map((i: any) => i.worker_id));
      const toInsert = bulananWorkers.filter((w: any) => activeBulananIds.has(w.id) && !existingWorkerIds.has(w.id)).map((w: any) => filterValidPayrollItemColumns({
        payroll_run_id: runId, worker_id: w.id, worker_name_snapshot: String(w.name || "-"), pay_system_snapshot: "BULANAN",
        daily_wage_snapshot: Number(w.daily_salary || w.daily_rate || 0), monthly_salary_snapshot: Number(w.monthly_salary || w.base_salary || 0),
        full_days: 0, half_days: 0, overtime_minutes: 0, base_amount: 0, meal_amount: 0, overtime_amount: 0, overtime_bonus: 0, holiday_bonus: 0,
        kasbon_perusahaan_amount: 0, kasbon_warung_amount: 0, deduction_amount: 0, net_amount: 0,
      }, allowedDbCols));
      if (toInsert.length > 0) {
        let { error: insErr } = await db.from("payroll_run_items").insert(toInsert);
        if (insErr && insErr.message.includes("Could not find the")) {
          const matchCol = insErr.message.match(/Could not find the '([^']+)' column/i);
          if (matchCol && matchCol[1]) {
            const badCol = matchCol[1];
            const retryItems = toInsert.map((item: any) => { const copy = { ...item }; delete copy[badCol]; return copy; });
            await db.from("payroll_run_items").insert(retryItems);
          }
        }
      }
    }
  }

  const { data: runItems, error: itemsErr } = await db.from("payroll_run_items").select("*").eq("payroll_run_id", runId);
  if (itemsErr || !runItems || !runItems.length) throw new Error(itemsErr?.message || "Rincian payroll tidak ditemukan.");
  const workerIds = runItems.map((i) => i.worker_id);

  const runStartDt = new Date(run.period_start + "T00:00:00Z");
  runStartDt.setUTCDate(runStartDt.getUTCDate() - 7);
  const searchStart = runStartDt.toISOString().slice(0, 10);

  const { data: attRecords } = await db.from("attendance_records")
    .select("id, worker_id, day_class, overtime_minutes, manual_overtime_hours, attendance_date, attendance_status, late_deduction, notes, verification_status")
    .gte("attendance_date", searchStart)
    .lte("attendance_date", run.period_end)
    .neq("verification_status", "DITOLAK");
  
  const attList = attRecords ?? [];

  const { data: advances } = await db.from("cash_advances").select("id, worker_id, amount, paid_amount, category, installment_amount, status").in("worker_id", workerIds).eq("status", "AKTIF");
  const advList = advances ?? [];

  let totalRunGross = 0; let totalRunDeduction = 0; let totalRunNet = 0;
  const allQualifyingAtts: any[] = [];
  const batchItemUpdates: any[] = []; // Penampung Upsert Instan (Anti-Lemot 15 dtk)

  // LOGIKA BARU ANTI-BOCOR 18 JAM
  for (const it of runItems) {
    const w = workerMap.get(it.worker_id);
    let paySystem = String(it.pay_system_snapshot || w?.pay_system || "").toUpperCase().trim();
    if (!paySystem && w?.name && bulananReferenceNames.some((bn) => String(w.name).toUpperCase().includes(bn))) paySystem = "BULANAN";
    if (!paySystem) paySystem = "HARIAN";

    let totalOtMinutes = 0;
    let count4hBulanan = 0;
    let count4hHarian = 0;
    let totalLateDeduction = 0;
    
    const currentPeriodAtts = [];
    const qualifyingAttsForWorker = [];

    for (const a of attList) {
      if (a.worker_id !== it.worker_id || a.attendance_status !== "HADIR" || a.verification_status === "DITOLAK") continue;

      const d = new Date(a.attendance_date + "T00:00:00Z");
      const isJumat = d.getUTCDay() === 5;
      const isHarianWorker = paySystem !== "BULANAN";
      const rawDayOt = Number(a.overtime_minutes || 0) + (Number(a.manual_overtime_hours || 0) * 60);
      
      const isFridayCutoff = isJumat && isHarianWorker && rawDayOt > 0;
      const hasCutoffNote = String(a.notes || "").toLowerCase().includes("cutoff") || String(a.notes || "").toLowerCase().includes("slip depan");
      const isCutoff = isFridayCutoff || hasCutoffNote;

      const isInsideCurrentPeriod = a.attendance_date >= run.period_start && a.attendance_date <= run.period_end;
      const isPreviousPeriod = a.attendance_date < run.period_start && a.attendance_date >= searchStart;

      // 1. Gaji Pokok & Telat HANYA dihitung untuk hari fisik yang pas di periode ini
      if (isInsideCurrentPeriod) {
          currentPeriodAtts.push(a);
          if (a.day_class !== "HALF_DAY") totalLateDeduction += Number(a.late_deduction || 0);
      }

      // 2. FILTER LEMBUR KETAT:
      // Lembur valid jika: ADA di periode ini DAN BUKAN CUTOFF, ATAU ada di minggu lalu DAN MERUPAKAN CUTOFF.
      const isValidCurrentOT = isInsideCurrentPeriod && !isCutoff;
      const isValidLookbackOT = isPreviousPeriod && isCutoff;

      if (isValidCurrentOT || isValidLookbackOT) {
          totalOtMinutes += rawDayOt;
          if (paySystem === "BULANAN") {
              const isSunday = d.getUTCDay() === 0;
              if (isSunday ? rawDayOt >= 720 : rawDayOt >= 240) count4hBulanan++;
          } else {
              if (rawDayOt >= 240) count4hHarian++;
          }
      }

      if (isInsideCurrentPeriod || isValidLookbackOT) {
          qualifyingAttsForWorker.push(a);
      }
    }

    allQualifyingAtts.push(...qualifyingAttsForWorker);

    const fullDays = currentPeriodAtts.filter((a) => a.day_class === "FULL_DAY").length;
    const halfDays = currentPeriodAtts.filter((a) => a.day_class === "HALF_DAY").length;

    let baseAmt = 0; let mealAmt = 0; let otAmt = 0; let manualOtAmt = 0; let otBonus = 0; let holidayBonus = 0;

    if (paySystem === "BULANAN") {
      if (run.payroll_type === "BULANAN") {
        baseAmt = Number(w?.monthly_salary ?? w?.base_salary ?? it.monthly_salary_snapshot ?? it.base_amount ?? 0);
        mealAmt = 0;
        const hourlyRate = baseAmt > 0 && monthlyDivider > 0 ? Math.round((baseAmt / monthlyDivider) * 100) / 100 : 0;
        otAmt = Math.round((totalOtMinutes / 60) * hourlyRate * 100) / 100;
        manualOtAmt = Number(it.manual_overtime_amount || 0);
        otBonus = count4hBulanan * bulananOt4hBonus;
        holidayBonus = 0;
      } else {
        baseAmt = 0; otAmt = 0; manualOtAmt = 0;
        const sundayAtts = currentPeriodAtts.filter((a) => new Date(a.attendance_date + "T00:00:00Z").getUTCDay() === 0);
        const nonSundayAtts = currentPeriodAtts.filter((a) => new Date(a.attendance_date + "T00:00:00Z").getUTCDay() !== 0);
        const fullDaysNonSun = nonSundayAtts.filter((a) => a.day_class === "FULL_DAY").length;
        const halfDaysNonSun = nonSundayAtts.filter((a) => a.day_class === "HALF_DAY").length;
        mealAmt = (fullDaysNonSun * mealFullDayRate) + (halfDaysNonSun * mealHalfDayRate) + (sundayAtts.length * mealSundayRate);
        otBonus = count4hBulanan * bulananOt4hBonus;
        holidayBonus = 0;
      }
    } else {
      const dailyRate = Number(w?.daily_salary ?? w?.daily_rate ?? w?.rate_per_day ?? it.daily_wage_snapshot ?? 0);
      baseAmt = fullDays > 0 || halfDays > 0 ? Math.round((fullDays + halfDays * 0.5) * dailyRate) : 0;
      mealAmt = 0;
      const hourlyRate = dailyRate > 0 ? Math.round((dailyRate / 8) * 100) / 100 : 0;
      otAmt = Math.round((totalOtMinutes / 60) * hourlyRate * 100) / 100;
      manualOtAmt = Number(it.manual_overtime_amount || 0);
      otBonus = count4hHarian * 5000;
      const sundayCount = currentPeriodAtts.filter((a) => new Date(a.attendance_date + "T00:00:00Z").getUTCDay() === 0).length;
      holidayBonus = sundayCount * 20000;
    }

    let kasbonP = 0; let kasbonW = 0;
    if (paySystem === "BULANAN" && run.payroll_type !== "BULANAN") {
      kasbonP = 0; kasbonW = 0;
    } else {
      const workerAdvs = advList.filter((a) => a.worker_id === it.worker_id);
      const baseKasbonP = workerAdvs.filter((a) => a.category === "KASBON_PERUSAHAAN").reduce((sum, a) => {
        const rem = Math.max(0, Number(a.amount) - Number(a.paid_amount));
        const inst = Number(a.installment_amount || 0);
        return sum + (inst > 0 ? Math.min(inst, rem) : rem);
      }, 0);
      kasbonP = baseKasbonP + totalLateDeduction;
      kasbonW = workerAdvs.filter((a) => a.category === "KASBON_WARUNG").reduce((sum, a) => sum + Math.max(0, Number(a.amount) - Number(a.paid_amount)), 0);
    }

    let gross = baseAmt + mealAmt + otAmt + manualOtAmt + otBonus + holidayBonus;
    if (paySystem === "BULANAN" && run.payroll_type !== "BULANAN") gross = mealAmt;
    
    const deduction = kasbonP + kasbonW;
    const net = Math.max(0, Math.round((gross - deduction) * 100) / 100);

    totalRunGross += gross;
    totalRunDeduction += deduction;
    totalRunNet += net;

    batchItemUpdates.push(filterValidPayrollItemColumns({
      id: it.id, 
      payroll_run_id: runId,
      worker_id: it.worker_id,
      worker_name_snapshot: it.worker_name_snapshot || w?.name || null,
      pay_system_snapshot: paySystem,
      monthly_salary_snapshot: Number(w?.monthly_salary || w?.base_salary || it.monthly_salary_snapshot || 0),
      daily_wage_snapshot: Number(w?.daily_salary || w?.daily_rate || it.daily_wage_snapshot || 0),
      full_days: fullDays,
      half_days: halfDays,
      overtime_minutes: totalOtMinutes,
      base_amount: baseAmt,
      meal_amount: mealAmt,
      overtime_amount: otAmt,
      manual_overtime_amount: manualOtAmt,
      overtime_bonus: otBonus,
      holiday_bonus: holidayBonus,
      kasbon_perusahaan_amount: kasbonP,
      kasbon_warung_amount: kasbonW,
      deduction_amount: deduction,
      net_amount: net,
    }, allowedDbCols));
  }

  // EKSEKUSI BATCH UPSERT SEKALIGUS (Ini yang bikin Instan)
  if (batchItemUpdates.length > 0) {
    const { error: batchErr } = await db.from("payroll_run_items").upsert(batchItemUpdates, { onConflict: "id" });
    if (batchErr) {
       for (const updatePayload of batchItemUpdates) {
          const id = updatePayload.id;
          delete updatePayload.id;
          await db.from("payroll_run_items").update(updatePayload).eq("id", id);
       }
    }
  }

  if (allQualifyingAtts.length > 0) {
    const detailPayloads = allQualifyingAtts.map((a) => ({
      payroll_run_id: runId,
      attendance_id: a.id,
      worker_id: a.worker_id,
      attendance_date: a.attendance_date,
      attendance_status: a.attendance_status || "HADIR",
      day_class: a.day_class || "FULL_DAY",
      overtime_approved_minutes: Number(a.overtime_minutes || 0) + (Number(a.manual_overtime_hours || 0) * 60),
      source_hash: `${runId}-${a.id}-${a.attendance_date}`,
    }));
    await db.from("payroll_run_details").upsert(detailPayloads, { onConflict: "payroll_run_id,attendance_id" });
  }

  await db.from("payroll_runs").update({
    total_gross: totalRunGross,
    total_deduction: totalRunDeduction,
    total_net: totalRunNet,
  }).eq("id", runId);
}

// === SISA ACTIONS ===
export async function finalizePayrollAction(f: FormData) { await mutate("/dashboard/payroll", "payroll.write", async () => { const s = await createClient(); const pType = t(f, "payroll_type"); const pStart = date(f, "period_start"); const pEnd = date(f, "period_end"); const pNotes = t(f, "notes") || null; let runId: number | null = null; try { const res = await rpc("finalize_general_payroll", { p_type: pType, p_start: pStart, p_end: pEnd, p_notes: pNotes }); if (res) runId = Number(res); } catch (err) { const errMsg = err && typeof err === "object" && "message" in err ? String(err.message) : String(err || ""); if (errMsg.includes("payroll_runs_period_uq") || errMsg.includes("duplicate key") || errMsg.includes("Payroll periode ini sudah ada")) { const { data: existing } = await s.from("payroll_runs").select("id, status").eq("payroll_type", pType).eq("period_start", pStart).eq("period_end", pEnd).neq("status", "DIBATALKAN").order("id", { ascending: false }).limit(1).maybeSingle(); if (existing?.id) { runId = existing.id; const admin = getAdminClient(); const db = admin || s; await db.from("payroll_runs").update({ notes: pNotes, status: "FINAL", finalized_at: new Date().toISOString() }).eq("id", runId); } else { throw err; } } else { throw err; } } if (runId) { await syncPayrollAdvancesCore(Number(runId)); } }, "Payroll berhasil dibuat dan disinkronkan dari absensi terverifikasi."); }
export async function finalizeOperatorPayrollAction(f: FormData) { await mutate("/dashboard/payroll", "payroll.write", async () => { await rpc("finalize_operator_payroll", { p_start: date(f, "period_start"), p_end: date(f, "period_end"), p_notes: t(f, "notes") || null }); }, "Payroll Operator difinalisasi dari Qty Sah Checker + hasil manual HARIAN."); }
export async function updatePayrollItemAction(f: FormData) { const path = "/dashboard/payroll"; await mutate(path, "payroll.write", async () => { const s = await createClient(); const itemId = id(f, "item_id"); const { data: item, error: fetchErr } = await s.from("payroll_run_items").select("*").eq("id", itemId).single(); if (fetchErr || !item) throw new Error("Item payroll tidak ditemukan."); const baseAmount = num(f, "base_amount", true) ?? Number(item.base_amount || 0); const mealAmount = num(f, "meal_amount", true) ?? Number(item.meal_amount || 0); const overtimeAmount = num(f, "overtime_amount", true) ?? Number(item.overtime_amount || 0); const manualOt = num(f, "manual_overtime_amount", true) ?? Number(item.manual_overtime_amount || 0); const bonus = num(f, "overtime_bonus", true) ?? Number(item.overtime_bonus || 0); const holidayBonus = num(f, "holiday_bonus", true) ?? Number(item.holiday_bonus || 0); const kasbonPerusahaan = num(f, "kasbon_perusahaan_amount", true) ?? Number(item.kasbon_perusahaan_amount || 0); const kasbonWarung = num(f, "kasbon_warung_amount", true) ?? Number(item.kasbon_warung_amount || 0); const totalDeduction = num(f, "deduction_amount", true) ?? (kasbonPerusahaan + kasbonWarung); const otMinRaw = num(f, "overtime_minutes", true); const overtimeMinutes = otMinRaw !== null ? Math.round(otMinRaw) : (item.overtime_minutes ?? 0); const manualOtHoursRaw = num(f, "manual_overtime_hours", true); const manualOvertimeHours = manualOtHoursRaw !== null ? manualOtHoursRaw : Number(item.manual_overtime_hours || 0); await rpc("update_payroll_item_manual", { p_item_id: itemId, p_base_amount: baseAmount, p_meal_amount: mealAmount, p_overtime_amount: overtimeAmount, p_manual_overtime_amount: manualOt, p_overtime_bonus: bonus, p_holiday_bonus: holidayBonus, p_kasbon_perusahaan_amount: kasbonPerusahaan, p_kasbon_warung_amount: kasbonWarung, p_deduction_amount: totalDeduction, p_overtime_minutes: overtimeMinutes, p_manual_overtime_hours: manualOvertimeHours }); }, "Koreksi upah dan rincian payroll berhasil disimpan."); }
export async function syncPayrollAdvancesAction(f: FormData) { const path = "/dashboard/payroll"; await mutate(path, "payroll.write", async () => { const runId = id(f, "run_id"); if (!runId) throw new Error("ID run tidak valid."); await syncPayrollAdvancesCore(runId); }, "Sinkronisasi berhasil: data kehadiran, lembur cutoff (Slip Depan), potongan telat, uang makan, dan kasbon telah dihitung ulang."); }
export async function syncPayrollMasterSalaryAction(f: FormData) { return syncPayrollAdvancesAction(f); }
export async function updateOperatorPayrollItemAction(f: FormData) { const path = "/dashboard/payroll"; await mutate(path, "payroll.write", async () => { const s = await createClient(); const itemId = id(f, "item_id"); const { data: item, error: fetchErr } = await s.from("operator_payroll_items").select("*").eq("id", itemId).single(); if (fetchErr || !item) throw new Error("Item payroll operator tidak ditemukan."); const qtyApproved = num(f, "qty_approved", true) ?? Number(item.qty_approved || 0); const opPrice = num(f, "operator_price", true) ?? Number(item.operator_price_snapshot || 0); const subPrice = num(f, "submission_price", true) ?? Number(item.submission_price_snapshot || 0); const opVal = num(f, "operator_value", true) ?? Math.round(qtyApproved * opPrice * 100) / 100; const subVal = num(f, "submission_value", true) ?? Math.round(qtyApproved * subPrice * 100) / 100; const { error: updateErr } = await s.from("operator_payroll_items").update({ qty_approved: qtyApproved, operator_price_snapshot: opPrice, submission_price_snapshot: subPrice, operator_value: opVal, submission_value: subVal }).eq("id", itemId); if (updateErr) throw updateErr; const { data: runItems, error: rItemsErr } = await s.from("operator_payroll_items").select("operator_value, submission_value").eq("run_id", item.run_id); if (!rItemsErr && runItems) { const totOp = runItems.reduce((acc, x) => acc + Number(x.operator_value || 0), 0); const totSub = runItems.reduce((acc, x) => acc + Number(x.submission_value || 0), 0); await s.from("operator_payroll_runs").update({ total_operator_value: Math.round(totOp * 100) / 100, total_submission_value: Math.round(totSub * 100) / 100 }).eq("id", item.run_id); } }, "Koreksi payroll operator borongan berhasil disimpan."); }
export async function togglePayrollPaymentStatusAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/payroll"; await mutate(returnPath, "payroll.write", async () => { const s = await createClient(); const runType = t(f, "run_type"); const runId = id(f, "run_id"); const targetStatus = t(f, "payment_status") || "SUDAH_DIBAYAR"; if (runType === "OPERATOR") { const { data: run, error: rErr } = await s.from("operator_payroll_runs").select("*").eq("id", runId).single(); if (rErr || !run) throw new Error("Run operator tidak ditemukan."); let notes = run.notes || ""; notes = notes.replace(/\[STATUS:\s*(SUDAH_DIBAYAR|BELUM_DIBAYAR|SUDAH DIBAYAR|BELUM DIBAYAR)\]/gi, "").trim(); const newNotes = `[STATUS: ${targetStatus}] ${notes}`.trim(); const { error } = await s.from("operator_payroll_runs").update({ notes: newNotes }).eq("id", runId); if (error) throw error; } else { const { data: run, error: rErr } = await s.from("payroll_runs").select("*").eq("id", runId).single(); if (rErr || !run) throw new Error("Run payroll tidak ditemukan."); const cfg = typeof run.config_snapshot === "object" && run.config_snapshot !== null ? { ...run.config_snapshot } : {}; const normalizedStatus = targetStatus.replace(/_/g, " ").trim(); cfg.payment_status = normalizedStatus; cfg.payment_status_code = targetStatus; cfg.payment_updated_at = new Date().toISOString(); const { error } = await s.from("payroll_runs").update({ config_snapshot: cfg }).eq("id", runId); if (error) throw error; } }, "Status pembayaran payroll berhasil diubah."); }
export async function savePayrollShiftSettingsAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/payroll"; await mutate(returnPath, "payroll.write", async () => { const rawSettings = t(f, "settings_json"); let settings: Record<string, unknown> = {}; if (rawSettings) { try { settings = JSON.parse(rawSettings); } catch { throw new Error("Format pengaturan tidak valid."); } } else { const keys = ["SHIFT_WEEKDAY_IN", "SHIFT_WEEKDAY_OUT", "SHIFT_SATURDAY_OUT", "SHIFT_SUNDAY_IN", "SHIFT_SUNDAY_OUT", "OT_DIVISOR_HARIAN", "OT_BONUS_HARIAN_4H", "HARIAN_HOLIDAY_BONUS_FULL", "HARIAN_HOLIDAY_BONUS_HALF", "OT_DIVISOR_BULANAN", "OT_BONUS_BULANAN_4H", "MEAL_FULL", "MEAL_HALF", "BULANAN_SUNDAY_MEAL", "FRIDAY_OVERTIME_NEXT_WEEK"]; for (const k of keys) { const val = f.get(k); if (val !== null && val !== undefined) { settings[k] = String(val).trim(); } } } await rpc("save_payroll_shift_settings", { p_settings: settings }); }, "Pengaturan jam kerja & tarif lembur berhasil disimpan."); }
export async function addCashAdvanceAction(f: FormData) { await mutate("/dashboard/kasbon", "kasbon.write", async () => { const s = await createClient(); const cat = "KASBON_PERUSAHAAN"; const amt = Number(num(f, "amount") ?? 0); const rawInst = num(f, "installment_count", true); const instCount = rawInst && rawInst > 0 ? Math.round(rawInst) : 1; const instAmt = instCount > 1 ? Math.round((amt / instCount) * 100) / 100 : amt; const { error } = await s.from("cash_advances").insert({ worker_id: id(f, "worker_id"), advance_date: date(f, "advance_date"), amount: amt, category: cat, warung_name: null, installment_count: instCount, installment_amount: instAmt, installments_paid: 0, notes: t(f, "notes") || null }); if (error) throw error; }, "Kasbon perusahaan berhasil ditambahkan."); }
export async function recordWarungDebtAction(f: FormData) { const path = "/dashboard/warung"; await requirePermission("warung.write"); try { const s = await createClient(); const amt = Number(num(f, "amount") ?? 0); const warung = t(f, "warung_name") || "Warung Luar"; const wId = id(f, "worker_id"); const advDate = date(f, "advance_date") || new Date().toISOString().slice(0, 10); const notes = t(f, "notes") || null; const { error } = await s.from("cash_advances").insert({ worker_id: wId, advance_date: advDate, amount: amt, paid_amount: 0, category: "KASBON_WARUNG", warung_name: warung, installment_count: 1, installment_amount: amt, installments_paid: 0, status: "AKTIF", notes }); if (error) throw error; } catch (e) { go(path, "error", msg(e)); } revalidatePath(path); revalidatePath("/dashboard/kasbon"); redirect(`${path}?success=${encodeURIComponent("Hutang warung berhasil dicatat.")}`); }
export async function payCashAdvanceAction(f: FormData) { await mutate("/dashboard/kasbon", "kasbon.write", async () => { const advId = id(f, "advance_id"); if (!advId) throw new Error("ID Kasbon tidak valid."); const s = await createClient(); const lock = await checkIsCashAdvanceLocked(s, advId, { allowPayment: true }); if (lock.isLocked) { throw new Error(lock.reason || "Aksi ditolak: Kasbon ini sudah terkunci dalam slip gaji yang telah dilunasi."); } await rpc("pay_cash_advance", { p_advance_id: advId, p_date: date(f, "payment_date"), p_amount: num(f, "amount"), p_source: t(f, "source") || "MANUAL", p_reference: t(f, "reference") || null, p_notes: t(f, "notes") || null }); }, "Pembayaran Kasbon tersimpan."); }
export async function deletePettyCashAction(f: FormData) { await mutate("/dashboard/kasKecil", "kas_kecil.write", async () => { const s = await createClient(); const targetId = id(f, "id"); if (!targetId) throw new Error("ID transaksi tidak valid."); const { error } = await s.from("petty_cash_transactions").delete().eq("id", targetId); if (error) { const { error: updErr } = await s.from("petty_cash_transactions").update({ status: "DIBATALKAN" }).eq("id", targetId); if (updErr) throw updErr; } }, "Transaksi Kas Kecil berhasil dihapus."); }
export async function addPettyCashAction(f: FormData) { await mutate("/dashboard/kasKecil", "kas_kecil.write", async () => { const s = await createClient(); const file = (f.get("receipt_file") as File | null) || (f.get("receipt") as File | null) || (f.get("file") as File | null) || (f.get("receipt_file_gallery") as File | null) || (f.get("nota") as File | null); const base64Data = t(f, "receipt_base64") || t(f, "base64"); let receiptUrl: string | null = null; const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"]; const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; const uploadNota = async (filePath: string, fileData: Buffer | File, mimeType: string): Promise<string> => { const candidateBuckets = ["petty-cash", "nota-kas-kecil"]; let lastError: any = null; for (const bucket of candidateBuckets) { const { error: uploadError } = await s.storage.from(bucket).upload(filePath, fileData, { contentType: mimeType, upsert: true }); if (!uploadError) { const { data: publicUrlData } = s.storage.from(bucket).getPublicUrl(filePath); return publicUrlData.publicUrl; } lastError = uploadError; if (!uploadError.message?.toLowerCase().includes("not found")) { break; } } throw new Error("Gagal mengunggah foto nota: " + (lastError?.message || "Storage upload failed")); }; if (base64Data && base64Data.startsWith("data:image")) { const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/); if (matches && matches.length === 3) { const contentType = matches[1].toLowerCase(); if (!ALLOWED_IMAGE_MIMES.includes(contentType)) { throw new Error("Format foto nota tidak valid. Hanya JPG, PNG, atau WEBP yang diperbolehkan."); } const buffer = Buffer.from(matches[2], "base64"); if (buffer.length > MAX_UPLOAD_SIZE) { throw new Error("Ukuran foto nota melebihi batas maksimal 5MB."); } const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg"; const filePath = `nota_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`; receiptUrl = await uploadNota(filePath, buffer, contentType); } } if (!receiptUrl && file && typeof file === "object" && file.size > 0 && file.name) { if (!ALLOWED_IMAGE_MIMES.includes(file.type)) { throw new Error("Format file nota tidak valid. Hanya file gambar JPG, PNG, atau WEBP yang diperbolehkan."); } if (file.size > MAX_UPLOAD_SIZE) { throw new Error("Ukuran file nota melebihi batas maksimal 5MB."); } const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"; const filePath = `nota_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`; receiptUrl = await uploadNota(filePath, file, file.type || "image/jpeg"); } const { error } = await s.from("petty_cash_transactions").insert({ transaction_date: date(f, "transaction_date"), direction: t(f, "direction"), category: t(f, "category"), amount: num(f, "amount"), description: t(f, "description"), document_no: t(f, "document_no") || null, receipt_url: receiptUrl, status: "AKTIF" }); if (error) throw error; }, "Transaksi Kas Kecil tersimpan."); }
export async function addFinanceAction(f: FormData) { await mutate("/dashboard/keuangan", "keuangan.write", async () => { const s = await createClient(); const { error } = await s.from("finance_transactions").insert({ transaction_date: date(f, "transaction_date"), direction: t(f, "direction"), category: t(f, "category"), amount: num(f, "amount"), description: t(f, "description"), document_no: t(f, "document_no") || null }); if (error) throw error; }, "Transaksi Keuangan tersimpan."); }
export async function addManufacturingAction(f: FormData) { const flow = t(f, "flow_type").toUpperCase(); const permission = flow === "TITIPAN" || flow.startsWith("OPNAME") ? "manufaktur.titipan.write" : flow === "BARANG_LUAR" ? "manufaktur.barang_luar.write" : flow === "PENGIRIMAN" ? "manufaktur.pengiriman.write" : "manufaktur.view"; await mutate("/dashboard/manufaktur", permission, async () => { const rawQty = num(f, "quantity"); const quantity = Number(rawQty ?? 0); if (!Number.isFinite(quantity) || quantity <= 0) { throw new Error("Jumlah Qty harus lebih dari 0."); } const materialId = id(f, "material_id", true); const finishedGoodId = id(f, "finished_good_id", true); if (!materialId && !finishedGoodId) { throw new Error("Pilih Bahan Baku atau Barang Jadi terlebih dahulu."); } const description = t(f, "description"); if (!description) { throw new Error("Keterangan / Catatan transaksi wajib diisi."); } await rpc("record_manufacturing_transaction", { p_flow_type: flow, p_date: date(f, "transaction_date"), p_project_id: id(f, "project_id", true), p_product_id: id(f, "product_id", true), p_material_id: materialId, p_finished_good_id: finishedGoodId, p_vendor_id: id(f, "vendor_id", true), p_quantity: quantity, p_unit: t(f, "unit") || null, p_document_no: t(f, "document_no") || null, p_description: description }); }, "Transaksi Manufaktur tersimpan."); }
export async function resolveEmbarkationIssueAction(f: FormData) { await mutate("/dashboard/rejectEmbarkasi", "reject_embarkasi.write", async () => { const s = await createClient(); const { error } = await s.from("embarkation_issues").update({ status: "SELESAI", resolution: t(f, "resolution") || "Diselesaikan", resolved_at: new Date().toISOString() }).eq("id", id(f, "issue_id")).eq("status", "OPEN"); if (error) throw error; }, "Masalah Embarkasi diselesaikan."); }
export async function cancelExternalReceiptAction(f: FormData) { await mutate("/dashboard/barangLuar", "barang_luar.receive", async () => { await rpc("cancel_external_finished_receipt", { p_receipt_id: id(f, "receipt_id"), p_reason: t(f, "reason") || "Dibatalkan manual oleh user" }); }, "Penerimaan barang luar dibatalkan & stok dikembalikan."); }
export async function editExternalReceiptAction(f: FormData) { await mutate("/dashboard/barangLuar", "barang_luar.receive", async () => { await rpc("edit_external_finished_receipt", { p_receipt_id: id(f, "receipt_id"), p_document_no: t(f, "document_no") || null, p_notes: t(f, "notes") || null }); }, "Data penerimaan barang luar diperbarui."); }
export async function cancelManufacturingAction(f: FormData) { await mutate("/dashboard/manufaktur", "manufaktur.view", async () => { await rpc("cancel_manufacturing_transaction", { p_id: id(f, "transaction_id"), p_reason: t(f, "reason") || "Dibatalkan manual oleh user" }); }, "Transaksi manufaktur dibatalkan."); }
export async function editManufacturingAction(f: FormData) { await mutate("/dashboard/manufaktur", "manufaktur.view", async () => { await rpc("edit_manufacturing_transaction", { p_id: id(f, "transaction_id"), p_document_no: t(f, "document_no") || null, p_description: t(f, "description") || null }); }, "Data transaksi manufaktur diperbarui."); }
export async function confirmTransferReceiptAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/transferBarangJadi"; await mutate(returnPath, "mr_wu.confirm", async () => { const transferId = id(f, "transfer_id"); const receivedQty = num(f, "received_qty"); const rejectQty = num(f, "reject_qty") || 0; const damagedQty = num(f, "damaged_qty") || 0; const notes = t(f, "received_notes") || null; const photoUrl = t(f, "surat_jalan_photo_url") || null; const initialPhotoUrl = t(f, "initial_surat_jalan_photo_url") || null; const photoWasUpdated = t(f, "photo_was_updated") === "true"; if (t(f, "transfer_kind") === "PACKAGE") { await rpc("confirm_bundle_package_transfer", { p_transfer_id: transferId, p_received_qty: receivedQty, p_reject_qty: rejectQty, p_damaged_qty: damagedQty, p_notes: notes, p_photo_url: photoUrl }); if (!photoUrl && (initialPhotoUrl || photoWasUpdated)) { await rpc("update_bundle_package_transfer_photo", { p_transfer_id: transferId, p_photo_url: null }); } } else { await rpc("confirm_transfer_receipt", { p_transfer_id: transferId, p_received_qty: receivedQty, p_reject_qty: rejectQty, p_damaged_qty: damagedQty, p_notes: notes, p_photo_url: photoUrl }); if (!photoUrl && (initialPhotoUrl || photoWasUpdated)) { await rpc("update_finished_good_transfer_photo", { p_transfer_id: transferId, p_photo_url: null }); } } }, "Penerimaan barang dan foto surat jalan berhasil dikonfirmasi!"); }
export async function updateShipmentSuratJalanPhotoAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/pengirimanEmbarkasi"; await mutate(returnPath, "pengiriman_embarkasi.operate", async () => { const shipmentId = id(f, "shipment_id"); const photoUrl = t(f, "surat_jalan_photo_url"); await rpc("update_shipment_surat_jalan_photo", { p_shipment_id: shipmentId, p_photo_url: photoUrl }); }, "Foto fisik surat jalan berhasil disimpan."); }
export async function processBundlePackagePackingAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/bundlingIsian"; await mutate(returnPath, "bundling_isian.write", async () => { const componentsRaw = t(f, "components_json"); let components: any[] = []; try { components = JSON.parse(componentsRaw || "[]"); } catch { throw new Error("Data komponen packing tidak valid."); } if (components.length > 100) { throw new Error("Maksimal 100 komponen per transaksi packing."); } const validatedComponents = components.map((c: any) => { if (!c || typeof c !== "object") throw new Error("Struktur komponen packing tidak valid."); const fgId = Number(c.finished_good_id || c.component_finished_good_id); const qty = Number(c.qty_used || c.qty || c.qty_per_bundle); if (!Number.isSafeInteger(fgId) || fgId <= 0 || !Number.isFinite(qty) || qty <= 0) { throw new Error("Komponen packing memuat ID barang atau kuantiti yang tidak valid."); } return { ...c, finished_good_id: fgId, qty_used: qty }; }); await rpc("process_bundle_package_packing", { p_date: date(f, "packing_date"), p_package_id: id(f, "package_id"), p_location_id: id(f, "location_id") || 1, p_quantity: num(f, "quantity"), p_notes: t(f, "notes") || null, p_components: validatedComponents }); }, "Hasil packing harian berhasil disimpan! Stok komponen satuan terpotong dan stok Paket Isian bertambah di Gudang Pusat."); }
export async function savePackageRecipeAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/bundlingIsian"; await mutate(returnPath, "bundling_isian.write", async () => { const s = await createClient(); const packageId = id(f, "package_id"); const itemsRaw = t(f, "recipe_items_json"); let items: any[] = []; try { items = JSON.parse(itemsRaw || "[]"); } catch { throw new Error("Format data resep tidak valid."); } if (!items.length) { throw new Error("Pilih minimal satu barang untuk dimasukkan ke resep paket."); } if (items.length > 100) { throw new Error("Maksimal 100 barang per resep paket."); } const { error: delErr } = await s.from("bundle_package_recipes").delete().eq("package_id", packageId); if (delErr) throw delErr; const payload = items.map((it: any) => { if (!it || typeof it !== "object") throw new Error("Struktur item resep tidak valid."); const fgId = Number(it.finished_good_id); const qty = Number(it.qty_per_bundle); if (!Number.isSafeInteger(fgId) || fgId <= 0 || !Number.isFinite(qty) || qty <= 0) { throw new Error("Item resep memuat ID barang atau kuantiti yang tidak valid."); } return { package_id: packageId, finished_good_id: fgId, qty_per_bundle: qty }; }); const { error: insErr } = await s.from("bundle_package_recipes").insert(payload); if (insErr) throw insErr; }, "Resep paket isian berhasil disimpan!"); }
export async function createBundlePackageAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/bundlingIsian"; await mutate(returnPath, "bundling_isian.write", async () => { const s = await createClient(); const code = t(f, "package_code").toUpperCase(); const name = t(f, "name"); const description = t(f, "description") || null; if (!code || !name) throw new Error("Kode dan nama paket wajib diisi."); const { error } = await s.from("bundle_packages").insert({ package_code: code, name: name, description: description, status: "AKTIF" }); if (error) throw error; }, "Jenis paket baru berhasil dibuat."); }
export async function updateBundlePackageAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/bundlingIsian"; await mutate(returnPath, "bundling_isian.write", async () => { const s = await createClient(); const targetId = id(f, "package_id"); const code = t(f, "package_code").toUpperCase(); const name = t(f, "name"); const description = t(f, "description") || null; if (!code || !name) throw new Error("Kode dan nama paket wajib diisi."); const { error } = await s.from("bundle_packages").update({ package_code: code, name: name, description: description, updated_at: new Date().toISOString() }).eq("id", targetId); if (error) throw error; }, "Nama dan data paket berhasil diperbarui!"); }
export async function deleteBundlePackageAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/bundlingIsian"; await mutate(returnPath, "bundling_isian.write", async () => { const s = await createClient(); const targetId = id(f, "package_id"); const { data: packings } = await s.from("bundle_package_packings").select("id").eq("package_id", targetId).limit(1); if (packings && packings.length > 0) { throw new Error("Paket tidak bisa dihapus karena sudah ada riwayat transaksi packing harian yang menggunakan paket ini."); } const { error } = await s.from("bundle_packages").delete().eq("id", targetId); if (error) throw error; }, "Paket isian berhasil dihapus."); }
export async function addVendorDownPaymentAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/barangLuar"; await mutate(returnPath, "barang_luar.receive", async () => { const s = await createClient(); const vendorId = id(f, "vendor_id"); const payDate = date(f, "payment_date"); const amount = num(f, "amount"); const notes = t(f, "notes") || null; if (!amount || amount <= 0) throw new Error("Nominal DP harus lebih dari 0."); const { error } = await s.from("vendor_down_payments").insert({ vendor_id: vendorId, payment_date: payDate, amount: amount, notes: notes }); if (error) throw error; }, "Uang muka (DP) vendor berhasil dicatat!"); }
export async function deleteVendorDownPaymentAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/barangLuar"; await mutate(returnPath, "barang_luar.receive", async () => { const s = await createClient(); const dpId = id(f, "dp_id"); const { error } = await s.from("vendor_down_payments").delete().eq("id", dpId); if (error) throw error; }, "Catatan uang muka (DP) berhasil dihapus."); }
export async function saveVendorDeliveryLogAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/barangLuar"; await mutate(returnPath, "barang_luar.receive", async () => { const s = await createClient(); const targetId = id(f, "log_id", true); const vendorId = id(f, "vendor_id"); const delivDate = date(f, "delivery_date"); const category = t(f, "category") || "UMUM"; const itemDesc = t(f, "item_description") || "Kiriman Barang"; const q18 = num(f, "qty_18", true) || 0; const q26 = num(f, "qty_26", true) || 0; const totalQty = num(f, "total_qty", true) || (q18 + q26); const totalBill = num(f, "total_bill") || 0; const dpCut = num(f, "dp_cut", true) || 0; const cashPaid = num(f, "cash_paid", true) || 0; const payDate = t(f, "payment_date") || null; const notes = t(f, "notes") || null; const payload = { vendor_id: vendorId, delivery_date: delivDate, category: category, item_description: itemDesc, qty_18: q18, qty_26: q26, total_qty: totalQty, total_bill: totalBill, dp_cut: dpCut, cash_paid: cashPaid, payment_date: payDate, notes: notes }; if (targetId) { const { error } = await s.from("vendor_delivery_logs").update(payload).eq("id", targetId); if (error) throw error; } else { const { count } = await s.from("vendor_delivery_logs").select("id", { count: "exact", head: true }); const nextCode = `LOG-${String((count || 0) + 1).padStart(2, "0")}`; const { error } = await s.from("vendor_delivery_logs").insert({ ...payload, log_code: nextCode }); if (error) throw error; } }, "Catatan kedatangan barang berhasil disimpan ke database!"); }
export async function deleteVendorDeliveryLogAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/barangLuar"; await mutate(returnPath, "barang_luar.receive", async () => { const s = await createClient(); const logId = id(f, "log_id"); const { error } = await s.from("vendor_delivery_logs").delete().eq("id", logId); if (error) throw error; }, "Catatan transaksi kedatangan berhasil dihapus secara permanen dari database."); }
export async function saveVendorPoTargetAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/barangLuar"; await mutate(returnPath, "barang_luar.receive", async () => { const s = await createClient(); const targetId = id(f, "target_id", true); const vendorId = id(f, "vendor_id"); const category = t(f, "category") || "-"; const itemName = t(f, "item_name"); const size = t(f, "size") || "-"; const targetPo = num(f, "target_po") || 0; const price = num(f, "price_per_unit") || 0; const payload = { vendor_id: vendorId, category: category, item_name: itemName, size: size, target_po: targetPo, price_per_unit: price }; if (targetId) { const { error } = await s.from("vendor_po_targets").update(payload).eq("id", targetId); if (error) throw error; } else { const { error } = await s.from("vendor_po_targets").insert(payload); if (error) throw error; } }, "Target PO berhasil disimpan!"); }
export async function deleteVendorPoTargetAction(f: FormData) { const returnPath = t(f, "return_path") || "/dashboard/barangLuar"; await mutate(returnPath, "barang_luar.receive", async () => { const s = await createClient(); const targetId = id(f, "target_id"); const { error } = await s.from("vendor_po_targets").delete().eq("id", targetId); if (error) throw error; }, "Target PO berhasil dihapus."); }
export async function deletePayrollRunAction(f: FormData) { const path = "/dashboard/payroll"; await mutate(path, "payroll.write", async () => { const s = await createClient(); const admin = getAdminClient(); const db = admin || s; const runId = id(f, "run_id"); await db.from("payroll_run_details").delete().eq("payroll_run_id", runId); await db.from("payroll_run_items").delete().eq("payroll_run_id", runId); await db.from("payroll_runs").update({ status: "DIBATALKAN" }).eq("id", runId); await db.from("payroll_runs").delete().eq("id", runId); revalidatePath("/dashboard/payroll"); }, "Payroll berhasil dibatalkan."); }
export async function deleteOperatorPayrollItemAction(f: FormData) { await requirePermission("payroll.write"); const s = await createClient(); const admin = getAdminClient(); const db = admin || s; const runId = f.get("run_id"); const itemId = f.get("item_id"); if (runId) { const numRunId = Number(runId); const { error: errItems } = await db.from("operator_payroll_items").delete().eq("run_id", numRunId); if (errItems) throw new Error("Gagal membatalkan item payroll operator: " + errItems.message); await db.from("operator_payroll_runs").update({ status: "DIBATALKAN" }).eq("id", numRunId); const { error: errRun } = await db.from("operator_payroll_runs").delete().eq("id", numRunId); if (errRun) throw new Error("Gagal menghapus batch payroll operator: " + errRun.message); } else if (itemId) { const numItemId = Number(itemId); const { error } = await db.from("operator_payroll_items").delete().eq("id", numItemId); if (error) throw new Error("Gagal membatalkan item payroll operator: " + error.message); } revalidatePath("/dashboard/payroll"); return { success: true, message: "Seluruh item borongan pada batch payroll operator berhasil dibatalkan." }; }
export async function deleteOperatorPayrollRunAction(f: FormData) { await requirePermission("payroll.write"); const s = await createClient(); const admin = getAdminClient(); const db = admin || s; const runId = id(f, "run_id"); const { error: errItems } = await db.from("operator_payroll_items").delete().eq("run_id", runId); if (errItems) { throw new Error("Gagal menghapus relasi rincian item payroll operator: " + errItems.message); } await db.from("operator_payroll_runs").update({ status: "DIBATALKAN" }).eq("id", runId); const { error: errRun } = await db.from("operator_payroll_runs").delete().eq("id", runId); if (errRun) { throw new Error("Gagal membatalkan batch payroll operator: " + errRun.message); } revalidatePath("/dashboard/payroll"); return { success: true, message: "Batch Payroll Operator dan seluruh rincian item borongannya berhasil dibatalkan." }; }
