import { dangerButtonClass, Field, inputClass, MasterPageShell, Notice, primaryButtonClass, ReadOnlyBanner, SectionCard } from "@/components/master/master-ui";
import { Badge, FlowNote, Metric } from "@/components/operations/ops-ui";
import { ProjectProductFields } from "@/components/forms/project-product-fields";
import { requirePermission } from "@/lib/access/current-user";
import { formatNumber, param, type SearchParams } from "@/lib/master/page-utils";
import { createClient } from "@/lib/supabase/server";
import { cancelResult, cancelUsage, recordLotUsage, recordResult, recordUsage, saveComponent } from "./actions";

type Props = { searchParams: Promise<SearchParams> };
type P = { id: number; project_code: string; name: string };
type PP = { id: number; product_code: string; project_id: number; name: string };
type C = { id: number; component_code: string; project_id: number; product_id: number | null; name: string; qty_per_product: number | string; unit: string; color: string; status: string };
type L = { id: number; code: string };
type B = { id: number; material_id: number | null; location_id: number; project_id: number | null; product_id: number | null; bom_requirement_id: number | null; quantity: number | string };
type M = { id: number; material_code: string; name: string; standard_unit: string; lot_tracking_mode: string };
type Bom = { id: number; project_id: number; product_id: number | null; material_id: number | null; component_name: string; unit: string };
type U = { id: number; usage_code: string; usage_date: string; bom_requirement_id: number; material_id: number; material_lot_id: number | null; quantity: number | string; unit_snapshot: string; input_quantity: number | string | null; input_unit: string | null; officer: string; status: string };
type R = { id: number; result_code: string; result_date: string; cutting_component_id: number; good_qty: number | string; reject_qty: number | string; unit_snapshot: string; officer: string; status: string };
type Lot = { id: number; lot_code: string; roll_number: string; material_id: number; material_name: string; normalized_unit: string; remaining_normalized_quantity: number | string; original_unit: string; current_project_id: number | null; current_product_id: number | null; current_bom_requirement_id: number | null; location_code: string; status: string };

const UNITS = ["METER", "YARD", "CM", "MM", "FT", "INCH", "KG", "GRAM", "MG", "TON", "LITER", "ML", "PCS", "LUSIN"];

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("cutting.view");
  const canWrite = a.permissionCodes.includes("cutting.write");
  const q = await searchParams;
  const s = await createClient();

  const [pr, ppr, cr, lr, br, mr, bmr, ur, rr, lotr] = await Promise.all([
    s.from("projects").select("id,project_code,name").limit(300),
    s.from("project_products").select("id,product_code,project_id,name").eq("status", "AKTIF").limit(1000),
    s.from("cutting_components").select("id,component_code,project_id,product_id,name,qty_per_product,unit,color,status").order("id", { ascending: false }).limit(1200),
    s.from("stock_locations").select("id,code"),
    s.from("stock_balances").select("id,material_id,location_id,project_id,product_id,bom_requirement_id,quantity").eq("item_kind", "MATERIAL").gt("quantity", 0).limit(1500),
    s.from("materials").select("id,material_code,name,standard_unit,lot_tracking_mode").limit(1200),
    s.from("bom_requirements").select("id,project_id,product_id,material_id,component_name,unit").eq("component_type", "BAHAN").eq("status", "AKTIF").limit(2500),
    s.from("cutting_material_usages").select("id,usage_code,usage_date,bom_requirement_id,material_id,material_lot_id,quantity,unit_snapshot,input_quantity,input_unit,officer,status").order("id", { ascending: false }).limit(100),
    s.from("cutting_daily_results").select("id,result_code,result_date,cutting_component_id,good_qty,reject_qty,unit_snapshot,officer,status").order("id", { ascending: false }).limit(100),
    s.from("v_material_lot_status").select("id,lot_code,roll_number,material_id,material_name,normalized_unit,remaining_normalized_quantity,original_unit,current_project_id,current_product_id,current_bom_requirement_id,location_code,status").eq("location_code", "CUTTING").order("updated_at", { ascending: false }).limit(1000),
  ]);

  const e = [pr.error, ppr.error, cr.error, lr.error, br.error, mr.error, bmr.error, ur.error, rr.error, lotr.error].find(Boolean);
  if (e) throw new Error(e.message);

  const projects = (pr.data ?? []) as P[];
  const products = (ppr.data ?? []) as PP[];
  const comps = (cr.data ?? []) as C[];
  const loc = ((lr.data ?? []) as L[]).find((x) => x.code === "CUTTING")?.id;
  const stock = ((br.data ?? []) as B[]).filter((x) => x.location_id === loc);
  const materialRows = (mr.data ?? []) as M[];
  const mm = new Map(materialRows.map((x) => [x.id, x]));
  const bomMap = new Map(((bmr.data ?? []) as Bom[]).map((x) => [x.id, x]));
  const pm = new Map(projects.map((x) => [x.id, x]));
  const ppm = new Map(products.map((x) => [x.id, x]));
  const cm = new Map(comps.map((x) => [x.id, x]));
  const usages = (ur.data ?? []) as U[];
  const results = (rr.data ?? []) as R[];
  const lots = (lotr.data ?? []) as Lot[];
  const lotMap = new Map(lots.map((x) => [x.id, x]));
  const activeLots = lots.filter((x) => ["AVAILABLE", "PARTIAL"].includes(x.status) && Number(x.remaining_normalized_quantity) > 0);
  const trackedKeys = new Set(activeLots.map((x) => `${x.current_project_id ?? 0}:${x.current_product_id ?? 0}:${x.material_id}:${x.current_bom_requirement_id ?? 0}`));

  return (
    <MasterPageShell
      eyebrow="Produksi"
      title="Cutting"
      description="Bahan yang dipakai harus sudah diserahkan Gudang. Roll/Lot yang dipakai sebagian tetap menyimpan sisa fisik."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      <FlowNote>
        Tidak ada Cutting → Sablon/Produksi langsung. Semua hasil baik masuk Gudang Hasil dulu. Material lot-tracked wajib dicatat per Roll/Lot agar sisa fisik tidak berbeda dari stok.
      </FlowNote>

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Komponen" value={comps.length} />
        <Metric label="Stok Bahan di Cutting" value={stock.length} />
        <Metric label="Roll/Lot Aktif" value={activeLots.length} />
        <Metric label="Hasil Terakhir" value={results.length} />
      </div>

      {canWrite ? (
        <SectionCard title="Tambah Komponen Cutting">
          <form action={saveComponent} className="grid gap-3 md:grid-cols-4">
            <ProjectProductFields
              projects={projects.map((x) => ({ id: x.id, name: x.name, code: x.project_code }))}
              products={products.map((x) => ({ id: x.id, project_id: x.project_id, name: x.name, code: x.product_code }))}
              className={inputClass}
            />
            <Field label="Nama Bagian">
              <input name="name" required className={inputClass} />
            </Field>
            <Field label="Qty/Produk">
              <input name="qty_per_product" type="number" min="0.0001" step="0.0001" required className={inputClass} />
            </Field>
            <Field label="Satuan">
              <input name="unit" required className={inputClass} />
            </Field>
            <Field label="Warna">
              <input name="color" className={inputClass} />
            </Field>
            <Field label="Status">
              <select name="status" className={inputClass}>
                <option>AKTIF</option>
                <option>NONAKTIF</option>
              </select>
            </Field>
            <Field label="Keterangan">
              <input name="notes" className={inputClass} />
            </Field>
            <div className="flex items-end">
              <button className={primaryButtonClass}>Simpan Komponen</button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Bahan Tersedia di Cutting">
        <div className="space-y-3">
          {stock.length === 0 ? <p className="text-sm text-slate-500">Belum ada bahan dari Gudang.</p> : null}
          {stock.map((x) => {
            const bom = x.bom_requirement_id ? bomMap.get(x.bom_requirement_id) : undefined;
            const m = x.material_id ? mm.get(x.material_id) : undefined;
            const key = `${x.project_id ?? 0}:${x.product_id ?? 0}:${x.material_id ?? 0}:${x.bom_requirement_id ?? 0}`;
            const tracked = trackedKeys.has(key) || m?.lot_tracking_mode !== "NONE";

            return (
              <div key={x.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <span className="font-bold text-slate-900">{m?.material_code} · {bom?.component_name || m?.name}</span>
                  <div className="flex gap-2">
                    <Badge>{formatNumber(x.quantity)} {m?.standard_unit || bom?.unit}</Badge>
                    {tracked ? <Badge>ROLL/LOT</Badge> : null}
                  </div>
                </div>

                {tracked ? (
                  <p className="mt-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    Material ini lot-tracked. Gunakan form Pemakaian Roll/Lot di bawah; form aggregate dinonaktifkan supaya sisa roll tetap sinkron.
                  </p>
                ) : canWrite && x.project_id && x.bom_requirement_id ? (
                  <form action={recordUsage} className="mt-3 grid gap-2 md:grid-cols-4">
                    <input type="hidden" name="project_id" value={x.project_id} />
                    <input type="hidden" name="product_id" value={x.product_id ?? ""} />
                    <input type="hidden" name="bom_requirement_id" value={x.bom_requirement_id} />
                    <Field label="Tanggal">
                      <input name="usage_date" type="date" required className={inputClass} />
                    </Field>
                    <Field label="Qty Dipakai">
                      <input name="quantity" type="number" min="0.0001" max={Number(x.quantity)} step="0.0001" required className={inputClass} />
                    </Field>
                    <Field label="Petugas">
                      <input name="officer" required className={inputClass} />
                    </Field>
                    <Field label="Keterangan">
                      <input name="notes" className={inputClass} />
                    </Field>
                    <div className="flex items-end">
                      <button className={primaryButtonClass}>Catat Pemakaian</button>
                    </div>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {canWrite && activeLots.length > 0 ? (
        <SectionCard title="Pemakaian Roll/Lot — Cutting">
          <div className="grid gap-3 xl:grid-cols-2">
            {activeLots.map((lot) => (
              <form key={lot.id} action={recordLotUsage} className="grid gap-2 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 md:grid-cols-2">
                <input type="hidden" name="material_lot_id" value={lot.id} />
                <div className="md:col-span-2">
                  <b className="font-bold text-slate-900">{lot.roll_number} · {lot.material_name}</b>
                  <p className="text-xs text-slate-500 mt-0.5">Sisa {formatNumber(lot.remaining_normalized_quantity)} {lot.normalized_unit} · asal satuan {lot.original_unit}</p>
                </div>
                <Field label="Tanggal">
                  <input name="usage_date" type="date" required className={inputClass} />
                </Field>
                <Field label="Qty Dipakai">
                  <input name="quantity" type="number" min="0.0001" step="0.0001" required className={inputClass} />
                </Field>
                <Field label="Satuan Pemakaian">
                  <select name="unit" defaultValue={lot.normalized_unit} className={inputClass}>
                    {[...new Set([lot.normalized_unit, lot.original_unit, ...UNITS])].map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Petugas">
                  <input name="officer" required className={inputClass} />
                </Field>
                <Field label="Keterangan">
                  <input name="notes" className={inputClass} />
                </Field>
                <div className="flex items-end">
                  <button className={primaryButtonClass}>Catat Pemakaian Roll</button>
                </div>
              </form>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {canWrite ? (
        <SectionCard title="Input Hasil Cutting">
          <form action={recordResult} className="grid gap-3 md:grid-cols-4">
            <Field label="Tanggal">
              <input name="result_date" type="date" required className={inputClass} />
            </Field>
            <Field label="Komponen">
              <select name="component_id" required className={inputClass}>
                <option value="">Pilih komponen</option>
                {comps.filter((x) => x.status === "AKTIF").map((x) => (
                  <option key={x.id} value={x.id}>
                    {pm.get(x.project_id)?.name} · {ppm.get(x.product_id || 0)?.name} · {x.name}{x.color ? `/${x.color}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hasil Baik">
              <input name="good_qty" type="number" min="0" step="0.0001" defaultValue="0" className={inputClass} />
            </Field>
            <Field label="Reject">
              <input name="reject_qty" type="number" min="0" step="0.0001" defaultValue="0" className={inputClass} />
            </Field>
            <Field label="Petugas">
              <input name="officer" required className={inputClass} />
            </Field>
            <Field label="Keterangan">
              <input name="notes" className={inputClass} />
            </Field>
            <div className="flex items-end">
              <button className={primaryButtonClass}>Simpan Hasil</button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Riwayat Cutting">
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <h3 className="mb-2 font-bold text-slate-900 text-sm">Pemakaian Bahan</h3>
            {usages.map((x) => {
              const lot = x.material_lot_id ? lotMap.get(x.material_lot_id) : undefined;
              return (
                <div key={x.id} className="mb-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                  <p className="text-sm font-semibold text-slate-800">{x.usage_code} · {bomMap.get(x.bom_requirement_id)?.component_name} · {formatNumber(x.quantity)} {x.unit_snapshot}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{x.usage_date} · {x.officer} · {x.status}{x.material_lot_id ? ` · Roll ${lot?.roll_number || `#${x.material_lot_id}`}` : ""}{x.input_quantity ? ` · input ${formatNumber(x.input_quantity)} ${x.input_unit || ""}` : ""}</p>
                  {canWrite && x.status === "AKTIF" ? (
                    <form action={cancelUsage} className="mt-2">
                      <input type="hidden" name="usage_id" value={x.id} />
                      <button className={dangerButtonClass}>Batalkan</button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div>
            <h3 className="mb-2 font-bold text-slate-900 text-sm">Hasil Harian</h3>
            {results.map((x) => (
              <div key={x.id} className="mb-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs">
                <p className="text-sm font-semibold text-slate-800">{x.result_code} · {cm.get(x.cutting_component_id)?.name} · Baik {formatNumber(x.good_qty)} · Reject {formatNumber(x.reject_qty)}</p>
                <p className="text-xs text-slate-500 mt-0.5">{x.result_date} · {x.officer} · {x.status}</p>
                {canWrite && x.status === "AKTIF" ? (
                  <form action={cancelResult} className="mt-2">
                    <input type="hidden" name="result_id" value={x.id} />
                    <button className={dangerButtonClass}>Batalkan</button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
    </MasterPageShell>
  );
}
