import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WarungPortal } from "./warung-portal";

export const metadata = {
  title: "Portal Warung | SMPT",
};

export default async function WarungPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const warungId = user.id;
  const warungName = "Dandi Store";

  // 1. Ambil pekerja (Gunakan RPC bawaan SMPT agar nama pekerja muncul di dropdown)
  let workers: any[] = [];
  try {
    const { data: rpcWorkers } = await supabase.rpc("smpt_get_active_workers_for_reference");
    if (rpcWorkers && rpcWorkers.length > 0) {
      workers = rpcWorkers;
    }
  } catch (e) {
    // Fallback jika RPC tidak tersedia
  }

  if (workers.length === 0) {
    const { data: directWorkers } = await supabase
      .from("workers")
      .select("id, name, worker_code, role, status")
      .order("name", { ascending: true });
    workers = directWorkers || [];
  }

  // 2. Ambil transaksi (Ambil data warung ini + 14 data lama Dandi Store agar tidak hilang)
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
    .or(`warung_id.eq.${warungId},warung_id.is.null,warung_name.ilike.%Dandi%`)
    .order("created_at", { ascending: false });

  const transactions = (transactionsData || []).map((t: any) => {
    // Cocokkan data pekerja
    const matchedWorker = workers.find((w: any) => String(w.id) === String(t.worker_id));

    return {
      id: String(t.id),
      worker_id: String(t.worker_id),
      worker_name: t.workers?.name || matchedWorker?.name || "Pekerja",
      worker_code: t.workers?.worker_code || matchedWorker?.worker_code || "-",
      worker_role: t.workers?.role || matchedWorker?.role || "PRODUKSI (BULANAN)",
      amount: Number(t.amount) || 0,
      notes: t.notes || "Kasbon",
      created_at: t.created_at,
      status: t.installments_paid > 0 ? "LUNAS" : "BELUM LUNAS",
      installments_paid: t.installments_paid || 0,
      warung_name: t.warung_name || warungName,
      items: (t.warung_transaction_items || []).map((item: any) => ({
        id: String(item.id),
        item_name: item.item_name,
        qty: Number(item.qty),
        unit_price: Number(item.unit_price),
        subtotal: Number(item.subtotal),
      })),
    };
  });

  return (
    <WarungPortal
      initialWorkers={workers}
      initialTransactions={transactions}
      currentWarung={{ id: warungId, name: warungName }}
    />
  );
}
