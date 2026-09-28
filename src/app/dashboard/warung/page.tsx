import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WarungPortal } from "./warung-portal";

export const metadata = {
  title: "Portal Warung | SMPT",
};

export default async function WarungPage() {
  const supabase = await createClient();

  // 1. Verifikasi User & Sesi
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect("/login");
  }

  const warungId = user.id;
  const warungName = (user.user_metadata?.warung_name as string) || 
                     (user.user_metadata?.full_name as string) || 
                     user.email?.split("@")[0] || 
                     "Warung Mitra";

  // 2. Query Pekerja Aktif
  const { data: workersData } = await supabase
    .from("workers")
    .select("id, name, worker_code, role, status")
    .eq("status", "AKTIF")
    .order("name", { ascending: true });

  const workers = workersData || [];

  // 3. Query Transaksi Khusus Warung Ini Saja (Multi-Tenant Filter)
  const { data: transactionsData } = await supabase
    .from("cash_advances")
    .select(`
      id,
      worker_id,
      amount,
      notes,
      created_at,
      status,
      installments_paid,
      warung_id,
      warung_name,
      workers (
        id,
        name,
        worker_code
      ),
      warung_transaction_items (
        id,
        item_name,
        qty,
        unit_price,
        subtotal
      )
    `)
    .eq("category", "KASBON_WARUNG")
    .eq("warung_id", warungId)
    .order("created_at", { ascending: false });

  const transactions = (transactionsData || []).map((t: any) => ({
    id: t.id,
    worker_id: t.worker_id,
    worker_name: t.workers?.name || "Tanpa Nama",
    worker_code: t.workers?.worker_code || "-",
    amount: Number(t.amount) || 0,
    notes: t.notes || "",
    created_at: t.created_at,
    status: t.status,
    installments_paid: t.installments_paid || 0,
    items: (t.warung_transaction_items || []).map((item: any) => ({
      id: item.id,
      item_name: item.item_name,
      qty: Number(item.qty),
      unit_price: Number(item.unit_price),
      subtotal: Number(item.subtotal),
    })),
  }));

  return (
    <WarungPortal
      initialWorkers={workers}
      initialTransactions={transactions}
      currentWarung={{ id: warungId, name: warungName }}
    />
  );
}
