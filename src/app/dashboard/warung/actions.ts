"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function getAuthenticatedWarung() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Sesi login telah habis. Silakan login kembali.");
  }

  const warungName = (user.user_metadata?.warung_name as string) || 
                     (user.user_metadata?.full_name as string) || 
                     user.email?.split("@")[0] || 
                     "Warung Mitra";

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
    const { supabase, warungId, warungName } = await getAuthenticatedWarung();
    const totalAmount = Number(payload.direct_amount) || 0;

    if (totalAmount <= 0) {
      return { success: false, error: "Nominal harus lebih dari Rp 0." };
    }

    const { error: advanceError } = await supabase
      .from("cash_advances")
      .insert({
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

    if (advanceError) {
      return { success: false, error: advanceError.message };
    }

    revalidatePath("/dashboard/warung");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Terjadi kesalahan." };
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
    const { supabase, warungId } = await getAuthenticatedWarung();
    const totalAmount = Number(payload.direct_amount) || 0;

    // Proteksi: HANYA bisa update jika warung_id cocok dengan user yang sedang login!
    const { error: updateError } = await supabase
      .from("cash_advances")
      .update({
        worker_id: payload.worker_id,
        amount: totalAmount,
        installment_amount: totalAmount,
        notes: payload.notes || "Kasbon",
      })
      .eq("id", transactionId)
      .eq("warung_id", warungId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    revalidatePath("/dashboard/warung");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Terjadi kesalahan." };
  }
}

export async function deleteWarungTransactionAction(transactionId: string) {
  try {
    const { supabase, warungId } = await getAuthenticatedWarung();

    // Proteksi: HANYA bisa delete jika warung_id cocok dengan user yang sedang login!
    const { error: delError } = await supabase
      .from("cash_advances")
      .delete()
      .eq("id", transactionId)
      .eq("warung_id", warungId);

    if (delError) {
      return { success: false, error: delError.message };
    }

    revalidatePath("/dashboard/warung");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Terjadi kesalahan." };
  }
}
