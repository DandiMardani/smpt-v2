"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function getAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Silakan login kembali.");
  const warungName = user.user_metadata?.warung_name || user.email?.split("@")[0] || "Warung Mitra";
  return { supabase, user, warungId: user.id, warungName };
}

export async function createWarungTransactionAction(payload: {
  worker_id: string;
  notes?: string;
  is_direct_nominal: boolean;
  direct_amount?: number;
  items?: Array<{ item_name: string; qty: number; unit_price: number; subtotal: number }>;
}) {
  try {
    const { supabase, warungId, warungName } = await getAuth();
    const totalAmount = Number(payload.direct_amount) || 0;
    if (totalAmount <= 0) return { success: false, error: "Nominal harus lebih dari 0." };

    const { error } = await supabase.from("cash_advances").insert({
      worker_id: payload.worker_id,
      amount: totalAmount,
      category: "KASBON_WARUNG",
      status: "AKTIF",
      notes: payload.notes || "Kasbon",
      warung_id: warungId,
      warung_name: warungName,
      installment_count: 1,
      installment_amount: totalAmount,
      installments_paid: 0,
    });

    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/warung");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateWarungTransactionAction(
  transactionId: string,
  payload: {
    worker_id: string;
    notes?: string;
    is_direct_nominal: boolean;
    direct_amount?: number;
    items?: Array<{ item_name: string; qty: number; unit_price: number; subtotal: number }>;
  }
) {
  try {
    const { supabase, warungId } = await getAuth();
    const totalAmount = Number(payload.direct_amount) || 0;

    // HANYA BISA UPDATE JIKA WARUNG_ID COCOK DENGAN USER LOGIN!
    const { error } = await supabase
      .from("cash_advances")
      .update({
        worker_id: payload.worker_id,
        amount: totalAmount,
        installment_amount: totalAmount,
        notes: payload.notes || "Kasbon",
      })
      .eq("id", transactionId)
      .eq("warung_id", warungId);

    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/warung");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteWarungTransactionAction(transactionId: string) {
  try {
    const { supabase, warungId } = await getAuth();

    // HANYA BISA HAPUS JIKA WARUNG_ID COCOK DENGAN USER LOGIN!
    const { error } = await supabase
      .from("cash_advances")
      .delete()
      .eq("id", transactionId)
      .eq("warung_id", warungId);

    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/warung");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
