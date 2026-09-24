import { MasterPageShell, ReadOnlyBanner, SectionCard } from "@/components/master/master-ui";
import { FlowNote } from "@/components/operations/ops-ui";
import { requirePermission } from "@/lib/access/current-user";
import { formatNumber } from "@/lib/master/page-utils";
import { createClient } from "@/lib/supabase/server";

type E = {
  id: number;
  material_id: number | null;
  location_id: number;
  project_id: number | null;
  movement_kind: string;
  quantity_delta: number | string;
  unit_snapshot: string;
  notes: string | null;
  created_at: string;
};
type M = { id: number; material_code: string; name: string };
type L = { id: number; name: string };
type P = { id: number; name: string };

export default async function Page() {
  await requirePermission("log_bahan.view");
  const s = await createClient();

  const [er, mr, lr, pr] = await Promise.all([
    s
      .from("stock_ledger_entries")
      .select("id,material_id,location_id,project_id,movement_kind,quantity_delta,unit_snapshot,notes,created_at")
      .eq("item_kind", "MATERIAL")
      .order("created_at", { ascending: false })
      .limit(200),
    s.from("materials").select("id,material_code,name"),
    s.from("stock_locations").select("id,name"),
    s.from("projects").select("id,name"),
  ]);

  const e = [er.error, mr.error, lr.error, pr.error].find(Boolean);
  if (e) throw new Error(e.message);

  const mm = new Map(((mr.data ?? []) as M[]).map((x) => [x.id, x]));
  const lm = new Map(((lr.data ?? []) as L[]).map((x) => [x.id, x]));
  const pm = new Map(((pr.data ?? []) as P[]).map((x) => [x.id, x]));
  const rows = (er.data ?? []) as E[];

  return (
    <MasterPageShell
      eyebrow="Gudang & Material"
      title="Log Bahan Baku"
      description="Monitoring-only. Tidak ada CRUD manual di halaman ini."
    >
      <ReadOnlyBanner />
      <FlowNote>
        Semua mutasi berasal dari transaksi sumber: Barang Masuk/Keluar, Cutting, atau Siap Produksi. Log Bahan tidak boleh mengubah stok.
      </FlowNote>

      <SectionCard title="200 Mutasi Material Terbaru">
        <div className="space-y-2">
          {rows.map((r) => {
            const m = r.material_id ? mm.get(r.material_id) : undefined;
            const isPos = Number(r.quantity_delta) >= 0;
            return (
              <div
                key={r.id}
                className="grid gap-2 rounded-xl border border-slate-200/80 bg-white p-3 text-sm shadow-2xs md:grid-cols-[170px_1fr_1fr_1fr_auto] items-center"
              >
                <span className="text-xs text-slate-500 font-mono">
                  {new Date(r.created_at).toLocaleString("id-ID")}
                </span>
                <span className="font-semibold text-slate-900">
                  {m?.material_code} · {m?.name}
                </span>
                <span className="text-slate-600 font-medium">
                  {lm.get(r.location_id)?.name}
                </span>
                <span className="text-slate-600">
                  {r.project_id ? pm.get(r.project_id)?.name : "Global Gudang"}
                </span>
                <b className={`font-mono text-sm font-bold ${isPos ? "text-emerald-700" : "text-amber-700"}`}>
                  {isPos ? "+" : ""}
                  {formatNumber(r.quantity_delta)} {r.unit_snapshot}
                </b>
                <span className="md:col-span-5 text-xs text-slate-500 border-t border-slate-100 pt-1.5 mt-1">
                  <span className="font-medium text-slate-700">{r.movement_kind}</span>
                  {r.notes ? ` · ${r.notes}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </MasterPageShell>
  );
}
