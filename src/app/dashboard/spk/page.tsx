import Link from "next/link";
import { cookies } from "next/headers";
import { Flow, Notice, PageShell, ReadOnly } from "@/components/final/final-ui";
import { SpkManager, type SpkOrder } from "@/components/spk/spk-manager";
import { requirePermission } from "@/lib/access/current-user";
import { param, type SearchParams } from "@/lib/final/final-utils";
import { resolveProjectCategory } from "@/lib/project-category";
import { createClient } from "@/lib/supabase/server";
import { isProductionSupervisor, isSewingOperator } from "@/lib/workers/options";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const access = await requirePermission("spk.view");
  const canWrite = access.permissionCodes.includes("spk.write");
  const q = await searchParams;
  const cookieStore = await cookies();
  const workspaceCookie = cookieStore.get("smpt_workspace")?.value?.toUpperCase();
  const rawCategory = param(q, "category");
  const categoryParam = rawCategory
    ? (rawCategory.toUpperCase() === "ALL" ? "" : rawCategory.toUpperCase())
    : (workspaceCookie === "HAJI" ? "HAJI" : workspaceCookie === "REGULER" ? "REGULER" : "");
  const s = await createClient();

  const [pr, ppr, wr, ir, or, oir, checkerRes, checksRes] = await Promise.all([
    s.from("projects").select("id, name, status, product_category").order("name").limit(300),
    s.from("project_products").select("id, project_id, name, target_production, status").eq("status", "AKTIF").order("name").limit(500),
    s.from("workers").select("id, worker_code, name, department, position, pay_system, status").eq("status", "AKTIF").order("name").limit(500),
    s.from("work_items").select("id, project_id, product_id, name, unit, operator_price, qty_per_product, display_order, status").eq("status", "AKTIF").order("display_order").limit(1500),
    s.from("production_orders").select("*").order("order_date", { ascending: false }).limit(200),
    s.from("production_order_items").select("*").limit(2000),
    s.rpc("smpt_spk_checker_options"),
    s.from("production_checks").select("order_item_id, good_qty, reject_qty, status").eq("status", "AKTIF").limit(3000),
  ]);

  const err = [pr.error, ppr.error, wr.error, ir.error, or.error, oir.error, checkerRes.error, checksRes.error].find(Boolean);
  if (err) throw new Error(err.message);

  const allProjectsRaw = (pr.data ?? []) as any[];
  const projectCategoryMap = new Map<number, "HAJI" | "REGULER">(
    allProjectsRaw.map((p) => [p.id, resolveProjectCategory(p)])
  );

  const activeProjects = allProjectsRaw
    .filter((x: any) => !["SELESAI", "NONAKTIF", "BATAL", "DIBATALKAN"].includes(String(x.status ?? "").trim().toUpperCase()))
    .filter((x: any) => !categoryParam || resolveProjectCategory(x) === categoryParam)
    .map((x: any) => {
      const cat = resolveProjectCategory(x);
      return {
        id: x.id,
        name: `${cat === "HAJI" ? "🕋 [HAJI] " : "🎒 [REGULER] "}${x.name}`,
        category: cat,
      };
    })
    .sort((a, b) => {
      if (a.category === b.category) return a.name.localeCompare(b.name);
      return a.category === "HAJI" ? -1 : 1;
    });

  const products = (ppr.data ?? []).map((x: any) => ({
    id: x.id,
    project_id: x.project_id,
    name: x.name,
    target_production: x.target_production,
  }));

  const workers = (wr.data ?? []) as any[];
  const operators = workers
    .filter((x) => isSewingOperator(x.position) && String(x.pay_system ?? "").trim().toUpperCase() === "BORONGAN")
    .map((x) => ({
      id: x.id,
      worker_code: x.worker_code,
      name: x.name,
      position: x.position,
    }));

  const supervisors = workers
    .filter((x) => isProductionSupervisor(x.position))
    .map((x) => ({
      id: x.id,
      worker_code: x.worker_code,
      name: x.name,
      position: x.position,
    }));

  const checkers = ((checkerRes.data ?? []) as any[]).map((x) => ({
    user_id: x.user_id,
    email: x.email,
    display_name: x.display_name,
  }));

  const workItems = (ir.data ?? []).map((x: any) => ({
    id: x.id,
    project_id: x.project_id,
    product_id: x.product_id,
    name: x.name,
    unit: x.unit || "PCS",
    operator_price: x.operator_price || 0,
    qty_per_product: x.qty_per_product || 1,
    display_order: x.display_order || 0,
    status: x.status || "AKTIF",
  }));

  const rawOrders = (or.data ?? []) as any[];
  const rawItems = (oir.data ?? []) as any[];
  const rawChecks = (checksRes.data ?? []) as any[];

  const checkedItemIds = new Set(
    rawChecks
      .filter((c: any) => Number(c.good_qty || 0) + Number(c.reject_qty || 0) > 0)
      .map((c: any) => Number(c.order_item_id))
  );

  const filteredRawOrders = categoryParam
    ? rawOrders.filter((o) => projectCategoryMap.get(o.project_id) === categoryParam)
    : rawOrders;

  const orders: SpkOrder[] = filteredRawOrders.map((o) => {
    const orderItems = rawItems
      .filter((i) => i.order_id === o.id)
      .map((i) => ({
        id: i.id,
        order_id: i.order_id,
        work_item_id: i.work_item_id,
        work_item_name_snapshot: i.work_item_name_snapshot,
        unit_snapshot: i.unit_snapshot,
        assigned_qty: i.assigned_qty,
        operator_price_snapshot: i.operator_price_snapshot,
        is_final_output_snapshot: i.is_final_output_snapshot,
        status: i.status,
        has_checks: checkedItemIds.has(Number(i.id)),
      }));

    return {
      id: o.id,
      spk_code: o.spk_code,
      order_date: o.order_date,
      due_date: o.due_date,
      status: o.status,
      project_id: o.project_id,
      product_id: o.product_id,
      operator_worker_id: o.operator_worker_id,
      checker_email: o.checker_email,
      supervisor_worker_id: o.supervisor_worker_id,
      notes: o.notes,
      has_checks: orderItems.some((i) => i.has_checks),
      items: orderItems,
    };
  });

  const pageEyebrow =
    categoryParam === "HAJI"
      ? "Produksi Haji"
      : categoryParam === "REGULER"
      ? "Produksi Reguler"
      : "Produksi";

  const pageTitle =
    categoryParam === "HAJI"
      ? "Surat Perintah Kerja (SPK) - Proyek Haji"
      : categoryParam === "REGULER"
      ? "Surat Perintah Kerja (SPK) - Proyek Reguler"
      : "Surat Perintah Kerja (SPK)";

  return (
    <PageShell
      eyebrow={pageEyebrow}
      title={pageTitle}
      description="Kelola penugasan kerja borongan operator jahit. Alur terpadu satu langkah: pilih proyek, produk, operator, centang item pekerjaan, dan terbitkan langsung atau simpan draft."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnly /> : null}

      {/* Export Shortcut */}
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/export/xlsx?report=spk&from=${new Date().toISOString().slice(0,4)}-01-01&to=${new Date().toISOString().slice(0,10)}${categoryParam ? `&ws=${categoryParam}` : ""}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-xs hover:bg-emerald-100 transition"
        >
          📥 Export SPK Excel
        </a>
        <span className="text-xs text-slate-400">Unduh seluruh data SPK{categoryParam ? ` — ${categoryParam}` : ""} tahun ini</span>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 mb-4">
        <Link
          href="/dashboard/spk?category=ALL"
          className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
            categoryParam === ""
              ? "bg-slate-800 text-white shadow-xs"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          🌐 Semua Kategori (Campuran)
        </Link>
        <Link
          href="/dashboard/spk?category=HAJI"
          className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
            categoryParam === "HAJI"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
          }`}
        >
          <span>🕋</span>
          <span>Proyek Haji</span>
        </Link>
        <Link
          href="/dashboard/spk?category=REGULER"
          className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
            categoryParam === "REGULER"
              ? "bg-blue-600 text-white shadow-xs"
              : "bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100"
          }`}
        >
          <span>🎒</span>
          <span>Proyek Reguler</span>
        </Link>
      </div>

      <Flow>
        Alur SPK: Supervisor membuat SPK untuk 1 Proyek + 1 Produk + 1 Operator Borongan. Centang item pekerjaan yang diserahkan dan isi Qty Penugasan. Klik <b>Simpan & Terbitkan</b> untuk langsung mengaktifkan SPK agar operator dapat mulai menyetor hasil kerja di Pekerjaan Saya.
      </Flow>

      <SpkManager
        canWrite={canWrite}
        projects={activeProjects}
        products={products}
        workItems={workItems}
        operators={operators}
        checkers={checkers}
        supervisors={supervisors}
        orders={orders}
      />
    </PageShell>
  );
}
