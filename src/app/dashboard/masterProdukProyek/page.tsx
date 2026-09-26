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
} from "@/components/master/master-ui";
import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  cleanSearch,
  pageRange,
  param,
  positivePage,
  type SearchParams,
  totalPages,
} from "@/lib/master/page-utils";
import { cookies } from "next/headers";
import { formatProjectOption, resolveProjectCategory } from "@/lib/project-category";
import { createProjectProduct } from "./actions";
import { ProductUnifiedClient } from "./product-unified-client";

type ProjectRef = {
  id: number;
  project_code: string;
  name: string;
  product_category?: string | null;
  status: string;
};

type ProductRow = {
  id: number;
  product_code: string;
  project_id: number;
  name: string;
  target_production: number | string;
  unit: string;
  status: string;
  notes: string | null;
};

type Props = { searchParams: Promise<SearchParams> };

export default async function MasterProdukProyekPage({ searchParams }: Props) {
  const access = await requirePermission("master_produk_proyek.view");
  const canWrite = access.permissionCodes.includes("master_produk_proyek.write");
  const params = await searchParams;
  const q = cleanSearch(param(params, "q"));
  const cookieStore = await cookies();
  const workspaceCookie = cookieStore.get("smpt_workspace")?.value?.toUpperCase();
  const rawCategory = param(params, "category");
  const categoryParam = rawCategory
    ? (rawCategory.toUpperCase() === "ALL" ? "" : rawCategory.toUpperCase())
    : (workspaceCookie === "HAJI" ? "HAJI" : workspaceCookie === "REGULER" ? "REGULER" : "");
  const selectedProject = Number(param(params, "project")) || 0;
  const page = positivePage(param(params, "page", "1"));
  const { from, to } = pageRange(page, 20);

  const supabase = await createClient();

  const [
    projectResult,
    materialResult,
    bomResult,
    cutResult,
    itemResult,
  ] = await Promise.all([
    supabase.rpc("master_reference_projects"),
    supabase.from("materials").select("id, material_code, name, standard_unit").order("name").limit(1000),
    supabase.from("bom_requirements").select("id, project_id, product_id, material_id, component_name, qty_per_unit, unit").eq("status", "AKTIF").limit(3000),
    supabase.from("cutting_components").select("id, project_id, product_id, component_code, name, qty_per_product, unit, color").eq("status", "AKTIF").limit(3000),
    supabase.from("work_items").select("id, project_id, product_id, item_code, name, operator_price, proposed_price, unit, qty_per_product").eq("status", "AKTIF").limit(3000),
  ]);

  if (projectResult.error) throw new Error(`Referensi proyek gagal dimuat: ${projectResult.error.message}`);

  const rawProjects = (projectResult.data ?? []) as ProjectRef[];
  const projects = categoryParam
    ? rawProjects.filter((p) => resolveProjectCategory(p) === categoryParam)
    : rawProjects;
  const scopedProjectIds = projects.map((p) => p.id);

  let query = supabase
    .from("project_products")
    .select("id, product_code, project_id, name, target_production, unit, status, notes", { count: "exact" })
    .order("project_id", { ascending: true })
    .order("name", { ascending: true });

  if (selectedProject > 0) {
    query = query.eq("project_id", selectedProject);
  } else if (categoryParam) {
    if (scopedProjectIds.length > 0) {
      query = query.in("project_id", scopedProjectIds);
    } else {
      query = query.eq("project_id", -1);
    }
  }

  if (q) query = query.or(`product_code.ilike.%${q}%,name.ilike.%${q}%`);

  const productResult = await query.range(from, to);
  if (productResult.error) throw new Error(`Produk gagal dimuat: ${productResult.error.message}`);

  const rows = (productResult.data ?? []) as ProductRow[];
  const materials = (materialResult.data ?? []) as any[];
  const boms = (bomResult.data ?? []) as any[];
  const cuttingComponents = (cutResult.data ?? []) as any[];
  const workItems = (itemResult.data ?? []) as any[];
  const count = productResult.count ?? 0;
  const pages = totalPages(count, 20);

  const pageEyebrow =
    categoryParam === "HAJI"
      ? "Master Data Haji"
      : categoryParam === "REGULER"
      ? "Master Data Reguler"
      : "Master Data Terpadu";

  const pageTitle =
    categoryParam === "HAJI"
      ? "Master Produk Proyek Haji"
      : categoryParam === "REGULER"
      ? "Master Produk Proyek Reguler"
      : "Master Produk & Spesifikasi Terpadu";

  const pageDesc =
    categoryParam === "HAJI"
      ? "Katalog produk tas Haji beserta Kebutuhan Bahan (BOM), Komponen Potong (Cutting), dan Ongkos Jahit Operator."
      : categoryParam === "REGULER"
      ? "Katalog produk tas pesanan umum/reguler beserta BOM, cutting, dan tarif pekerjaan terpadu."
      : "Kelola produk tas beserta Kebutuhan Bahan (BOM), Komponen Potong (Cutting), dan Ongkos Jahit Operator langsung di 1 halaman terpusat.";

  return (
    <MasterPageShell
      eyebrow={pageEyebrow}
      title={pageTitle}
      description={pageDesc}
    >
      <Notice success={param(params, "success")} error={param(params, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      {canWrite ? (
        <details className="group rounded-2xl border border-blue-200 bg-linear-to-r from-blue-50/70 to-indigo-50/70 p-5 shadow-xs">
          <summary className="cursor-pointer list-none flex items-center justify-between font-bold text-sm text-blue-900 select-none">
            <span className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white text-xs">＋</span>
              Tambah Produk / Tas Baru
            </span>
            <span className="text-xs font-semibold text-blue-600 group-open:rotate-180 transition-transform">
              ▼
            </span>
          </summary>
          <div className="mt-4 pt-4 border-t border-blue-200/80">
            <form action={createProjectProduct} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Field label="Proyek">
                <select name="project_id" required defaultValue="" className={selectClass}>
                  <option value="" disabled>Pilih proyek</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {formatProjectOption(project)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nama Produk"><input name="name" required placeholder="Contoh: Tas Ransel Mandiri 2026" className={inputClass} /></Field>
              <Field label="Target Produksi"><input name="target_production" type="number" min="0.0001" step="0.0001" required placeholder="1000" className={inputClass} /></Field>
              <Field label="Satuan"><input name="unit" defaultValue="pcs" required className={inputClass} /></Field>
              <Field label="Status">
                <select name="status" defaultValue="AKTIF" className={selectClass}>
                  <option value="AKTIF">AKTIF</option>
                  <option value="NONAKTIF">NONAKTIF</option>
                </select>
              </Field>
              <Field label="Keterangan"><input name="notes" placeholder="Opsional" className={inputClass} /></Field>
              <div className="flex items-end"><button type="submit" className={primaryButtonClass}>Simpan Produk Baru</button></div>
            </form>
          </div>
        </details>
      ) : null}

      <SectionCard
        title="Daftar Produk & Pengaturan Spesifikasi"
        description={`Ditemukan total ${count} produk. Klik "⚡ Atur BOM, Cutting & Ongkos Jahit" pada produk yang ingin dikelola.`}
      >
        <ProductUnifiedClient
          products={rows}
          projects={projects}
          materials={materials}
          boms={boms}
          cuttingComponents={cuttingComponents}
          workItems={workItems}
          canWrite={canWrite}
        />

        <div className="mt-6">
          <Pagination
            page={page}
            total={pages}
            basePath="/dashboard/masterProdukProyek"
            params={{ ...(q ? { q } : {}), ...(selectedProject ? { project: String(selectedProject) } : {}) }}
          />
        </div>
      </SectionCard>
    </MasterPageShell>
  );
}
