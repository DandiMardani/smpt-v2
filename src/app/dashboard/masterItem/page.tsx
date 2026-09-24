import Link from "next/link";
import {
  EmptyState,
  Field,
  inputClass,
  MasterPageShell,
  Notice,
  Pagination,
  primaryButtonClass,
  ReadOnlyBanner,
  SectionCard,
  selectClass,
  StatusBadge,
  secondaryButtonClass,
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
import { saveWorkItem, saveWorkItemFlowInline, saveWorkItemPayrollProfile, setWorkItemStatus } from "./actions";

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
type FlowMode = "MANDIRI" | "BERANTAI" | "KHUSUS";
type ValidationMode = "WARNING" | "HARD";
type WorkItemRow = {
  id: number;
  item_code: string;
  project_id: number;
  product_id: number | null;
  name: string;
  unit: string;
  qty_per_product: number;
  operator_price: number;
  proposed_price: number;
  status: string;
  output_final: boolean;
  flow_mode: FlowMode;
  flow_order: number | null;
  routing_validation_mode: ValidationMode;
  executor_scope: "OPERATOR_BORONGAN" | "PEKERJA_HARIAN" | "KEDUANYA";
  submission_category: "BORONGAN" | "TIDAK_ADA";
};

type Props = { searchParams: Promise<SearchParams> };
const ITEM_UNITS = ["Pcs", "Set", "Pasang", "Unit"] as const;

function flowBadge(row: WorkItemRow) {
  if (row.flow_mode === "BERANTAI") return `BERANTAI · Alur ${row.flow_order ?? "?"}`;
  if (row.flow_mode === "KHUSUS") return "KHUSUS · Routing manual";
  return "MANDIRI";
}

export default async function MasterItemPage({ searchParams }: Props) {
  const access = await requirePermission("master_item.view");
  const canWrite = access.role === "ADMIN" && access.permissionCodes.includes("master_item.write");
  const params = await searchParams;
  const q = cleanSearch(param(params, "q"));
  const selectedProject = Number(param(params, "project")) || 0;
  const selectedProduct = Number(param(params, "product")) || 0;
  const page = positivePage(param(params, "page", "1"));
  const { from, to } = pageRange(page);

  const supabase = await createClient();
  let query = supabase
    .from("work_items")
    .select("id, item_code, project_id, product_id, name, unit, qty_per_product, operator_price, proposed_price, status, output_final, flow_mode, flow_order, routing_validation_mode, executor_scope, submission_category", { count: "exact" })
    .order("project_id", { ascending: true })
    .order("product_id", { ascending: true })
    .order("flow_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true })
    .range(from, to);

  if (selectedProject) query = query.eq("project_id", selectedProject);
  if (selectedProduct) query = query.eq("product_id", selectedProduct);
  if (q) query = query.or(`item_code.ilike.%${q}%,name.ilike.%${q}%`);

  const [projectResult, productResult, workItemsResult] = await Promise.all([
    supabase.rpc("master_reference_projects"),
    supabase.rpc("master_reference_products", { p_project_id: null, p_include_inactive: true }),
    query,
  ]);
  if (projectResult.error) throw new Error(`Referensi proyek gagal dimuat: ${projectResult.error.message}`);
  if (productResult.error) throw new Error(`Referensi Produk/Tas gagal dimuat: ${productResult.error.message}`);
  if (workItemsResult.error) throw new Error(`Master Item Pekerjaan gagal dimuat: ${workItemsResult.error.message}`);

  const projects = (projectResult.data ?? []) as ProjectRef[];
  const products = (productResult.data ?? []) as ProductRef[];
  const projectMap = new Map(projects.map((item) => [item.id, item]));
  const productMap = new Map(products.map((item) => [item.id, item]));
  const productsForProject = selectedProject
    ? products.filter((item) => item.project_id === selectedProject)
    : [];

  const rows = (workItemsResult.data ?? []) as WorkItemRow[];
  const pages = totalPages(workItemsResult.count ?? 0);
  const routingHref = selectedProject && selectedProduct
    ? `/dashboard/masterItem/routing?project=${selectedProject}&product=${selectedProduct}`
    : "/dashboard/masterItem/routing";

  return (
    <MasterPageShell
      eyebrow="Master Data"
      title="Master Item Pekerjaan"
      description="Atur pekerjaan dan alurnya dari sini. Default MANDIRI; pilih BERANTAI cukup dengan Nomor Alur. Routing Khusus hanya untuk cabang, parallel, join, atau pengecualian."
    >
      <Notice success={param(params, "success")} error={param(params, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      <SectionCard title="Pilih Proyek / Produk" description="Filter ini menentukan konteks Item Pekerjaan dan alurnya.">
        <form method="get" className="grid gap-3 md:grid-cols-3">
          <Field label="Proyek">
            <select name="project" defaultValue={selectedProject ? String(selectedProject) : ""} className={selectClass}>
              <option value="">Semua proyek</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.project_code} · {project.name}</option>)}
            </select>
          </Field>
          <Field label="Produk/Tas">
            <select name="product" defaultValue={selectedProduct ? String(selectedProduct) : ""} className={selectClass}>
              <option value="">Semua Produk/Tas</option>
              {productsForProject.map((product) => <option key={product.id} value={product.id}>{product.product_code} · {product.name}</option>)}
            </select>
          </Field>
          <Field label="Cari"><input name="q" defaultValue={q} placeholder="ID atau nama pekerjaan" className={inputClass} /></Field>
          <div className="md:col-span-3 flex flex-wrap gap-2">
            <button type="submit" className={secondaryButtonClass}>Terapkan Filter</button>
            {selectedProject && selectedProduct ? <Link href={routingHref} className={secondaryButtonClass}>Lihat / Atur Alur</Link> : null}
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Cara Pakai Alur" description="User tidak perlu membuat predecessor/successor satu-satu untuk pekerjaan normal.">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
            <p className="font-bold text-slate-900">MANDIRI</p>
            <p className="mt-1 text-xs text-slate-500">Pekerjaan berdiri sendiri dan tidak dibandingkan dengan item lain.</p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 shadow-2xs">
            <p className="font-bold text-blue-700">BERANTAI</p>
            <p className="mt-1 text-xs text-slate-600">Isi Alur 1, 2, 3, dst. Sistem otomatis membentuk 1→2→3 dan validasi WIP saat Checker.</p>
          </div>
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 shadow-2xs">
            <p className="font-bold text-amber-800">KHUSUS</p>
            <p className="mt-1 text-xs text-slate-600">Dipakai hanya untuk cabang, parallel, join, atau alur tidak linear. Atur lewat Routing Khusus.</p>
          </div>
        </div>
      </SectionCard>

      {canWrite && selectedProject && selectedProduct ? (
        <SectionCard title="Tambah Item Pekerjaan" description="Item baru default MANDIRI. Setelah tersimpan, atur alurnya pada kartu item di bawah.">
          <form action={saveWorkItem} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="project_id" value={selectedProject} />
            <input type="hidden" name="product_id" value={selectedProduct} />
            <input type="hidden" name="return_project" value={selectedProject} />
            <input type="hidden" name="return_product" value={selectedProduct} />
            <input type="hidden" name="return_q" value={q} />
            <Field label="Proyek"><input disabled value={projectMap.get(selectedProject)?.name ?? "-"} className={inputClass} /></Field>
            <Field label="Produk/Tas"><input disabled value={productMap.get(selectedProduct)?.name ?? "-"} className={inputClass} /></Field>
            <Field label="Nama Pekerjaan"><input name="name" required className={inputClass} /></Field>
            <Field label="Satuan">
              <select name="unit" required defaultValue="" className={selectClass}><option value="" disabled>Pilih satuan</option>{ITEM_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select>
            </Field>
            <Field label="Qty Pekerjaan / Produk"><input name="qty_per_product" type="number" min="1" step="1" defaultValue="1" required className={inputClass} /></Field>
            <Field label="Harga Operator"><input name="operator_price" type="number" min="0" step="1" defaultValue="0" required className={inputClass} /></Field>
            <Field label="Harga Pengajuan"><input name="proposed_price" type="number" min="0" step="1" defaultValue="0" required className={inputClass} /></Field>
            <Field label="Status"><select name="status" defaultValue="AKTIF" className={selectClass}><option value="AKTIF">AKTIF</option><option value="NONAKTIF">NONAKTIF</option></select></Field>
            <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-xs font-semibold text-slate-700 cursor-pointer">
              <input name="output_final" type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /> Output Final
            </label>
            <div className="md:col-span-2 xl:col-span-3 flex items-end"><button type="submit" className={primaryButtonClass}>Simpan Item</button></div>
          </form>
        </SectionCard>
      ) : canWrite ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-xs font-medium text-blue-800">Pilih satu Proyek dan satu Produk/Tas pada filter untuk menambah item baru.</div>
      ) : null}

      <SectionCard title="Daftar Item Pekerjaan" description={`${workItemsResult.count ?? 0} item ditemukan · alur bisa diatur langsung dari setiap item`}>
        {rows.length === 0 ? <EmptyState text="Belum ada item pekerjaan pada filter ini." /> : (
          <div className="space-y-3">
            {rows.map((row) => {
              const project = projectMap.get(row.project_id);
              const product = row.product_id ? productMap.get(row.product_id) : undefined;
              const itemRoutingHref = row.product_id
                ? `/dashboard/masterItem/routing?project=${row.project_id}&product=${row.product_id}`
                : "/dashboard/masterItem/routing";
              return (
                <details key={row.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs hover:border-slate-300 transition">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{row.name}</span>
                          <StatusBadge status={row.status} />
                          <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700">{flowBadge(row)}</span>
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">{row.executor_scope.replaceAll("_", " ")}</span>
                          <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-700">Pengajuan {row.submission_category.replaceAll("_", " ")}</span>
                          {row.flow_mode !== "MANDIRI" ? <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${row.routing_validation_mode === "HARD" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{row.routing_validation_mode}</span> : null}
                          {row.output_final ? <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">OUTPUT FINAL</span> : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-500 font-medium">{row.item_code} · {project?.name ?? "-"} · {product?.name ?? "Legacy / belum terikat"}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-xs lg:text-right">
                        <div><p className="text-[11px] text-slate-400">Qty/Produk</p><p className="font-semibold text-slate-800">{formatNumber(row.qty_per_product)}</p></div>
                        <div><p className="text-[11px] text-slate-400">Operator</p><p className="font-semibold text-slate-800">{formatRupiah(row.operator_price)}</p></div>
                        <div><p className="text-[11px] text-slate-400">Pengajuan</p><p className="font-semibold text-slate-800">{formatRupiah(row.proposed_price)}</p></div>
                      </div>
                    </div>
                  </summary>

                  {canWrite && row.product_id ? (
                    <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                      {row.status === "AKTIF" ? (
                        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div><h3 className="font-bold text-slate-900 text-sm">Alur Kerja</h3><p className="text-xs text-slate-500">Atur normalnya di sini. Routing manual hanya untuk KHUSUS.</p></div>
                            {row.flow_mode === "KHUSUS" ? <Link href={itemRoutingHref} className={secondaryButtonClass}>Atur Routing Khusus</Link> : null}
                          </div>
                          <form action={saveWorkItemFlowInline} className="grid gap-3 md:grid-cols-4">
                            <input type="hidden" name="work_item_id" value={row.id} />
                            <input type="hidden" name="return_project" value={selectedProject || row.project_id} />
                            <input type="hidden" name="return_product" value={selectedProduct || row.product_id} />
                            <input type="hidden" name="return_q" value={q} />
                            <Field label="Tipe Alur">
                              <select name="flow_mode" defaultValue={row.flow_mode} className={selectClass}>
                                <option value="MANDIRI">MANDIRI</option>
                                <option value="BERANTAI">BERANTAI</option>
                                <option value="KHUSUS">KHUSUS</option>
                              </select>
                            </Field>
                            <Field label="Nomor Alur">
                              <input name="flow_order" type="number" min="1" step="1" defaultValue={row.flow_order ?? ""} placeholder="Isi jika BERANTAI" className={inputClass} />
                            </Field>
                            <Field label="Validasi">
                              <select name="validation_mode" defaultValue={row.routing_validation_mode} className={selectClass}>
                                <option value="WARNING">WARNING</option>
                                <option value="HARD">HARD</option>
                              </select>
                            </Field>
                            <div className="flex items-end"><button type="submit" className={primaryButtonClass}>Simpan Alur</button></div>
                          </form>
                          <p className="mt-3 text-xs leading-5 text-slate-500">BERANTAI akan disambungkan otomatis berdasarkan Nomor Alur pada Produk/Tas yang sama. MANDIRI tidak punya predecessor. KHUSUS membuka routing cabang/join.</p>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">Aktifkan item terlebih dahulu untuk mengubah alurnya.</div>
                      )}

                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                        <div className="mb-3"><h3 className="font-bold text-slate-900 text-sm">Pelaksana & Pengajuan</h3><p className="text-xs leading-5 text-slate-500">PEKERJA HARIAN/KEDUANYA membuka input hasil manual di Hasil Produksi. Untuk pekerja HARIAN, Nilai Operator selalu 0; pengajuan BORONGAN tetap memakai Qty Hasil × Harga Pengajuan.</p></div>
                        <form action={saveWorkItemPayrollProfile} className="grid gap-3 md:grid-cols-3">
                          <input type="hidden" name="work_item_id" value={row.id} />
                          <input type="hidden" name="return_project" value={selectedProject || row.project_id} />
                          <input type="hidden" name="return_product" value={selectedProduct || row.product_id} />
                          <input type="hidden" name="return_q" value={q} />
                          <Field label="Pelaksana">
                            <select name="executor_scope" defaultValue={row.executor_scope} className={selectClass}>
                              <option value="OPERATOR_BORONGAN">Operator Borongan</option>
                              <option value="PEKERJA_HARIAN">Pekerja Harian</option>
                              <option value="KEDUANYA">Keduanya</option>
                            </select>
                          </Field>
                          <Field label="Kategori Pengajuan">
                            <select name="submission_category" defaultValue={row.submission_category} className={selectClass}>
                              <option value="BORONGAN">BORONGAN</option>
                              <option value="TIDAK_ADA">TIDAK ADA</option>
                            </select>
                          </Field>
                          <div className="flex items-end"><button type="submit" className={primaryButtonClass}>Simpan Profil</button></div>
                        </form>
                      </div>

                      <form action={saveWorkItem} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="project_id" value={row.project_id} />
                        <input type="hidden" name="product_id" value={row.product_id} />
                        <input type="hidden" name="return_project" value={selectedProject || row.project_id} />
                        <input type="hidden" name="return_product" value={selectedProduct || row.product_id} />
                        <input type="hidden" name="return_q" value={q} />
                        <Field label="Proyek"><input disabled value={project?.name ?? "-"} className={inputClass} /></Field>
                        <Field label="Produk/Tas"><input disabled value={product?.name ?? "-"} className={inputClass} /></Field>
                        <Field label="Nama Pekerjaan"><input name="name" required defaultValue={row.name} className={inputClass} /></Field>
                        <Field label="Satuan"><select name="unit" required defaultValue={row.unit} className={selectClass}>{!ITEM_UNITS.includes(row.unit as (typeof ITEM_UNITS)[number]) ? <option value={row.unit}>{row.unit}</option> : null}{ITEM_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></Field>
                        <Field label="Qty Pekerjaan / Produk"><input name="qty_per_product" type="number" min="1" step="1" required defaultValue={row.qty_per_product} className={inputClass} /></Field>
                        <Field label="Harga Operator"><input name="operator_price" type="number" min="0" step="1" required defaultValue={row.operator_price} className={inputClass} /></Field>
                        <Field label="Harga Pengajuan"><input name="proposed_price" type="number" min="0" step="1" required defaultValue={row.proposed_price} className={inputClass} /></Field>
                        <Field label="Status"><select name="status" defaultValue={row.status} className={selectClass}><option value="AKTIF">AKTIF</option><option value="NONAKTIF">NONAKTIF</option></select></Field>
                        <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-xs font-semibold text-slate-700 cursor-pointer">
                          <input name="output_final" type="checkbox" defaultChecked={row.output_final} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /> Output Final
                        </label>
                        <div className="md:col-span-2 xl:col-span-3 flex items-end"><button type="submit" className={primaryButtonClass}>Simpan Perubahan</button></div>
                      </form>
                      <form action={setWorkItemStatus} className="border-t border-slate-100 pt-4">
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="status" value={row.status === "AKTIF" ? "NONAKTIF" : "AKTIF"} />
                        <input type="hidden" name="return_project" value={selectedProject || row.project_id} />
                        <input type="hidden" name="return_product" value={selectedProduct || row.product_id} />
                        <input type="hidden" name="return_q" value={q} />
                        <button type="submit" className={secondaryButtonClass}>{row.status === "AKTIF" ? "Nonaktifkan Item" : "Aktifkan Item"}</button>
                      </form>
                    </div>
                  ) : null}
                </details>
              );
            })}
          </div>
        )}

        <Pagination
          page={page}
          total={pages}
          basePath="/dashboard/masterItem"
          params={{ ...(q ? { q } : {}), ...(selectedProject ? { project: String(selectedProject) } : {}), ...(selectedProduct ? { product: String(selectedProduct) } : {}) }}
        />
      </SectionCard>
    </MasterPageShell>
  );
}
