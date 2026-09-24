"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const rawInput = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  const password = String(formData.get("password") ?? "");

  if (!rawInput || !password) {
    redirect("/login?error=Email%20atau%20ID%20Pekerja%20dan%20password%20wajib%20diisi");
  }

  const email = rawInput.includes("@") ? rawInput : `${rawInput}@smpt.id`;

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect("/login?error=Email%20atau%20password%20salah");
  }

  redirect("/dashboard");
}