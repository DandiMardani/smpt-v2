import { Metric, Notice, PageShell, ReadOnly } from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { money, n, param, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { WarungPortal } from "./warung-portal";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const access = await requirePermission("warung.view");
  const canWrite = access.permissionCodes.includes("warung.write");
  const query = await searchParams;
  const supabase = await createClient();

  let workers: any[] = [];
  const [rpcWorkersResult, fallbackWorkersResult, warungAdvancesResult] = await Promise.all([
    supabase.rpc("smpt_get_active_workers_for_reference"),
    supabase
      .from("workers")
      .select("id,worker_code,name,pay_system,department,status")
      .eq("status", "AKTIF")
      .order("name"),
    supabase
      .from("cash_advances")
      .select("*")
      .eq("category", "KASBON_WARUNG")
      .order("advance_date", { ascending: false })
      .limit(1000),
  ]);

  if (warungAdvancesResult.error) throw new Error(warungAdvancesResult.error.message);

  if (rpcWorkersResult.data && rpcWorkersResult.data.length > 0) {
    workers = rpcWorkersResult.data;
  } else if (fallbackWorkersResult.data && fallbackWorkersResult.data.length > 0) {
    workers = fallbackWorkersResult.data;
  }

  const transactions = warungAdvancesResult.data ?? [];

  const todayStr = new Date().toISOString().slice(0, 10);
  let todayAmount = 0;
  let todayCount = 0;
  let totalUnpaid = 0;
  let totalPaid = 0;
  const debtorWorkerIds = new Set<number>();

  for (const tx of transactions) {
    const rem = n(tx.amount) - n(tx.paid_amount);
    if (tx.status === "AKTIF" && rem > 0) {
      totalUnpaid += rem;
      debtorWorkerIds.add(tx.worker_id);
    } else {
      totalPaid += n(tx.paid_amount || tx.amount);
    }

    if (tx.advance_date === todayStr) {
      todayAmount += n(tx.amount);
      todayCount += 1;
    }
  }

  return (
    <PageShell
      eyebrow="Portal Warung Mitra"
      title="Pencatatan Kasbon Warung Luar"
      description="Hak akses khusus pemilik warung luar untuk mencatat konsumsi/hutang makan pekerja harian, borongan, dan bulanan yang otomatis masuk ke slip gaji payroll."
    >
      <Notice success={param(query, "success")} error={param(query, "error")} />
      {!canWrite ? <ReadOnly /> : null}

      {/* Summary KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Tagihan Dicatat Hari Ini"
          value={money(todayAmount)}
        />
        <Metric
          label="Total Tagihan Belum Lunas"
          value={money(totalUnpaid)}
        />
        <Metric
          label="Pekerja Berhutang Aktif"
          value={`${debtorWorkerIds.size} orang`}
        />
        <Metric
          label="Total Sudah Terbayar (Payroll)"
          value={money(totalPaid)}
        />
      </div>

      {/* Interactive Portal Client Component */}
      <WarungPortal
        workers={workers}
        transactions={transactions}
        canWrite={canWrite}
      />
    </PageShell>
  );
}
