import {
  Field,
  inputClass,
  MasterPageShell,
  Notice,
  primaryButtonClass,
  ReadOnlyBanner,
  SectionCard,
} from "@/components/master/master-ui";
import { Badge, FlowNote, Metric } from "@/components/operations/ops-ui";
import { requirePermission } from "@/lib/access/current-user";
import { formatNumber, param, type SearchParams } from "@/lib/master/page-utils";
import { createClient } from "@/lib/supabase/server";
import { returnToWarehouse } from "./actions";

type Props = { searchParams: Promise<SearchParams> };
type L = { id: number; code: string };
type B = {
  id: number;
  cutting_component_id: number | null;
  location_id: number;
  project_id: number | null;
  product_id: number | null;
  quantity: number | string;
};
type C = { id: number; component_code: string; name: string; color: string; unit: string };
type P = { id: number; name: string };
type PP = { id: number; name: string };

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("sablon.view");
  const canWrite = a.permissionCodes.includes("sablon.write");
  const q = await searchParams;
  const s = await createClient();

  const [lr, br, cr, pr, ppr] = await Promise.all([
    s.from("stock_locations").select("id,code"),
    s.from("stock_balances").select("id,cutting_component_id,location_id,project_id,product_id,quantity").eq("item_kind", "CUTTING_COMPONENT").gt("quantity", 0),
    s.from("cutting_components").select("id,component_code,name,color,unit"),
    s.from("projects").select("id,name"),
    s.from("project_products").select("id,name"),
  ]);
  const e = [lr.error, br.error, cr.error, pr.error, ppr.error].find(Boolean);
  if (e) throw new Error(e.message);

  const loc = ((lr.data ?? []) as L[]).find((x) => x.code === "SABLON")?.id;
  const rows = ((br.data ?? []) as B[]).filter((x) => x.location_id === loc);
  const cm = new Map(((cr.data ?? []) as C[]).map((x) => [x.id, x]));
  const pm = new Map(((pr.data ?? []) as P[]).map((x) => [x.id, x]));
  const ppm = new Map(((ppr.data ?? []) as PP[]).map((x) => [x.id, x]));

  return (
    <MasterPageShell
      eyebrow="Produksi"
      title="Sablon"
      description="Sablon hanya menerima WIP dari Gudang Hasil dan mengembalikannya ke Gudang Hasil setelah selesai."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      <FlowNote>
        Tidak ada Sablon → Produksi langsung. Gudang tetap pusat custody antarbagian.
      </FlowNote>

      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="WIP di Sablon" value={rows.length} />
        <Metric label="Jalur Keluar" value="Kembali ke Gudang" />
      </div>

      <SectionCard title="Stok Fisik di Sablon">
        <div className="space-y-3">
          {rows.length === 0 ? <p className="text-sm text-slate-500">Belum ada WIP di Sablon.</p> : null}
          {rows.map((x) => {
            const c = x.cutting_component_id ? cm.get(x.cutting_component_id) : undefined;
            return (
              <div key={x.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="flex flex-wrap justify-between items-center gap-3">
                  <div>
                    <b className="font-bold text-slate-900 text-sm">
                      {c?.component_code} · {c?.name}{c?.color ? ` / ${c.color}` : ""}
                    </b>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {x.project_id ? pm.get(x.project_id)?.name : "-"} · {x.product_id ? ppm.get(x.product_id)?.name : "-"}
                    </p>
                  </div>
                  <Badge>{formatNumber(x.quantity)} {c?.unit}</Badge>
                </div>

                {canWrite ? (
                  <form action={returnToWarehouse} className="mt-4 grid gap-3 md:grid-cols-4 border-t border-slate-100 pt-4">
                    <input type="hidden" name="component_id" value={x.cutting_component_id ?? ""} />
                    <input type="hidden" name="product_id" value={x.product_id ?? ""} />
                    <Field label="Tanggal">
                      <input name="transaction_date" type="date" required className={inputClass} />
                    </Field>
                    <Field label="Qty Kembali">
                      <input name="quantity" type="number" min="0.0001" max={Number(x.quantity)} step="0.0001" required className={inputClass} />
                    </Field>
                    <Field label="Keterangan">
                      <input name="notes" className={inputClass} />
                    </Field>
                    <div className="flex items-end">
                      <button className={primaryButtonClass}>Kembalikan ke Gudang Hasil</button>
                    </div>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </SectionCard>
    </MasterPageShell>
  );
}
