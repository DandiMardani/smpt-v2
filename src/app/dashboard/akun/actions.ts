"use server";

import { revalidatePath } from "next/cache";
import { errorMessage, redirectWithMessage } from "@/lib/master/action-utils";
import { createClient } from "@/lib/supabase/server";

const PATH = "/dashboard/akun";

function text(f: FormData, key: string) {
  return String(f.get(key) ?? "").trim();
}

export async function changeOwnPasswordAction(f: FormData) {
  const password = text(f, "new_password");
  const confirmation = text(f, "confirm_password");

  try {
    if (password.length < 8) throw new Error("Password baru minimal 8 karakter.");
    if (password !== confirmation) throw new Error("Konfirmasi password tidak sama.");

    const s = await createClient();
    const { data: { user }, error: userError } = await s.auth.getUser();
    if (userError || !user) throw new Error("Sesi login tidak ditemukan.");

    const { error } = await s.auth.updateUser({ password });
    if (error) throw error;
  } catch (e) {
    redirectWithMessage(PATH, "error", errorMessage(e, "Password gagal diubah."));
  }

  revalidatePath(PATH);
  redirectWithMessage(PATH, "success", "Password berhasil diubah. Gunakan password baru pada login berikutnya.");
}
