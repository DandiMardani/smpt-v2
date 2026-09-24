import { Badge, Card, Field, Notice, PageShell, ReadOnly, buttonClass, inputClass } from "@/components/final/final-ui";
import { SetFinishedGoodFields } from "@/components/forms/set-finished-good-fields";
import { requirePermission } from "@/lib/access/current-user";
import { param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { addSetComponentAction, saveSetAction } from "@/lib/final/actions";

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

  return (
    <PageShell
      eyebrow="QC & Logistik"
      title="Master Set"
      description="Definisi SET dan komponen Barang Jadi. Komponen wajib berasal dari proyek Set yang sama."
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
                  {(pr.data ?? []).map((x: any) => (
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
              <div>
                <button className={buttonClass}>Simpan</button>
              </div>
            </form>
          </Card>

          <Card title="Tambah Komponen">
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
              <div>
                <button className={buttonClass}>Tambah</button>
              </div>
            </form>
          </Card>
        </>
      ) : null}

      <Card title="Daftar Set">
        <div className="space-y-3">
          {sets.map((x: any) => (
            <div key={x.id} className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs">
              <div className="flex justify-between items-center">
                <b className="font-bold text-slate-900">{x.set_code} · {x.name}</b>
                <Badge>{x.status}</Badge>
              </div>
              <div className="mt-2 text-sm text-slate-600 font-medium">
                {(cr.data ?? []).filter((c: any) => c.set_id === x.id).map((c: any) => `Barang #${c.finished_good_id} × ${qty(c.qty_per_set)}`).join(" · ") || "Belum ada komponen"}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </PageShell>
  );
}
