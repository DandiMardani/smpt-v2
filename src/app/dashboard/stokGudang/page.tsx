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
import { moveWip } from "./actions";

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
type M = { id: number; material_code: string; name: string; standard_unit: string };
type C = { id: number; component_code: string; name: string; color: string; unit: string };
type P = { id: number; name: string };
type PP = { id: number; name: string };

function Move({ b, action, label, secondary = false }: { b: B; action: string; label: string; secondary?: boolean }) {
  return (
    <form action={moveWip} className="grid gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 sm:grid-cols-[1fr_1fr_auto]">
      <input type="hidden" name="component_id" value={b.cutting_component_id ?? ""} />
      <input type="hidden" name="product_id" value={b.product_id ?? ""} />
      <input type="hidden" name="action" value={action} />
      <Field label="Tanggal">
        <input name="transaction_date" type="date" required className={inputClass} />
      </Field>
      <Field label="Qty">
        <input name="quantity" type="number" min="0.0001" max={Number(b.quantity)} step="0.0001" required className={inputClass} />
      </Field>
      <div className="flex items-end">
        <button className={secondary ? secondaryButtonClass : primaryButtonClass}>{label}</button>
      </div>
      <input name="notes" placeholder="Keterangan" className={`${inputClass} sm:col-span-3`} />
    </form>
  );
}

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("stok_gudang.view");
  const canWrite = a.permissionCodes.includes("stok_gudang.write");
  const q = await searchParams;
  const s = await createClient();

  const [lr, br, mr, cr, pr, ppr] = await Promise.all([
    s.from("stock_locations").select("id,code,name,physical_group"),
    s.from("stock_balances").select("id,item_kind,material_id,cutting_component_id,location_id,project_id,product_id,quantity").gt("quantity", 0),
    s.from("materials").select("id,material_code,name,standard_unit"),
    s.from("cutting_components").select("id,component_code,name,color,unit"),
    s.from("projects").select("id,name"),
    s.from("project_products").select("id,name"),
  ]);

  const e = [lr.error, br.error, mr.error, cr.error, pr.error, ppr.error].find(Boolean);
  if (e) throw new Error(e.message);

  const locs = (lr.data ?? []) as L[];
  const rows = (br.data ?? []) as B[];
  const lm = new Map(locs.map((x) => [x.id, x]));
  const mm = new Map(((mr.data ?? []) as M[]).map((x) => [x.id, x]));
  const cm = new Map(((cr.data ?? []) as C[]).map((x) => [x.id, x]));
  const pm = new Map(((pr.data ?? []) as P[]).map((x) => [x.id, x]));
  const ppm = new Map(((ppr.data ?? []) as PP[]).map((x) => [x.id, x]));

  const raw = rows.filter((x) => lm.get(x.location_id)?.code === "GUDANG_BAHAN");
  const wip = rows.filter((x) => lm.get(x.location_id)?.physical_group === "GUDANG_HASIL");

  return (
    <MasterPageShell
      eyebrow="Gudang & Material"
      title="Stok Gudang"
      description="Saldo cepat dari projection; histori sumber tetap immutable stock ledger."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

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

      <SectionCard title="Gudang Hasil / WIP">
        <div className="space-y-4">
          {wip.map((b) => {
            const c = b.cutting_component_id ? cm.get(b.cutting_component_id) : undefined;
            const l = lm.get(b.location_id);
            return (
              <div key={b.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <b className="font-bold text-slate-900">
                      {c?.component_code} · {c?.name}{c?.color ? ` / ${c.color}` : ""}
                    </b>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {b.project_id ? pm.get(b.project_id)?.name : "-"} · {b.product_id ? ppm.get(b.product_id)?.name : "-"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge>{l?.name}</Badge>
                    <Badge>{formatNumber(b.quantity)} {c?.unit}</Badge>
                  </div>
                </div>

                {canWrite ? (
                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    {l?.code === "GUDANG_HASIL_BELUM" ? (
                      <>
                        <Move b={b} action="TANDAI_SABLON" label="Tandai untuk Sablon" />
                        <Move b={b} action="CUTTING_KE_SIAP_PRODUKSI" label="Kirim ke Siap Produksi" />
                      </>
                    ) : null}
                    {l?.code === "GUDANG_HASIL_SABLON" ? (
                      <>
                        <Move b={b} action="BATAL_TANDA_SABLON" label="Batalkan Tanda" secondary />
                        <Move b={b} action="KIRIM_SABLON" label="Kirim ke Sablon" />
                      </>
                    ) : null}
                    {l?.code === "GUDANG_HASIL_SELESAI_SABLON" ? (
                      <Move b={b} action="SABLON_KE_SIAP_PRODUKSI" label="Kirim ke Siap Produksi" />
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </SectionCard>
    </MasterPageShell>
  );
}
