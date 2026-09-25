import { Badge, Card, Field, Notice, PageShell, ReadOnly, buttonClass, inputClass } from "@/components/final/final-ui";
import { SetFinishedGoodFields } from "@/components/forms/set-finished-good-fields";
import { requirePermission } from "@/lib/access/current-user";
import { param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { addSetComponentAction, deleteSetAction, deleteSetComponentAction, saveSetAction } from "@/lib/final/actions";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const access = await requirePermission("master_set.view");
  const can = access.permissionCodes.includes("master_set.write");
  const q = await searchParams;
  const s = await createClient();

  const [sr, cr, fr, pr] = await Promise.all([
    s.from("product_sets").select("*").order("name"),
    s.from("product_set_components").select("*").limit(1000),
    s.from("finished_goods").select("id,project_id,finished_good_code,name,status").eq("status", "AKTIF").order("name"),
    s.from("projects").select("id,name").order("name").limit(300),
  ]);

  const e = [sr.error, cr.error, fr.error, pr.error].find(Boolean);
  if (e) throw new Error(e.message);

  const sets = sr.data ?? [];
  const goods = fr.data ?? [];
  const goodsMap = new Map(goods.map((g: any) => [g.id, g]));
  const projects = pr.data ?? [];

  return (
    <PageShell
      eyebrow="QC & Logistik"
      title="Master Set"
      description="Definisi SET dan komponen Barang Jadi. Dilengkapi fitur edit nama set, satuan, dan penyesuaian komponen."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!can ? <ReadOnly /> : null}

      {can ? (
        <>
          <Card title="Tambah Set">
            <form action={saveSetAction} className="grid gap-3 md:grid-cols-4">
              <Field label="Proyek">
                <select name="project_id" required className={inputClass}>
                  <option value="">Pilih</option>
                  {projects.map((x: any) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Nama Set">
                <input name="name" required className={inputClass} />
              </Field>
              <Field label="Satuan">
                <input name="unit" defaultValue="SET" className={inputClass} />
              </Field>
              <Field label="Catatan">
                <input name="notes" className={inputClass} />
              </Field>
              <div className="md:col-span-4">
                <button className={buttonClass}>Simpan Set</button>
              </div>
            </form>
          </Card>

          <Card title="Tambah Komponen ke Set">
            <form action={addSetComponentAction} className="grid gap-3 md:grid-cols-4">
              <SetFinishedGoodFields
                sets={sets.filter((x: any) => x.status === "AKTIF").map((x: any) => ({
                  id: x.id,
                  project_id: x.project_id,
                  label: `${x.set_code} · ${x.name}`,
                }))}
                finishedGoods={goods.map((x: any) => ({
                  id: x.id,
                  project_id: x.project_id,
                  label: `${x.finished_good_code} · ${x.name}`,
                }))}
                className={inputClass}
              />
              <Field label="Qty / Set">
                <input name="qty_per_set" type="number" min="0.0001" step="0.0001" required className={inputClass} />
              </Field>
              <div className="flex items-end">
                <button className={buttonClass}>Tambah Komponen</button>
              </div>
            </form>
          </Card>
        </>
      ) : null}

      <Card title={`Daftar Set (${sets.length})`}>
        <div className="space-y-3">
          {sets.map((x: any) => {
            const comps = (cr.data ?? []).filter((c: any) => c.set_id === x.id);
            return (
              <details key={x.id} className="group rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs hover:border-slate-300 transition">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">{x.set_code}</span>
                        <b className="font-bold text-slate-900 text-sm">{x.name}</b>
                        <Badge>{x.status}</Badge>
                      </div>
                      <div className="mt-1.5 text-xs text-slate-500">
                        {comps.length > 0 ? (
                          comps.map((c: any) => {
                            const g = goodsMap.get(c.finished_good_id);
                            return `${g ? g.name : `#${c.finished_good_id}`} × ${qty(c.qty_per_set)}`;
                          }).join(" · ")
                        ) : "Belum ada komponen"}
                      </div>
                    </div>
                    <div>
                      <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-bold text-gray-700 group-open:bg-blue-50 group-open:text-blue-700 group-open:border-blue-200 transition">
                        ✏️ Edit ▾
                      </span>
                    </div>
                  </div>
                </summary>

                {can ? (
                  <div className="mt-4 border-t border-slate-100 pt-4 space-y-4">
                    <form action={saveSetAction} className="grid gap-3 md:grid-cols-3">
                      <input type="hidden" name="id" value={x.id} />
                      <input type="hidden" name="project_id" value={x.project_id} />
                      <Field label="Nama Set"><input name="name" required defaultValue={x.name} className={inputClass} /></Field>
                      <Field label="Satuan"><input name="unit" required defaultValue={x.unit} className={inputClass} /></Field>
                      <Field label="Catatan"><input name="notes" defaultValue={x.notes || ""} className={inputClass} /></Field>
                      <Field label="Status">
                        <select name="status" defaultValue={x.status} className={inputClass}>
                          <option value="AKTIF">AKTIF</option>
                          <option value="NONAKTIF">NONAKTIF</option>
                        </select>
                      </Field>
                      <div className="md:col-span-3 flex flex-wrap items-center justify-between gap-3 pt-2">
                        <button type="submit" className={buttonClass}>Simpan Perubahan Set</button>
                        <button
                          type="submit"
                          formAction={deleteSetAction}
                          formNoValidate
                          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition"
                        >
                          🗑️ Hapus Set
                        </button>
                      </div>
                    </form>

                    {comps.length > 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                        <h4 className="font-bold text-xs text-slate-700 mb-2">Komponen Set Ini:</h4>
                        <div className="space-y-1.5">
                          {comps.map((c: any) => {
                            const g = goodsMap.get(c.finished_good_id);
                            return (
                              <div key={c.id} className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-slate-200/80">
                                <span><b>{g ? `${g.finished_good_code} · ${g.name}` : `#${c.finished_good_id}`}</b> × {qty(c.qty_per_set)}</span>
                                <form action={deleteSetComponentAction}>
                                  <input type="hidden" name="id" value={c.id} />
                                  <button type="submit" className="text-red-600 font-bold hover:underline">Hapus</button>
                                </form>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </details>
            );
          })}
        </div>
      </Card>
    </PageShell>
  );
}
