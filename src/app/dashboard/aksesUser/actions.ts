"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createStandaloneClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/access/current-user";
import { errorMessage, redirectWithMessage } from "@/lib/master/action-utils";
import { createClient } from "@/lib/supabase/server";

const PATH = "/dashboard/aksesUser";

function text(f: FormData, key: string) {
  return String(f.get(key) ?? "").trim();
}

// Password adalah credential. Jangan trim/normalisasi karena harus sama persis
// dengan yang nanti diketik user saat login.
function passwordText(f: FormData, key: string) {
  return String(f.get(key) ?? "");
}

function workerIdFromForm(f: FormData) {
  const raw = text(f, "worker_id");
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error("Pekerja tidak valid.");
  return value;
}

function validatePassword(password: string, confirmation: string, label = "Password") {
  if (password.length < 8) throw new Error(`${label} minimal 8 karakter.`);
  if (password !== confirmation) throw new Error("Konfirmasi password tidak sama.");
}

function createAdminAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL belum dikonfigurasi.");
  if (!serverKey) {
    throw new Error(
      "Server key Supabase belum dikonfigurasi. Tambahkan SUPABASE_SECRET_KEY atau SUPABASE_SERVICE_ROLE_KEY ke .env.local/Vercel sebagai server-only secret.",
    );
  }

  return createStandaloneClient(url, serverKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function requireAdminWrite() {
  const access = await requirePermission("access_control.write");
  if (access.role !== "ADMIN") throw new Error("Hanya ADMIN yang boleh mengelola akun login.");
  return access;
}

async function saveAccess(userId: string, roleCode: string, workerId: number | null, isActive: boolean) {
  const s = await createClient();
  const { error } = await s.rpc("smpt_admin_save_user_access", {
    p_user_id: userId,
    p_role_code: roleCode,
    p_worker_id: workerId,
    p_is_active: isActive,
  });
  if (error) throw error;
}

function redirectUserMessage(userId: string, type: "success" | "error", message: string): never {
  // redirectWithMessage() lama hanya aman untuk path tanpa query string.
  // Halaman ini perlu mempertahankan ?user=... agar pesan validasi terlihat.
  const params = new URLSearchParams({ user: userId, [type]: message });
  redirect(`${PATH}?${params.toString()}`);
}

export async function createUserAccessAction(f: FormData) {
  await requireAdminWrite();

  try {
    const email = text(f, "email").toLowerCase();
    const password = passwordText(f, "password");
    const confirmation = passwordText(f, "confirm_password");
    const roleCode = text(f, "role_code").toUpperCase() || "USER";
    const workerId = workerIdFromForm(f);

    if (!email || !email.includes("@")) throw new Error("Email user tidak valid.");
    if (roleCode === "CHECKER") throw new Error("CHECKER adalah role legacy. Untuk checker baru gunakan role USER lalu berikan permission checker.");
    if (roleCode === "PEKERJA" && workerId == null) throw new Error("Role PEKERJA wajib dihubungkan ke Master Pekerja.");
    validatePassword(password, confirmation, "Password sementara");

    const admin = createAdminAuthClient();

    // Akun internal dibuat oleh ADMIN, jadi langsung confirmed dan dapat login
    // tanpa bergantung pada email konfirmasi eksternal.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    if (!data.user?.id) throw new Error("Akun Auth gagal dibuat.");

    try {
      await saveAccess(data.user.id, roleCode, workerId, true);
    } catch (accessError) {
      // Hindari akun Auth yatim bila penyimpanan role/link pekerja gagal.
      await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
      throw accessError;
    }
  } catch (e) {
    redirectWithMessage(PATH, "error", errorMessage(e, "Gagal membuat user login."));
  }

  revalidatePath(PATH);
  redirectWithMessage(PATH, "success", "User login berhasil dibuat, email sudah dikonfirmasi, dan role sudah diset.");
}

export async function saveUserAccessAction(f: FormData) {
  await requireAdminWrite();
  try {
    const userId = text(f, "user_id");
    const roleCode = text(f, "role_code").toUpperCase();
    const workerId = workerIdFromForm(f);
    const isActive = text(f, "is_active") !== "false";

    if (!userId) throw new Error("Akun wajib dipilih.");
    if (!roleCode) throw new Error("Role wajib dipilih.");
    if (roleCode === "PEKERJA" && workerId == null) throw new Error("Role PEKERJA wajib dihubungkan ke Master Pekerja.");

    await saveAccess(userId, roleCode, workerId, isActive);
  } catch (e) {
    redirectWithMessage(PATH, "error", errorMessage(e, "Gagal menyimpan akses user."));
  }

  revalidatePath(PATH);
  revalidatePath("/dashboard");
  redirectWithMessage(PATH, "success", "Role dan link pekerja berhasil disimpan.");
}

export async function adminSetUserPasswordAction(f: FormData) {
  await requireAdminWrite();

  const userId = text(f, "user_id");
  const password = passwordText(f, "new_password");
  const confirmation = passwordText(f, "confirm_password");

  try {
    if (!userId) throw new Error("User tujuan tidak ditemukan.");
    validatePassword(password, confirmation, "Password baru");

    const admin = createAdminAuthClient();
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password,
      // Memperbaiki akun lama yang dulu dibuat lewat signUp biasa dan masih unconfirmed.
      email_confirm: true,
    });
    if (error) throw error;
  } catch (e) {
    redirectUserMessage(userId, "error", errorMessage(e, "Password user gagal diubah."));
  }

  revalidatePath(PATH);
  redirectUserMessage(
    userId,
    "success",
    "Password user berhasil diubah dan email akun dipastikan terkonfirmasi.",
  );
}
