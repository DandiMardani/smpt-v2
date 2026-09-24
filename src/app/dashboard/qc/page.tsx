import {
  Badge,
  Card,
  Empty,
  Field,
  Flow,
  Notice,
  PageShell,
  ReadOnly,
  buttonClass,
  dangerClass,
  inputClass,
  secondaryClass,
} from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { n, param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { cancelQcAction, completeReworkAction, createReworkAction, recordQcAction } from "@/lib/final/actions";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("qc.view");
  const can = a.permissionCodes.includes("qc.operate");
  const canRework = a.permissionCodes.includes("qc.rework");
  const q = await searchParams;
  const s = await createClient();

  const [cr, ir, qr, rr] = await Promise.all([
    s.from("production_checks").select("*").eq("status", "AKTIF").order("check_date", { ascending: false }).limit(500),
    s.from("production_order_items").select("*").limit(1000),
    s.from("qc_inspections").select("*").order("inspection_date", { ascending: false }).limit(500),
    s.from("qc_reworks").select("*").order("created_at", { ascending: false }).limit(300),
  ]);
  const e = [cr.error, ir.error, qr.error, rr.error].find(Boolean);
  if (e) throw new Error(e.message);

  const items = ir.data ?? [];
  const qc = qr.data ?? [];
  const checks = cr.data ?? [];
  const finals = (checks as any[]).filter((c) => {
    const i = (items as any[]).find((x) => x.id === c.order_item_id);
    return i?.is_final_output_snapshot;
  });

  return (
    <PageShell
      eyebrow="QC & Logistik"
      title="Quality Control"
      description="QC hanya menerima Qty Sah Checker untuk item Output Final. Qty baik otomatis menambah stok Barang Jadi PUSAT."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!can ? <ReadOnly /> : null}
      <Flow>
        Checker → Qty Sah Output Final → QC (Baik/Reject/Rework) → Barang Jadi. Input hasil manual dari Siap Produksi tidak dipakai.
      </Flow>

      <Card title="Menunggu QC">
        <div className="space-y-3">
          {finals.length === 0 ? (
            <Empty>Belum ada Qty Sah Output Final.</Empty>
          ) : (
            finals.map((c: any) => {
              const i = (items as any[]).find((x) => x.id === c.order_item_id);
              const done = (qc as any[])
                .filter((x) => x.production_check_id === c.id && x.status === "AKTIF")
                .reduce((a, x) => a + n(x.inspected_qty), 0);
              const remain = Math.max(0, n(c.good_qty) - done);
              return (
                <div key={c.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                  <div className="flex flex-wrap justify-between items-center gap-2">
                    <div>
                      <b className="font-bold text-slate-900 text-sm">
                        {c.check_code} · {i?.work_item_name_snapshot}
                      </b>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Qty Sah {qty(c.good_qty)} · Sisa QC <span className="font-semibold text-blue-700">{qty(remain)}</span>
                      </p>
                    </div>
                    <Badge>{remain > 0 ? "MENUNGGU" : "SELESAI"}</Badge>
                  </div>

                  {can && remain > 0 ? (
                    <form action={recordQcAction} className="mt-3 grid gap-3 md:grid-cols-6 border-t border-slate-100 pt-3">
                      <input type="hidden" name="production_check_id" value={c.id} />
                      <Field label="Tanggal">
                        <input name="inspection_date" type="date" required className={inputClass} />
                      </Field>
                      <Field label="Baik">
                        <input name="good_qty" type="number" min="0" max={remain} step="0.0001" required className={inputClass} />
                      </Field>
                      <Field label="Reject">
                        <input name="reject_qty" type="number" min="0" max={remain} step="0.0001" required className={inputClass} />
                      </Field>
                      <Field label="Rework">
                        <input name="rework_qty" type="number" min="0" max={remain} step="0.0001" required className={inputClass} />
                      </Field>
                      <Field label="Catatan">
                        <input name="notes" className={inputClass} />
                      </Field>
                      <div className="flex items-end">
                        <button className={buttonClass}>Simpan QC</button>
                      </div>
                    </form>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </Card>

      <Card title="Riwayat QC">
        <div className="space-y-3">
          {qc.map((x: any) => (
            <div key={x.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div>
                  <b className="font-bold text-slate-900 text-sm">{x.qc_code}</b>
                  <span className="ml-2 text-xs text-slate-600 font-medium">
                    · Baik <span className="text-emerald-700 font-semibold">{qty(x.good_qty)}</span>
                    · Reject <span className="text-rose-600 font-semibold">{qty(x.reject_qty)}</span>
                    · Rework <span className="text-amber-700 font-semibold">{qty(x.rework_qty)}</span>
                  </span>
                </div>
                <Badge>{x.status}</Badge>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                {canRework && n(x.rework_qty) > 0 && x.status === "AKTIF" ? (
                  <form action={createReworkAction} className="flex flex-wrap gap-2">
                    <input type="hidden" name="qc_id" value={x.id} />
                    <input name="quantity" type="number" min="0.0001" step="0.0001" max={x.rework_qty} required className={inputClass} />
                    <input name="notes" placeholder="Catatan rework" className={inputClass} />
                    <button className={secondaryClass}>Buat Rework</button>
                  </form>
                ) : null}
                {can && x.status === "AKTIF" ? (
                  <form action={cancelQcAction}>
                    <input type="hidden" name="qc_id" value={x.id} />
                    <button className={dangerClass}>Batalkan QC</button>
                  </form>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {canRework ? (
        <Card title="Rework OPEN">
          <div className="space-y-2">
            {(rr.data ?? []).filter((x: any) => x.status === "OPEN").map((x: any) => (
              <form key={x.id} action={completeReworkAction} className="grid gap-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs md:grid-cols-5 items-center">
                <input type="hidden" name="rework_id" value={x.id} />
                <span className="text-sm font-semibold text-slate-900">{x.rework_code} · Qty {qty(x.quantity)}</span>
                <input name="good_qty" type="number" min="0" step="0.0001" required className={inputClass} placeholder="Good" />
                <input name="reject_qty" type="number" min="0" step="0.0001" required className={inputClass} placeholder="Reject" />
                <input name="notes" className={inputClass} placeholder="Catatan" />
                <button className={buttonClass}>Selesaikan</button>
              </form>
            ))}
          </div>
        </Card>
      ) : null}
    </PageShell>
  );
}
