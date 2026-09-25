"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";

function t(f:FormData,k:string){return String(f.get(k)??"").trim()}
function num(f:FormData,k:string,nullable=false){let raw=t(f,k).replace(/^rp\.?\s*/i,"").replace(/\s+/g,"");if(!raw&&nullable)return null;if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)){raw=raw.replace(/\./g,"").replace(",",".");}else if(/^\d+(,\d+)$/.test(raw)&&!raw.includes(".")){raw=raw.replace(",",".");}else if(raw.includes(".")&&(raw.match(/\./g)||[]).length>1){raw=raw.replace(/\./g,"");}const v=Number(raw);if(!Number.isFinite(v))throw new Error(`${k} tidak valid.`);return v}
function id(f:FormData,k:string,nullable=false){const v=num(f,k,nullable);if(v===null)return null;if(!Number.isSafeInteger(v)||v<=0)throw new Error(`${k} tidak valid.`);return v}
function date(f:FormData,k:string,nullable=false){const v=t(f,k);if(!v&&nullable)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(v))throw new Error(`${k} tidak valid.`);return v}
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

export async function linkWorkerAction(f:FormData){const path="/dashboard/aksesUser";await mutate(path,"access_control.write",async()=>{await rpc("link_worker_account",{p_email:t(f,"email"),p_worker_id:id(f,"worker_id")})},"Akun berhasil dihubungkan ke pekerja.")}

export async function createSpkAction(f:FormData){const path="/dashboard/spk";await requirePermission("spk.write");let data:unknown;try{data=await rpc("create_production_order",{p_order_date:date(f,"order_date"),p_project_id:id(f,"project_id"),p_product_id:id(f,"product_id"),p_operator_worker_id:id(f,"operator_worker_id"),p_checker_email:t(f,"checker_email"),p_supervisor_worker_id:id(f,"supervisor_worker_id",true),p_due_date:date(f,"due_date",true),p_notes:t(f,"notes")||null})}catch(e){go(path,"error",msg(e))}revalidatePath(path);redirect(`${path}?order=${encodeURIComponent(String(data))}&success=${encodeURIComponent("Draft SPK dibuat.")}`)}
export async function addSpkItemAction(f:FormData){const order=id(f,"order_id");const path=`/dashboard/spk?order=${order}`;await requirePermission("spk.write");try{await rpc("add_production_order_item",{p_order_id:order,p_work_item_id:id(f,"work_item_id"),p_assigned_qty:num(f,"assigned_qty")})}catch(e){redirect(`${path}&error=${encodeURIComponent(msg(e))}`)}revalidatePath("/dashboard/spk");redirect(`${path}&success=${encodeURIComponent("Item SPK disimpan.")}`)}
export async function removeSpkItemAction(f:FormData){const order=id(f,"order_id");const path=`/dashboard/spk?order=${order}`;await requirePermission("spk.write");try{await rpc("remove_production_order_item",{p_order_id:order,p_order_item_id:id(f,"order_item_id")})}catch(e){redirect(`${path}&error=${encodeURIComponent(msg(e))}`)}revalidatePath("/dashboard/spk");redirect(`${path}&success=${encodeURIComponent("Item dihapus.")}`)}
export async function publishSpkAction(f:FormData){await mutate("/dashboard/spk","spk.write",async()=>{await rpc("publish_production_order",{p_order_id:id(f,"order_id")})},"SPK diterbitkan dan snapshot harga/qty terkunci.")}
export async function cancelSpkAction(f:FormData){await mutate("/dashboard/spk","spk.write",async()=>{await rpc("cancel_production_order",{p_order_id:id(f,"order_id")})},"SPK dibatalkan.")}

export async function checkerResultAction(f:FormData){await mutate("/dashboard/borongan","borongan.operate",async()=>{await rpc("record_checker_result",{p_order_item_id:id(f,"order_item_id"),p_check_date:date(f,"check_date"),p_good_qty:num(f,"good_qty"),p_reject_qty:num(f,"reject_qty"),p_notes:t(f,"notes")||null})},"Qty Sah Checker tersimpan.")}
export async function cancelCheckerResultAction(f:FormData){await mutate("/dashboard/borongan","borongan.operate",async()=>{await rpc("cancel_checker_result",{p_check_id:id(f,"check_id")})},"Input Checker dibatalkan.")}

export async function recordQcAction(f:FormData){await mutate("/dashboard/qc","qc.operate",async()=>{await rpc("record_quality_control",{p_production_check_id:id(f,"production_check_id"),p_inspection_date:date(f,"inspection_date"),p_good_qty:num(f,"good_qty"),p_reject_qty:num(f,"reject_qty"),p_rework_qty:num(f,"rework_qty"),p_notes:t(f,"notes")||null})},"QC tersimpan. Qty baik masuk stok Barang Jadi PUSAT.")}
export async function cancelQcAction(f:FormData){await mutate("/dashboard/qc","qc.operate",async()=>{await rpc("cancel_quality_control",{p_qc_id:id(f,"qc_id")})},"QC dibatalkan dan stok direversal.")}
export async function createReworkAction(f:FormData){await mutate("/dashboard/qc","qc.rework",async()=>{await rpc("create_qc_rework",{p_qc_id:id(f,"qc_id"),p_quantity:num(f,"quantity"),p_notes:t(f,"notes")||null})},"Rework dibuat.")}
export async function completeReworkAction(f:FormData){await mutate("/dashboard/qc","qc.rework",async()=>{await rpc("complete_qc_rework",{p_rework_id:id(f,"rework_id"),p_good_qty:num(f,"good_qty"),p_reject_qty:num(f,"reject_qty"),p_notes:t(f,"notes")||null})},"Rework diselesaikan.")}

export async function saveFinishedGoodAction(f:FormData){await mutate("/dashboard/masterBarangJadi","master_barang_jadi.write",async()=>{const s=await createClient();const targetId=id(f,"id",true);const payload={project_id:id(f,"project_id",true),product_id:id(f,"product_id",true),name:t(f,"name"),category:t(f,"category"),unit:t(f,"unit")||"PCS",source:t(f,"source")||"INTERNAL",final_work_item_id:id(f,"final_work_item_id",true),status:t(f,"status")||"AKTIF",notes:t(f,"notes")||null};if(targetId){const {error}=await s.from("finished_goods").update(payload).eq("id",targetId);if(error)throw error}else{const {error}=await s.from("finished_goods").insert(payload);if(error)throw error}},"Master Barang Jadi berhasil disimpan.")}
export async function deleteFinishedGoodAction(f:FormData){await mutate("/dashboard/masterBarangJadi","master_barang_jadi.write",async()=>{const s=await createClient();const {error}=await s.from("finished_goods").delete().eq("id",id(f,"id"));if(error)throw error},"Master Barang Jadi berhasil dihapus.")}

export async function saveLocationAction(f:FormData){await mutate("/dashboard/masterLokasi","master_lokasi.write",async()=>{const s=await createClient();const targetId=id(f,"id",true);const payload={name:t(f,"name"),location_type:t(f,"location_type")||"GUDANG",address:t(f,"address")||null,pic_name:t(f,"pic_name")||null,phone:t(f,"phone")||null,status:t(f,"status")||"AKTIF",notes:t(f,"notes")||null};if(targetId){const {error}=await s.from("locations").update(payload).eq("id",targetId);if(error)throw error}else{const {error}=await s.from("locations").insert(payload);if(error)throw error}},"Master Lokasi berhasil disimpan.")}
export async function deleteLocationAction(f:FormData){await mutate("/dashboard/masterLokasi","master_lokasi.write",async()=>{const s=await createClient();const {error}=await s.from("locations").delete().eq("id",id(f,"id"));if(error)throw error},"Master Lokasi berhasil dihapus.")}

export async function saveVendorAction(f:FormData){await mutate("/dashboard/masterVendor","master_vendor.write",async()=>{const s=await createClient();const targetId=id(f,"id",true);const payload={name:t(f,"name"),pic_name:t(f,"pic_name")||null,phone:t(f,"phone")||null,email:t(f,"email")||null,address:t(f,"address")||null,tax_no:t(f,"tax_no")||null,bank_name:t(f,"bank_name")||null,bank_account_no:t(f,"bank_account_no")||null,bank_account_name:t(f,"bank_account_name")||null,status:t(f,"status")||"AKTIF",notes:t(f,"notes")||null};if(targetId){const {error}=await s.from("vendors").update(payload).eq("id",targetId);if(error)throw error}else{const {error}=await s.from("vendors").insert(payload);if(error)throw error}},"Master Vendor berhasil disimpan.")}

export async function saveEmbarkationAction(f:FormData){await mutate("/dashboard/masterEmbarkasi","master_embarkasi.write",async()=>{const s=await createClient();const targetId=id(f,"id",true);const payload={name:t(f,"name"),short_code:t(f,"short_code")||null,address:t(f,"address")||null,pic_name:t(f,"pic_name")||null,phone:t(f,"phone")||null,status:t(f,"status")||"AKTIF",notes:t(f,"notes")||null};if(targetId){const {error}=await s.from("embarkations").update(payload).eq("id",targetId);if(error)throw error}else{const {error}=await s.from("embarkations").insert(payload);if(error)throw error}},"Master Embarkasi berhasil disimpan.")}
export async function deleteEmbarkationAction(f:FormData){await mutate("/dashboard/masterEmbarkasi","master_embarkasi.write",async()=>{const s=await createClient();const {error}=await s.from("embarkations").delete().eq("id",id(f,"id"));if(error)throw error},"Master Embarkasi berhasil dihapus.")}

export async function saveSetAction(f:FormData){await mutate("/dashboard/masterSet","master_set.write",async()=>{const s=await createClient();const targetId=id(f,"id",true);const payload={project_id:id(f,"project_id"),name:t(f,"name"),unit:t(f,"unit")||"SET",status:t(f,"status")||"AKTIF",notes:t(f,"notes")||null};if(targetId){const {error}=await s.from("product_sets").update(payload).eq("id",targetId);if(error)throw error}else{const {error}=await s.from("product_sets").insert(payload);if(error)throw error}},"Master Set berhasil disimpan.")}
export async function deleteSetAction(f:FormData){await mutate("/dashboard/masterSet","master_set.write",async()=>{const s=await createClient();const {error}=await s.from("product_sets").delete().eq("id",id(f,"id"));if(error)throw error},"Master Set berhasil dihapus.")}

export async function addSetComponentAction(f:FormData){await mutate("/dashboard/masterSet","master_set.write",async()=>{const s=await createClient();const {error}=await s.from("product_set_components").insert({set_id:id(f,"set_id"),finished_good_id:id(f,"finished_good_id"),qty_per_set:num(f,"qty_per_set")});if(error)throw error},"Komponen Set ditambahkan.")}
export async function deleteSetComponentAction(f:FormData){await mutate("/dashboard/masterSet","master_set.write",async()=>{const s=await createClient();const {error}=await s.from("product_set_components").delete().eq("id",id(f,"id"));if(error)throw error},"Komponen Set berhasil dihapus.")}


export async function transferFinishedGoodAction(f:FormData){await mutate("/dashboard/transferBarangJadi","transfer_barang_jadi.write",async()=>{await rpc("transfer_finished_good",{p_date:date(f,"transfer_date"),p_finished_good_id:id(f,"finished_good_id"),p_source_location_id:id(f,"source_location_id"),p_destination_location_id:id(f,"destination_location_id"),p_quantity:num(f,"quantity"),p_notes:t(f,"notes")||null})},"Transfer Barang Jadi tersimpan.")}
export async function receiveExternalAction(f:FormData){await mutate("/dashboard/barangLuar","barang_luar.receive",async()=>{await rpc("receive_external_finished_good",{p_date:date(f,"receipt_date"),p_finished_good_id:id(f,"finished_good_id"),p_vendor_id:id(f,"vendor_id",true),p_location_id:id(f,"location_id"),p_quantity:num(f,"quantity"),p_document_no:t(f,"document_no")||null,p_notes:t(f,"notes")||null})},"Barang luar diterima dan stok bertambah.")}
export async function packSetAction(f:FormData){await mutate("/dashboard/packingSet","packing_set.write",async()=>{await rpc("pack_product_set",{p_date:date(f,"packing_date"),p_set_id:id(f,"set_id"),p_location_id:id(f,"location_id"),p_set_qty:num(f,"set_qty"),p_notes:t(f,"notes")||null})},"Packing Set selesai. Komponen PCS berkurang dan stok SET bertambah.")}

export async function createTargetAction(f:FormData){await mutate("/dashboard/targetEmbarkasi","target_embarkasi.write",async()=>{const ref=t(f,"item_ref");const [kind,rawId]=ref.split(":");const itemId=Number(rawId);if(!["FINISHED_GOOD","SET"].includes(kind)||!Number.isSafeInteger(itemId)||itemId<=0)throw new Error("Item target tidak valid.");const s=await createClient();const {error}=await s.from("embarkation_targets").insert({embarkation_id:id(f,"embarkation_id"),item_kind:kind,finished_good_id:kind==="FINISHED_GOOD"?itemId:null,set_id:kind==="SET"?itemId:null,target_qty:num(f,"target_qty"),status:"AKTIF",notes:t(f,"notes")||null});if(error)throw error},"Target Embarkasi ditambahkan.")}
export async function createShipmentAction(f:FormData){await mutate("/dashboard/pengirimanEmbarkasi","pengiriman_embarkasi.operate",async()=>{await rpc("create_embarkation_shipment",{p_target_id:id(f,"target_id"),p_date:date(f,"shipment_date"),p_source_location_id:id(f,"source_location_id"),p_quantity:num(f,"quantity"),p_document_no:t(f,"document_no")||null,p_driver:t(f,"driver_name")||null,p_vehicle:t(f,"vehicle_no")||null,p_notes:t(f,"notes")||null})},"Draft pengiriman dibuat. Stok belum berubah.")}
export async function sendShipmentAction(f:FormData){await mutate("/dashboard/pengirimanEmbarkasi","pengiriman_embarkasi.operate",async()=>{await rpc("send_embarkation_shipment",{p_shipment_id:id(f,"shipment_id")})},"Pengiriman DIKIRIM. Stok sumber berkurang.")}
export async function receiveShipmentAction(f:FormData){await mutate("/dashboard/pengirimanEmbarkasi","pengiriman_embarkasi.operate",async()=>{await rpc("receive_embarkation_shipment",{p_shipment_id:id(f,"shipment_id"),p_received:num(f,"received_qty"),p_reject:num(f,"reject_qty"),p_damaged:num(f,"damaged_qty"),p_missing:num(f,"missing_qty"),p_notes:t(f,"notes")||null})},"Penerimaan Embarkasi dikonfirmasi.")}
export async function cancelShipmentAction(f:FormData){await mutate("/dashboard/pengirimanEmbarkasi","pengiriman_embarkasi.operate",async()=>{await rpc("cancel_embarkation_shipment",{p_shipment_id:id(f,"shipment_id")})},"Pengiriman dibatalkan. Jika sudah dikirim, stok direversal.")}
export async function createEmbarkationIssueAction(f:FormData){await mutate("/dashboard/rejectEmbarkasi","reject_embarkasi.write",async()=>{const s=await createClient();const {error}=await s.from("embarkation_issues").insert({shipment_id:id(f,"shipment_id"),issue_type:t(f,"issue_type"),quantity:num(f,"quantity"),description:t(f,"description"),status:"OPEN"});if(error)throw error},"Masalah Embarkasi dicatat.")}

export async function addAttendanceAction(f:FormData){await mutate("/dashboard/absensi","absensi.write",async()=>{const s=await createClient();const otMin=num(f,"overtime_minutes",true)??0;const payload={worker_id:id(f,"worker_id"),attendance_date:date(f,"attendance_date"),schedule_in:t(f,"schedule_in")||null,schedule_out:t(f,"schedule_out")||null,actual_in:t(f,"actual_in")||null,actual_out:t(f,"actual_out")||null,attendance_status:t(f,"attendance_status")||"HADIR",overtime_minutes:otMin,source:"MANUAL",notes:t(f,"notes")||null};const {error}=await s.from("attendance_records").upsert(payload,{onConflict:"worker_id,attendance_date"});if(error)throw error},"Absensi disimpan.")}
export async function verifyAttendanceAction(f:FormData){await mutate("/dashboard/absensi","absensi.write",async()=>{await rpc("verify_attendance",{p_attendance_id:id(f,"attendance_id"),p_day_class:t(f,"day_class"),p_overtime_minutes:num(f,"overtime_minutes"),p_notes:t(f,"notes")||null})},"Absensi diverifikasi.")}
export async function verifyBulkAttendanceAction(f: FormData) {
  const path = "/dashboard/absensi";
  await mutate(path, "absensi.write", async () => {
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
    for (const it of itemsToVerify) {
      const dayClass = (it.day_class || "FULL_DAY").toUpperCase();
      const otMin = Math.max(0, Math.round(Number(it.overtime_minutes || 0)));
      const updatePayload: Record<string, unknown> = {
        day_class: dayClass,
        overtime_minutes: otMin,
        verification_status: "TERVERIFIKASI",
        verified_by: user?.id,
        verified_at: now,
        updated_at: now,
      };
      if (it.notes && it.notes.trim()) {
        updatePayload.notes = it.notes.trim();
      }

      const { error } = await s.from("attendance_records").update(updatePayload).eq("id", it.id);
      if (error) {
        throw new Error(`Gagal verifikasi absensi #${it.id}: ${error.message}`);
      }
    }
  }, "Berhasil memverifikasi data absensi sekaligus.");
}
export async function unverifyAttendanceAction(f: FormData) {
  const path = "/dashboard/absensi";
  await mutate(path, "absensi.write", async () => {
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
  }, "Status absensi dikembalikan ke DRAFT.");
}
export async function finalizePayrollAction(f:FormData){await mutate("/dashboard/payroll","payroll.write",async()=>{await rpc("finalize_general_payroll",{p_type:t(f,"payroll_type"),p_start:date(f,"period_start"),p_end:date(f,"period_end"),p_notes:t(f,"notes")||null})},"Payroll difinalisasi dari absensi terverifikasi.")}
export async function finalizeOperatorPayrollAction(f:FormData){await mutate("/dashboard/payroll","payroll.write",async()=>{await rpc("finalize_operator_payroll",{p_start:date(f,"period_start"),p_end:date(f,"period_end"),p_notes:t(f,"notes")||null})},"Payroll Operator difinalisasi dari Qty Sah Checker + hasil manual HARIAN; Nilai Operator HARIAN tetap 0 dan Nilai Pengajuan terpisah.")}
export async function updatePayrollItemAction(f:FormData){const path="/dashboard/payroll";await mutate(path,"payroll.write",async()=>{const s=await createClient();const itemId=id(f,"item_id");const manualOt=num(f,"manual_overtime_amount",true)??0;const {data:item,error:fetchErr}=await s.from("payroll_run_items").select("*").eq("id",itemId).single();if(fetchErr||!item)throw new Error("Item payroll tidak ditemukan.");const baseGross=Number(item.base_amount||0)+Number(item.meal_amount||0)+Number(item.overtime_amount||0)+Number(item.overtime_bonus||0)+Number(item.holiday_bonus||0)+Number(item.holiday_manual_amount||0);const newGross=baseGross+manualOt;const totalDeduction=Number(item.kasbon_perusahaan_amount||0)+Number(item.kasbon_warung_amount||0)+Number(item.deduction_amount||0);const newNet=Math.max(0,newGross-totalDeduction);const {error:updateErr}=await s.from("payroll_run_items").update({manual_overtime_amount:manualOt,net_amount:newNet}).eq("id",itemId);if(updateErr)throw updateErr},"Lemburan manual payroll tersimpan.")}
export async function savePayrollShiftSettingsAction(f: FormData) {
  const returnPath = t(f, "return_path") || "/dashboard/payroll";
  await mutate(returnPath, "payroll.write", async () => {
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
  }, "Pengaturan jam kerja & tarif lembur berhasil disimpan.");
}
export async function addCashAdvanceAction(f:FormData){await mutate("/dashboard/kasbon","kasbon.write",async()=>{const s=await createClient();const cat=t(f,"category")||"KASBON_PERUSAHAAN";const amt=Number(num(f,"amount")??0);const rawInst=num(f,"installment_count",true);const instCount=cat==="KASBON_PERUSAHAAN"&&rawInst&&rawInst>0?Math.round(rawInst):1;const instAmt=cat==="KASBON_PERUSAHAAN"&&instCount>1?Math.round((amt/instCount)*100)/100:amt;const warung=cat==="KASBON_WARUNG"?(t(f,"warung_name")||"Warung Luar"):null;const {error}=await s.from("cash_advances").insert({worker_id:id(f,"worker_id"),advance_date:date(f,"advance_date"),amount:amt,category:cat,warung_name:warung,installment_count:instCount,installment_amount:instAmt,installments_paid:0,notes:t(f,"notes")||null});if(error)throw error},"Kasbon ditambahkan.")}
export async function recordWarungDebtAction(f:FormData){const path="/dashboard/warung";await requirePermission("warung.write");try{const s=await createClient();const amt=Number(num(f,"amount")??0);const warung=t(f,"warung_name")||"Warung Luar";const wId=id(f,"worker_id");const advDate=date(f,"advance_date")||new Date().toISOString().slice(0,10);const notes=t(f,"notes")||null;const {error}=await s.from("cash_advances").insert({worker_id:wId,advance_date:advDate,amount:amt,paid_amount:0,category:"KASBON_WARUNG",warung_name:warung,installment_count:1,installment_amount:amt,installments_paid:0,status:"AKTIF",notes});if(error)throw error}catch(e){go(path,"error",msg(e))}revalidatePath(path);revalidatePath("/dashboard/kasbon");redirect(`${path}?success=${encodeURIComponent("Hutang warung berhasil dicatat.")}`)}
export async function payCashAdvanceAction(f:FormData){await mutate("/dashboard/kasbon","kasbon.write",async()=>{await rpc("pay_cash_advance",{p_advance_id:id(f,"advance_id"),p_date:date(f,"payment_date"),p_amount:num(f,"amount"),p_source:t(f,"source")||"MANUAL",p_reference:t(f,"reference")||null,p_notes:t(f,"notes")||null})},"Pembayaran Kasbon tersimpan.")}
export async function addPettyCashAction(f:FormData){await mutate("/dashboard/kasKecil","kas_kecil.write",async()=>{const s=await createClient();const {error}=await s.from("petty_cash_transactions").insert({transaction_date:date(f,"transaction_date"),direction:t(f,"direction"),category:t(f,"category"),amount:num(f,"amount"),description:t(f,"description"),document_no:t(f,"document_no")||null});if(error)throw error},"Transaksi Kas Kecil tersimpan.")}
export async function addFinanceAction(f:FormData){await mutate("/dashboard/keuangan","keuangan.write",async()=>{const s=await createClient();const {error}=await s.from("finance_transactions").insert({transaction_date:date(f,"transaction_date"),direction:t(f,"direction"),category:t(f,"category"),amount:num(f,"amount"),description:t(f,"description"),document_no:t(f,"document_no")||null});if(error)throw error},"Transaksi Keuangan tersimpan.")}
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

  await mutate("/dashboard/manufaktur", permission, async () => {
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
  }, "Transaksi Manufaktur tersimpan.");
}
export async function resolveEmbarkationIssueAction(f:FormData){await mutate("/dashboard/rejectEmbarkasi","reject_embarkasi.write",async()=>{const s=await createClient();const {error}=await s.from("embarkation_issues").update({status:"SELESAI",resolution:t(f,"resolution")||"Diselesaikan",resolved_at:new Date().toISOString()}).eq("id",id(f,"issue_id")).eq("status","OPEN");if(error)throw error},"Masalah Embarkasi diselesaikan.")}

export async function cancelExternalReceiptAction(f: FormData) {
  await mutate("/dashboard/barangLuar", "barang_luar.receive", async () => {
    await rpc("cancel_external_finished_receipt", {
      p_receipt_id: id(f, "receipt_id"),
      p_reason: t(f, "reason") || "Dibatalkan manual oleh user",
    });
  }, "Penerimaan barang luar dibatalkan & stok dikembalikan.");
}

export async function editExternalReceiptAction(f: FormData) {
  await mutate("/dashboard/barangLuar", "barang_luar.receive", async () => {
    await rpc("edit_external_finished_receipt", {
      p_receipt_id: id(f, "receipt_id"),
      p_document_no: t(f, "document_no") || null,
      p_notes: t(f, "notes") || null,
    });
  }, "Data penerimaan barang luar diperbarui.");
}

export async function cancelManufacturingAction(f: FormData) {
  await mutate("/dashboard/manufaktur", "manufaktur.view", async () => {
    await rpc("cancel_manufacturing_transaction", {
      p_id: id(f, "transaction_id"),
      p_reason: t(f, "reason") || "Dibatalkan manual oleh user",
    });
  }, "Transaksi manufaktur dibatalkan.");
}

export async function editManufacturingAction(f: FormData) {
  await mutate("/dashboard/manufaktur", "manufaktur.view", async () => {
    await rpc("edit_manufacturing_transaction", {
      p_id: id(f, "transaction_id"),
      p_document_no: t(f, "document_no") || null,
      p_description: t(f, "description") || null,
    });
  }, "Data transaksi manufaktur diperbarui.");
}

