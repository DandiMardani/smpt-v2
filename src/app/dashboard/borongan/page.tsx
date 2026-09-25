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

  const isCheckerRole = access.role === "CHECKER";
  const userEmail = access.email?.toLowerCase().trim();

  const [or, ir, cr] = await Promise.all([
    s.from("production_orders").select("*").order("order_date", { ascending: false }).limit(200),
    s.from("production_order_items").select("*").limit(1000),
    s.from("production_checks").select("*").order("check_date", { ascending: false }).limit(300),
  ]);
  const e = [or.error, ir.error, cr.error].find(Boolean);
  if (e) throw new Error(e.message);

  let orders = (or.data ?? []) as any[];
  let checks = (cr.data ?? []) as any[];

  // Scoping: Jika user login adalah CHECKER, fokuskan ke SPK dan input milik checker tersebut
  if (isCheckerRole && userEmail) {
    orders = orders.filter((o) => (o.checker_email || "").toLowerCase().trim() === userEmail);
    checks = checks.filter(
      (c) =>
        (c.checker_email || "").toLowerCase().trim() === userEmail ||
        c.checker_user_id === access.userId,
    );
  }

  const items = (ir.data ?? []) as any[];
  const orderMap = new Map(orders.map((o) => [o.id, o]));

  // Item aktif yang SPK-nya AKTIF dan ditugaskan ke Checker ini
  const active = items.filter(
    (i) => i.status === "AKTIF" && orderMap.has(i.order_id) && orderMap.get(i.order_id)?.status === "AKTIF",
  );

  // Deteksi SPK yang baru saja di-edit / diperbarui oleh SPV
  const editedOrders = orders.filter((o) => {
    if (!o.updated_at || !o.created_at) return false;
    const diff = new Date(o.updated_at).getTime() - new Date(o.created_at).getTime();
    return diff > 5000; // Lebih dari 5 detik setelah dibuat
  });

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
      description="Pemeriksaan hasil kerja operator borongan berdasarkan SPK yang ditugaskan oleh Supervisor."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canOperate ? <ReadOnly /> : null}

      {/* Notifikasi Khusus Checker */}
      <div className="space-y-3">
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50/40 p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-2xs text-lg">
                📋
              </span>
              <div>
                <p className="font-extrabold text-slate-900 text-sm">
                  {isCheckerRole ? `Halo, Checker ${access.displayName || access.email}` : "Mode Tinjauan Checker (Admin/Manager)"}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {isCheckerRole
                    ? `Menampilkan pekerjaan SPK yang ditugaskan SPV khusus ke email Anda (${userEmail}).`
                    : "Menampilkan seluruh penugasan Checker aktif di sistem."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
                {active.length} Tugas Menunggu
              </span>
              {editedOrders.length > 0 && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 animate-pulse">
                  ⚠️ {editedOrders.length} SPK Diedit SPV
                </span>
              )}
            </div>
          </div>
        </div>

        {editedOrders.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 shadow-2xs">
            <div className="font-bold flex items-center gap-2 text-sm text-amber-900 mb-1">
              <span>⚠️</span> Ada Perubahan SPK oleh Supervisor
            </div>
            <p className="mb-2">
              Supervisor telah memperbarui tugas pada SPK berikut. Pastikan Anda memeriksa ulang rincian penugasan sebelum input setoran:
            </p>
            <div className="flex flex-wrap gap-2">
              {editedOrders.map((eo) => (
                <span key={eo.id} className="rounded-lg bg-white border border-amber-200 px-2.5 py-1 font-bold text-amber-900">
                  {eo.spk_code} · {eo.notes || "Item/Qty diperbarui"}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <Flow>
        Qty Sah menjadi output approved dan masuk ke WIP tahap berikutnya. Pastikan pemeriksaan fisik selesai sebelum input disimpan.
      </Flow>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Tugas SPK Aktif" value={active.length} />
        <Metric label="Input Pemeriksaan Saya" value={checks.length} />
        <Metric label="Pekerjaan Berantai (Routing)" value={active.filter((x: any) => routeMap.get(x.id)?.has_dependencies).length} />
      </div>

      <Card title="Pekerjaan Menunggu Checker">
        <div className="space-y-3">
          {active.length === 0 ? (
            <Empty>
              {isCheckerRole
                ? `Tidak ada SPK aktif yang ditugaskan ke Checker (${userEmail}). Tunggu penugasan baru dari Supervisor.`
                : "Tidak ada SPK aktif yang sedang menunggu pemeriksaan Checker."}
            </Empty>
          ) : (
            active.map((i: any) => {
              const o = orderMap.get(i.order_id);
              const used = checks
                .filter((x) => x.order_item_id === i.id && x.status === "AKTIF")
                .reduce((a, x) => a + n(x.good_qty) + n(x.reject_qty), 0);
              const remain = Math.max(0, n(i.assigned_qty) - used);
              const route = routeMap.get(i.id);
              const availableEq = route?.available_equivalent == null ? null : n(route.available_equivalent);
              const maxRaw = availableEq == null ? null : availableEq * n(i.qty_per_product_snapshot);
              const hard = Boolean(route?.hard_enforced);

              const isOrderEdited = o && o.updated_at && o.created_at && (new Date(o.updated_at).getTime() - new Date(o.created_at).getTime() > 5000);

              return (
                <div key={i.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                  <div className="flex flex-wrap justify-between items-center gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="font-bold text-slate-900 text-sm">
                          {o?.spk_code} · {i.work_item_name_snapshot}
                        </b>
                        {isOrderEdited && (
                          <span className="rounded-full bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 font-bold border border-amber-200">
                            ⚠️ Diperbarui SPV
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Operator #{o?.operator_worker_id} · Sisa penugasan <b>{qty(remain)} {i.unit_snapshot}</b> · Target/Produk {qty(i.qty_per_product_snapshot)}
                        {o?.due_date ? ` · Target Selesai: ${o.due_date}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                        Checker: {o?.checker_email || "-"}
                      </span>
                      <Badge>{i.status}</Badge>
                    </div>
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
                      <Field label="Tanggal"><input name="check_date" type="date" required className={inputClass} defaultValue={new Date().toISOString().split("T")[0]} /></Field>
                      <Field label="Qty Sah"><input name="good_qty" type="number" min="0" max={remain} step="0.0001" required className={inputClass} /></Field>
                      <Field label="Reject"><input name="reject_qty" type="number" min="0" max={remain} step="0.0001" defaultValue="0" required className={inputClass} /></Field>
                      <Field label="Catatan"><input name="notes" placeholder="Kondisi pengerjaan" className={inputClass} /></Field>
                      <div className="flex items-end"><button className={buttonClass}>Simpan Checker</button></div>
                    </form>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </Card>

      <Card title="Riwayat Input Saya">
        <TableWrap>
          <thead>
            <tr>
              <Th>Kode</Th>
              <Th>Tanggal</Th>
              <Th>Qty Sah</Th>
              <Th>Reject</Th>
              <Th>Status</Th>
              <Th>Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {checks.length === 0 ? (
              <tr>
                <Td colSpan={6} className="text-center py-6 text-slate-400">
                  Belum ada riwayat hasil pemeriksaan yang Anda input.
                </Td>
              </tr>
            ) : (
              checks.map((x: any) => (
                <tr key={x.id}>
                  <Td>{x.check_code}</Td>
                  <Td>{x.check_date}</Td>
                  <Td className="font-bold text-emerald-700">{qty(x.good_qty)}</Td>
                  <Td className={Number(x.reject_qty) > 0 ? "font-bold text-rose-600" : ""}>{qty(x.reject_qty)}</Td>
                  <Td>{x.status}</Td>
                  <Td>
                    {canOperate && x.status === "AKTIF" ? (
                      <form action={cancelCheckerResultAction}>
                        <input type="hidden" name="check_id" value={x.id} />
                        <button className={dangerClass}>Batalkan</button>
                      </form>
                    ) : (
                      "-"
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </TableWrap>
      </Card>
    </PageShell>
  );
}
