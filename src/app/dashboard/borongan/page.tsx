import {
  Badge,
  Card,
  Flow,
  Metric,
  Notice,
  PageShell,
  ReadOnly,
  TableWrap,
  Td,
  Th,
  dangerClass,
} from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { n, param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { cancelCheckerResultAction } from "@/lib/final/actions";
import { CheckerTasksClient, type CheckerTaskItem } from "./checker-tasks-client";

type ProductionOrder = {
  id: number;
  spk_code: string;
  order_date?: string;
  due_date?: string | null;
  status: string;
  product_id: number;
  project_id: number;
  operator_worker_id: number;
  checker_email?: string | null;
  supervisor_worker_id?: number | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

type ProductionOrderItem = {
  id: number;
  order_id: number;
  work_item_id: number;
  work_item_name_snapshot: string;
  unit_snapshot: string;
  assigned_qty: number | string;
  qty_per_product_snapshot: number | string;
  operator_price_snapshot?: number | string;
  status: string;
};

type ProductionCheck = {
  id: number;
  check_code?: string;
  check_date?: string;
  order_item_id: number;
  checker_user_id?: string | null;
  checker_email?: string | null;
  good_qty: number | string;
  reject_qty: number | string;
  status: string;
  notes?: string | null;
};

type WorkerRow = {
  id: number;
  name: string;
  worker_code: string;
  department?: string | null;
  position?: string | null;
};

type ProductRow = {
  id: number;
  name: string;
  product_code?: string | null;
};

type RouteStatusRow = {
  order_item_id: number;
  has_dependencies?: boolean;
  hard_enforced?: boolean;
  available_equivalent?: number | string | null;
};

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const access = await requirePermission("borongan.view");
  const canOperate = access.permissionCodes.includes("borongan.operate");
  const q = await searchParams;
  const s = await createClient();

  const isCheckerRole = access.role === "CHECKER";
  const userEmail = access.email?.toLowerCase().trim();

  const [or, ir, cr, wr, pr] = await Promise.all([
    s.from("production_orders").select("*").order("order_date", { ascending: false }).limit(200),
    s.from("production_order_items").select("*").limit(1000),
    s.from("production_checks").select("*").order("check_date", { ascending: false }).limit(300),
    s.from("workers").select("id, name, worker_code, department, position").limit(500),
    s.from("project_products").select("id, name, product_code").limit(500),
  ]);
  const e = [or.error, ir.error, cr.error, wr.error, pr.error].find(Boolean);
  if (e) throw new Error(e.message);

  let orders = (or.data ?? []) as ProductionOrder[];
  let checks = (cr.data ?? []) as ProductionCheck[];
  const workers = (wr.data ?? []) as WorkerRow[];
  const products = (pr.data ?? []) as ProductRow[];
  const workerMap = new Map<number, WorkerRow>(workers.map((w) => [w.id, w]));
  const productMap = new Map<number, ProductRow>(products.map((p) => [p.id, p]));

  // Scoping: Jika user login adalah CHECKER, fokuskan ke SPK dan input milik checker tersebut
  if (isCheckerRole && userEmail) {
    orders = orders.filter((o) => (o.checker_email || "").toLowerCase().trim() === userEmail);
    checks = checks.filter(
      (c) =>
        (c.checker_email || "").toLowerCase().trim() === userEmail ||
        c.checker_user_id === access.userId,
    );
  }

  const items = (ir.data ?? []) as ProductionOrderItem[];
  const orderMap = new Map<number, ProductionOrder>(orders.map((o) => [o.id, o]));

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

  const routeMap = new Map<number, RouteStatusRow>();
  if (active.length > 0) {
    const { data, error } = await s.rpc("smpt_get_checker_route_status", {
      p_order_item_ids: active.slice(0, 200).map((x) => x.id),
    });
    if (error) throw new Error(error.message);
    const rows = (Array.isArray(data) ? data : []) as RouteStatusRow[];
    for (const row of rows) routeMap.set(Number(row.order_item_id), row);
  }

  const tasks: CheckerTaskItem[] = active.map((i) => {
    const o = orderMap.get(i.order_id);
    const used = checks
      .filter((x) => x.order_item_id === i.id && x.status === "AKTIF")
      .reduce((a, x) => a + n(x.good_qty) + n(x.reject_qty), 0);
    const remain = Math.max(0, n(i.assigned_qty) - used);
    const route = routeMap.get(i.id);
    const availableEq = route?.available_equivalent == null ? null : n(route.available_equivalent);
    const maxRaw = availableEq == null ? null : availableEq * n(i.qty_per_product_snapshot);
    const hard = Boolean(route?.hard_enforced);

    const isOrderEdited = Boolean(
      o &&
        o.updated_at &&
        o.created_at &&
        new Date(o.updated_at).getTime() - new Date(o.created_at).getTime() > 5000
    );

    const prod = o?.product_id != null ? productMap.get(o.product_id) : undefined;
    const op = o?.operator_worker_id != null ? workerMap.get(o.operator_worker_id) : undefined;

    return {
      id: i.id,
      order_id: i.order_id,
      work_item_name_snapshot: i.work_item_name_snapshot,
      unit_snapshot: i.unit_snapshot,
      assigned_qty: n(i.assigned_qty),
      qty_per_product_snapshot: n(i.qty_per_product_snapshot),
      status: i.status,
      spk_code: o?.spk_code || "",
      product_name: prod?.name || "",
      product_code: prod?.product_code || "",
      operator_worker_id: o?.operator_worker_id ?? null,
      operator_name: op
        ? `${op.name} (${op.worker_code})`
        : o?.operator_worker_id
        ? `Operator #${o.operator_worker_id}`
        : "-",
      operator_code: op?.worker_code || "",
      checker_email: o?.checker_email || "-",
      due_date: o?.due_date || null,
      notes: o?.notes || null,
      remain,
      isOrderEdited,
      has_dependencies: Boolean(route?.has_dependencies),
      hard,
      availableEq,
      maxRaw,
    };
  });

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
        <Metric label="Pekerjaan Berantai (Routing)" value={active.filter((x) => routeMap.get(x.id)?.has_dependencies).length} />
      </div>

      <Card title="Pekerjaan Menunggu Checker">
        <CheckerTasksClient
          tasks={tasks}
          canOperate={canOperate}
          isCheckerRole={isCheckerRole}
          userEmail={userEmail}
        />
      </Card>

      <Card title="Riwayat Input Saya">
        <TableWrap>
          <thead>
            <tr>
              <Th>Kode Pemeriksaan</Th>
              <Th>Tanggal</Th>
              <Th>SPK & Pekerjaan</Th>
              <Th>Operator</Th>
              <Th>Qty Sah</Th>
              <Th>Reject</Th>
              <Th>Status</Th>
              <Th>Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {checks.length === 0 ? (
              <tr>
                <Td colSpan={8} className="text-center py-6 text-slate-400">
                  Belum ada riwayat hasil pemeriksaan yang Anda input.
                </Td>
              </tr>
            ) : (
              checks.map((x) => {
                const item = items.find((it) => it.id === x.order_item_id);
                const order = item ? orderMap.get(item.order_id) : null;
                const op = order ? workerMap.get(order.operator_worker_id) : null;
                const opName = op ? `${op.name} (${op.worker_code})` : order?.operator_worker_id ? `Operator #${order.operator_worker_id}` : "-";

                return (
                  <tr key={x.id}>
                    <Td className="font-mono text-xs font-bold text-slate-700">{x.check_code}</Td>
                    <Td>{x.check_date}</Td>
                    <Td>
                      <div className="font-bold text-slate-900">{order?.spk_code || "-"}</div>
                      <div className="text-xs text-slate-500">{item?.work_item_name_snapshot || "-"}</div>
                    </Td>
                    <Td className="font-medium text-slate-800">{opName}</Td>
                    <Td className="font-bold text-emerald-700">{qty(x.good_qty)}</Td>
                    <Td className={Number(x.reject_qty) > 0 ? "font-bold text-rose-600" : ""}>{qty(x.reject_qty)}</Td>
                    <Td><Badge>{x.status}</Badge></Td>
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
                );
              })
            )}
          </tbody>
        </TableWrap>
      </Card>
    </PageShell>
  );
}
