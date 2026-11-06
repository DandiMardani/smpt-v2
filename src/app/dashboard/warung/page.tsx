import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WarungPortal } from "./warung-portal";

export default async function WarungPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const warungId = user.id;
  const userEmail = (user.email || "").toLowerCase();

  // Admin Dandi memiliki otoritas melihat seluruh kartu warung
  const isAdmin =
    userEmail.includes("dandi") ||
    userEmail.includes("admin") ||
    userEmail.includes("smpt");

  const defaultWarungName = isAdmin
    ? "Dandi Store"
    : (user.user_metadata?.warung_name || user.email?.split("@")[0] || "Warung Mitra");

  // 1. Ambil data master pekerja
  let workers: any[] = [];
  try {
    const { data } = await supabase.rpc("smpt_get_active_workers_for_reference");
    if (data?.length) workers = data;
  } catch (e) {}

  if (!workers.length) {
    const { data } = await supabase
      .from("workers")
      .select("id, name, worker_code, role, pay_system, department")
      .order("name");
    workers = data || [];
  }

  // 2. Hak Akses Query Data Transaksi:
  // - Admin: Ambil SELURUH kasbon warung agar bisa melihat kartu per-warung
  // - User Warung Mitra: HANYA ambil data yang sesuai warung miliknya
  let query = supabase
    .from("cash_advances")
    .select("id, worker_id, amount, paid_amount, notes, created_at, advance_date, status, installments_paid, warung_name, warung_id")
    .eq("category", "KASBON_WARUNG")
    .order("created_at", { ascending: false });

  if (!isAdmin) {
    query = query.or(`warung_id.eq.${warungId},warung_name.ilike.%${defaultWarungName}%`);
  }

  const [txRes, paidPayrollRes] = await Promise.all([
    query,
    supabase
      .from("payroll_run_items")
      .select("id, worker_id, payment_status, payroll_runs(id, status, period_start, period_end, notes, config_snapshot)")
      .neq("payment_status", "DIBATALKAN"),
  ]);

  const transactionsData = txRes.data || [];
  const paidPayrollItems = paidPayrollRes.data || [];

  const transactions = transactionsData.map((t: any) => {
    const w = workers.find((item: any) => String(item.id) === String(t.worker_id));
    const effectiveWarungName = t.warung_name && t.warung_name.trim() !== "" ? t.warung_name : "Dandi Store";
    const remAmount = Math.max(0, (Number(t.amount) || 0) - (Number(t.paid_amount) || 0));

    // Evaluasi pengunci payroll
    const isLockedByPayroll = paidPayrollItems.some((item: any) => {
      if (String(item.worker_id) !== String(t.worker_id)) return false;
      const run = item.payroll_runs;
      if (!run) return false;
      const itemStatus = String(item.payment_status || "").toUpperCase();
      const runStatus = String(run.status || "").toUpperCase();
      const isPaid =
        itemStatus === "PAID" ||
        itemStatus === "SUDAH_DIBAYAR" ||
        itemStatus === "SUDAH DIBAYAR" ||
        runStatus === "PAID" ||
        runStatus === "FINAL" ||
        runStatus === "SUDAH_DIBAYAR" ||
        String(run.notes || "").toLowerCase().includes("sudah dibayar");

      if (!isPaid) return false;

      const tDate = t.advance_date || (t.created_at ? String(t.created_at).slice(0, 10) : "");
      return tDate >= run.period_start && tDate <= run.period_end;
    });

    const isLocked =
      t.status === "LUNAS" ||
      (Number(t.paid_amount || 0) >= Number(t.amount || 0) && Number(t.amount || 0) > 0) ||
      String(t.notes || "").toLowerCase().includes("payroll") ||
      String(t.notes || "").toLowerCase().includes("lunas via") ||
      isLockedByPayroll;

    return {
      id: String(t.id),
      worker_id: String(t.worker_id),
      worker_name: w?.name || "Pekerja",
      worker_code: w?.worker_code || "-",
      worker_role: w?.role || w?.department || "PRODUKSI",
      amount: Number(t.amount) || 0,
      paid_amount: Number(t.paid_amount) || 0,
      remaining_amount: remAmount,
      notes: t.notes || "Kasbon Warung",
      created_at: t.advance_date || t.created_at,
      status: t.status || "AKTIF",
      installments_paid: t.installments_paid || 0,
      warung_name: effectiveWarungName,
      warung_id: t.warung_id || (effectiveWarungName === "Dandi Store" ? warungId : null),
      is_locked: isLocked,
    };
  });

  const PortalComponent = WarungPortal as any;

  return (
    <PortalComponent
      initialWorkers={workers}
      initialTransactions={transactions}
      currentWarung={{ id: warungId, name: defaultWarungName }}
      isAdmin={isAdmin}
    />
  );
}
