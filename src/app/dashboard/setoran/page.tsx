import { Badge, Card, Empty, Flow, Metric, PageShell } from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { n, qty } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requirePermission("pekerjaan_saya.view");
  const s = await createClient();

  const [wr, or, ir, cr] = await Promise.all([
    s.rpc("smpt_current_worker_id"),
    s.from("production_orders").select("*").order("order_date", { ascending: false }).limit(100),
    s.from("production_order_items").select("*").limit(500),
    s.from("production_checks").select("*").eq("status", "AKTIF").limit(1000),
  ]);

  const e = [wr.error, or.error, ir.error, cr.error].find(Boolean);
  if (e) throw new Error(e.message);

  const orders = or.data ?? [];
  const items = ir.data ?? [];
  const checks = cr.data ?? [];

  return (
    <PageShell
      eyebrow="Produksi"
      title="Pekerjaan Saya"
      description="Operator hanya melihat pekerjaan yang ditentukan SPV. Tidak ada tombol setor hasil dari Operator."
    >
      <Flow>
        Hasil kerja dicatat oleh Checker yang ditentukan SPV. Operator tidak dapat self-submit.
      </Flow>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Worker ID" value={String(wr.data ?? "-")} />
        <Metric label="SPK" value={orders.length} />
        <Metric label="Input Operator" value="Dikunci" />
      </div>

      <Card title="Penugasan">
        <div className="space-y-3">
          {orders.length === 0 ? (
            <Empty>
              Belum ada SPK untuk akun pekerja ini. Hubungkan akun ke Master Pekerja lewat Manajemen User.
            </Empty>
          ) : (
            orders.map((o: any) => {
              const oi = (items as any[]).filter((x) => x.order_id === o.id);
              return (
                <div key={o.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                  <div className="flex justify-between items-center gap-2">
                    <b className="font-bold text-slate-900 text-sm">{o.spk_code}</b>
                    <Badge>{o.status}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {o.order_date} · Checker {o.checker_email}
                  </p>
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {oi.map((i: any) => {
                      const c = (checks as any[]).filter((x) => x.order_item_id === i.id);
                      const good = c.reduce((a, x) => a + n(x.good_qty), 0);
                      const reject = c.reduce((a, x) => a + n(x.reject_qty), 0);
                      return (
                        <div key={i.id} className="flex flex-wrap justify-between gap-2 text-sm">
                          <span className="font-medium text-slate-800">{i.work_item_name_snapshot}</span>
                          <span className="text-xs font-semibold text-slate-500">
                            Tugas {qty(i.assigned_qty)} · Sah <span className="text-emerald-700">{qty(good)}</span> · Reject <span className="text-rose-600">{qty(reject)}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </PageShell>
  );
}
