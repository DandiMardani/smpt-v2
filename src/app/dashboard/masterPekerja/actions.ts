"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  errorMessage,
  getId,
  getInteger,
  getNumber,
  getOptionalDate,
  getText,
  redirectWithMessage,
} from "@/lib/master/action-utils";
import {
  createAdminAuthClient,
  createBoronganUserAccount,
} from "@/lib/workers/worker-auth";

const PATH = "/dashboard/masterPekerja";
const upper = (value: string) => value.trim().toUpperCase();

async function uploadKtpIfProvided(f: FormData): Promise<string | null> {
  const existingUrl = getText(f, "existing_ktp_photo_url") || null;
  let fileCandidate = f.get("ktp_photo");
  if (!fileCandidate || typeof fileCandidate !== "object" || !("size" in fileCandidate) || (fileCandidate as File).size === 0) {
    fileCandidate = f.get("ktp_photo_gallery");
  }

  if (!fileCandidate || typeof fileCandidate !== "object" || !("size" in fileCandidate) || (fileCandidate as File).size === 0) {
    return existingUrl;
  }

  const file = fileCandidate;

  const ktpFile = file as File;
  const bytes = await ktpFile.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const rawExt = ktpFile.name.split(".").pop() || "jpg";
  const ext = rawExt.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";
  const path = `ktp/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const admin = createAdminAuthClient();
  const { error: uploadError } = await admin.storage
    .from("worker-documents")
    .upload(path, buffer, {
      contentType: ktpFile.type || "image/jpeg",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Gagal upload Foto KTP: ${uploadError.message}`);
  }

  const { data } = admin.storage.from("worker-documents").getPublicUrl(path);
  return data.publicUrl;
}

function payload(f: FormData, ktpPhotoUrl?: string | null) {
  return {
    name: getText(f, "name"),
    finger_id: getText(f, "finger_id") || null,
    identity_no: getText(f, "identity_no") || null,
    department: upper(getText(f, "department")) || null,
    position: upper(getText(f, "position")) || null,
    pay_system: upper(getText(f, "pay_system")) || null,
    daily_wage: getNumber(f, "daily_wage", { min: 0 }),
    monthly_salary: getNumber(f, "monthly_salary", { min: 0 }),
    phone: getText(f, "phone") || null,
    address: getText(f, "address") || null,
    entry_date: getOptionalDate(f, "entry_date"),
    exit_date: getOptionalDate(f, "exit_date"),
    bank_name: getText(f, "bank_name") || null,
    bank_account_no: getText(f, "bank_account_no") || null,
    bank_account_name: getText(f, "bank_account_name") || null,
    status: upper(getText(f, "status")) || "AKTIF",
    notes: getText(f, "notes") || null,
    children_count: getInteger(f, "children_count", { min: 0 }),
    ktp_photo_url: ktpPhotoUrl !== undefined ? ktpPhotoUrl : (getText(f, "existing_ktp_photo_url") || null),
  };
}

function validate(p: ReturnType<typeof payload>) {
  if (!p.name) throw new Error("Nama pekerja wajib diisi.");
  if (!p.department) throw new Error("Bagian wajib dipilih.");
  if (!p.position) throw new Error("Jabatan wajib dipilih.");
  if (!p.pay_system || !["HARIAN", "BULANAN", "BORONGAN"].includes(p.pay_system)) {
    throw new Error("Sistem Upah wajib HARIAN, BULANAN, atau BORONGAN.");
  }
  if (!["AKTIF", "NONAKTIF"].includes(p.status)) throw new Error("Status pekerja tidak valid.");
  if (p.children_count < 0) throw new Error("Jumlah anak tidak boleh bernilai negatif.");
}

export async function createWorker(f: FormData) {
  await requirePermission("master_pekerja.write");
  let redirectType: "success" | "error" = "success";
  let redirectMsg = "Master Pekerja berhasil ditambahkan.";
  let extraParams: Record<string, string> = {};

  try {
    const ktpPhotoUrl = await uploadKtpIfProvided(f);
    const p = payload(f, ktpPhotoUrl);
    validate(p);
    const s = await createClient();
    const { data: inserted, error } = await s
      .from("workers")
      .insert(p)
      .select("id, worker_code, name, phone, pay_system")
      .single();
    if (error) throw error;

    // KHUSUS PEKERJA BORONGAN: otomatis buatkan akun user login
    if (p.pay_system === "BORONGAN" && inserted) {
      const emailInput = getText(f, "email") || null;
      const accountRes = await createBoronganUserAccount({
        workerId: inserted.id,
        workerCode: inserted.worker_code,
        workerName: inserted.name,
        customEmail: emailInput,
        phone: inserted.phone,
      });

      if (accountRes.success) {
        extraParams = {
          acc_name: inserted.name,
          acc_code: inserted.worker_code,
          acc_user: accountRes.email,
          acc_pass: accountRes.password,
          acc_phone: inserted.phone || "",
        };
        redirectMsg = `Pekerja borongan "${inserted.name}" berhasil ditambahkan & akun login aktif!`;
      } else {
        redirectMsg = `Pekerja borongan "${inserted.name}" berhasil ditambahkan, namun akun login gagal dibuat: ${accountRes.error || ""}`;
      }
    }
  } catch (e) {
    redirectType = "error";
    redirectMsg = errorMessage(e, "Gagal menambah pekerja.");
  }

  revalidatePath(PATH);
  const q = new URLSearchParams({ [redirectType]: redirectMsg, ...extraParams });
  redirect(`${PATH}?${q.toString()}`);
}

export async function updateWorker(f: FormData) {
  await requirePermission("master_pekerja.write");
  try {
    const id = getId(f, "id");
    const ktpPhotoUrl = await uploadKtpIfProvided(f);
    const p = payload(f, ktpPhotoUrl);
    validate(p);
    const s = await createClient();
    const { error } = await s.from("workers").update(p).eq("id", id);
    if (error) throw error;
  } catch (e) {
    redirectWithMessage(PATH, "error", errorMessage(e, "Gagal memperbarui pekerja."));
  }
  revalidatePath(PATH);
  redirectWithMessage(PATH, "success", "Master Pekerja berhasil diperbarui.");
}
