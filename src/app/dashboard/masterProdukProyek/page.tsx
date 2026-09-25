import {
  EmptyState,
  Field,
  inputClass,
  MasterPageShell,
  Notice,
  Pagination,
  primaryButtonClass,
  ReadOnlyBanner,
  secondaryButtonClass,
  SectionCard,
  selectClass,
  StatusBadge,
} from "@/components/master/master-ui";
import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  cleanSearch,
  formatNumber,
  pageRange,
  param,
  positivePage,
  type SearchParams,
  totalPages,
} from "@/lib/master/page-utils";
import { createProjectProduct, updateProjectProduct, deleteProjectProduct } from "./actions";

type ProjectRef = {
  id: number;
  project_code: string;
  name: string;
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
  const selectedProject = Number(param(params, "project")) || 0;
  const page = positivePage(param(params, "page", "1"));
  const { from, to } = pageRange(page);

  const supabase = await createClient();

  let query = supabase
    .from("project_products")
    .select("id, product_code, project_id, name, target_production, unit, status, notes", { count: "exact" })
    .order("project_id", { ascending: true })
    .order("name", { ascending: true })
    .range(from, to);

  if (selectedProject > 0) query = query.eq("project_id", selectedProject);
  if (q) query = query.or(`product_code.ilike.%${q}%,name.ilike.%${q}%`);

  const [projectResult, productResult] = await Promise.all([
    supabase.rpc("master_reference_projects"),
    query,
  ]);

  if (projectResult.error) throw new Error(`Referensi proyek gagal dimuat: ${projectResult.error.message}`);
  if (productResult.error) throw new Error(`Produk gagal dimuat: ${productResult.error.message}`);

  const projects = (projectResult.data ?? []) as ProjectRef[];
  const projectMap = new Map(projects.map((item) => [item.id, item]));
  const rows = (productResult.data ?? []) as ProductRow[];
  const count = productResult.count ?? 0;
  const pages = totalPages(count);

  return (
    <MasterPageShell
      eyebrow="Master Data"
      title="Master Produk Proyek"
      description="Target produksi aktif disimpan per Produk. Anda dapat mengedit nama, target, satuan, maupun memindahkan proyek jika salah input."
    >
      <Notice success={param(params, "success")} error={param(params, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      {canWrite ? (
        <SectionCard title="Tambah Produk">
          <form action={createProjectProduct} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Proyek">
              <select name="project_id" required defaultValue="" className={selectClass}>
                <option value="" disabled>Pilih proyek</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.project_code} · {project.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Nama Produk"><input name="name" required className={inputClass} /></Field>
            <Field label="Target Produksi"><input name="target_production" type="number" min="0.0001" step="0.0001" required className={inputClass} /></Field>
            <Field label="Satuan"><input name="unit" defaultValue="pcs" required className={inputClass} /></Field>
            <Field label="Status">
              <select name="status" defaultValue="AKTIF" className={selectClass}>
                <option value="AKTIF">AKTIF</option>
                <option value="NONAKTIF">NONAKTIF</option>
              </select>
            </Field>
            <Field label="Keterangan"><input name="notes" className={inputClass} /></Field>
            <div className="flex items-end"><button type="submit" className={primaryButtonClass}>Simpan Produk</button></div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Daftar Produk" description={`${count ?? 0} data ditemukan`}>
        <form method="get" className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto]">
          <input name="q" defaultValue={q} placeholder="Cari ID atau nama Produk..." className={inputClass} />
          <select name="project" defaultValue={selectedProject ? String(selectedProject) : ""} className={selectClass}>
            <option value="">Semua proyek</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <button className={secondaryButtonClass} type="submit">Filter</button>
        </form>

        {rows.length === 0 ? <EmptyState text="Belum ada Produk pada filter ini." /> : (
          <div className="space-y-3">
            {rows.map((row) => {
              const project = projectMap.get(row.project_id);
              return (
                <details key={row.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs hover:border-slate-300 transition">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2"><span className="font-bold text-slate-900 text-sm">{row.name}</span><StatusBadge status={row.status} /></div>
                        <p className="mt-1 text-xs text-slate-500 font-medium">{row.product_code} · {project?.name ?? "Proyek tidak ditemukan"}</p>
                      </div>
                      <div className="sm:text-right"><p className="text-xs text-slate-400">Target</p><p className="font-semibold text-slate-800">{formatNumber(row.target_production)} {row.unit}</p></div>
                    </div>
                  </summary>
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    {canWrite ? (
                      <form action={updateProjectProduct} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <input type="hidden" name="id" value={row.id} />
                        <Field label="Proyek" hint="Pilih proyek tujuan jika ingin memindahkan produk ini.">
                          <select name="project_id" required defaultValue={row.project_id} className={selectClass}>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.project_code} · {p.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Nama Produk"><input name="name" required defaultValue={row.name} className={inputClass} /></Field>
                        <Field label="Target Produksi"><input name="target_production" type="number" min="0.0001" step="0.0001" required defaultValue={String(row.target_production)} className={inputClass} /></Field>
                        <Field label="Satuan"><input name="unit" required defaultValue={row.unit} className={inputClass} /></Field>
                        <Field label="Status"><select name="status" defaultValue={row.status} className={selectClass}><option value="AKTIF">AKTIF</option><option value="NONAKTIF">NONAKTIF</option></select></Field>
                        <Field label="Keterangan"><input name="notes" defaultValue={row.notes ?? ""} className={inputClass} /></Field>
                        <div className="md:col-span-2 xl:col-span-3 flex flex-wrap items-center justify-between gap-3 pt-2">
                          <button type="submit" className={primaryButtonClass}>Simpan Perubahan</button>
                          <button
                            type="submit"
                            formAction={deleteProjectProduct}
                            formNoValidate
                            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                          >
                            🗑️ Hapus Produk
                          </button>
                        </div>
                      </form>
                    ) : <p className="text-sm text-slate-400">{row.notes || "Tidak ada keterangan."}</p>}
                  </div>
                </details>
              );
            })}
          </div>
        )}

        <Pagination
          page={page}
          total={pages}
          basePath="/dashboard/masterProdukProyek"
          params={{ ...(q ? { q } : {}), ...(selectedProject ? { project: String(selectedProject) } : {}) }}
        />
      </SectionCard>
    </MasterPageShell>
  );
}
