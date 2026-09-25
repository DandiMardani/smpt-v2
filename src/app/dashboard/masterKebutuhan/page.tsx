import {
  dangerButtonClass,
  EmptyState,
  Field,
  inputClass,
  MasterPageShell,
  Notice,
  Pagination,
  primaryButtonClass,
  ReadOnlyBanner,
  SectionCard,
  secondaryButtonClass,
  selectClass,
  StatusBadge,
} from "@/components/master/master-ui";
import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  cleanSearch,
  formatNumber,
  formatRupiah,
  pageRange,
  param,
  positivePage,
  type SearchParams,
  totalPages,
} from "@/lib/master/page-utils";
import { deleteBomRequirement, saveBomRequirement } from "./actions";
import { MasterKebutuhanCreateForm, MasterKebutuhanFilter } from "./master-kebutuhan-client";

type ProjectRef = { id: number; project_code: string; name: string; status: string };
type ProductRef = {
  id: number;
  product_code: string;
  project_id: number;
  name: string;
  target_production: number | string;
  unit: string;
  status: string;
};
type MaterialRef = {
  id: number;
  material_code: string;
  name: string;
  standard_unit: string;
  category: string;
  status: string;
  calculation_type: "SHEET" | "LENGTH" | "PCS" | "ROLL_LENGTH";
};
type BomRow = {
  id: number;
  requirement_code: string;
  project_id: number;
  product_id: number | null;
  material_id: number | null;
  component_type: string;
  component_name: string;
  unit: string;
  qty_per_unit: number | string;
  unit_price: number | string;
  status: string;
  legacy_total_requirement: number | string | null;
  legacy_project_level: boolean;
  fulfillment_source: string | null;
  calculation_method: string | null;
  net_usage_per_product: number | string | null;
  allowance_percent: number | string | null;
  waste_percent: number | string | null;
  final_requirement: number | string | null;
};

type Props = { searchParams: Promise<SearchParams> };

export default async function MasterKebutuhanPage({ searchParams }: Props) {
  const access = await requirePermission("master_kebutuhan.view");
  const canWrite = access.permissionCodes.includes("master_kebutuhan.write");
  const params = await searchParams;
  const q = cleanSearch(param(params, "q"));
  const selectedProject = Number(param(params, "project")) || 0;
  const selectedProduct = Number(param(params, "product")) || 0;
  const page = positivePage(param(params, "page", "1"));
  const { from, to } = pageRange(page);

  const supabase = await createClient();
  const [projectResult, productResult, materialResult] = await Promise.all([
    supabase.rpc("master_reference_projects"),
    supabase.rpc("master_reference_products", { p_project_id: null, p_include_inactive: true }),
    supabase.rpc("master_reference_materials_v2", { p_include_inactive: true }),
  ]);

  if (projectResult.error) throw new Error(`Referensi proyek gagal dimuat: ${projectResult.error.message}`);
  if (productResult.error) throw new Error(`Referensi Produk gagal dimuat: ${productResult.error.message}`);
  if (materialResult.error) throw new Error(`Referensi bahan gagal dimuat: ${materialResult.error.message}`);

  const projects = (projectResult.data ?? []) as ProjectRef[];
  const products = (productResult.data ?? []) as ProductRef[];
  const materials = (materialResult.data ?? []) as MaterialRef[];
  const projectMap = new Map(projects.map((item) => [item.id, item]));
  const productMap = new Map(products.map((item) => [item.id, item]));
  const materialMap = new Map(materials.map((item) => [item.id, item]));

  let query = supabase
    .from("bom_requirements")
    .select("id, requirement_code, project_id, product_id, material_id, component_type, component_name, unit, qty_per_unit, unit_price, status, legacy_total_requirement, legacy_project_level, fulfillment_source, calculation_method, net_usage_per_product, allowance_percent, waste_percent, final_requirement", { count: "exact" })
    .order("project_id", { ascending: true })
    .order("product_id", { ascending: true })
    .order("component_type", { ascending: true })
    .order("component_name", { ascending: true })
    .range(from, to);

  if (selectedProject) query = query.eq("project_id", selectedProject);
  if (selectedProduct) query = query.eq("product_id", selectedProduct);
  if (q) query = query.or(`requirement_code.ilike.%${q}%,component_name.ilike.%${q}%`);

  const { data, count, error } = await query;
  if (error) throw new Error(`Master Kebutuhan gagal dimuat: ${error.message}`);
  const rows = (data ?? []) as BomRow[];
  const pages = totalPages(count ?? 0);

  return (
    <MasterPageShell
      eyebrow="Master Data"
      title="Master Kebutuhan Bahan / BOM"
      description="BAHAN masuk flow stok fisik. JASA dan BIAYA hanya masuk costing. Total kebutuhan dihitung dinamis dari Target Produk × Kebutuhan per Unit."
    >
      <Notice success={param(params, "success")} error={param(params, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      <MasterKebutuhanFilter
        projects={projects}
        products={products}
        initialProjectId={selectedProject}
        initialProductId={selectedProduct}
        initialQ={q}
      />

      {canWrite ? (
        <MasterKebutuhanCreateForm
          projects={projects}
          products={products}
          materials={materials}
          defaultProjectId={selectedProject || undefined}
          defaultProductId={selectedProduct || undefined}
        />
      ) : null}

      <SectionCard title="Daftar Kebutuhan / Costing" description={`${count ?? 0} komponen ditemukan`}>
        {rows.length === 0 ? <EmptyState text="Belum ada kebutuhan pada filter ini." /> : (
          <div className="space-y-3">
            {rows.map((row) => {
              const project = projectMap.get(row.project_id);
              const product = row.product_id ? productMap.get(row.product_id) : undefined;
              const qty = Number(row.qty_per_unit ?? 0);
              const price = Number(row.unit_price ?? 0);
              const target = Number(product?.target_production ?? 0);
              const totalRequirement = product
                ? target * qty
                : Number(row.legacy_total_requirement ?? 0);
              const costPerProduct = qty * price;
              const totalCost = totalRequirement * price;

              return (
                <details key={row.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs hover:border-slate-300 transition">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2"><span className="font-bold text-slate-900 text-sm">{row.component_name}</span><span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{row.component_type}</span><StatusBadge status={row.status} /></div>
                        <p className="mt-1 text-xs text-slate-500 font-medium">{row.requirement_code} · {project?.name ?? "-"} · {product?.name ?? "Legacy level proyek"} · {row.fulfillment_source ?? "-"}{row.calculation_method && row.calculation_method !== "MANUAL" ? ` · ${row.calculation_method}` : ""}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4 lg:text-right">
                        <div><p className="text-[11px] text-slate-400">Kebutuhan/Unit</p><p className="font-semibold text-slate-800">{formatNumber(qty)} {row.unit}</p></div>
                        <div><p className="text-[11px] text-slate-400">Total Kebutuhan</p><p className="font-semibold text-slate-800">{formatNumber(totalRequirement)}</p></div>
                        <div><p className="text-[11px] text-slate-400">Modal/Produk</p><p className="font-semibold text-slate-800">{formatRupiah(costPerProduct)}</p></div>
                        <div><p className="text-[11px] text-slate-400">Total Biaya</p><p className="font-semibold text-slate-800">{formatRupiah(totalCost)}</p></div>
                      </div>
                    </div>
                  </summary>

                  {canWrite && row.product_id ? (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <form action={saveBomRequirement} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="project_id" value={row.project_id} />
                        <input type="hidden" name="product_id" value={row.product_id} />
                        <Field label="Jenis Komponen"><select name="component_type" defaultValue={row.component_type} className={selectClass}><option value="BAHAN">BAHAN</option><option value="JASA">JASA</option><option value="BIAYA">BIAYA</option></select></Field>
                        <Field label="Master Bahan"><select name="material_id" defaultValue={row.material_id ? String(row.material_id) : ""} className={selectClass}><option value="">Tidak menggunakan Master Bahan</option>{materials.map((item) => <option key={item.id} value={item.id}>{item.material_code} · {item.name}</option>)}</select></Field>
                        <Field label="Nama Jasa/Biaya"><input name="component_name" defaultValue={row.component_type === "BAHAN" ? "" : row.component_name} className={inputClass} /></Field>
                        <Field label="Satuan Jasa/Biaya"><input name="unit" defaultValue={row.component_type === "BAHAN" ? "" : row.unit} className={inputClass} /></Field>
                        <Field label="Kebutuhan / Unit"><input name="qty_per_unit" type="number" min="0" step="0.0001" required defaultValue={String(row.qty_per_unit)} className={inputClass} /></Field>
                        <Field label="Harga Satuan"><input name="unit_price" type="number" min="0" step="0.01" required defaultValue={String(row.unit_price)} className={inputClass} /></Field>
                        <Field label="Sumber Pemenuhan"><select name="fulfillment_source" defaultValue={row.fulfillment_source ?? "COMPANY_PURCHASE"} className={selectClass}><option value="COMPANY_PURCHASE">Perusahaan Beli</option><option value="CUSTOMER_SUPPLIED">Bahan Customer / Titipan</option><option value="VENDOR_SUPPLIED">Disediakan Vendor</option><option value="INTERNAL_STOCK">Stok Internal</option><option value="OTHER">Lainnya</option></select></Field>
                        <input type="hidden" name="calculation_method" value={row.calculation_method ?? "MANUAL"} />
                        <input type="hidden" name="net_usage_per_product" value={row.net_usage_per_product == null ? "" : String(row.net_usage_per_product)} />
                        <input type="hidden" name="allowance_percent" value={row.allowance_percent == null ? "0" : String(row.allowance_percent)} />
                        <input type="hidden" name="waste_percent" value={row.waste_percent == null ? "0" : String(row.waste_percent)} />
                        <input type="hidden" name="final_requirement" value={row.final_requirement == null ? "" : String(row.final_requirement)} />
                        <input type="hidden" name="calculation_input_snapshot" value="" />
                        <Field label="Status"><select name="status" defaultValue={row.status} className={selectClass}><option value="AKTIF">AKTIF</option><option value="NONAKTIF">NONAKTIF</option></select></Field>
                        <div className="flex items-end"><button type="submit" className={primaryButtonClass}>Simpan Perubahan</button></div>
                      </form>
                      <form action={deleteBomRequirement} className="mt-4 border-t border-slate-100 pt-4"><input type="hidden" name="id" value={row.id} /><button type="submit" className={dangerButtonClass}>Hapus Kebutuhan</button></form>
                    </div>
                  ) : row.legacy_project_level ? (
                    <p className="mt-4 border-t border-slate-100 pt-4 text-xs font-medium text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">Row legacy level proyek dipertahankan untuk audit. Migrasi data final akan memetakannya ke Produk yang benar sebelum go-live.</p>
                  ) : null}
                </details>
              );
            })}
          </div>
        )}

        <Pagination
          page={page}
          total={pages}
          basePath="/dashboard/masterKebutuhan"
          params={{ ...(q ? { q } : {}), ...(selectedProject ? { project: String(selectedProject) } : {}), ...(selectedProduct ? { product: String(selectedProduct) } : {}) }}
        />
      </SectionCard>
    </MasterPageShell>
  );
}
