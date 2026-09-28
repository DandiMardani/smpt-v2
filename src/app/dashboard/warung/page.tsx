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
  const warungName = (user.user_metadata?.warung_name as string) || 
                     (user.user_metadata?.full_name as string) || 
                     user.email?.split("@")[0] || 
                     "Warung Mitra";

  // 1. Ambil data pekerja
  let workers: any[] = [];
  try {
    const { data: rpcWorkers } = await supabase.rpc("smpt_get_active_workers_for_reference");
    if (rpcWorkers && rpcWorkers.length > 0) {
      workers = rpcWorkers;
    }
  } catch (e) {}

  if (workers.length === 0) {
    const { data: directWorkers } = await supabase
      .from("workers")
      .select("id, name, worker_code, role, status")
      .order("name", { ascending: true });
    workers = directWorkers || [];
  }

  // 2. ISOLASI DATA: HANYA ambil transaksi milik akun warung yang sedang login!
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
      warung_name,
      warung_id
    `)
    .eq("category", "KASBON_WARUNG")
    .eq("warung_id", warungId)
    .order("created_at", { ascending: false });

  const transactions = (transactionsData || []).map((t: any) => {
    const matchedWorker = workers.find((w: any) => String(w.id) === String(t.worker_id));
    return {
      id: String(t.id),
      worker_id: String(t.worker_id),
      worker_name: matchedWorker?.name || "Pekerja",
      worker_code: matchedWorker?.worker_code || "-",
      worker_role: matchedWorker?.role || "PRODUKSI (BULANAN)",
      amount: Number(t.amount) || 0,
      notes: t.notes || "Kasbon",
      created_at: t.created_at,
      status: t.status === "LUNAS" || t.installments_paid > 0 ? "LUNAS" : "BELUM LUNAS",
      installments_paid: t.installments_paid || 0,
      warung_name: t.warung_name || warungName,
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
