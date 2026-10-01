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

  // Kunci data murni pinjaman kantor (KASBON_WARUNG tidak ditarik ke sini)
  const [wr, ar] = await Promise.all([
    s
      .from("workers")
      .select("id,worker_code,name,pay_system,department,status")
      .eq("status", "AKTIF")
      .order("name"),
    s
      .from("cash_advances")
      .select("*")
      .in("category", ["KASBON_PERUSAHAAN", "KASBON_KANTOR"])
      .order("advance_date", { ascending: false })
      .limit(1000),
  ]);
  const e = [wr.error, ar.error].find(Boolean);
  if (e) throw new Error(e.message);

  const workers = wr.data ?? [];
  const advances = (ar.data ?? []) as CashAdvanceItem[];

  const workerMap: Record<number, any> = {};
  for (const w of workers) {
    workerMap[w.id] = w;
  }

  // Hitung ringkasan murni kasbon kantor perusahaan
  let totalPerusahaanRem = 0;
  let totalPerusahaanPaid = 0;
  const activeWorkerIdsWithDebt = new Set<number>();

  for (const adv of advances) {
    if (adv.status === "AKTIF") {
      const rem = n(adv.amount) - n(adv.paid_amount);
      if (rem > 0) {
        activeWorkerIdsWithDebt.add(adv.worker_id);
        totalPerusahaanRem += rem;
      }
    }
    totalPerusahaanPaid += n(adv.paid_amount);
  }

  return (
    <PageShell
      eyebrow="SDM & Payroll"
      title="Kasbon Pinjaman Kantor"
      description="Manajemen saldo pinjaman internal perusahaan dengan sistem angsuran bulanan atau pelunasan langsung."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnly /> : null}

      {/* Summary Metrics Murni Pinjaman Kantor */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Sisa Pinjaman Berjalan" value={money(totalPerusahaanRem)} />
        <Metric label="Total Terbayar / Diangsur" value={money(totalPerusahaanPaid)} />
        <Metric label="Pengajuan Aktif" value={`${advances.filter((a) => a.status === "AKTIF").length} transaksi`} />
        <Metric label="Pekerja Berhutang" value={`${activeWorkerIdsWithDebt.size} orang`} />
      </div>

      {canWrite ? (
        <Card title="Tambah Kasbon Perusahaan Baru">
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
