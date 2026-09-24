import { Notice, PageShell, ReadOnly } from "@/components/final/final-ui";
import { ManufakturManager } from "@/components/manufaktur/manufaktur-manager";
import { requirePermission } from "@/lib/access/current-user";
import { param, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("manufaktur.view");
  const canTit = a.permissionCodes.includes("manufaktur.titipan.write");
  const canLuar = a.permissionCodes.includes("manufaktur.barang_luar.write");
  const canShip = a.permissionCodes.includes("manufaktur.pengiriman.write");
  const can = canTit || canLuar || canShip;

  const q = await searchParams;
  const s = await createClient();

  const [pr, mr, fr, vr, tr] = await Promise.all([
    s
      .from("projects")
      .select("id,name,status")
      .order("name")
      .limit(300),
    s
      .from("materials")
      .select("id,material_code,name,standard_unit,status")
      .eq("status", "AKTIF")
      .order("name")
      .limit(1000),
    s
      .from("finished_goods")
      .select("id,project_id,finished_good_code,name,unit,status")
      .eq("status", "AKTIF")
      .order("name")
      .limit(1000),
    s
      .from("vendors")
      .select("id,vendor_code,name,status")
      .eq("status", "AKTIF")
      .order("name")
      .limit(500),
    s
      .from("manufacturing_transactions")
      .select("*")
      .order("transaction_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(500),
  ]);

  const e = [pr.error, mr.error, fr.error, vr.error, tr.error].find(Boolean);
  if (e) throw new Error(e.message);

  const activeProjects = ((pr.data ?? []) as any[]).filter(
    (x: any) => !["SELESAI", "NONAKTIF", "BATAL", "DIBATALKAN"].includes(String(x.status || "").toUpperCase()),
  );

  return (
    <PageShell
      eyebrow="Produksi & Manufaktur"
      title="Produksi Internal & Eksternal"
      description="Pencatatan fleksibel bahan baku dan barang jadi titipan (non-aset), penerimaan barang luar, dan mutasi eksternal."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!can ? <ReadOnly /> : null}

      <ManufakturManager
        transactions={(tr.data ?? []) as any[]}
        projects={activeProjects}
        materials={(mr.data ?? []) as any[]}
        finishedGoods={(fr.data ?? []) as any[]}
        vendors={(vr.data ?? []) as any[]}
        canTitipan={canTit}
        canBarangLuar={canLuar}
        canPengiriman={canShip}
      />
    </PageShell>
  );
}
