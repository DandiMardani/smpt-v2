import { createClient as createStandaloneClient } from "@supabase/supabase-js";

/**
 * Formula password khusus pekerja borongan:
 * Nama pekerja (huruf kecil, dibersihkan) + "123".
 * Minimal 6 karakter untuk memenuhi standar Supabase Auth.
 */
export function generateBoronganPassword(workerName: string): string {
  const words = workerName.trim().split(/\s+/).filter(Boolean);
  const firstWord = (words[0] || "pekerja").toLowerCase().replace(/[^a-z0-9]/g, "");

  let base = firstWord;
  // Jika nama panggilan/depan sangat pendek (< 3 huruf), gabungkan dengan nama belakang jika ada
  if (base.length < 3 && words[1]) {
    base += words[1].toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  let pass = `${base}123`;
  // Standar keamanan Supabase Auth: minimal 6 karakter
  if (pass.length < 6) {
    pass = `${base}12345`;
  }
  return pass;
}

/**
 * Formula email username untuk login:
 * Jika admin mengisi email asli, gunakan email tersebut.
 * Jika kosong, buatkan username internal berbasis kode pekerja (misal: pkr-00012@smpt.id).
 */
export function generateBoronganEmail(workerCode: string, customEmail?: string | null): string {
  if (customEmail && customEmail.includes("@")) {
    return customEmail.trim().toLowerCase();
  }
  return `${workerCode.trim().toLowerCase()}@smpt.id`;
}

export function createAdminAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL belum dikonfigurasi.");
  if (!serverKey) {
    throw new Error(
      "Server key Supabase belum dikonfigurasi. Tambahkan SUPABASE_SECRET_KEY ke .env.local.",
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

export type AutoBoronganAccountResult = {
  success: boolean;
  email: string;
  workerCode: string;
  password: string;
  workerName: string;
  phone?: string | null;
  error?: string;
};

/**
 * Otomatisasi pendaftaran user login khusus pekerja BORONGAN:
 * 1. Mendaftarkan user ke Supabase Auth (email_confirm: true).
 * 2. Mengaitkan role PEKERJA di profiles.
 * 3. Menghubungkan user_id ke worker_id di user_worker_links.
 */
export async function createBoronganUserAccount({
  workerId,
  workerCode,
  workerName,
  customEmail,
  phone,
}: {
  workerId: number;
  workerCode: string;
  workerName: string;
  customEmail?: string | null;
  phone?: string | null;
}): Promise<AutoBoronganAccountResult> {
  const email = generateBoronganEmail(workerCode, customEmail);
  const password = generateBoronganPassword(workerName);

  try {
    const admin = createAdminAuthClient();

    // 1. Daftarkan user login di Supabase Auth
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: workerName,
        worker_code: workerCode,
        pay_system: "BORONGAN",
      },
    });

    if (authError) {
      console.error("Gagal create user borongan:", authError);
      return { success: false, email, workerCode, password, workerName, phone, error: authError.message };
    }

    const userId = authData.user?.id;
    if (!userId) {
      return { success: false, email, workerCode, password, workerName, phone, error: "Gagal mendapatkan user ID Auth." };
    }

    // 2. Ambil ID role PEKERJA
    const { data: roleData } = await admin.from("roles").select("id").eq("code", "PEKERJA").single();
    const roleId = roleData?.id;

    // 3. Update profile agar role diset ke PEKERJA & aktif
    if (roleId) {
      await admin.from("profiles").update({
        role_id: roleId,
        display_name: workerName,
        is_active: true,
      }).eq("id", userId);
    }

    // 4. Hubungkan ke user_worker_links
    await admin.from("user_worker_links").upsert({
      user_id: userId,
      worker_id: workerId,
      active: true,
    }, { onConflict: "user_id" });

    return {
      success: true,
      email,
      workerCode,
      password,
      workerName,
      phone,
    };
  } catch (err: any) {
    console.error("Error auto creating borongan account:", err);
    return {
      success: false,
      email,
      workerCode,
      password,
      workerName,
      phone,
      error: err?.message || "Gagal membuat akun login otomatis.",
    };
  }
}
