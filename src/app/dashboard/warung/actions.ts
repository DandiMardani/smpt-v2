"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function getAuthenticatedWarung() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Sesi login telah habis. Silakan login kembali.");
  }

  const warungName = "Dandi Store";
  return { supabase, user, warungId: user.id, warungName };
}

export async function createWarungTransactionAction(payload: {
  worker_id: string;
  notes?: string;
  is_direct_nominal: boolean;
  direct_amount?: number;
  items: Array<{ item_name: string; qty: number; unit_price: number; subtotal: number }>;
}) {
  try {
    const { supabase, warungId, warungName } = await getAuthenticatedWarung();

    let totalAmount = 0;
    if (payload.is_direct_nominal) {
      totalAmount = Number(payload.direct_amount) || 0;
    } else {
      totalAmount = payload.items.reduce((acc, item) => acc + (Number(item.subtotal) || 0), 0);
    }

    if (totalAmount <= 0) {
      return { success: false, error: "Total transaksi harus lebih dari Rp 0." };
    }

    // Insert ke cash_advances dengan status AKTIF sesuai sistem SMPT
    const { data: advance, error: advanceError } = await supabase
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
      })
      .select("id")
      .single();

    if (advanceError || !advance) {
      return { 
        success: false, 
        error: advanceError ? advanceError.message : "Gagal menyimpan nota transaksi ke pembukuan." 
      };
    }

    // Simpan rincian item jika ada
    if (!payload.is_direct_nominal && payload.items.length > 0) {
      const itemsToInsert = payload.items.map((it) => ({
        cash_advance_id: advance.id,
        item_name: it.item_name,
        qty: it.qty,
        unit_price: it.unit_price,
        subtotal: it.qty * it.unit_price,
      }));
      await supabase.from("warung_transaction_items").insert(itemsToInsert);
    }

    revalidatePath("/dashboard/warung");
    return { success: true, message: "Nota berhasil disimpan!" };
  } catch (err: any) {
    return { success: false, error: err.message || "Terjadi kesalahan internal." };
  }
}

export async function updateWarungTransactionAction(
  transactionId: string,
  payload: {
    worker_id: string;
    notes?: string;
    is_direct_nominal: boolean;
    direct_amount?: number;
    items: Array<{ item_name: string; qty: number; unit_price: number; subtotal: number }>;
  }
) {
  try {
    const { supabase } = await getAuthenticatedWarung();

    let totalAmount = 0;
    if (payload.is_direct_nominal) {
      totalAmount = Number(payload.direct_amount) || 0;
    } else {
      totalAmount = payload.items.reduce((acc, item) => acc + (Number(item.subtotal) || 0), 0);
    }

    const { error: updateError } = await supabase
      .from("cash_advances")
      .update({
        worker_id: payload.worker_id,
        amount: totalAmount,
        installment_amount: totalAmount,
        notes: payload.notes || "Kasbon",
      })
      .eq("id", transactionId);

    if (updateError) {
      return { success: false, error: updateError.message || "Gagal memperbarui nota." };
    }

    revalidatePath("/dashboard/warung");
    return { success: true, message: "Nota berhasil diperbarui!" };
  } catch (err: any) {
    return { success: false, error: err.message || "Terjadi kesalahan sistem." };
  }
}

export async function deleteWarungTransactionAction(transactionId: string) {
  try {
    const { supabase } = await getAuthenticatedWarung();
    const { error: delError } = await supabase
      .from("cash_advances")
      .delete()
      .eq("id", transactionId);

    if (delError) {
      return { success: false, error: delError.message || "Gagal membatalkan nota." };
    }

    revalidatePath("/dashboard/warung");
    return { success: true, message: "Nota berhasil dibatalkan." };
  } catch (err: any) {
    return { success: false, error: err.message || "Terjadi kesalahan." };
  }
}
