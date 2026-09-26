import Link from "next/link";
import { cookies } from "next/headers";
import {
  EmptyState,
  Field,
  inputClass,
  MasterPageShell,
  Notice,
  Pagination,
  primaryButtonClass,
  ReadOnlyBanner,
  SearchForm,
  SectionCard,
  selectClass,
  StatusBadge,
  dangerButtonClass,
} from "@/components/master/master-ui";
import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  cleanSearch,
  formatRupiah,
  pageRange,
  param,
  positivePage,
  type SearchParams,
  totalPages,
} from "@/lib/master/page-utils";
import {
  getProjectCategoryBadge,
  resolveProjectCategory,
} from "@/lib/project-category";
import { createProject, deleteProject, repeatProject, updateProject } from "./actions";

type ProjectRow = {
  id: number;
  project_code: string;
  name: string;
  product_category: string | null;
  customer_name: string | null;
  contract_value: number | string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  repeat_source_project_id: number | null;
};

type ProductTargetRow = {
  id: number;
  project_id: number;
  product_code: string;
  name: string;
  target_production: number | string;
  unit: string;
  status: string;
};

type Props = { searchParams: Promise<SearchParams> };

const PROJECT_STATUSES = ["Pending", "Berjalan", "Selesai"];

export default async function MasterProyekPage({ searchParams }: Props) {
  const access = await requirePermission("master_proyek.view");
  const canWrite = access.permissionCodes.includes("master_proyek.write");
  const canRepeat =
    canWrite &&
    [
      "master_produk_proyek.write",
      "master_item.write",
      "master_kebutuhan.write",
    ].every((permission) => access.permissionCodes.includes(permission));
  const params = await searchParams;
  const q = cleanSearch(param(params, "q"));
  const cookieStore = await cookies();
  const workspaceCookie = cookieStore.get("smpt_workspace")?.value?.toUpperCase();
  const rawCategory = param(params, "category");
  const categoryParam = rawCategory
    ? (rawCategory.toUpperCase() === "ALL" ? "" : rawCategory.toUpperCase())
    : (workspaceCookie === "HAJI" ? "HAJI" : workspaceCookie === "REGULER" ? "REGULER" : "");
  const page = positivePage(param(params, "page", "1"));
  const { from, to } = pageRange(page);

  const supabase = await createClient();
  let query = supabase
    .from("projects")
    .select(
      "id, project_code, name, product_category, customer_name, contract_value, start_date, end_date, status, repeat_source_project_id",
      { count: "exact" },
    )
    .order("name", { ascending: true })
    .range(from, to);

  if (q) {
    query = query.or(`project_code.ilike.%${q}%,name.ilike.%${q}%`);
  }

  if (categoryParam === "HAJI") {
    query = query.or("product_category.eq.HAJI,name.ilike.%haji%,name.ilike.%embarkasi%,project_code.ilike.%haji%");
  } else if (categoryParam === "REGULER") {
    query = query.not("product_category", "eq", "HAJI").not("name", "ilike", "%haji%").not("name", "ilike", "%embarkasi%");
  }

  const { data, count, error } = await query;
  if (error) throw new Error(`Master Proyek gagal dimuat: ${error.message}`);

  const rows = (data ?? []) as ProjectRow[];
  const pages = totalPages(count ?? 0);
  const rowIds = rows.map((row) => row.id);
  const sourceIds = Array.from(
    new Set(
      rows
        .map((row) => row.repeat_source_project_id)
        .filter((id): id is number => Boolean(id)),
    ),
  );
  const [productTargetResult, sourceProjectResult] = await Promise.all([
    canRepeat && rowIds.length
      ? supabase
          .from("project_products")
          .select("id, project_id, product_code, name, target_production, unit, status")
          .in("project_id", rowIds)
          .order("id")
      : Promise.resolve({ data: [] as ProductTargetRow[], error: null }),
    sourceIds.length
      ? supabase
          .from("projects")
          .select("id, project_code, name")
          .in("id", sourceIds)
      : Promise.resolve({
          data: [] as { id: number; project_code: string; name: string }[],
          error: null,
        }),
  ]);
  if (productTargetResult.error)
    throw new Error(`Produk Repeat Order gagal dimuat: ${productTargetResult.error.message}`);
  if (sourceProjectResult.error)
    throw new Error(`Trace Repeat Order gagal dimuat: ${sourceProjectResult.error.message}`);
  const productsByProject = new Map<number, ProductTargetRow[]>();
  for (const product of (productTargetResult.data ?? []) as ProductTargetRow[]) {
    const list = productsByProject.get(product.project_id) ?? [];
    list.push(product);
    productsByProject.set(product.project_id, list);
  }
  const sourceProjectMap = new Map(
    ((sourceProjectResult.data ?? []) as { id: number; project_code: string; name: string }[]).map(
      (item) => [item.id, item],
    ),
  );

  const pageEyebrow =
    categoryParam === "HAJI"
      ? "Master Data Haji"
      : categoryParam === "REGULER"
      ? "Master Data Reguler"
      : "Master Data";

  const pageTitle =
    categoryParam === "HAJI"
      ? "Master Proyek (Haji & Embarkasi)"
      : categoryParam === "REGULER"
      ? "Master Proyek (Pesanan Reguler)"
      : "Master Proyek";

  const pageDesc =
    categoryParam === "HAJI"
      ? "Data induk proyek khusus Haji & Distribusi Embarkasi Kemenag. Hanya menampilkan proyek Haji sesuai ruang kerja aktif."
      : categoryParam === "REGULER"
      ? "Data induk proyek khusus Pesanan Reguler, Seminar, Sekolah & Maklon. Hanya menampilkan proyek Reguler sesuai ruang kerja aktif."
      : "Data induk proyek terpadu (Haji & Embarkasi vs Pesanan Reguler). Dilengkapi filter kategori, audit, dan repeat order.";

  return (
    <MasterPageShell
      eyebrow={pageEyebrow}
      title={pageTitle}
      description={pageDesc}
    >
      <Notice success={param(params, "success")} error={param(params, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      {canWrite ? (
        <SectionCard
          title="Tambah Proyek Baru"
          description="Pilih kategori proyek (Haji atau Reguler) agar otomatis terhubung ke alur kerja masing-masing."
        >
          <form action={createProject} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Kategori Proyek" hint="Pemisah utama alur kerja sistem.">
              <select
                name="product_category"
                required
                defaultValue={categoryParam === "HAJI" ? "HAJI" : "REGULER"}
                className={selectClass}
              >
                <option value="REGULER">🎒 Proyek Reguler / Umum</option>
                <option value="HAJI">🕋 Proyek Haji & Embarkasi</option>
              </select>
            </Field>
            <Field label="ID Proyek">
              <input name="project_code" required className={inputClass} placeholder="Contoh: PRJ-001" />
            </Field>
            <Field label="Nama Proyek">
              <input name="name" required className={inputClass} placeholder="Contoh: Pesanan Tas Haji Embarkasi SUB" />
            </Field>
            <Field label="Nama Customer / Klien">
              <input name="customer_name" className={inputClass} placeholder="Contoh: Kemenag / PT Citra Mandiri" />
            </Field>
            <Field label="Nilai Kontrak">
              <input name="contract_value" type="number" min="0" step="1" defaultValue="0" className={inputClass} />
            </Field>
            <Field label="Status Proyek">
              <select name="status" defaultValue="Pending" className={selectClass}>
                {PROJECT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tanggal Mulai">
              <input name="start_date" type="date" className={inputClass} />
            </Field>
            <Field label="Tanggal Selesai">
              <input name="end_date" type="date" className={inputClass} />
            </Field>
            <div className="flex items-end">
              <button className={primaryButtonClass} type="submit">
                Simpan Proyek
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        title={
          categoryParam === "HAJI"
            ? "Daftar Proyek Haji & Embarkasi"
            : categoryParam === "REGULER"
            ? "Daftar Proyek Reguler / Umum"
            : "Daftar Semua Proyek"
        }
        description={`${count ?? 0} proyek ditemukan${categoryParam ? ` (Ruang Kerja: ${categoryParam})` : " (Semua Kategori)"}`}
      >
        {/* Kategori Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Link
            href={`/dashboard/masterProyek?category=HAJI${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              categoryParam === "HAJI"
                ? "bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-600"
                : "bg-white text-emerald-700 hover:bg-emerald-50 border border-emerald-200"
            }`}
          >
            <span>🕋</span> Proyek Haji & Embarkasi
          </Link>
          <Link
            href={`/dashboard/masterProyek?category=REGULER${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              categoryParam === "REGULER"
                ? "bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-600"
                : "bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200"
            }`}
          >
            <span>🎒</span> Proyek Reguler / Umum
          </Link>
          <Link
            href={`/dashboard/masterProyek?category=ALL${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              !categoryParam
                ? "bg-slate-900 text-white shadow-sm ring-1 ring-slate-900"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <span>🌐</span> Semua Kategori (Campuran)
          </Link>
        </div>

        <div className="mb-5">
          <SearchForm defaultValue={q} placeholder="Cari ID atau nama proyek..." />
        </div>

        {rows.length === 0 ? (
          <EmptyState text="Belum ada proyek pada filter kategori/pencarian ini." />
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const knownStatus = PROJECT_STATUSES.includes(row.status);
              const projectCategory = resolveProjectCategory(row);
              const badge = getProjectCategoryBadge(projectCategory);

              return (
                <details
                  key={row.id}
                  className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs hover:border-slate-300 transition"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{row.name}</span>
                          <span className={badge.badgeClass}>{badge.fullLabel}</span>
                          <StatusBadge status={row.status} />
                        </div>
                        <p className="mt-1 text-xs text-slate-500 font-medium">
                          {row.project_code} · {row.customer_name || "Tanpa customer"}
                        </p>
                        {row.repeat_source_project_id ? (
                          <p className="mt-1 text-xs text-violet-700 font-medium">
                            Repeat dari{" "}
                            {sourceProjectMap.get(row.repeat_source_project_id)?.project_code ??
                              `Project #${row.repeat_source_project_id}`}{" "}
                            · trace source tersimpan
                          </p>
                        ) : null}
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-xs text-slate-400">Nilai Kontrak</p>
                        <p className="font-semibold text-slate-800">{formatRupiah(row.contract_value)}</p>
                      </div>
                    </div>
                  </summary>

                  <div className="mt-4 border-t border-slate-100 pt-4">
                    {canWrite ? (
                      <>
                        <form action={updateProject} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          <input type="hidden" name="id" value={row.id} />
                          <Field label="ID Proyek" hint="ID bisnis tidak diubah saat edit.">
                            <input value={row.project_code} disabled className={inputClass} />
                          </Field>
                          <Field label="Kategori Proyek">
                            <select
                              name="product_category"
                              defaultValue={projectCategory}
                              className={selectClass}
                            >
                              <option value="REGULER">🎒 Proyek Reguler / Umum</option>
                              <option value="HAJI">🕋 Proyek Haji & Embarkasi</option>
                            </select>
                          </Field>
                          <Field label="Nama Proyek">
                            <input name="name" required defaultValue={row.name} className={inputClass} />
                          </Field>
                          <Field label="Nama Customer">
                            <input
                              name="customer_name"
                              defaultValue={row.customer_name ?? ""}
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Nilai Kontrak">
                            <input
                              name="contract_value"
                              type="number"
                              min="0"
                              step="1"
                              defaultValue={String(row.contract_value ?? 0)}
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Status Proyek">
                            <select name="status" defaultValue={row.status} className={selectClass}>
                              {!knownStatus ? <option value={row.status}>{row.status}</option> : null}
                              {PROJECT_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Tanggal Mulai">
                            <input
                              name="start_date"
                              type="date"
                              defaultValue={row.start_date ?? ""}
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Tanggal Selesai">
                            <input
                              name="end_date"
                              type="date"
                              defaultValue={row.end_date ?? ""}
                              className={inputClass}
                            />
                          </Field>
                          <div className="flex items-end">
                            <button className={primaryButtonClass} type="submit">
                              Simpan Perubahan
                            </button>
                          </div>
                        </form>
                        {canRepeat ? (
                          <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                            <h3 className="font-bold text-slate-900 text-sm">Repeat Order</h3>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                              Membuat project baru dan hanya menyalin master/config reusable: Produk, target
                              baru, BOM, Item Pekerjaan, profil pelaksana/pengajuan, dan Routing. Transaksi
                              lama tidak disalin.
                            </p>
                            <form
                              action={repeatProject}
                              className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                            >
                              <input type="hidden" name="source_project_id" value={row.id} />
                              <Field label="ID Proyek Baru">
                                <input
                                  name="project_code"
                                  required
                                  className={inputClass}
                                  placeholder={`${row.project_code}-RO`}
                                />
                              </Field>
                              <Field label="Kategori Proyek">
                                <select
                                  name="product_category"
                                  defaultValue={projectCategory}
                                  className={selectClass}
                                >
                                  <option value="REGULER">🎒 Proyek Reguler / Umum</option>
                                  <option value="HAJI">🕋 Proyek Haji & Embarkasi</option>
                                </select>
                              </Field>
                              <Field label="Nama Proyek Baru">
                                <input
                                  name="name"
                                  required
                                  className={inputClass}
                                  defaultValue={`${row.name} - Repeat`}
                                />
                              </Field>
                              <Field label="Nama Customer">
                                <input
                                  name="customer_name"
                                  className={inputClass}
                                  defaultValue={row.customer_name ?? ""}
                                />
                              </Field>
                              <Field label="Nilai Kontrak">
                                <input
                                  name="contract_value"
                                  type="number"
                                  min="0"
                                  step="1"
                                  defaultValue={String(row.contract_value ?? 0)}
                                  className={inputClass}
                                />
                              </Field>
                              <Field label="Status">
                                <select name="status" defaultValue="Pending" className={selectClass}>
                                  {PROJECT_STATUSES.map((status) => (
                                    <option key={status} value={status}>
                                      {status}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                              <Field label="Tanggal Mulai">
                                <input name="start_date" type="date" className={inputClass} />
                              </Field>
                              <Field label="Tanggal Selesai">
                                <input name="end_date" type="date" className={inputClass} />
                              </Field>
                              <Field label="Catatan Repeat">
                                <input
                                  name="repeat_note"
                                  className={inputClass}
                                  placeholder="Opsional: PO/customer/revisi"
                                />
                              </Field>
                              {(productsByProject.get(row.id) ?? []).map((product) => (
                                <Field
                                  key={product.id}
                                  label={`Target Baru · ${product.product_code} · ${product.name}`}
                                >
                                  <input
                                    name={`target_${product.id}`}
                                    type="number"
                                    min="0.0001"
                                    step="0.0001"
                                    required
                                    defaultValue={String(product.target_production)}
                                    className={inputClass}
                                  />
                                </Field>
                              ))}
                              <div className="flex items-end">
                                <button type="submit" className={primaryButtonClass}>
                                  Buat Repeat Order
                                </button>
                              </div>
                            </form>
                            {(productsByProject.get(row.id) ?? []).length === 0 ? (
                              <p className="mt-3 text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                                Project ini belum mempunyai Produk. Repeat tetap bisa dibuat, tetapi tidak ada
                                konfigurasi produk yang dicopy.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        <form action={deleteProject} className="mt-4 border-t border-slate-100 pt-4">
                          <input type="hidden" name="id" value={row.id} />
                          <button type="submit" className={dangerButtonClass}>
                            Hapus Proyek
                          </button>
                          <p className="mt-2 text-xs text-slate-500">
                            Database akan menolak penghapusan jika proyek sudah memiliki data turunan.
                          </p>
                        </form>
                      </>
                    ) : (
                      <div className="grid gap-3 text-xs text-slate-600 sm:grid-cols-2">
                        <p>Kategori: {badge.fullLabel}</p>
                        <p>Customer: {row.customer_name || "-"}</p>
                        <p>Mulai: {row.start_date || "-"}</p>
                        <p>Selesai: {row.end_date || "-"}</p>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}

        <Pagination
          page={page}
          total={pages}
          basePath="/dashboard/masterProyek"
          params={{
            ...(q ? { q } : {}),
            ...(categoryParam ? { category: categoryParam } : {}),
          }}
        />
      </SectionCard>
    </MasterPageShell>
  );
}
