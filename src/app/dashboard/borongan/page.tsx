import {
  Badge,
  Card,
  Empty,
  Field,
  Flow,
  Metric,
  Notice,
  PageShell,
  ReadOnly,
  TableWrap,
  Td,
  Th,
  buttonClass,
  dangerClass,
  inputClass,
} from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { n, param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { cancelCheckerResultAction, checkerResultAction } from "@/lib/final/actions";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const access = await requirePermission("borongan.view");
  const canOperate = access.permissionCodes.includes("borongan.operate");
  const q = await searchParams;
  const s = await createClient();

  const [or, ir, cr] = await Promise.all([
    s.from("production_orders").select("*").order("order_date", { ascending: false }).limit(150),
    s.from("production_order_items").select("*").limit(1000),
    s.from("production_checks").select("*").order("check_date", { ascending: false }).limit(300),
  ]);
  const e = [or.error, ir.error, cr.error].find(Boolean);
  if (e) throw new Error(e.message);

  const orders = or.data ?? [];
  const items = ir.data ?? [];
  const checks = cr.data ?? [];
  const active = (items as any[]).filter(
    (i) => i.status === "AKTIF" && (orders as any[]).some((o) => o.id === i.order_id && o.status === "AKTIF"),
  );

  const routeMap = new Map<number, any>();
  if (active.length > 0) {
    const { data, error } = await s.rpc("smpt_get_checker_route_status", {
      p_order_item_ids: active.slice(0, 200).map((x: any) => x.id),
    });
    if (error) throw new Error(error.message);
    for (const row of (Array.isArray(data) ? data : [])) routeMap.set(Number(row.order_item_id), row);
  }

  return (
    <PageShell
      eyebrow="Produksi"
      title="Checker / Setoran Borongan"
      description="Qty Sah menjadi output approved. Routing memakai Equivalent Product dan WIP predecessor, bukan raw qty antar-item."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canOperate ? <ReadOnly /> : null}
      <Flow>
        WARNING: transaksi tetap tersimpan + anomaly dicatat. HARD: Checker ditolak jika Qty Sah + Reject yang diproses melebihi available WIP predecessor.
      </Flow>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Menunggu Checker" value={active.length} />
        <Metric label="Input Saya" value={checks.length} />
        <Metric label="Dengan Routing" value={active.filter((x: any) => routeMap.get(x.id)?.has_dependencies).length} />
      </div>

      <Card title="Pekerjaan Menunggu Checker">
        <div className="space-y-3">
          {active.length === 0 ? <Empty>Tidak ada pekerjaan aktif yang ditugaskan ke Checker ini.</Empty> : active.map((i: any) => {
            const o = (orders as any[]).find((x) => x.id === i.order_id);
            const used = (checks as any[])
              .filter((x) => x.order_item_id === i.id && x.status === "AKTIF")
              .reduce((a, x) => a + n(x.good_qty) + n(x.reject_qty), 0);
            const remain = Math.max(0, n(i.assigned_qty) - used);
            const route = routeMap.get(i.id);
            const availableEq = route?.available_equivalent == null ? null : n(route.available_equivalent);
            const maxRaw = availableEq == null ? null : availableEq * n(i.qty_per_product_snapshot);
            const hard = Boolean(route?.hard_enforced);

            return (
              <div key={i.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="flex flex-wrap justify-between items-center gap-3">
                  <div>
                    <b className="font-bold text-slate-900 text-sm">{o?.spk_code} · {i.work_item_name_snapshot}</b>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Operator #{o?.operator_worker_id} · Sisa penugasan {qty(remain)} {i.unit_snapshot} · Qty/Produk {qty(i.qty_per_product_snapshot)}
                    </p>
                  </div>
                  <Badge>{i.status}</Badge>
                </div>

                {route?.has_dependencies ? (
                  <div className={`mt-3 rounded-xl border p-3 text-sm ${hard ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                    <b className="font-bold">Routing {hard ? "HARD" : "WARNING"}</b>
                    <p className="mt-1 font-medium">
                      Available predecessor: <b>{qty(availableEq)} equivalent produk</b>
                      {maxRaw != null ? <> · kira-kira maksimum proses saat ini <b>{qty(maxRaw)} {i.unit_snapshot}</b></> : null}
                    </p>
                    <p className="text-xs opacity-75 mt-0.5">Jika predecessor lebih dari satu, kapasitas mengikuti available yang paling kecil.</p>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-500">Tidak ada predecessor wajib. Item ini dapat berjalan independen/parallel.</p>
                )}

                {canOperate && remain > 0 ? (
                  <form action={checkerResultAction} className="mt-3 grid gap-3 md:grid-cols-5">
                    <input type="hidden" name="order_item_id" value={i.id} />
                    <Field label="Tanggal"><input name="check_date" type="date" required className={inputClass} /></Field>
                    <Field label="Qty Sah"><input name="good_qty" type="number" min="0" max={remain} step="0.0001" required className={inputClass} /></Field>
                    <Field label="Reject"><input name="reject_qty" type="number" min="0" max={remain} step="0.0001" required className={inputClass} /></Field>
                    <Field label="Catatan"><input name="notes" className={inputClass} /></Field>
                    <div className="flex items-end"><button className={buttonClass}>Simpan Checker</button></div>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Riwayat Input Saya">
        <TableWrap>
          <thead><tr><Th>Kode</Th><Th>Tanggal</Th><Th>Qty Sah</Th><Th>Reject</Th><Th>Status</Th><Th>Aksi</Th></tr></thead>
          <tbody>{checks.map((x: any) => <tr key={x.id}>
            <Td>{x.check_code}</Td><Td>{x.check_date}</Td><Td>{qty(x.good_qty)}</Td><Td>{qty(x.reject_qty)}</Td><Td>{x.status}</Td>
            <Td>{canOperate && x.status === "AKTIF" ? <form action={cancelCheckerResultAction}><input type="hidden" name="check_id" value={x.id} /><button className={dangerClass}>Batalkan</button></form> : "-"}</Td>
          </tr>)}</tbody>
        </TableWrap>
      </Card>
    </PageShell>
  );
}
