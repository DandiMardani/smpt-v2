import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WarungPortal } from "./warung-portal";

export default async function WarungPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const warungId = user.id;
  const userEmail = (user.email || "").toLowerCase();
  const isDandi = userEmail.includes("dandi");
  const warungName = isDandi 
    ? "Dandi Store" 
    : (user.user_metadata?.warung_name || user.email?.split("@")[0] || "Warung Mitra");

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

  // 2. OTOMATIS: Kunci 14 nota lama Dandi Store ke ID akun Dandi jika belum terkunci
  if (isDandi) {
    await supabase
      .from("cash_advances")
      .update({ warung_id: warungId })
      .eq("category", "KASBON_WARUNG")
      .is("warung_id", null);
  }

  // 3. ISOLASI MUTLAK: HANYA ambil data yang warung_id-nya SAMA PERSIS dengan ID user login!
  const { data: transactionsData } = await supabase
    .from("cash_advances")
    .select("id, worker_id, amount, notes, created_at, status, installments_paid, warung_name, warung_id")
    .eq("category", "KASBON_WARUNG")
    .eq("warung_id", warungId)
    .order("created_at", { ascending: false });

  const transactions = (transactionsData || []).map((t: any) => {
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
