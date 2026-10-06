import Link from "next/link";
import {
  EmptyState,
  Field,
  inputClass,
  MasterPageShell,
  Notice,
  primaryButtonClass,
  ReadOnlyBanner,
  SectionCard,
  selectClass,
  StatusBadge,
  secondaryButtonClass,
} from "@/components/master/master-ui";
import { CurrencyNumberInput } from "@/components/forms/currency-number-input";
import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { resolveProjectCategory } from "@/lib/project-category";
import {
  cleanSearch,
  formatNumber,
  formatRupiah,
  param,
  type SearchParams,
} from "@/lib/master/page-utils";
import {
  deleteWorkItem,
  saveWorkItem,
  saveWorkItemFlowInline,
  saveWorkItemPayrollProfile,
  setWorkItemStatus,
} from "./actions";
import {
  MasterItemCardActions,
  MasterItemCreateForm,
  MasterItemFilter,
  MasterItemProductGrid,
} from "./master-item-client";

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

function flowBadge(row: WorkItemRow) {
  if (row.flow_mode === "BERANTAI") return `BERANTAI · Alur ${row.flow_order ?? "?"}`;
  if (row.flow_mode === "KHUSUS") return "KHUSUS · Routing manual";
  return "MANDIRI";
}

export default async function MasterItemPage({ searchParams }: Props) {
  const access = await requirePermission("master_item.view");
  const canWrite = access.permissionCodes.includes("master_item.write");
  const params = await searchParams;
  const q = cleanSearch(param(params, "q"));
  const cookieStore = await cookies();
  const workspaceCookie = cookieStore.get("smpt_workspace")?.value?.toUpperCase();
  const rawCategory = param(params, "category");
  const categoryParam = rawCategory
    ? (rawCategory.toUpperCase() === "ALL" ? "" : rawCategory.toUpperCase())
    : (workspaceCookie === "HAJI" ? "HAJI" : workspaceCookie === "REGULER" ? "REGULER" : "");
  let selectedProject = Number(param(params, "project")) || 0;
  const selectedProduct = Number(param(params, "product")) || 0;

  const supabase = await createClient();

  // Load reference projects and products
  const [projectResult, productResult] = await Promise.all([
    supabase.rpc("master_reference_projects"),
    supabase.rpc("master_reference_products", { p_project_id: null, p_include_inactive: true }),
  ]);
  if (projectResult.error) throw new Error(`Referensi proyek gagal dimuat: ${projectResult.error.message}`);
  if (productResult.error) throw new Error(`Referensi Produk gagal dimuat: ${productResult.error.message}`);

  const rawProjects = (projectResult.data ?? []) as ProjectRef[];
  const projects = categoryParam
    ? rawProjects.filter((p) => resolveProjectCategory(p) === categoryParam)
    : rawProjects;
  const products = (productResult.data ?? []) as ProductRef[];
  const projectMap = new Map(projects.map((item) => [item.id, item]));
  const productMap = new Map(products.map((item) => [item.id, item]));

  const currentProduct = selectedProduct ? productMap.get(selectedProduct) : undefined;
  if (currentProduct && !selectedProject) {
    selectedProject = currentProduct.project_id;
  }
  if (selectedProject && !projectMap.has(selectedProject)) {
    selectedProject = projects[0]?.id || 0;
  } else if (!selectedProject && projects.length > 0) {
    selectedProject = projects[0]?.id || 0;
  }
  const currentProject = selectedProject ? projectMap.get(selectedProject) : undefined;

  // Products belonging to the selected project
  const projectProducts = selectedProject
    ? products.filter((p) => p.project_id === selectedProject && p.status === "AKTIF")
    : [];

  // Query work items for the project to calculate Global Project Modal
  let projectWorkItems: WorkItemRow[] = [];
  if (selectedProject) {
    let projectItemsQuery = supabase
      .from("work_items")
      .select("id, item_code, project_id, product_id, name, unit, qty_per_product, operator_price, proposed_price, status, output_final, flow_mode, flow_order, routing_validation_mode, executor_scope, submission_category")
      .eq("project_id", selectedProject);

    const { data: pItems, error: pError } = await projectItemsQuery;
    if (pError) throw new Error(`Data item proyek gagal dimuat: ${pError.message}`);
    projectWorkItems = (pItems ?? []) as WorkItemRow[];
  }

  // Calculate Product Recap (Modal per produk dalam proyek)
  const productRecap = projectProducts.map((prod) => {
    const prodItems = projectWorkItems.filter(
      (item) => item.product_id === prod.id && item.status === "AKTIF"
    );
    const operatorPerPcs = prodItems.reduce(
      (acc, it) => acc + Number(it.qty_per_product || 1) * Number(it.operator_price || 0),
      0
    );
    const proposedPerPcs = prodItems.reduce(
      (acc, it) => acc + Number(it.qty_per_product || 1) * Number(it.proposed_price || 0),
      0
    );
    const target = Number(prod.target_production || 0);
    const totalOperator = target * operatorPerPcs;
    const totalProposed = target * proposedPerPcs;
    const marginPerPcs = proposedPerPcs - operatorPerPcs;
    const totalMargin = totalProposed - totalOperator;

    return {
      product: prod,
      itemCount: prodItems.length,
      operatorPerPcs,
      proposedPerPcs,
      marginPerPcs,
      totalOperator,
      totalProposed,
      totalMargin,
    };
  });

  // Grand Total Se-Proyek (Modal Global Proyek)
  const grandProjectOperator = productRecap.reduce((acc, p) => acc + p.totalOperator, 0);
  const grandProjectProposed = productRecap.reduce((acc, p) => acc + p.totalProposed, 0);
  const grandProjectMargin = grandProjectProposed - grandProjectOperator;
  const grandProjectTarget = productRecap.reduce((acc, p) => acc + Number(p.product.target_production || 0), 0);

  // If a single product is selected, filter its items
  const productItems = selectedProduct
    ? projectWorkItems
        .filter((w) => w.product_id === selectedProduct)
        .filter((w) => (q ? w.name.toLowerCase().includes(q.toLowerCase()) || w.item_code.toLowerCase().includes(q.toLowerCase()) : true))
        .sort((a, b) => (a.flow_order ?? 9999) - (b.flow_order ?? 9999) || a.name.localeCompare(b.name))
    : [];

  const activeItems = productItems.filter((x) => x.status === "AKTIF");
  const totalOperatorPrice = activeItems.reduce(
    (sum, item) => sum + Number(item.qty_per_product || 1) * Number(item.operator_price || 0),
    0
  );
  const totalProposedPrice = activeItems.reduce(
    (sum, item) => sum + Number(item.qty_per_product || 1) * Number(item.proposed_price || 0),
    0
  );
  const totalMargin = totalProposedPrice - totalOperatorPrice;
  const marginPercent = totalProposedPrice > 0 ? ((totalMargin / totalProposedPrice) * 100).toFixed(1) : "0";
  const targetProduction = Number(currentProduct?.target_production || 0);
  const totalBoronganProduct = targetProduction * totalProposedPrice;
  const totalOperatorProduct = targetProduction * totalOperatorPrice;

  const routingHref =
    selectedProject && selectedProduct
      ? `/dashboard/masterItem/routing?project=${selectedProject}&product=${selectedProduct}`
      : "/dashboard/masterItem/routing";

  const kebutuhanHref =
    selectedProject && selectedProduct
      ? `/dashboard/masterKebutuhan?project=${selectedProject}&product=${selectedProduct}`
      : "/dashboard/masterKebutuhan";

  const pageEyebrow =
    categoryParam === "HAJI"
      ? "Master Data Haji"
      : categoryParam === "REGULER"
      ? "Master Data Reguler"
      : "Master Data";

  const pageTitle =
    categoryParam === "HAJI"
      ? "Item & Tarif Pekerjaan (Proyek Haji)"
      : categoryParam === "REGULER"
      ? "Item & Tarif Pekerjaan (Proyek Reguler)"
      : "Master Item Pekerjaan & Modal Upah";

  return (
    <MasterPageShell
      eyebrow={pageEyebrow}
      title={pageTitle}
      description="Kalkulasi modal upah operator dan harga pengajuan borongan baik secara global per Project maupun rincian per Produk."
    >
      <Notice success={param(params, "success")} error={param(params, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      {/* Filter Selector Proyek & Produk */}
      <MasterItemFilter
        projects={projects}
        products={products}
        initialProjectId={selectedProject}
        initialProductId={selectedProduct}
        initialQ={q}
        initialCategory={categoryParam}
      />

      {/* SCENARIO 1: SPECIFIC PRODUCT SELECTED -> TAMPILKAN RINCIAN MODAL PRODUK & DAFTAR ITEM */}
      {selectedProduct && currentProduct ? (
        <div className="space-y-6">
          {/* Active Product Banner & Quick Links */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-blue-200 bg-gradient-to-r from-blue-50/80 to-indigo-50/50 p-4 sm:p-5 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white shadow-xs">
                🎒
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-extrabold text-slate-900">{currentProduct.name}</h2>
                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md border border-blue-200">
                    {currentProduct.product_code}
                  </span>
                  <StatusBadge status={currentProduct.status} />
                </div>
                <p className="mt-0.5 text-xs text-slate-600 font-medium">
                  Proyek: <b className="text-slate-800">{currentProject?.name ?? "Umum"}</b> ({currentProject?.project_code ?? "-"}) · Target Produksi: <b className="text-slate-800">{formatNumber(targetProduction)} {currentProduct.unit}</b>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/dashboard/masterItem?project=${selectedProject}`}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
              >
                📊 Lihat Modal Global Proyek
              </Link>
              <Link href={routingHref} className={secondaryButtonClass}>
                🔄 Alur Routing
              </Link>
              <Link href={kebutuhanHref} className={secondaryButtonClass}>
                📦 Kebutuhan Bahan (BOM)
              </Link>
            </div>
          </div>

          {/* 4 SUMMARY KPI CARDS: MODAL & UPAH PRODUK TERPILIH */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border-2 border-emerald-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Harga Operator / Pcs</p>
                <span className="text-lg">🪡</span>
              </div>
              <div className="mt-2 text-2xl font-black text-emerald-900">{formatRupiah(totalOperatorPrice)}</div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Total harga operator jahit per 1 pcs {currentProduct.name} ({activeItems.length} tahapan).
              </p>
            </div>

            <div className="rounded-2xl border-2 border-blue-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Harga Pengajuan / Pcs</p>
                <span className="text-lg">📋</span>
              </div>
              <div className="mt-2 text-2xl font-black text-blue-900">{formatRupiah(totalProposedPrice)}</div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Total tarif borongan yang diajukan ke pemilik proyek per pcs.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Harga Operator</p>
                <span className="text-lg">💵</span>
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900">{formatRupiah(totalOperatorProduct)}</div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Untuk seluruh target {formatNumber(targetProduction)} pcs (Selisih: {formatRupiah(totalProposedPrice - totalOperatorPrice)}/pcs).
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Harga Pengajuan</p>
                <span className="text-lg">💰</span>
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900">{formatRupiah(totalBoronganProduct)}</div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Nilai borongan total untuk target {formatNumber(targetProduction)} pcs.
              </p>
            </div>
          </div>

          {/* Form Tambah Item Pekerjaan: Pre-locked to product */}
          {canWrite ? (
            <MasterItemCreateForm
              key={`create-form-${selectedProject}-${selectedProduct}`}
              projects={projects}
              products={products}
              defaultProjectId={selectedProject}
              defaultProductId={selectedProduct}
              currentQ={q}
            />
          ) : null}

          {/* Daftar Item Pekerjaan Produk Ini */}
          <SectionCard
            title={`Rincian Tarif Pekerjaan: ${currentProduct.name} (${productItems.length} Tahapan Borongan)`}
            description={`Daftar ${productItems.length} tahapan pekerjaan untuk ${currentProduct.name}. Total modal tukang: ${formatRupiah(totalOperatorPrice)}/pcs · Nilai pengajuan borongan: ${formatRupiah(totalProposedPrice)}/pcs.`}
          >
            {productItems.length === 0 ? (
              <EmptyState text="Belum ada item pekerjaan untuk produk ini. Silakan tambahkan menggunakan form di atas." />
            ) : (
              <div className="space-y-3">
                {productItems.map((row, idx) => {
                  const subOp = Number(row.qty_per_product || 1) * Number(row.operator_price || 0);
                  const subProp = Number(row.qty_per_product || 1) * Number(row.proposed_price || 0);
                  const itemRoutingHref = `/dashboard/masterItem/routing?project=${row.project_id}&product=${row.product_id}`;

                  return (
                    <details
                      key={row.id}
                      className="group rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs hover:border-slate-300 transition"
                    >
                      <summary className="cursor-pointer list-none">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                                {idx + 1}
                              </span>
                              <span className="font-bold text-slate-900 text-sm">{row.name}</span>
                              <StatusBadge status={row.status} />
                              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700">
                                {flowBadge(row)}
                              </span>
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                                {row.executor_scope.replaceAll("_", " ")}
                              </span>
                              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-700">
                                Pengajuan {row.submission_category.replaceAll("_", " ")}
                              </span>
                              {row.output_final ? (
                                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                                  OUTPUT FINAL
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-slate-500 font-medium">
                              Kode: <span className="font-mono font-semibold text-slate-700">{row.item_code}</span> · Satuan: {row.unit}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs border-t border-slate-100 pt-2 lg:border-t-0 lg:pt-0 shrink-0">
                            <div className="rounded-lg bg-slate-50 border border-slate-200/80 px-2.5 py-1 text-center">
                              <p className="text-[10px] uppercase font-bold text-slate-400">Rasio</p>
                              <p className="font-extrabold text-slate-800 text-xs">{formatNumber(row.qty_per_product)} {row.unit}</p>
                            </div>
                            <div className="rounded-lg bg-emerald-50/70 border border-emerald-200/80 px-2.5 py-1 text-right">
                              <p className="text-[10px] uppercase font-bold text-emerald-600">Harga Operator</p>
                              <p className="font-extrabold text-emerald-700 text-xs">{formatRupiah(row.operator_price)}</p>
                              {row.qty_per_product > 1 ? (
                                <p className="text-[9px] text-emerald-600 font-medium">Sub: {formatRupiah(subOp)}</p>
                              ) : null}
                            </div>
                            <div className="rounded-lg bg-blue-50/70 border border-blue-200/80 px-2.5 py-1 text-right">
                              <p className="text-[10px] uppercase font-bold text-blue-600">Harga Pengajuan</p>
                              <p className="font-extrabold text-blue-700 text-xs">{formatRupiah(row.proposed_price)}</p>
                              {row.qty_per_product > 1 ? (
                                <p className="text-[9px] text-blue-600 font-medium">Sub: {formatRupiah(subProp)}</p>
                              ) : null}
                            </div>
                            <MasterItemCardActions
                              itemId={row.id}
                              itemName={row.name}
                              canWrite={canWrite}
                              selectedProject={selectedProject}
                              selectedProduct={selectedProduct}
                              q={q}
                            />
                          </div>
                        </div>
                      </summary>

                      {/* Detail / Inline Edits */}
                      {canWrite && row.product_id ? (
                        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                          {/* 1. EDIT INFORMASI & TARIF ITEM PEKERJAAN */}
                          <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4">
                            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <h3 className="font-bold text-slate-900 text-sm">✏️ Edit Informasi & Tarif Pekerjaan</h3>
                                <p className="text-xs text-slate-500">
                                  Ubah nama pekerjaan, satuan, rasio per produk, tarif tukang, atau harga pengajuan.
                                </p>
                              </div>
                              <span className="font-mono text-xs font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md border border-blue-200 w-fit">
                                ID: {row.item_code}
                              </span>
                            </div>
                            <form action={saveWorkItem} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="work_item_id" value={row.id} />
                              <input type="hidden" name="project_id" value={selectedProject} />
                              <input type="hidden" name="product_id" value={selectedProduct} />
                              <input type="hidden" name="return_project" value={selectedProject} />
                              <input type="hidden" name="return_product" value={selectedProduct} />
                              <input type="hidden" name="return_q" value={q} />

                              <div className="xl:col-span-2">
                                <Field label="Nama Pekerjaan">
                                  <input name="name" required defaultValue={row.name} className={inputClass} />
                                </Field>
                              </div>

                              <Field label="Satuan">
                                <input name="unit" required defaultValue={row.unit} className={inputClass} placeholder="PCS / LUSIN / LEMBAR" />
                              </Field>

                              <Field label="Qty / Produk" hint="Berapa kali pengerjaan per 1 pcs produk">
                                <CurrencyNumberInput
                                  name="qty_per_product"
                                  min={1}
                                  required
                                  defaultValue={row.qty_per_product}
                                  className={inputClass}
                                />
                              </Field>

                              <Field label="Harga Operator (Rp)" hint="Upah tukang / biaya modal">
                                <CurrencyNumberInput
                                  name="operator_price"
                                  min={0}
                                  required
                                  defaultValue={row.operator_price}
                                  className={`${inputClass} font-bold text-slate-900`}
                                />
                              </Field>

                              <Field label="Harga Pengajuan (Rp)" hint="Harga borongan diajukan">
                                <CurrencyNumberInput
                                  name="proposed_price"
                                  min={0}
                                  required
                                  defaultValue={row.proposed_price}
                                  className={`${inputClass} font-bold text-blue-900`}
                                />
                              </Field>

                              <Field label="Status Item">
                                <select name="status" defaultValue={row.status} className={selectClass}>
                                  <option value="AKTIF">AKTIF</option>
                                  <option value="NONAKTIF">NONAKTIF</option>
                                </select>
                              </Field>

                              <div className="xl:col-span-4 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-blue-100">
                                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    name="output_final"
                                    value="1"
                                    defaultChecked={row.output_final}
                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span>Tandai sebagai Output Final Produk (Hasil akhir yang dihitung checker/QC)</span>
                                </label>

                                <button type="submit" className={primaryButtonClass}>
                                  💾 Simpan Perubahan Item
                                </button>
                              </div>
                            </form>
                          </div>

                          {row.status === "AKTIF" ? (
                            <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <h3 className="font-bold text-slate-900 text-sm">Alur Kerja</h3>
                                  <p className="text-xs text-slate-500">
                                    Atur urutan alur berantai di sini.
                                  </p>
                                </div>
                                {row.flow_mode === "KHUSUS" ? (
                                  <Link href={itemRoutingHref} className={secondaryButtonClass}>
                                    Atur Routing Khusus
                                  </Link>
                                ) : null}
                              </div>
                              <form action={saveWorkItemFlowInline} className="grid gap-3 md:grid-cols-4">
                                <input type="hidden" name="work_item_id" value={row.id} />
                                <input type="hidden" name="return_project" value={selectedProject} />
                                <input type="hidden" name="return_product" value={selectedProduct} />
                                <input type="hidden" name="return_q" value={q} />
                                <Field label="Tipe Alur">
                                  <select name="flow_mode" defaultValue={row.flow_mode} className={selectClass}>
                                    <option value="MANDIRI">MANDIRI</option>
                                    <option value="BERANTAI">BERANTAI</option>
                                    <option value="KHUSUS">KHUSUS</option>
                                  </select>
                                </Field>
                                <Field label="Nomor Alur">
                                  <input
                                    name="flow_order"
                                    type="number"
                                    min="1"
                                    step="1"
                                    defaultValue={row.flow_order ?? ""}
                                    placeholder="Isi jika BERANTAI"
                                    className={inputClass}
                                  />
                                </Field>
                                <Field label="Validasi">
                                  <select name="validation_mode" defaultValue={row.routing_validation_mode} className={selectClass}>
                                    <option value="WARNING">WARNING</option>
                                    <option value="HARD">HARD</option>
                                  </select>
                                </Field>
                                <div className="flex items-end">
                                  <button type="submit" className={primaryButtonClass}>
                                    Simpan Alur
                                  </button>
                                </div>
                              </form>
                            </div>
                          ) : null}

                          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
                            <h3 className="mb-3 font-bold text-slate-900 text-sm">Pelaksana & Pengajuan</h3>
                            <form action={saveWorkItemPayrollProfile} className="grid gap-3 md:grid-cols-3">
                              <input type="hidden" name="work_item_id" value={row.id} />
                              <input type="hidden" name="return_project" value={selectedProject} />
                              <input type="hidden" name="return_product" value={selectedProduct} />
                              <input type="hidden" name="return_q" value={q} />
                              <Field label="Pelaksana">
                                <select name="executor_scope" defaultValue={row.executor_scope} className={selectClass}>
                                  <option value="OPERATOR_BORONGAN">OPERATOR BORONGAN</option>
                                  <option value="PEKERJA_HARIAN">PEKERJA HARIAN</option>
                                  <option value="KEDUANYA">KEDUANYA</option>
                                </select>
                              </Field>
                              <Field label="Kategori Pengajuan">
                                <select name="submission_category" defaultValue={row.submission_category} className={selectClass}>
                                  <option value="BORONGAN">BORONGAN</option>
                                  <option value="TIDAK_ADA">TIDAK ADA</option>
                                </select>
                              </Field>
                              <div className="flex items-end">
                                <button type="submit" className={primaryButtonClass}>
                                  Simpan Profil
                                </button>
                              </div>
                            </form>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                            <form action={setWorkItemStatus}>
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="work_item_id" value={row.id} />
                              <input type="hidden" name="status" value={row.status === "AKTIF" ? "NONAKTIF" : "AKTIF"} />
                              <input type="hidden" name="return_project" value={selectedProject} />
                              <input type="hidden" name="return_product" value={selectedProduct} />
                              <button
                                type="submit"
                                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                              >
                                {row.status === "AKTIF" ? "Nonaktifkan Item" : "Aktifkan Item"}
                              </button>
                            </form>

                            <form action={deleteWorkItem}>
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="work_item_id" value={row.id} />
                              <input type="hidden" name="return_project" value={selectedProject} />
                              <input type="hidden" name="return_product" value={selectedProduct} />
                              <button
                                type="submit"
                                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                              >
                                🗑️ Hapus Item
                              </button>
                            </form>
                          </div>
                        </div>
                      ) : null}
                    </details>
                  );
                })}

                {/* Grand Total Footer Summary Per Produk */}
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
                    <span className="font-bold text-slate-900">Total Upah Produk ({activeItems.length} Item Aktif):</span>
                    <div className="flex flex-wrap items-center gap-6">
                      <div>
                        <span className="text-xs text-slate-500 block">Total Operator:</span>
                        <b className="font-bold text-emerald-800 text-base">{formatRupiah(totalOperatorPrice)}</b>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block">Total Pengajuan:</span>
                        <b className="font-bold text-blue-800 text-base">{formatRupiah(totalProposedPrice)}</b>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block">Total Margin:</span>
                        <b className="font-bold text-slate-800 text-base">{formatRupiah(totalMargin)}</b>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Collapsible / Comparison Section for Project-wide Totals */}
          <SectionCard
            title={`Ringkasan Modal Global Proyek: ${currentProject?.name} (${projectProducts.length} Produk)`}
            description="Perbandingan total modal upah operator dan nilai pengajuan antar produk dalam proyek ini."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 font-bold">Produk</th>
                    <th className="py-2.5 font-bold">Target</th>
                    <th className="py-2.5 font-bold">Operator / Pcs</th>
                    <th className="py-2.5 font-bold">Total Modal Operator</th>
                    <th className="py-2.5 font-bold">Pengajuan / Pcs</th>
                    <th className="py-2.5 font-bold">Total Pengajuan</th>
                    <th className="py-2.5 font-bold">Total Margin</th>
                    <th className="py-2.5 font-bold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productRecap.map((pr) => (
                    <tr key={pr.product.id} className={pr.product.id === selectedProduct ? "bg-blue-50/50 font-semibold" : ""}>
                      <td className="py-2.5">
                        <span className="font-mono text-blue-600 mr-1.5">{pr.product.product_code}</span>
                        {pr.product.name}
                        {pr.product.id === selectedProduct ? <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">Aktif</span> : null}
                      </td>
                      <td className="py-2.5">{formatNumber(pr.product.target_production)} {pr.product.unit}</td>
                      <td className="py-2.5 font-bold text-emerald-800">{formatRupiah(pr.operatorPerPcs)}</td>
                      <td className="py-2.5 font-bold text-emerald-950">{formatRupiah(pr.totalOperator)}</td>
                      <td className="py-2.5 font-bold text-blue-800">{formatRupiah(pr.proposedPerPcs)}</td>
                      <td className="py-2.5 font-bold text-blue-950">{formatRupiah(pr.totalProposed)}</td>
                      <td className="py-2.5 text-slate-700">{formatRupiah(pr.totalMargin)}</td>
                      <td className="py-2.5">
                        <Link
                          href={`/dashboard/masterItem?project=${selectedProject}&product=${pr.product.id}`}
                          className="text-blue-600 hover:underline font-semibold"
                        >
                          Buka Item →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-bold text-slate-900 bg-slate-50">
                    <td className="py-3">TOTAL GLOBAL PROYEK</td>
                    <td className="py-3">{formatNumber(grandProjectTarget)} pcs</td>
                    <td className="py-3">-</td>
                    <td className="py-3 text-emerald-900">{formatRupiah(grandProjectOperator)}</td>
                    <td className="py-3">-</td>
                    <td className="py-3 text-blue-900">{formatRupiah(grandProjectProposed)}</td>
                    <td className="py-3 text-slate-900">{formatRupiah(grandProjectMargin)}</td>
                    <td className="py-3">-</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </SectionCard>
        </div>
      ) : selectedProject && currentProject ? (
        /* SCENARIO 2: PROJECT SELECTED, BUT ALL PRODUCTS -> TAMPILKAN MODAL GLOBAL PROYEK */
        <div className="space-y-6">
          {/* Active Project Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-blue-200 bg-gradient-to-r from-blue-50/80 to-indigo-50/50 p-4 sm:p-5 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white shadow-xs">
                🏢
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-extrabold text-slate-900">{currentProject.name}</h2>
                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md border border-blue-200">
                    {currentProject.project_code}
                  </span>
                  <StatusBadge status={currentProject.status} />
                </div>
                <p className="mt-0.5 text-xs text-slate-600 font-medium">
                  Modal Global Se-Proyek · Total <b className="text-slate-800">{projectProducts.length} Produk Aktif</b> · Target Keseluruhan: <b className="text-slate-800">{formatNumber(grandProjectTarget)} Pcs</b>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/dashboard/masterKebutuhan?project=${selectedProject}`} className={secondaryButtonClass}>
                📦 Kebutuhan Bahan Proyek (BOM)
              </Link>
            </div>
          </div>

          {/* 4 GLOBAL PROJECT KPI CARDS */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border-2 border-emerald-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Total Modal Operator Proyek</p>
                <span className="text-lg">🪡</span>
              </div>
              <div className="mt-2 text-2xl font-black text-emerald-900">{formatRupiah(grandProjectOperator)}</div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Total modal upah yang harus disiapkan untuk seluruh operator jahit di proyek ini.
              </p>
            </div>

            <div className="rounded-2xl border-2 border-blue-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Total Pengajuan Borongan Proyek</p>
                <span className="text-lg">📋</span>
              </div>
              <div className="mt-2 text-2xl font-black text-blue-900">{formatRupiah(grandProjectProposed)}</div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Total omzet nilai borongan yang diajukan ke pemilik proyek ({projectProducts.length} produk).
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Estimasi Margin Upah Proyek</p>
                <span className="text-lg">📈</span>
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900">{formatRupiah(grandProjectMargin)}</div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Selisih nilai borongan terhadap modal operator se-proyek.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Target Produksi</p>
                <span className="text-lg">📦</span>
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900">{formatNumber(grandProjectTarget)} pcs</div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Akumulasi target dari {projectProducts.length} produk aktif di proyek ini.
              </p>
            </div>
          </div>

          {/* TABLE REKAPITULASI MODAL SEMUA PRODUK DALAM PROYEK */}
          <SectionCard
            title={`Rekapitulasi Modal per Produk · Proyek ${currentProject.name}`}
            description="Tabel perbandingan modal upah operator dan harga pengajuan borongan per produk. Klik salah satu produk untuk mengelola rincian item."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-xs font-bold uppercase text-slate-600 bg-slate-50/70">
                    <th className="py-3 px-3">No</th>
                    <th className="py-3 px-3">Produk</th>
                    <th className="py-3 px-3">Target</th>
                    <th className="py-3 px-3">Item Aktif</th>
                    <th className="py-3 px-3">Operator / Pcs</th>
                    <th className="py-3 px-3">Total Modal Operator</th>
                    <th className="py-3 px-3">Pengajuan / Pcs</th>
                    <th className="py-3 px-3">Total Nilai Pengajuan</th>
                    <th className="py-3 px-3">Total Margin</th>
                    <th className="py-3 px-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {productRecap.map((pr, idx) => (
                    <tr key={pr.product.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-3 text-slate-400 font-semibold">{idx + 1}</td>
                      <td className="py-3 px-3">
                        <span className="font-mono text-blue-600 font-bold block">{pr.product.product_code}</span>
                        <span className="font-bold text-slate-900 text-sm">{pr.product.name}</span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800">
                        {formatNumber(pr.product.target_production)} {pr.product.unit}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        <span className="inline-block bg-slate-100 px-2 py-0.5 rounded text-[11px] font-semibold">
                          {pr.itemCount} item
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-emerald-800">{formatRupiah(pr.operatorPerPcs)}</td>
                      <td className="py-3 px-3 font-black text-emerald-900">{formatRupiah(pr.totalOperator)}</td>
                      <td className="py-3 px-3 font-bold text-blue-800">{formatRupiah(pr.proposedPerPcs)}</td>
                      <td className="py-3 px-3 font-black text-blue-900">{formatRupiah(pr.totalProposed)}</td>
                      <td className="py-3 px-3 font-bold text-slate-700">{formatRupiah(pr.totalMargin)}</td>
                      <td className="py-3 px-3 text-center">
                        <Link
                          href={`/dashboard/masterItem?project=${selectedProject}&product=${pr.product.id}`}
                          className="inline-flex items-center rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition"
                        >
                          Buka Item →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-black text-slate-900 bg-slate-100/80 text-xs">
                    <td colSpan={2} className="py-3.5 px-3 uppercase tracking-wider">
                      TOTAL GLOBAL PROYEK ({projectProducts.length} Produk)
                    </td>
                    <td className="py-3.5 px-3">{formatNumber(grandProjectTarget)} pcs</td>
                    <td className="py-3.5 px-3">-</td>
                    <td className="py-3.5 px-3">-</td>
                    <td className="py-3.5 px-3 text-emerald-900 text-sm">{formatRupiah(grandProjectOperator)}</td>
                    <td className="py-3.5 px-3">-</td>
                    <td className="py-3.5 px-3 text-blue-900 text-sm">{formatRupiah(grandProjectProposed)}</td>
                    <td className="py-3.5 px-3 text-slate-900 text-sm">{formatRupiah(grandProjectMargin)}</td>
                    <td className="py-3.5 px-3">-</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </SectionCard>
        </div>
      ) : (
        /* SCENARIO 3: NO PROJECT SELECTED -> TAMPILKAN GRID PRODUK & PROYEK */
        <MasterItemProductGrid
          projects={projects}
          products={products.filter((p) => p.status === "AKTIF")}
        />
      )}
    </MasterPageShell>
  );
}
