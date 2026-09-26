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
  const s = await createClient();

  const [pr, ppr, wr, ir, or, oir, checkerRes] = await Promise.all([
    s.from("projects").select("id, name, status, product_category").order("name").limit(300),
    s.from("project_products").select("id, project_id, name, target_production, status").eq("status", "AKTIF").order("name").limit(500),
    s.from("workers").select("id, worker_code, name, department, position, pay_system, status").eq("status", "AKTIF").order("name").limit(500),
    s.from("work_items").select("id, project_id, product_id, name, unit, operator_price, qty_per_product, display_order, status").eq("status", "AKTIF").order("display_order").limit(1500),
    s.from("production_orders").select("*").order("order_date", { ascending: false }).limit(200),
    s.from("production_order_items").select("*").limit(2000),
    s.rpc("smpt_spk_checker_options"),
  ]);

  const err = [pr.error, ppr.error, wr.error, ir.error, or.error, oir.error, checkerRes.error].find(Boolean);
  if (err) throw new Error(err.message);

  const activeProjects = (pr.data ?? [])
    .filter((x: any) => !["SELESAI", "NONAKTIF", "BATAL", "DIBATALKAN"].includes(String(x.status ?? "").trim().toUpperCase()))
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

  const orders: SpkOrder[] = rawOrders.map((o) => ({
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
    items: rawItems
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
      })),
  }));

  return (
    <PageShell
      eyebrow="Produksi"
      title="Surat Perintah Kerja (SPK)"
      description="Kelola penugasan kerja borongan operator jahit. Alur terpadu satu langkah: pilih proyek, produk, operator, centang item pekerjaan, dan terbitkan langsung atau simpan draft."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnly /> : null}

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
