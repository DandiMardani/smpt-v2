import {
  Field,
  inputClass,
  MasterPageShell,
  Notice,
  primaryButtonClass,
  ReadOnlyBanner,
  SectionCard,
  secondaryButtonClass,
} from "@/components/master/master-ui";
import { Badge, FlowNote, Metric } from "@/components/operations/ops-ui";
import { requirePermission } from "@/lib/access/current-user";
import { formatNumber, param, type SearchParams } from "@/lib/master/page-utils";
import { createClient } from "@/lib/supabase/server";
import { MonitoringMaterialTable, type MonitoringRow } from "./monitoring-table";
import { WipListClient } from "./wip-list-client";

type Props = { searchParams: Promise<SearchParams> };
type L = { id: number; code: string; name: string; physical_group: string };
type B = {
  id: number;
  item_kind: string;
  material_id: number | null;
  cutting_component_id: number | null;
  location_id: number;
  project_id: number | null;
  product_id: number | null;
  quantity: number | string;
};
type M = { id: number; material_code: string; name: string; standard_unit: string; category?: string };
type C = { id: number; component_code: string; name: string; color: string; unit: string };
type P = { id: number; name: string };
type PP = { id: number; name: string };

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("stok_gudang.view");
  const canWrite = a.permissionCodes.includes("stok_gudang.write");
  const q = await searchParams;
  const currentTab = param(q, "tab") || "stok";
  const s = await createClient();

  const [lr, br, mr, cr, pr, ppr, wrr, bmr, slr] = await Promise.all([
    s.from("stock_locations").select("id,code,name,physical_group"),
    s.from("stock_balances").select("id,item_kind,material_id,cutting_component_id,location_id,project_id,product_id,quantity").gt("quantity", 0),
    s.from("materials").select("id,material_code,name,standard_unit,category"),
    s.from("cutting_components").select("id,component_code,name,color,unit"),
    s.from("projects").select("id,name"),
    s.from("project_products").select("id,name"),
    s.from("warehouse_receipts").select("material_id,quantity"),
    s.from("bom_requirements").select("material_id,product_id,qty_per_unit").eq("status", "AKTIF").eq("component_type", "BAHAN"),
    s.from("stock_ledger_entries").select("id,event_id,item_kind,cutting_component_id,location_id,movement_kind,quantity_delta,unit_snapshot,notes,created_at").eq("item_kind", "CUTTING_COMPONENT").order("id", { ascending: false }).limit(1000),
  ]);

  const e = [lr.error, br.error, mr.error, cr.error, pr.error, ppr.error, slr.error].find(Boolean);
  if (e) throw new Error(e.message);

  const locs = (lr.data ?? []) as L[];
  const rows = (br.data ?? []) as B[];
  const materials = (mr.data ?? []) as M[];
  const receipts = (wrr.data ?? []) as { material_id: number; quantity: number | string }[];
  const boms = (bmr.data ?? []) as { material_id: number; product_id: number; qty_per_unit: number | string }[];

  const lm = new Map(locs.map((x) => [x.id, x]));
  const mm = new Map(materials.map((x) => [x.id, x]));
  const cm = new Map(((cr.data ?? []) as C[]).map((x) => [x.id, x]));
  const pm = new Map(((pr.data ?? []) as P[]).map((x) => [x.id, x]));
  const ppm = new Map(((ppr.data ?? []) as PP[]).map((x) => [x.id, x]));

  const raw = rows.filter((x) => lm.get(x.location_id)?.code === "GUDANG_BAHAN");
  const wip = rows.filter((x) => lm.get(x.location_id)?.physical_group === "GUDANG_HASIL");

  // Sum total masuk per material
  const totalMasukMap = new Map<number, number>();
  receipts.forEach((r) => {
    totalMasukMap.set(r.material_id, (totalMasukMap.get(r.material_id) || 0) + Number(r.quantity));
  });

  // Calculate monitoring per material
  const targetProduction = 22600; // Asumsi paket proyek haji penuh

  // Specs for Tas Paspor & Ransel (products 3 & 4) and Lapisan (products 1 & 2)
  const specPasporRanselMap = new Map<number, number>();
  const specLapisanMap = new Map<number, number>();

  boms.forEach((b) => {
    if (!b.material_id) return;
    const qVal = Number(b.qty_per_unit || 0);
    if ([3, 4].includes(b.product_id)) {
      specPasporRanselMap.set(b.material_id, (specPasporRanselMap.get(b.material_id) || 0) + qVal);
    } else if ([1, 2].includes(b.product_id)) {
      specLapisanMap.set(b.material_id, (specLapisanMap.get(b.material_id) || 0) + qVal);
    }
  });

  const pasporRanselCodes = [
    "A010", "A011", "A015", "AB03", "AB01", "A019", "A020", "A023", "A024",
    "A026", "A028", "A029", "A031", "A032", "A033", "A035", "B010"
  ];
  const lapisanCodes = [
    "A005", "AB02", "A003", "A002", "A006", "A008", "A004", "A034", "A009"
  ];

  const monitoringRows: MonitoringRow[] = [];

  materials.forEach((m) => {
    let group = "MATERIAL LAINNYA";
    let spec = 0;

    if (pasporRanselCodes.includes(m.material_code)) {
      group = "TAS PASPORT + TAS RANSEL";
      spec = specPasporRanselMap.get(m.id) || 0;
    } else if (lapisanCodes.includes(m.material_code)) {
      group = "LAPISAN KOPER / HAJI";
      spec = specLapisanMap.get(m.id) || 0;
    } else {
      spec = (specPasporRanselMap.get(m.id) || 0) + (specLapisanMap.get(m.id) || 0);
    }

    const masuk = totalMasukMap.get(m.id) || 0;
    const butuh = Math.round(spec * targetProduction);
    const selisih = masuk - butuh;

    if (masuk > 0 || butuh > 0 || pasporRanselCodes.includes(m.material_code) || lapisanCodes.includes(m.material_code)) {
      monitoringRows.push({
        materialId: m.id,
        materialCode: m.material_code,
        name: m.name,
        unit: m.standard_unit,
        categoryGroup: group,
        specPerPcs: Number(spec.toFixed(4)),
        totalMasuk: masuk,
        totalKebutuhan: butuh,
        selisih,
        status: selisih < 0 ? "DEFISIT" : selisih > 0 ? "SURPLUS" : "SESUAI",
      });
    }
  });

  return (
    <MasterPageShell
      eyebrow="Gudang & Material"
      title={currentTab === "monitoring" ? "Monitoring Material Proyek" : "Stok Gudang Material"}
      description={
        currentTab === "monitoring"
          ? "Perbandingan langsung antara Total Kebutuhan Proyek (BOM) dengan Realisasi Barang Masuk Gudang (Surplus / Defisit)."
          : "Saldo cepat stok fisik bahan baku di rak dan barang dalam proses (WIP) pabrik."
      }
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      {currentTab === "monitoring" ? (
        <MonitoringMaterialTable rows={monitoringRows} targetProduction={targetProduction} />
      ) : (
        <>
          <FlowNote>
            Gudang Hasil tetap satu custody fisik, dengan state logis: belum ditentukan, untuk Sablon, dan selesai Sablon.
          </FlowNote>

          <div className="mb-3">
            <a href="/dashboard/stokGudang/rollLot" className={secondaryButtonClass}>
              Kelola Stock Roll / Lot
            </a>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Jenis Bahan" value={raw.length} />
            <Metric label="Baris WIP Gudang Hasil" value={wip.length} />
          </div>

          <SectionCard title="Gudang Bahan">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {raw.map((b) => {
                const m = b.material_id ? mm.get(b.material_id) : undefined;
                return (
                  <div key={b.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                    <b className="font-bold text-slate-900">{m?.material_code} · {m?.name}</b>
                    <p className="mt-2 text-2xl font-bold text-blue-600">
                      {formatNumber(b.quantity)} <span className="text-sm font-normal text-slate-500">{m?.standard_unit}</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            title={`Gudang Hasil / WIP (${wip.length})`}
            description="Pantau barang potongan hasil cutting. Buka form mutasi untuk mengalirkan ke Sablon atau Siap Produksi, serta cek riwayat log pergerakan."
          >
            <WipListClient
              items={wip.map((b) => {
                const c = b.cutting_component_id ? cm.get(b.cutting_component_id) : undefined;
                const l = lm.get(b.location_id);
                return {
                  id: b.id,
                  cutting_component_id: b.cutting_component_id,
                  location_id: b.location_id,
                  project_id: b.project_id,
                  product_id: b.product_id,
                  quantity: b.quantity,
                  component_code: c?.component_code,
                  component_name: c?.name,
                  component_color: c?.color,
                  component_unit: c?.unit,
                  location_code: l?.code,
                  location_name: l?.name,
                  project_name: b.project_id ? pm.get(b.project_id)?.name : undefined,
                  product_name: b.product_id ? ppm.get(b.product_id)?.name : undefined,
                };
              })}
              ledgerEntries={((slr.data ?? []) as any[]).map((e) => {
                const l = lm.get(e.location_id);
                return {
                  id: e.id,
                  event_id: e.event_id,
                  cutting_component_id: e.cutting_component_id,
                  location_id: e.location_id,
                  movement_kind: e.movement_kind,
                  quantity_delta: Number(e.quantity_delta),
                  unit_snapshot: e.unit_snapshot,
                  notes: e.notes,
                  created_at: e.created_at,
                  location_code: l?.code,
                  location_name: l?.name,
                };
              })}
              canWrite={canWrite}
            />
          </SectionCard>
        </>
      )}
    </MasterPageShell>
  );
}
