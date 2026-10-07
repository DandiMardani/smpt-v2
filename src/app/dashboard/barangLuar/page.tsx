import { Notice, PageShell, ReadOnly } from "@/components/final/final-ui";
import { BarangLuarManager } from "@/components/barang-luar/barang-luar-manager";
import { SarungKoperMonitoring } from "@/components/sarung-koper/sarung-koper-monitoring";
import { requirePermission } from "@/lib/access/current-user";
import { param, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("barang_luar.view");
  const canReceive = a.permissionCodes.includes("barang_luar.receive");
  const q = await searchParams;
  const s = await createClient();

  const [pr, fr, vr, lr, rr, dpRes, poRes, logsRes] = await Promise.all([
    s.from("projects").select("id,name,status").order("name").limit(300),
    s.from("finished_goods").select("id,finished_good_code,name,unit,project_id,status").eq("status", "AKTIF").order("name").limit(1000),
    s.from("vendors").select("id,vendor_code,name,status").eq("status", "AKTIF").order("name").limit(500),
    s.from("locations").select("id,name,status").eq("status", "AKTIF").order("name").limit(200),
    s.from("external_finished_receipts").select("*").order("receipt_date", { ascending: false }).order("id", { ascending: false }).limit(500),
    s.from("vendor_down_payments").select("*").order("payment_date", { ascending: false }),
    s.from("vendor_po_targets").select("*").order("id", { ascending: true }),
    s.from("vendor_delivery_logs").select("*").order("delivery_date", { ascending: false }).order("id", { ascending: false }),
  ]);

  const e = [pr.error, fr.error, vr.error, lr.error, rr.error].find(Boolean);
  if (e) throw new Error(e.message);

  const activeProjects = ((pr.data ?? []) as any[]).filter(
    (x: any) => !["SELESAI", "NONAKTIF", "BATAL", "DIBATALKAN"].includes(String(x.status || "").toUpperCase()),
  );

  return (
    <PageShell
      eyebrow="QC & Logistik"
      title="Barang Luar"
      description="Penerimaan barang jadi dari rekanan / supplier ke gudang perusahaan. Fleksibel terkait proyek maupun stok umum bebas."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canReceive ? <ReadOnly /> : null}

      {/* DASHBOARD MONITORING SUPPLIER & POTONGAN DP REAL-DATABASE */}
      <div className="mb-6">
        <SarungKoperMonitoring
          vendors={(vr.data ?? []) as any[]}
          downPayments={(dpRes.data ?? []) as any[]}
          poTargets={(poRes.data ?? []) as any[]}
          deliveryLogs={(logsRes.data ?? []) as any[]}
          canEdit={canReceive}
        />
      </div>

      <BarangLuarManager
        receipts={(rr.data ?? []) as any[]}
        projects={activeProjects}
        finishedGoods={(fr.data ?? []) as any[]}
        vendors={(vr.data ?? []) as any[]}
        locations={(lr.data ?? []) as any[]}
        canReceive={canReceive}
      />
    </PageShell>
  );
}
