import Link from "next/link";
import {
  Field,
  inputClass,
  MasterPageShell,
  Notice,
  primaryButtonClass,
  ReadOnlyBanner,
  SectionCard,
  secondaryButtonClass,
} from "@/components/master/master-ui";
import { ProjectProductFields } from "@/components/forms/project-product-fields";
import { requirePermission } from "@/lib/access/current-user";
import { formatNumber, param, type SearchParams } from "@/lib/master/page-utils";
import { createClient } from "@/lib/supabase/server";
import {
  cancelPo,
  createDraftPo,
  createPlan,
  issuePo,
  savePlanLine,
  savePoLine,
} from "./actions";

type Props = { searchParams: Promise<SearchParams> };
type Project = { id: number; project_code: string; name: string };
type Product = { id: number; project_id: number; product_code: string; name: string };
type Vendor = { id: number; vendor_code: string; name: string; status: string };
type Plan = { id: number; plan_code: string; plan_date: string; project_id: number; product_id: number | null; status: string; notes: string | null };
type PlanLine = {
  id: number; purchase_plan_id: number; material_id: number; material_code: string; material_name: string; unit_snapshot: string;
  final_requirement: number | string; usable_stock: number | string; confirmed_incoming: number | string; open_po_quantity: number | string;
  net_procurement_need: number | string; planned_quantity: number | string; supplier_id: number | null; supplier_name: string | null;
  unit_price: number | string | null; source_requirement_count: number; notes: string | null;
};
type Po = {
  id: number; po_number: string; purchase_plan_id: number | null; supplier_id: number; supplier_name: string; order_date: string;
  expected_date: string | null; currency: string; status: string; notes: string | null; total_amount: number | string;
  ordered_stock_quantity: number | string; received_stock_quantity: number | string;
};
type PoLine = {
  id: number; purchase_order_id: number; material_id: number; ordered_quantity: number | string; purchase_unit: string;
  conversion_factor: number | string; ordered_stock_quantity: number | string; stock_unit: string; received_stock_quantity: number | string;
  unit_price: number | string; status: string; notes: string | null;
};
type Material = { id: number; material_code: string; name: string };

function asId(value: string): number | null {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function formatMoney(value: number | string | null, currency = "IDR"): string {
  const amount = Number(value ?? 0);
  try {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `${currency} ${formatNumber(amount)}`;
  }
}

export default async function Page({ searchParams }: Props) {
  const access = await requirePermission("procurement.view");
  const canCreate = access.permissionCodes.includes("procurement.create");
  const canEdit = access.permissionCodes.includes("procurement.edit_draft");
  const canIssue = access.permissionCodes.includes("procurement.issue");
  const canCancel = access.permissionCodes.includes("procurement.cancel");
  const canExport = access.permissionCodes.includes("procurement.export");
  const q = await searchParams;
  const selectedPlanId = asId(param(q, "plan"));
  const selectedPoId = asId(param(q, "po"));
  const supabase = await createClient();

  // Keep the first paint bounded: load only list/header data first, then fetch
  // lines for the active plan/PO instead of pulling every historical line.
  const [projectsRes, productsRes, vendorsRes, plansRes, posRes, materialsRes] = await Promise.all([
    supabase.from("projects").select("id,project_code,name").order("id", { ascending: false }).limit(300),
    supabase.from("project_products").select("id,project_id,product_code,name").eq("status", "AKTIF").order("id", { ascending: false }).limit(1000),
    supabase.from("vendors").select("id,vendor_code,name,status").eq("status", "AKTIF").order("name").limit(500),
    supabase.from("purchase_plans").select("id,plan_code,plan_date,project_id,product_id,status,notes").order("id", { ascending: false }).limit(60),
    supabase.from("v_purchase_orders").select("id,po_number,purchase_plan_id,supplier_id,supplier_name,order_date,expected_date,currency,status,notes,total_amount,ordered_stock_quantity,received_stock_quantity").order("id", { ascending: false }).limit(100),
    supabase.from("materials").select("id,material_code,name").order("name").limit(1000),
  ]);

  const headerErr = [projectsRes.error, productsRes.error, vendorsRes.error, plansRes.error, posRes.error, materialsRes.error].find(Boolean);
  if (headerErr) throw new Error(headerErr.message);

  const projects = (projectsRes.data ?? []) as Project[];
  const products = (productsRes.data ?? []) as Product[];
  const vendors = (vendorsRes.data ?? []) as Vendor[];
  const plans = (plansRes.data ?? []) as Plan[];
  const pos = (posRes.data ?? []) as Po[];
  const materials = (materialsRes.data ?? []) as Material[];
  const projectMap = new Map(projects.map((x) => [x.id, x]));
  const productMap = new Map(products.map((x) => [x.id, x]));
  const materialMap = new Map(materials.map((x) => [x.id, x]));

  const activePlan = plans.find((x) => x.id === selectedPlanId) ?? plans[0] ?? null;
  const activePo = pos.find((x) => x.id === selectedPoId) ?? (activePlan ? pos.find((x) => x.purchase_plan_id === activePlan.id) : null) ?? pos[0] ?? null;

  const [planLinesRes, poLinesRes] = await Promise.all([
    supabase.from("v_procurement_plan_lines").select("id,purchase_plan_id,material_id,material_code,material_name,unit_snapshot,final_requirement,usable_stock,confirmed_incoming,open_po_quantity,net_procurement_need,planned_quantity,supplier_id,supplier_name,unit_price,source_requirement_count,notes").eq("purchase_plan_id", activePlan?.id ?? -1).order("material_name").limit(500),
    supabase.from("purchase_order_lines").select("id,purchase_order_id,material_id,ordered_quantity,purchase_unit,conversion_factor,ordered_stock_quantity,stock_unit,received_stock_quantity,unit_price,status,notes").eq("purchase_order_id", activePo?.id ?? -1).order("id").limit(500),
  ]);
  const detailErr = [planLinesRes.error, poLinesRes.error].find(Boolean);
  if (detailErr) throw new Error(detailErr.message);
  const planLines = (planLinesRes.data ?? []) as PlanLine[];
  const poLines = (poLinesRes.data ?? []) as PoLine[];
  const supplierIds = Array.from(new Set(planLines.filter((x) => x.supplier_id && Number(x.planned_quantity) > 0).map((x) => x.supplier_id as number)));

  return (
    <MasterPageShell
      eyebrow="Gudang & Material"
      title="Procurement / Purchase Planning"
      description="Kebutuhan BOM → shortage planning → Draft PO → issue PO → penerimaan Gudang. Draft tidak pernah otomatis dikirim ke supplier."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canCreate && !canEdit && !canIssue ? <ReadOnlyBanner /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Planning</p><p className="mt-1.5 text-2xl font-black text-slate-900">{plans.length}</p></div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Draft PO</p><p className="mt-1.5 text-2xl font-black text-slate-900">{pos.filter((x) => x.status === "DRAFT").length}</p></div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Open PO</p><p className="mt-1.5 text-2xl font-black text-slate-900">{pos.filter((x) => ["ISSUED", "PARTIAL"].includes(x.status)).length}</p></div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Need Aktif</p><p className="mt-1.5 text-2xl font-black text-slate-900">{planLines.filter((x) => Number(x.net_procurement_need) > 0).length}</p></div>
      </div>

      {canCreate ? (
        <SectionCard title="Buat Purchase Planning" description="Idempotent: bila scope yang sama masih memiliki DRAFT, sistem membuka DRAFT itu daripada membuat duplikat.">
          <form action={createPlan} className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Tanggal"><input name="plan_date" type="date" className={inputClass} /></Field>
            <ProjectProductFields projects={projects.map((x) => ({ id:x.id, name:x.name, code:x.project_code }))} products={products.map((x) => ({ id:x.id, project_id:x.project_id, name:x.name, code:x.product_code }))} className={inputClass} productRequired={false} productEmptyLabel="Semua produk proyek" />
            <Field label="Catatan"><input name="notes" className={inputClass} /></Field>
            <div className="self-end"><button className={primaryButtonClass}>Hitung Planning</button></div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Purchase Planning Aktif" description="Rumus: Final Requirement − Usable Stock − Confirmed Incoming − Open PO = Net Procurement Need (minimum 0).">
        {plans.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2">{plans.slice(0, 20).map((x) => <Link key={x.id} href={`${"/dashboard/procurement"}?plan=${x.id}`} className={x.id === activePlan?.id ? primaryButtonClass : secondaryButtonClass}>{x.plan_code} · {x.status}</Link>)}</div>
        ) : <p className="text-sm text-slate-500">Belum ada Purchase Planning.</p>}

        {activePlan ? <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700 shadow-xs"><b className="text-slate-900 font-bold">{activePlan.plan_code}</b> · {projectMap.get(activePlan.project_id)?.name || `Project #${activePlan.project_id}`} · {activePlan.product_id ? productMap.get(activePlan.product_id)?.name || `Produk #${activePlan.product_id}` : "Semua Produk"} · <b className="text-blue-600">{activePlan.status}</b></div> : null}

        <div className="space-y-3">
          {planLines.map((line) => (
            <div key={line.id} className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div><b className="text-slate-900 font-bold">{line.material_code} · {line.material_name}</b><p className="text-xs text-slate-500">{line.source_requirement_count} requirement BOM · unit stok {line.unit_snapshot}</p></div>
                <div className="text-right text-sm"><b className="text-blue-600 font-bold">Need {formatNumber(line.net_procurement_need)} {line.unit_snapshot}</b><p className="text-xs text-slate-500">Final {formatNumber(line.final_requirement)} · Stock {formatNumber(line.usable_stock)} · Incoming {formatNumber(line.confirmed_incoming)} · Open PO {formatNumber(line.open_po_quantity)}</p></div>
              </div>
              {canEdit && activePlan?.status === "DRAFT" ? (
                <form action={savePlanLine} className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <input type="hidden" name="line_id" value={line.id} /><input type="hidden" name="plan_id" value={line.purchase_plan_id} />
                  <Field label="Confirmed Incoming"><input name="confirmed_incoming" type="number" min="0" step="0.0001" required data-field-label="Confirmed Incoming" defaultValue={String(line.confirmed_incoming)} className={inputClass} /></Field>
                  <Field label={`Qty Direncanakan (${line.unit_snapshot})`}><input name="planned_quantity" type="number" min="0" step="0.0001" required data-field-label="Qty Direncanakan" defaultValue={String(line.planned_quantity)} className={inputClass} /></Field>
                  <Field label="Supplier" hint="Wajib dipilih jika Qty Direncanakan lebih dari 0."><select name="supplier_id" defaultValue={line.supplier_id ?? ""} data-field-label="Supplier" data-required-if-positive="planned_quantity" data-required-if-positive-message="Supplier wajib dipilih karena Qty Direncanakan lebih dari 0." className={inputClass}><option value="">Belum dipilih</option>{vendors.map((x) => <option key={x.id} value={x.id}>{x.vendor_code} · {x.name}</option>)}</select></Field>
                  <Field label="Harga Supplier"><input name="unit_price" type="number" min="0" step="0.01" defaultValue={line.unit_price == null ? "" : String(line.unit_price)} className={inputClass} /></Field>
                  <Field label="Catatan"><input name="notes" defaultValue={line.notes ?? ""} className={inputClass} /></Field>
                  <div className="self-end"><button className={primaryButtonClass}>Simpan</button></div>
                </form>
              ) : <p className="text-sm text-slate-400">Supplier: {line.supplier_name || "-"} · Planned {formatNumber(line.planned_quantity)} · {formatNumber(line.unit_price)} / {line.unit_snapshot}</p>}
            </div>
          ))}
        </div>

        {canCreate && activePlan?.status === "DRAFT" && supplierIds.length > 0 ? (
          <form action={createDraftPo} className="mt-5 grid gap-3 rounded-xl border border-sky-900/60 bg-sky-950/20 p-4 md:grid-cols-2 xl:grid-cols-5">
            <input type="hidden" name="plan_id" value={activePlan.id} />
            <Field label="Supplier"><select name="supplier_id" required data-field-label="Supplier" data-validation-message="Pilih supplier yang akan dibuatkan Draft PO." className={inputClass}><option value="">Pilih supplier dari planning</option>{supplierIds.map((id) => <option key={id} value={id}>{vendors.find((x) => x.id === id)?.name || `Supplier #${id}`}</option>)}</select></Field>
            <Field label="Tanggal PO"><input name="order_date" type="date" className={inputClass} /></Field>
            <Field label="Expected"><input name="expected_date" type="date" className={inputClass} /></Field>
            <Field label="Catatan"><input name="notes" className={inputClass} /></Field>
            <div className="self-end"><button className={primaryButtonClass}>Buat Draft PO</button></div>
          </form>
        ) : null}
      </SectionCard>

      <SectionCard title="Purchase Orders" description="Draft wajib direview sebelum Issue. Penerimaan fisik dilakukan dari halaman Barang Masuk Gudang.">
        <div className="mb-4 flex flex-wrap gap-2">
          {pos.slice(0, 30).map((po) => <Link key={po.id} href={`${"/dashboard/procurement"}?${po.purchase_plan_id ? `plan=${po.purchase_plan_id}&` : ""}po=${po.id}`} className={po.id === activePo?.id ? primaryButtonClass : secondaryButtonClass}>{po.po_number} · {po.status}</Link>)}
          {canExport ? <Link href="/api/export/xlsx?report=purchase_orders" className={secondaryButtonClass}>Export PO XLSX</Link> : null}
        </div>

        {activePo ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
              <div className="flex flex-wrap justify-between gap-3"><div><b className="text-slate-900 font-bold">{activePo.po_number}</b><p className="text-sm text-slate-500">{activePo.supplier_name} · {activePo.order_date} · Expected {activePo.expected_date || "-"}</p></div><div className="text-right"><b className="text-blue-600 font-bold">{formatMoney(activePo.total_amount, activePo.currency)}</b><p className="text-xs text-slate-500">{activePo.status} · received {formatNumber(activePo.received_stock_quantity)} / {formatNumber(activePo.ordered_stock_quantity)} stock unit</p></div></div>
              <div className="mt-3 flex flex-wrap gap-2"><Link href={`/dashboard/procurement/po/${activePo.id}`} className={secondaryButtonClass}>Cetak / Save PDF</Link>{canIssue && activePo.status === "DRAFT" ? <form action={issuePo}><input type="hidden" name="po_id" value={activePo.id} />{activePo.purchase_plan_id ? <input type="hidden" name="plan_id" value={activePo.purchase_plan_id} /> : null}<button className={primaryButtonClass}>Issue PO</button></form> : null}{canCancel && ["DRAFT", "ISSUED"].includes(activePo.status) ? <form action={cancelPo} className="flex gap-2"><input type="hidden" name="po_id" value={activePo.id} />{activePo.purchase_plan_id ? <input type="hidden" name="plan_id" value={activePo.purchase_plan_id} /> : null}<input name="reason" placeholder="Alasan batal" className={inputClass} /><button className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100">Batalkan</button></form> : null}</div>
            </div>

            {poLines.map((line) => (
              <div key={line.id} className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
                <p className="mb-3 text-sm text-slate-700"><b className="text-slate-900 font-bold">{materialMap.get(line.material_id)?.material_code || `#${line.material_id}`} · {materialMap.get(line.material_id)?.name || "Material"}</b> · received {formatNumber(line.received_stock_quantity)} / {formatNumber(line.ordered_stock_quantity)} {line.stock_unit} · {line.status}</p>
                {canEdit && activePo.status === "DRAFT" ? <form action={savePoLine} className="grid gap-3 md:grid-cols-2 xl:grid-cols-6"><input type="hidden" name="line_id" value={line.id} /><input type="hidden" name="po_id" value={activePo.id} />{activePo.purchase_plan_id ? <input type="hidden" name="plan_id" value={activePo.purchase_plan_id} /> : null}<Field label="Qty Purchase"><input name="ordered_quantity" type="number" min="0.0001" step="0.0001" required data-field-label="Qty Purchase" defaultValue={String(line.ordered_quantity)} className={inputClass} /></Field><Field label="Purchase Unit"><input name="purchase_unit" required data-field-label="Purchase Unit" defaultValue={line.purchase_unit} className={inputClass} /></Field><Field label="Factor → Stock"><input name="conversion_factor" type="number" min="0.00000001" step="0.00000001" defaultValue={String(line.conversion_factor)} className={inputClass} /></Field><Field label="Harga / Purchase Unit"><input name="unit_price" type="number" min="0" step="0.01" required data-field-label="Harga / Purchase Unit" defaultValue={String(line.unit_price)} className={inputClass} /></Field><Field label="Catatan"><input name="notes" defaultValue={line.notes ?? ""} className={inputClass} /></Field><div className="self-end"><button className={primaryButtonClass}>Simpan PO</button></div></form> : <p className="text-sm text-slate-500">Order {formatNumber(line.ordered_quantity)} {line.purchase_unit} × {formatMoney(line.unit_price, activePo.currency)} · normalized {formatNumber(line.ordered_stock_quantity)} {line.stock_unit}</p>}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-slate-500">Belum ada Purchase Order.</p>}
      </SectionCard>
    </MasterPageShell>
  );
}
