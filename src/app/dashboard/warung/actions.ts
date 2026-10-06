"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentAccessContext } from "@/lib/access/current-user";
import { revalidatePath } from "next/cache";

async function getAuth() {
  const access = await getCurrentAccessContext();
  const supabase = await createClient();

  const isAdmin = access.role === "ADMIN" || access.permissionCodes.includes("warung.admin");
  const warungName = access.displayName || "Warung Mitra";

  return { supabase, user: { id: access.userId, email: access.email }, warungId: access.userId, warungName, isAdmin };
}

export async function createWarungTransactionAction(payload: {
  worker_id: string;
  notes?: string;
  is_direct_nominal: boolean;
  direct_amount?: number;
  items?: Array<{ item_name: string; qty: number; unit_price: number; subtotal: number }>;
  warung_name?: string;
  advance_date?: string;
}) {
  try {
    const { supabase, warungId, warungName, isAdmin } = await getAuth();
    const totalAmount = Number(payload.direct_amount) || 0;
    if (totalAmount <= 0) return { success: false, error: "Nominal harus lebih dari 0." };

    const assignedWarungName = isAdmin && payload.warung_name ? payload.warung_name : warungName;
    const effectiveDate = payload.advance_date || new Date().toLocaleDateString("en-CA");

    const { error } = await supabase.from("cash_advances").insert({
      worker_id: payload.worker_id,
      amount: totalAmount,
      paid_amount: 0,
      category: "KASBON_WARUNG",
      status: "AKTIF",
      notes: payload.notes || "Kasbon",
      warung_id: warungId,
      warung_name: assignedWarungName,
      installment_count: 1,
      installment_amount: totalAmount,
      installments_paid: 0,
      advance_date: effectiveDate,
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
    paid_amount?: number;
    items?: Array<{ item_name: string; qty: number; unit_price: number; subtotal: number }>;
    warung_name?: string;
    advance_date?: string;
  }
) {
  try {
    const { supabase, warungId, isAdmin } = await getAuth();
    const totalAmount = Number(payload.direct_amount) || 0;
    const paidAmount = Math.max(0, Number(payload.paid_amount) || 0);

    if (totalAmount <= 0) return { success: false, error: "Nominal harus lebih dari 0." };

    const newStatus = paidAmount >= totalAmount ? "LUNAS" : "AKTIF";

    let query = supabase
      .from("cash_advances")
      .update({
        worker_id: payload.worker_id,
        amount: totalAmount,
        paid_amount: paidAmount,
        installment_amount: totalAmount,
        notes: payload.notes || "Kasbon",
        status: newStatus,
        ...(payload.advance_date ? { advance_date: payload.advance_date } : {}),
        ...(payload.warung_name ? { warung_name: payload.warung_name } : {}),
      })
      .eq("id", transactionId);

    if (!isAdmin) {
      query = query.eq("warung_id", warungId);
    }

    const { error } = await query;

    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/warung");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function recordWarungPaymentAction(
  transactionId: string,
  paidAmount: number
) {
  try {
    const { supabase, warungId, isAdmin } = await getAuth();

    let queryFetch = supabase
      .from("cash_advances")
      .select("id, amount, warung_id")
      .eq("id", transactionId);

    if (!isAdmin) {
      queryFetch = queryFetch.eq("warung_id", warungId);
    }

    const { data: currentTx, error: fetchErr } = await queryFetch.single();
    if (fetchErr || !currentTx) throw new Error("Data nota tidak ditemukan.");

    const totalAmount = Number(currentTx.amount) || 0;
    const cleanPaid = Math.max(0, Math.min(totalAmount, Number(paidAmount) || 0));
    const newStatus = cleanPaid >= totalAmount ? "LUNAS" : "AKTIF";

    let queryUpdate = supabase
      .from("cash_advances")
      .update({
        paid_amount: cleanPaid,
        status: newStatus,
      })
      .eq("id", transactionId);

    if (!isAdmin) {
      queryUpdate = queryUpdate.eq("warung_id", warungId);
    }

    const { error: updateErr } = await queryUpdate;
    if (updateErr) throw new Error(updateErr.message);

    revalidatePath("/dashboard/warung");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteWarungTransactionAction(transactionId: string) {
  try {
    const { supabase, warungId, isAdmin } = await getAuth();

    let query = supabase.from("cash_advances").delete().eq("id", transactionId);

    if (!isAdmin) {
      query = query.eq("warung_id", warungId);
    }

    const { error } = await query;

    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/warung");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
