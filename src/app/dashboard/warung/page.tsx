import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WarungPortal } from "./warung-portal";

export default async function WarungPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const warungId = user.id;
  const userMeta = (user.user_metadata?.warung_name as string) || (user.user_metadata?.full_name as string) || "";
  const isWarungLain = userMeta && !userMeta.toLowerCase().includes("dandi");
  const warungName = isWarungLain ? userMeta : "Dandi Store";

  // 1. Ambil data pekerja
  let workers: any[] = [];
  try {
    const { data } = await supabase.rpc("smpt_get_active_workers_for_reference");
    if (data?.length) workers = data;
  } catch (e) {}

  if (!workers.length) {
    const { data } = await supabase.from("workers").select("id, name, worker_code, role").order("name");
    workers = data || [];
  }

  // 2. Ambil transaksi kasbon warung
  const { data: rawTx } = await supabase
    .from("cash_advances")
    .select("id, worker_id, amount, notes, created_at, status, installments_paid, warung_name, warung_id")
    .eq("category", "KASBON_WARUNG")
    .order("created_at", { ascending: false });

  // 3. Filter: Akun Dandi melihat nota miliknya + 14 nota lama. Warung lain hanya melihat nota miliknya sendiri.
  const myTx = (rawTx || []).filter((t: any) => {
    if (isWarungLain) {
      return (t.warung_id && t.warung_id === warungId) || 
             (t.warung_name && t.warung_name.toLowerCase() === warungName.toLowerCase());
    }
    // Akun Dandi
    if (t.warung_id === warungId) return true;
    if (!t.warung_id && (t.warung_name || "dandi").toLowerCase().includes("dandi")) return true;
    if (!t.warung_id && !isWarungLain) return true;
    return false;
  });

  const transactions = myTx.map((t: any) => {
    const w = workers.find((item: any) => String(item.id) === String(t.worker_id));
    return {
      id: String(t.id),
      worker_id: String(t.worker_id),
      worker_name: w?.name || "Pekerja",
      worker_code: w?.worker_code || "-",
      worker_role: w?.role || "PRODUKSI (BULANAN)",
      amount: Number(t.amount) || 0,
      notes: t.notes || "Kasbon",
      created_at: t.created_at,
      status: t.status || "AKTIF",
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
