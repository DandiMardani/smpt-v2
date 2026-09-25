import {
  Card,
  Metric,
  Notice,
  PageShell,
  ReadOnly,
} from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { money, n, param, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { KasbonForm } from "@/components/kasbon/kasbon-form";
import { KasbonList, type CashAdvanceItem } from "@/components/kasbon/kasbon-list";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("kasbon.view");
  const canWrite = a.permissionCodes.includes("kasbon.write");
  const q = await searchParams;
  const s = await createClient();

  const [wr, ar] = await Promise.all([
    s.from("workers").select("id,worker_code,name,pay_system,department,status").eq("status", "AKTIF").order("name"),
    s.from("cash_advances").select("*").order("advance_date", { ascending: false }).limit(1000),
  ]);
  const e = [wr.error, ar.error].find(Boolean);
  if (e) throw new Error(e.message);

  const workers = wr.data ?? [];
  const advances = (ar.data ?? []) as CashAdvanceItem[];

  const workerMap: Record<number, any> = {};
  for (const w of workers) {
    workerMap[w.id] = w;
  }

  // Calculate summary metrics
  let totalPerusahaanRem = 0;
  let totalWarungRem = 0;
  const activeWorkerIdsWithDebt = new Set<number>();

  for (const adv of advances) {
    if (adv.status === "AKTIF") {
      const rem = n(adv.amount) - n(adv.paid_amount);
      if (rem > 0) {
        activeWorkerIdsWithDebt.add(adv.worker_id);
        if (adv.category === "KASBON_WARUNG") {
          totalWarungRem += rem;
        } else {
          totalPerusahaanRem += rem;
        }
      }
    }
  }

  return (
    <PageShell
      eyebrow="SDM & Payroll"
      title="Kasbon & Hutang Warung"
      description="Manajemen saldo pinjaman internal perusahaan dengan sistem angsuran/cicilan bulanan, dan pencatatan hutang makan/belanja di warung mitra luar."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnly /> : null}

      {/* Summary Metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Hutang Warung Aktif" value={money(totalWarungRem)} />
        <Metric label="Sisa Kasbon Perusahaan" value={money(totalPerusahaanRem)} />
        <Metric label="Total Hutang Berjalan" value={money(totalWarungRem + totalPerusahaanRem)} />
        <Metric label="Pekerja Berhutang" value={`${activeWorkerIdsWithDebt.size} orang`} />
      </div>

      {canWrite ? (
        <Card title="Tambah Kasbon Baru / Catat Hutang Warung">
          <KasbonForm workers={workers} />
        </Card>
      ) : null}

      <Card title="Daftar Kasbon & Riwayat Pembayaran">
        <KasbonList
          advances={advances}
          workerMap={workerMap}
          canWrite={canWrite}
        />
      </Card>
    </PageShell>
  );
}
