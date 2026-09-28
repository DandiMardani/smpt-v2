import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WarungPortal } from "./warung-portal";

export const metadata = {
  title: "Portal Warung | SMPT",
};

export default async function WarungPage() {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    redirect("/login");
  }

  const warungId = user.id;
  const warungName = (user.user_metadata?.warung_name as string) || 
                     (user.user_metadata?.full_name as string) || 
                     "Dandi Store";

  // 1. Ambil data pekerja aktif
  const { data: workersData } = await supabase
    .from("workers")
    .select("id, name, worker_code, role, status")
    .eq("status", "AKTIF")
    .order("name", { ascending: true });

  const workers = workersData || [];

  // 2. Ambil transaksi khusus warung ini (Multi-Tenant)
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
        worker_code,
        role
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
    worker_role: t.workers?.role || "PRODUKSI (BULANAN)",
    amount: Number(t.amount) || 0,
    notes: t.notes || "Kasbon",
    created_at: t.created_at,
    status: t.installments_paid > 0 ? "LUNAS" : "BELUM LUNAS",
    installments_paid: t.installments_paid || 0,
    warung_name: t.warung_name || warungName,
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
