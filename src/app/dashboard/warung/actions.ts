"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface TransactionItemInput {
  item_name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

export interface WarungTransactionInput {
  worker_id: string;
  notes?: string;
  is_direct_nominal: boolean;
  direct_amount?: number;
  items: TransactionItemInput[];
}

// Helper untuk verifikasi sesi dan tenant warung aktif
async function getAuthenticatedWarung() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Sesi tidak valid. Silakan login kembali.");
  }

  // Cek metadata pengguna atau data profil
  const warungName = (user.user_metadata?.warung_name as string) || 
                     (user.user_metadata?.full_name as string) || 
                     user.email?.split("@")[0] || 
                     "Warung Mitra";

  return { supabase, user, warungId: user.id, warungName };
}

/**
 * 1. Simpan Transaksi Baru
 */
export async function createWarungTransactionAction(payload: WarungTransactionInput) {
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

    // 1. Insert ke tabel cash_advances (sebagai kasbon warung terintegrasi payroll)
    const { data: advance, error: advanceError } = await supabase
      .from("cash_advances")
      .insert({
        worker_id: payload.worker_id,
        amount: totalAmount,
        category: "KASBON_WARUNG",
        status: "APPROVED",
        notes: payload.notes || (payload.is_direct_nominal ? "Input Langsung Nominal" : "Rincian Item"),
        warung_id: warungId,
        warung_name: warungName,
        installment_count: 1,
        installment_amount: totalAmount,
        installments_paid: 0,
      })
      .select("id")
      .single();

    if (advanceError || !advance) {
      console.error("Gagal simpan cash_advances:", advanceError);
      return { success: false, error: "Gagal menyimpan nota transaksi ke pembukuan." };
    }

    // 2. Jika bukan direct nominal, simpan rincian item ke warung_transaction_items
    if (!payload.is_direct_nominal && payload.items.length > 0) {
      const itemsToInsert = payload.items.map((it) => ({
        cash_advance_id: advance.id,
        item_name: it.item_name,
        qty: it.qty,
        unit_price: it.unit_price,
        subtotal: it.qty * it.unit_price,
      }));

      const { error: itemsError } = await supabase
        .from("warung_transaction_items")
        .insert(itemsToInsert);

      if (itemsError) {
        console.error("Gagal simpan items:", itemsError);
      }
    }

    revalidatePath("/dashboard/warung");
    return { success: true, message: "Nota berhasil dicatat!" };
  } catch (err: any) {
    return { success: false, error: err.message || "Terjadi kesalahan internal." };
  }
}

/**
 * 2. Update / Edit Nota Transaksi
 */
export async function updateWarungTransactionAction(
  transactionId: string,
  payload: WarungTransactionInput
) {
  try {
    const { supabase, warungId } = await getAuthenticatedWarung();

    // Verifikasi bahwa transaksi ini milik warung yang bersangkutan dan belum terpotong payroll
    const { data: existing, error: checkError } = await supabase
      .from("cash_advances")
      .select("id, status, installments_paid")
      .eq("id", transactionId)
      .eq("warung_id", warungId)
      .single();

    if (checkError || !existing) {
      return { success: false, error: "Nota tidak ditemukan atau Anda tidak memiliki akses." };
    }

    if (existing.installments_paid > 0) {
      return { success: false, error: "Nota ini sudah dipotong dalam slip gaji dan tidak dapat diedit." };
    }

    let totalAmount = 0;
    if (payload.is_direct_nominal) {
      totalAmount = Number(payload.direct_amount) || 0;
    } else {
      totalAmount = payload.items.reduce((acc, item) => acc + (Number(item.subtotal) || 0), 0);
    }

    // Update header cash_advances
    const { error: updateError } = await supabase
      .from("cash_advances")
      .update({
        worker_id: payload.worker_id,
        amount: totalAmount,
        installment_amount: totalAmount,
        notes: payload.notes || (payload.is_direct_nominal ? "Input Langsung Nominal" : "Rincian Item"),
      })
      .eq("id", transactionId);

    if (updateError) {
      return { success: false, error: "Gagal memperbarui total nota." };
    }

    // Replace items
    await supabase.from("warung_transaction_items").delete().eq("cash_advance_id", transactionId);

    if (!payload.is_direct_nominal && payload.items.length > 0) {
      const itemsToInsert = payload.items.map((it) => ({
        cash_advance_id: transactionId,
        item_name: it.item_name,
        qty: it.qty,
        unit_price: it.unit_price,
        subtotal: it.qty * it.unit_price,
      }));

      await supabase.from("warung_transaction_items").insert(itemsToInsert);
    }

    revalidatePath("/dashboard/warung");
    return { success: true, message: "Nota berhasil diperbarui!" };
  } catch (err: any) {
    return { success: false, error: err.message || "Terjadi kesalahan sistem." };
  }
}

/**
 * 3. Hapus / Batalkan Nota
 */
export async function deleteWarungTransactionAction(transactionId: string) {
  try {
    const { supabase, warungId } = await getAuthenticatedWarung();

    const { data: existing, error: checkError } = await supabase
      .from("cash_advances")
      .select("id, installments_paid")
      .eq("id", transactionId)
      .eq("warung_id", warungId)
      .single();

    if (checkError || !existing) {
      return { success: false, error: "Nota tidak ditemukan atau Anda tidak berhak menghapusnya." };
    }

    if (existing.installments_paid > 0) {
      return { success: false, error: "Nota tidak bisa dihapus karena sudah masuk ke pemotongan slip gaji." };
    }

    // CASCADE delete akan otomatis menghapus item di warung_transaction_items
    const { error: delError } = await supabase
      .from("cash_advances")
      .delete()
      .eq("id", transactionId);

    if (delError) {
      return { success: false, error: "Gagal membatalkan nota." };
    }

    revalidatePath("/dashboard/warung");
    return { success: true, message: "Nota berhasil dibatalkan." };
  } catch (err: any) {
    return { success: false, error: err.message || "Terjadi kesalahan." };
  }
}
