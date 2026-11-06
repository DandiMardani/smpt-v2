import {
  Notice,
  PageShell,
  ReadOnly,
} from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { n, param, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { BoronganPageClient } from "./borongan-page-client";
import type {
  CheckerTaskItem,
  ProductionCheck,
  CheckerEditRequest,
  ProjectOptionItem,
  ProductOptionItem,
  WorkItemOptionItem,
  WorkerOptionItem,
} from "./types";

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

type WorkerRow = {
  id: number;
  name: string;
  worker_code: string;
  department?: string | null;
  position?: string | null;
  status?: string | null;
};

type ProductRow = {
  id: number;
  project_id?: number | null;
  name: string;
  product_code?: string | null;
  target_production?: number | string | null;
  unit?: string | null;
  status?: string | null;
};

type ProjectRow = {
  id: number;
  name: string;
  project_code?: string | null;
  status?: string | null;
};

type WorkItemRow = {
  id: number;
  project_id: number;
  product_id?: number | null;
  name: string;
  unit: string;
  qty_per_product: number;
  operator_price?: number | null;
  proposed_price?: number | null;
  status?: string | null;
  executor_scope?: string | null;
};

type ProfileRow = {
  id: string;
  display_name?: string | null;
  email?: string | null;
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
  const isCheckerRole = access.role === "CHECKER";
  const isAdminOrManager = access.role === "ADMIN" || access.role === "MANAGER";
  const canOperate = access.permissionCodes.includes("borongan.operate") || isCheckerRole || isAdminOrManager;
  const q = await searchParams;
  const s = await createClient();

  const userEmail = access.email?.toLowerCase().trim();

  const [or, ir, cr, wr, pr, er, profs, projRes, wiRes] = await Promise.all([
    s.from("production_orders").select("*").order("order_date", { ascending: false }).limit(200),
    s.from("production_order_items").select("*").limit(1000),
    s.from("production_checks").select("*").order("check_date", { ascending: false }).limit(300),
    s.from("workers").select("id, name, worker_code, department, position, status").order("name").limit(500),
    s.from("project_products").select("id, project_id, name, product_code, target_production, unit, status").order("name").limit(500),
    s
      .from("checker_edit_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
    s.from("profiles").select("id, display_name, email").limit(500),
    s.from("projects").select("id, name, project_code, status").order("name").limit(300),
    s.from("work_items").select("id, project_id, product_id, name, unit, qty_per_product, operator_price, proposed_price, status, executor_scope").order("name").limit(1000),
  ]);

  const e = [or.error, ir.error, cr.error, wr.error, pr.error, projRes.error, wiRes.error].find(Boolean);
  if (e) throw new Error(e.message);

  let orders = (or.data ?? []) as ProductionOrder[];
  let checksRaw = (cr.data ?? []) as any[];
  const workers = (wr.data ?? []) as WorkerRow[];
  const products = (pr.data ?? []) as ProductRow[];
  const editRequestsRaw = (er.data ?? []) as any[];
  const profiles = (profs.data ?? []) as ProfileRow[];
  const rawProjects = (projRes.data ?? []) as ProjectRow[];
  const rawWorkItems = (wiRes.data ?? []) as WorkItemRow[];

  // Data Options untuk Input Setoran Mandiri (Auto-SPK)
  const projectOptions: ProjectOptionItem[] = rawProjects.map((p) => ({
    id: p.id,
    name: p.name,
    project_code: p.project_code,
    status: p.status || undefined,
  }));

  const productOptions: ProductOptionItem[] = products.map((pr) => ({
    id: pr.id,
    project_id: Number(pr.project_id || 0),
    name: pr.name,
    product_code: pr.product_code,
    target_production: n(pr.target_production),
    unit: pr.unit || undefined,
    status: pr.status || undefined,
  }));

  const workItemOptions: WorkItemOptionItem[] = rawWorkItems
    .filter((wi) => wi.executor_scope !== "PEKERJA_HARIAN" && !wi.name.toUpperCase().includes("PEKERJA HARIAN"))
    .map((wi) => ({
      id: wi.id,
      project_id: wi.project_id,
      product_id: wi.product_id,
      name: wi.name,
      unit: wi.unit || "PCS",
      qty_per_product: n(wi.qty_per_product) || 1,
      operator_price: n(wi.operator_price),
      proposed_price: n(wi.proposed_price),
      status: wi.status || undefined,
      executor_scope: wi.executor_scope || undefined,
    }));

  const workerOptions: WorkerOptionItem[] = workers.map((w) => ({
    id: w.id,
    name: w.name,
    worker_code: w.worker_code,
    department: w.department,
    position: w.position,
    status: w.status || undefined,
  }));

  const workerMap = new Map<number, WorkerRow>(workers.map((w) => [w.id, w]));
  const productMap = new Map<number, ProductRow>(products.map((p) => [p.id, p]));
  const profileMap = new Map<string, ProfileRow>(profiles.map((p) => [p.id, p]));

  // Map edit requests yang berstatus pending berdasarkan setoran_id
  const pendingEditMap = new Map<number, CheckerEditRequest>();
  for (const req of editRequestsRaw) {
    if (req.status === "pending" && !pendingEditMap.has(req.setoran_id)) {
      pendingEditMap.set(req.setoran_id, req as CheckerEditRequest);
    }
  }

  // Map edit requests yang berstatus rejected (ambil yang paling baru per setoran)
  const rejectedEditMap = new Map<number, CheckerEditRequest>();
  for (const req of editRequestsRaw) {
    if (req.status === "rejected" && !rejectedEditMap.has(req.setoran_id)) {
      rejectedEditMap.set(req.setoran_id, req as CheckerEditRequest);
    }
  }

  // Map edit requests yang berstatus approved (setoran sudah direvisi & disahkan Admin)
  const approvedEditMap = new Map<number, CheckerEditRequest>();
  for (const req of editRequestsRaw) {
    if (req.status === "approved" && !approvedEditMap.has(req.setoran_id)) {
      approvedEditMap.set(req.setoran_id, req as CheckerEditRequest);
    }
  }

  // Scoping: Jika user login adalah CHECKER, fokuskan ke SPK dan input milik checker tersebut
  if (isCheckerRole && userEmail) {
    orders = orders.filter((o) => (o.checker_email || "").toLowerCase().trim() === userEmail);
    checksRaw = checksRaw.filter(
      (c) =>
        (c.checker_email || "").toLowerCase().trim() === userEmail ||
        c.checker_user_id === access.userId,
    );
  }

  const items = (ir.data ?? []) as ProductionOrderItem[];
  const orderMap = new Map<number, ProductionOrder>(orders.map((o) => [o.id, o]));
  const itemMap = new Map<number, ProductionOrderItem>(items.map((i) => [i.id, i]));

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

  // Siapkan data checks dengan pending_request, rejected_request, dan field denormalized
  const checks: ProductionCheck[] = checksRaw.map((c) => {
    const item = itemMap.get(c.order_item_id);
    const order = item ? orderMap.get(item.order_id) : null;
    const op = order ? workerMap.get(order.operator_worker_id) : null;
    return {
      id: c.id,
      check_code: c.check_code,
      check_date: c.check_date,
      order_item_id: c.order_item_id,
      checker_user_id: c.checker_user_id,
      checker_email: c.checker_email,
      good_qty: n(c.good_qty),
      reject_qty: n(c.reject_qty),
      status: c.status,
      notes: c.notes,
      pending_request: pendingEditMap.get(c.id) || null,
      rejected_request: rejectedEditMap.get(c.id) || null,
      approved_request: approvedEditMap.get(c.id) || null,
      spk_code: order?.spk_code || "-",
      work_item_name: item?.work_item_name_snapshot || "-",
      operator_name: op ? `${op.name} (${op.worker_code})` : "-",
      unit: item?.unit_snapshot || "PCS",
      is_paid: Boolean(c.is_paid),
      payment_status: c.payment_status || null,
    };
  });

  // Buat CheckerTaskItem dengan submitted_checks
  const tasks: CheckerTaskItem[] = active.map((i) => {
    const o = orderMap.get(i.order_id);
    const itemChecks = checks.filter(
      (x) => x.order_item_id === i.id && x.status === "AKTIF"
    );
    const used = itemChecks.reduce((a, x) => a + n(x.good_qty) + n(x.reject_qty), 0);
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

    const p = o ? productMap.get(o.product_id) : null;
    const op = o ? workerMap.get(o.operator_worker_id) : null;

    return {
      id: i.id,
      order_id: i.order_id,
      work_item_name_snapshot: i.work_item_name_snapshot,
      unit_snapshot: i.unit_snapshot,
      assigned_qty: n(i.assigned_qty),
      qty_per_product_snapshot: n(i.qty_per_product_snapshot),
      status: i.status,
      spk_code: o?.spk_code || "-",
      product_name: p?.name || "",
      product_code: p?.product_code || "",
      operator_worker_id: o?.operator_worker_id,
      operator_name: op ? `${op.name} (${op.worker_code})` : "-",
      operator_code: op?.worker_code || "",
      checker_email: o?.checker_email || "",
      due_date: o?.due_date || null,
      notes: o?.notes || null,
      remain,
      isOrderEdited,
      has_dependencies: Boolean(route?.has_dependencies),
      hard,
      availableEq,
      maxRaw,
      checks: itemChecks,
    };
  });

  // Dekorasikan data checker_edit_requests dengan relasi SPK, Operator, dan Checker (HANYA yang relasi setoran-nya AKTIF)
  const decoratedEditRequests: CheckerEditRequest[] = editRequestsRaw
    .filter((r) => {
      // Pastikan relasi production_checks berstatus AKTIF (mencegah data yatim)
      if (r.production_checks && r.production_checks.status !== "AKTIF") return false;
      const check = checksRaw.find((c) => c.id === r.setoran_id);
      if (check && check.status !== "AKTIF") return false;
      return true;
    })
    .map((r) => {
    const check = checksRaw.find((c) => c.id === r.setoran_id);
    const item = check ? itemMap.get(check.order_item_id) : null;
    const order = item ? orderMap.get(item.order_id) : null;
    const operator = order ? workerMap.get(order.operator_worker_id) : null;
    const prof = profileMap.get(r.checker_id);

    return {
      id: r.id,
      setoran_id: r.setoran_id,
      checker_id: r.checker_id,
      current_qty: n(r.current_qty),
      requested_qty: n(r.requested_qty),
      reason: r.reason,
      status: r.status,
      reviewed_by: r.reviewed_by,
      reviewed_at: r.reviewed_at,
      review_notes: r.review_notes,
      created_at: r.created_at,
      updated_at: r.updated_at,
      check_code: check?.check_code,
      check_date: check?.check_date,
      spk_code: order?.spk_code,
      work_item_name: item?.work_item_name_snapshot,
      unit: item?.unit_snapshot,
      operator_name: operator ? `${operator.name} (${operator.worker_code})` : undefined,
      checker_name: prof?.display_name || undefined,
      checker_email: prof?.email || check?.checker_email || undefined,
    };
  });

  return (
    <PageShell
      eyebrow="Borongan & Upah Satuan"
      title="Pemeriksaan Checker Borongan"
      description="Pemeriksaan hasil kerja operator borongan berdasarkan SPK yang ditugaskan oleh Supervisor beserta pengajuan dan persetujuan edit setoran."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canOperate ? <ReadOnly /> : null}

      {/* Banner Notifikasi Khusus Checker */}
      <div className="space-y-3">
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50/40 p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-2xs text-lg">
                📋
              </span>
              <div>
                <p className="font-extrabold text-slate-900 text-sm">
                  {isCheckerRole
                    ? `Halo, Checker ${access.displayName || access.email}`
                    : "Mode Tinjauan Checker (Admin/Manager)"}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {isCheckerRole
                    ? `Menampilkan pekerjaan SPK yang ditugaskan SPV khusus ke email Anda (${userEmail}).`
                    : "Menampilkan seluruh penugasan Checker aktif serta antrean persetujuan perubahan setoran."}
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

      {/* Main Client Tabbed Container */}
      <BoronganPageClient
        tasks={tasks}
        checks={checks}
        editRequests={decoratedEditRequests}
        canOperate={canOperate}
        isAdminOrManager={isAdminOrManager}
        isCheckerRole={isCheckerRole}
        userEmail={userEmail}
        hasRoutingDependenciesCount={active.filter((x) => routeMap.get(x.id)?.has_dependencies).length}
        projects={projectOptions}
        products={productOptions}
        workItems={workItemOptions}
        workers={workerOptions}
      />
    </PageShell>
  );
}
