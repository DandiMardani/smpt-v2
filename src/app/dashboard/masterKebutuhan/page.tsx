import Link from "next/link";
import { cookies } from "next/headers";
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
import { resolveProjectCategory } from "@/lib/project-category";
import {
  cleanSearch,
  formatNumber,
  formatRupiah,
  param,
  type SearchParams,
} from "@/lib/master/page-utils";
import { deleteBomRequirement, saveBomRequirement } from "./actions";
import {
  MasterKebutuhanCreateForm,
  MasterKebutuhanFilter,
  MasterKebutuhanProductGrid,
} from "./master-kebutuhan-client";

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
type WorkItemMini = {
  id: number;
  project_id?: number;
  product_id?: number;
  name: string;
  qty_per_product: number;
  operator_price: number;
  proposed_price: number;
  status: string;
};

type Props = { searchParams: Promise<SearchParams> };

export default async function MasterKebutuhanPage({ searchParams }: Props) {
  const access = await requirePermission("master_kebutuhan.view");
  const canWrite = access.permissionCodes.includes("master_kebutuhan.write");
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

  // Load references
  const [projectResult, productResult, materialResult] = await Promise.all([
    supabase.rpc("master_reference_projects"),
    supabase.rpc("master_reference_products", { p_project_id: null, p_include_inactive: true }),
    supabase.rpc("master_reference_materials_v2", { p_include_inactive: true }),
  ]);

  if (projectResult.error) throw new Error(`Referensi proyek gagal dimuat: ${projectResult.error.message}`);
  if (productResult.error) throw new Error(`Referensi Produk gagal dimuat: ${productResult.error.message}`);
  if (materialResult.error) throw new Error(`Referensi bahan gagal dimuat: ${materialResult.error.message}`);

  const rawProjects = (projectResult.data ?? []) as ProjectRef[];
  const projects = categoryParam
    ? rawProjects.filter((p) => resolveProjectCategory(p) === categoryParam)
    : rawProjects;
  const products = (productResult.data ?? []) as ProductRef[];
  const materials = (materialResult.data ?? []) as MaterialRef[];
  const projectMap = new Map(projects.map((item) => [item.id, item]));
  const productMap = new Map(products.map((item) => [item.id, item]));
  const materialMap = new Map(materials.map((item) => [item.id, item]));

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

  let projectBoms: BomRow[] = [];
  let projectWorkItems: WorkItemMini[] = [];

  if (selectedProject) {
    const [bomRes, itemRes] = await Promise.all([
      supabase
        .from("bom_requirements")
        .select("id, requirement_code, project_id, product_id, material_id, component_type, component_name, unit, qty_per_unit, unit_price, status, legacy_total_requirement, legacy_project_level, fulfillment_source, calculation_method, net_usage_per_product, allowance_percent, waste_percent, final_requirement")
        .eq("project_id", selectedProject),
      supabase
        .from("work_items")
        .select("id, project_id, product_id, name, qty_per_product, operator_price, proposed_price, status")
        .eq("project_id", selectedProject)
        .eq("status", "AKTIF"),
    ]);

    if (bomRes.error) throw new Error(`Master Kebutuhan proyek gagal dimuat: ${bomRes.error.message}`);
    if (itemRes.error) throw new Error(`Item pekerjaan proyek gagal dimuat: ${itemRes.error.message}`);
    projectBoms = (bomRes.data ?? []) as BomRow[];
    projectWorkItems = (itemRes.data ?? []) as WorkItemMini[];
  }

  // Calculate Product Recap (Modal Bahan, Ongkos Tukang, dan HPP per produk dalam proyek)
  const productBomRecap = projectProducts.map((prod) => {
    const prodBoms = projectBoms.filter(
      (b) => b.product_id === prod.id && b.status === "AKTIF"
    );
    const prodItems = projectWorkItems.filter(
      (it) => it.product_id === prod.id && it.status === "AKTIF"
    );

    const materialCostPerPcs = prodBoms.reduce(
      (acc, b) => acc + Number(b.qty_per_unit || 0) * Number(b.unit_price || 0),
      0
    );
    const operatorWagePerPcs = prodItems.reduce(
      (acc, it) => acc + Number(it.qty_per_product || 1) * Number(it.operator_price || 0),
      0
    );
    const proposedWagePerPcs = prodItems.reduce(
      (acc, it) => acc + Number(it.qty_per_product || 1) * Number(it.proposed_price || 0),
      0
    );

    const hppRiilPerPcs = materialCostPerPcs + operatorWagePerPcs;
    const hppBoronganPerPcs = materialCostPerPcs + proposedWagePerPcs;

    const target = Number(prod.target_production || 0);
    const totalMaterialCost = target * materialCostPerPcs;
    const totalOperatorWage = target * operatorWagePerPcs;
    const totalProposedWage = target * proposedWagePerPcs;
    const totalHppRiil = target * hppRiilPerPcs;
    const totalHppBorongan = target * hppBoronganPerPcs;

    return {
      product: prod,
      bomCount: prodBoms.length,
      itemCount: prodItems.length,
      materialCostPerPcs,
      operatorWagePerPcs,
      proposedWagePerPcs,
      hppRiilPerPcs,
      hppBoronganPerPcs,
      totalMaterialCost,
      totalOperatorWage,
      totalProposedWage,
      totalHppRiil,
      totalHppBorongan,
    };
  });

  // Grand Totals se-Proyek (Modal Global Proyek)
  const grandProjectMaterialCost = productBomRecap.reduce((acc, p) => acc + p.totalMaterialCost, 0);
  const grandProjectOperatorWage = productBomRecap.reduce((acc, p) => acc + p.totalOperatorWage, 0);
  const grandProjectProposedWage = productBomRecap.reduce((acc, p) => acc + p.totalProposedWage, 0);
  const grandProjectHppRiil = grandProjectMaterialCost + grandProjectOperatorWage;
  const grandProjectHppBorongan = grandProjectMaterialCost + grandProjectProposedWage;
  const grandProjectTarget = productBomRecap.reduce((acc, p) => acc + Number(p.product.target_production || 0), 0);

  // If a single product is selected:
  const productBoms = selectedProduct
    ? projectBoms
        .filter((b) => b.product_id === selectedProduct)
        .filter((b) => (q ? b.requirement_code.toLowerCase().includes(q.toLowerCase()) || b.component_name.toLowerCase().includes(q.toLowerCase()) : true))
        .sort((a, b) => a.component_type.localeCompare(b.component_type) || a.component_name.localeCompare(b.component_name))
    : [];

  const productWorkItems = selectedProduct
    ? projectWorkItems.filter((w) => w.product_id === selectedProduct)
    : [];

  const activeBomRows = productBoms.filter((x) => x.status === "AKTIF");
  const totalBiayaBahan = activeBomRows.reduce(
    (sum, item) => sum + Number(item.qty_per_unit || 0) * Number(item.unit_price || 0),
    0
  );
  const totalOngkosOperator = productWorkItems.reduce(
    (sum, item) => sum + Number(item.qty_per_product || 1) * Number(item.operator_price || 0),
    0
  );
  const totalOngkosPengajuan = productWorkItems.reduce(
    (sum, item) => sum + Number(item.qty_per_product || 1) * Number(item.proposed_price || 0),
    0
  );

  const totalHppRiil = totalBiayaBahan + totalOngkosOperator;
  const totalHPPProposed = totalBiayaBahan + totalOngkosPengajuan;
  const targetProduction = Number(currentProduct?.target_production || 0);
  const totalBudgetBahan = targetProduction * totalBiayaBahan;
  const totalBudgetOperator = targetProduction * totalOngkosOperator;
  const totalBudgetBorongan = targetProduction * totalOngkosPengajuan;
  const totalBudgetHppRiil = targetProduction * totalHppRiil;
  const totalBudgetHPPProposed = targetProduction * totalHPPProposed;

  const itemPekerjaanHref =
    selectedProject && selectedProduct
      ? `/dashboard/masterItem?project=${selectedProject}&product=${selectedProduct}${categoryParam ? `&category=${categoryParam}` : ""}`
      : selectedProject
      ? `/dashboard/masterItem?project=${selectedProject}${categoryParam ? `&category=${categoryParam}` : ""}`
      : `/dashboard/masterItem${categoryParam ? `?category=${categoryParam}` : ""}`;

  const routingHref =
    selectedProject && selectedProduct
      ? `/dashboard/masterItem/routing?project=${selectedProject}&product=${selectedProduct}${categoryParam ? `&category=${categoryParam}` : ""}`
      : `/dashboard/masterItem/routing${categoryParam ? `?category=${categoryParam}` : ""}`;

  const pageEyebrow =
    categoryParam === "HAJI"
      ? "Master Data Haji"
      : categoryParam === "REGULER"
      ? "Master Data Reguler"
      : "Master Data";

  const pageTitle =
    categoryParam === "HAJI"
      ? "Kebutuhan Bahan (BOM) & HPP - Proyek Haji"
      : categoryParam === "REGULER"
      ? "Kebutuhan Bahan (BOM) & HPP - Proyek Reguler"
      : "Master Kebutuhan Bahan (BOM) & HPP Produksi";

  return (
    <MasterPageShell
      eyebrow={pageEyebrow}
      title={pageTitle}
      description="Kalkulasi modal belanja bahan baku, ongkos tukang operator (dari Item Pekerjaan), serta Grand Total Modal HPP Produksi baik secara Global se-Proyek maupun rincian per Produk."
    >
      <Notice success={param(params, "success")} error={param(params, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      {/* Product & Project Filter */}
      <MasterKebutuhanFilter
        projects={projects}
        products={products}
        initialProjectId={selectedProject}
        initialProductId={selectedProduct}
        initialQ={q}
        initialCategory={categoryParam}
      />

      {/* SCENARIO 1: SPECIFIC PRODUCT SELECTED -> RINCIAN MODAL BAHAN, ONGKOS TUKANG, HPP PER PRODUK */}
      {selectedProduct && currentProduct ? (
        <div className="space-y-6">
          {/* Active Product Banner & Quick Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-teal-50/50 p-4 sm:p-5 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-xl font-bold text-white shadow-xs">
                📦
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-extrabold text-slate-900">{currentProduct.name}</h2>
                  <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-200">
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
                href={`/dashboard/masterKebutuhan?project=${selectedProject}${categoryParam ? `&category=${categoryParam}` : ""}`}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
              >
                📊 Lihat Modal Global Proyek
              </Link>
              <Link href={itemPekerjaanHref} className={secondaryButtonClass}>
                🪡 Kelola Item Pekerjaan ({productWorkItems.length})
              </Link>
              <Link href={routingHref} className={secondaryButtonClass}>
                🔄 Alur Routing
              </Link>
            </div>
          </div>

          {/* 4 SUMMARY KPI CARDS: HARGA PENGAJUAN, BIAYA BAHAN, TOTAL HPP PENGAJUAN, MODAL OPERATOR */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border-2 border-blue-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Biaya Produksi (Harga Pengajuan)</p>
                <span className="text-lg">🧵</span>
              </div>
              <div className="mt-2 text-2xl font-black text-blue-900">{formatRupiah(totalOngkosPengajuan)} <span className="text-xs font-medium text-slate-500">/ pcs</span></div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Total Biaya Produksi: <b className="text-blue-950">{formatRupiah(totalBudgetBorongan)}</b> ({productWorkItems.length} item pekerjaan).
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Biaya Bahan Baku & Jasa (BOM)</p>
                <span className="text-lg">📦</span>
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900">{formatRupiah(totalBiayaBahan)} <span className="text-xs font-medium text-slate-500">/ pcs</span></div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Total Belanja Bahan: <b className="text-slate-900">{formatRupiah(totalBudgetBahan)}</b> ({activeBomRows.length} komponen).
              </p>
            </div>

            <div className="rounded-2xl border-2 border-blue-500 bg-blue-50/40 p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Total HPP (Nilai Pengajuan)</p>
                <span className="text-lg">💎</span>
              </div>
              <div className="mt-2 text-2xl font-black text-blue-900">{formatRupiah(totalHPPProposed)} <span className="text-xs font-medium text-blue-700">/ pcs</span></div>
              <p className="mt-1 text-xs text-blue-900/80 font-medium leading-relaxed">
                Bahan ({formatRupiah(totalBiayaBahan)}) + Produksi ({formatRupiah(totalOngkosPengajuan)}). Total: <b className="text-blue-950 font-bold">{formatRupiah(totalBudgetHPPProposed)}</b>.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Modal Riil Operator (Pabrik)</p>
                <span className="text-lg">💵</span>
              </div>
              <div className="mt-2 text-2xl font-black text-slate-800">{formatRupiah(totalHppRiil)} <span className="text-xs font-medium text-slate-500">/ pcs</span></div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Upah Operator: {formatRupiah(totalOngkosOperator)}/pcs · Margin: <b className="text-emerald-700 font-bold">+{formatRupiah(totalHPPProposed - totalHppRiil)}/pcs</b>.
              </p>
            </div>
          </div>

          {/* Form Create BOM: Pre-locked to this selected product */}
          {canWrite ? (
            <MasterKebutuhanCreateForm
              projects={projects}
              products={products}
              materials={materials}
              defaultProjectId={selectedProject}
              defaultProductId={selectedProduct}
              currentQ={q}
            />
          ) : null}

          {/* BOM Requirements Table for This Product */}
          <SectionCard
            title={`Rincian Kebutuhan Bahan (${productBoms.length} komponen)`}
            description={`BOM aktif untuk produk ${currentProduct.name}. Total biaya bahan: ${formatRupiah(totalBiayaBahan)} · Ongkos tukang: ${formatRupiah(totalOngkosOperator)} · Modal HPP: ${formatRupiah(totalHppRiil)}.`}
          >
            {productBoms.length === 0 ? (
              <EmptyState text="Belum ada komponen kebutuhan bahan untuk produk ini. Silakan input bahan baru di atas." />
            ) : (
              <div className="space-y-3">
                {productBoms.map((row, idx) => {
                  const material = row.material_id ? materialMap.get(row.material_id) : undefined;
                  const subCost = Number(row.qty_per_unit || 0) * Number(row.unit_price || 0);

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
                              <b className="text-slate-900 text-sm">
                                {material ? `${material.material_code} · ${material.name}` : row.component_name}
                              </b>
                              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                                {row.component_type}
                              </span>
                              <StatusBadge status={row.status} />
                              {row.fulfillment_source ? (
                                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                  {row.fulfillment_source.replaceAll("_", " ")}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-slate-500 font-medium">
                              Kode BOM: <span className="font-mono font-semibold text-slate-700">{row.requirement_code}</span> · Metode: {row.calculation_method || "MANUAL"}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-xs lg:text-right border-t border-slate-100 pt-2 lg:border-t-0 lg:pt-0">
                            <div>
                              <p className="text-[11px] text-slate-400">Kebutuhan / Pcs</p>
                              <p className="font-semibold text-slate-800">
                                {formatNumber(row.qty_per_unit)} {row.unit}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] text-slate-400">Harga Satuan</p>
                              <p className="font-semibold text-slate-800">{formatRupiah(row.unit_price)}</p>
                            </div>
                            <div>
                              <p className="text-[11px] text-slate-400">Subtotal Bahan</p>
                              <p className="font-bold text-emerald-800 text-sm">{formatRupiah(subCost)}</p>
                            </div>
                            <div>
                              <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 group-open:bg-emerald-50 group-open:text-emerald-700 group-open:border-emerald-200 transition">
                                ✏️ Edit ▾
                              </span>
                            </div>
                          </div>
                        </div>
                      </summary>

                      {canWrite ? (
                        <div className="mt-4 border-t border-slate-100 pt-4">
                          <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-4">
                            <h4 className="font-bold text-slate-900 text-sm mb-3">✏️ Edit Komponen Kebutuhan Bahan</h4>
                            <form action={saveBomRequirement} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="project_id" value={selectedProject} />
                              <input type="hidden" name="product_id" value={selectedProduct} />
                              <input type="hidden" name="return_project" value={selectedProject} />
                              <input type="hidden" name="return_product" value={selectedProduct} />
                              <input type="hidden" name="component_type" value={row.component_type} />
                              {row.material_id ? <input type="hidden" name="material_id" value={row.material_id} /> : null}

                              {row.component_type !== "BAHAN" ? (
                                <Field label="Nama Komponen">
                                  <input name="component_name" required defaultValue={row.component_name} className={inputClass} />
                                </Field>
                              ) : (
                                <Field label="Material">
                                  <input readOnly disabled defaultValue={material ? `${material.material_code} · ${material.name}` : row.component_name} className={`${inputClass} bg-slate-100 text-slate-600`} />
                                  <input type="hidden" name="component_name" value={row.component_name} />
                                </Field>
                              )}

                              <Field label="Kebutuhan per Unit (Pcs)">
                                <input
                                  name="qty_per_unit"
                                  type="number"
                                  min="0.0001"
                                  step="any"
                                  required
                                  defaultValue={Number(row.qty_per_unit || 0)}
                                  className={inputClass}
                                />
                              </Field>

                              <Field label="Satuan">
                                <input name="unit" required defaultValue={row.unit} className={inputClass} />
                              </Field>

                              <Field label="Harga Satuan (Rp)">
                                <CurrencyNumberInput
                                  name="unit_price"
                                  min={0}
                                  required
                                  defaultValue={Number(row.unit_price || 0)}
                                  className={`${inputClass} font-bold text-slate-900`}
                                />
                              </Field>

                              <Field label="Sumber Pemenuhan">
                                <select name="fulfillment_source" defaultValue={row.fulfillment_source || "COMPANY_PURCHASE"} className={selectClass}>
                                  <option value="COMPANY_PURCHASE">Pembelian Perusahaan</option>
                                  <option value="CUSTOMER_SUPPLIED">Disediakan Customer</option>
                                  <option value="VENDOR_SUPPLIED">Disediakan Vendor</option>
                                  <option value="INTERNAL_STOCK">Stok Gudang Sendiri</option>
                                  <option value="OTHER">Lainnya</option>
                                </select>
                              </Field>

                              <Field label="Status">
                                <select name="status" defaultValue={row.status} className={selectClass}>
                                  <option value="AKTIF">AKTIF</option>
                                  <option value="NONAKTIF">NONAKTIF</option>
                                </select>
                              </Field>

                              <div className="md:col-span-2 xl:col-span-3 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-emerald-100">
                                <button type="submit" className={primaryButtonClass}>
                                  💾 Simpan Perubahan BOM
                                </button>
                                <button
                                  type="submit"
                                  formAction={deleteBomRequirement}
                                  formNoValidate
                                  className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                                >
                                  🗑️ Hapus Komponen
                                </button>
                              </div>
                            </form>
                          </div>
                        </div>
                      ) : null}
                    </details>
                  );
                })}

                {/* Grand Total Footer Summary With Integrated Labor Wage */}
                <div className="mt-4 rounded-xl border-2 border-blue-200 bg-blue-50/40 p-4.5">
                  <div className="space-y-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between border-b border-blue-200/60 pb-2">
                      <span className="text-slate-700 font-medium">1. Total Estimasi Biaya Bahan Baku & Jasa (BOM):</span>
                      <b className="font-bold text-slate-900">{formatRupiah(totalBiayaBahan)} / pcs · Total: {formatRupiah(totalBudgetBahan)}</b>
                    </div>
                    <div className="flex flex-wrap items-center justify-between border-b border-blue-200/60 pb-2">
                      <span className="text-blue-900 font-semibold">2. Biaya Produksi / Harga Pengajuan (dari Master Item Pekerjaan):</span>
                      <b className="font-bold text-blue-900">{formatRupiah(totalOngkosPengajuan)} / pcs · Total: {formatRupiah(totalBudgetBorongan)}</b>
                    </div>
                    <div className="flex flex-wrap items-center justify-between border-b border-blue-300 pb-2 text-base">
                      <span className="font-extrabold text-blue-950">3. Total HPP / Nilai Pengajuan (Bahan + Harga Pengajuan):</span>
                      <b className="font-black text-blue-950 text-lg">{formatRupiah(totalHPPProposed)} / pcs · Total: {formatRupiah(totalBudgetHPPProposed)}</b>
                    </div>
                    <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-1">
                      <span>Perbandingan Modal Riil Operator:</span>
                      <span>
                        Harga Operator: <b>{formatRupiah(totalOngkosOperator)} / pcs</b> · Modal Riil Pabrik: <b>{formatRupiah(totalHppRiil)} / pcs</b> · Margin Pabrik: <b className="text-emerald-700 font-bold">+{formatRupiah(totalHPPProposed - totalHppRiil)} / pcs</b>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Project-Wide Comparison Table */}
          <SectionCard
            title={`Ringkasan Modal & HPP Semua Produk di Proyek: ${currentProject?.name} (${projectProducts.length} Produk)`}
            description="Perbandingan total modal belanja bahan, modal upah tukang, dan HPP antar produk dalam proyek ini."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 font-bold">Produk</th>
                    <th className="py-2.5 font-bold">Target</th>
                    <th className="py-2.5 font-bold">Biaya Bahan / Pcs</th>
                    <th className="py-2.5 font-bold">Total Biaya Bahan</th>
                    <th className="py-2.5 font-bold">Harga Pengajuan / Pcs</th>
                    <th className="py-2.5 font-bold">Total Harga Pengajuan</th>
                    <th className="py-2.5 font-bold text-blue-900">Total HPP Pengajuan / Pcs</th>
                    <th className="py-2.5 font-bold text-blue-950">Total Nilai Pengajuan</th>
                    <th className="py-2.5 font-bold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productBomRecap.map((pr) => (
                    <tr key={pr.product.id} className={pr.product.id === selectedProduct ? "bg-blue-50/60 font-semibold" : ""}>
                      <td className="py-2.5">
                        <span className="font-mono text-blue-700 mr-1.5">{pr.product.product_code}</span>
                        {pr.product.name}
                        {pr.product.id === selectedProduct ? <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">Aktif</span> : null}
                      </td>
                      <td className="py-2.5">{formatNumber(pr.product.target_production)} {pr.product.unit}</td>
                      <td className="py-2.5 font-bold text-slate-700">{formatRupiah(pr.materialCostPerPcs)}</td>
                      <td className="py-2.5 font-bold text-slate-900">{formatRupiah(pr.totalMaterialCost)}</td>
                      <td className="py-2.5 font-bold text-blue-800">{formatRupiah(pr.proposedWagePerPcs)}</td>
                      <td className="py-2.5 font-bold text-blue-950">{formatRupiah(pr.totalProposedWage)}</td>
                      <td className="py-2.5 font-black text-blue-900">{formatRupiah(pr.hppBoronganPerPcs)}</td>
                      <td className="py-2.5 font-black text-blue-950">{formatRupiah(pr.totalHppBorongan)}</td>
                      <td className="py-2.5">
                        <Link
                          href={`/dashboard/masterKebutuhan?project=${selectedProject}&product=${pr.product.id}`}
                          className="text-blue-700 hover:underline font-semibold"
                        >
                          Buka BOM →
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
                    <td className="py-3 text-slate-900">{formatRupiah(grandProjectMaterialCost)}</td>
                    <td className="py-3">-</td>
                    <td className="py-3 text-blue-900">{formatRupiah(grandProjectProposedWage)}</td>
                    <td className="py-3">-</td>
                    <td className="py-3 text-blue-950">{formatRupiah(grandProjectHppBorongan)}</td>
                    <td className="py-3">-</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </SectionCard>
        </div>
      ) : selectedProject && currentProject ? (
        /* SCENARIO 2: PROJECT SELECTED, BUT ALL PRODUCTS -> MODAL & HPP GLOBAL SE-PROYEK */
        <div className="space-y-6">
          {/* Active Project Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-teal-50/50 p-4 sm:p-5 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-xl font-bold text-white shadow-xs">
                🏢
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-extrabold text-slate-900">{currentProject.name}</h2>
                  <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-200">
                    {currentProject.project_code}
                  </span>
                  <StatusBadge status={currentProject.status} />
                </div>
                <p className="mt-0.5 text-xs text-slate-600 font-medium">
                  Modal & HPP Global Se-Proyek · Total <b className="text-slate-800">{projectProducts.length} Produk Aktif</b> · Target Keseluruhan: <b className="text-slate-800">{formatNumber(grandProjectTarget)} Pcs</b>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/dashboard/masterItem?project=${selectedProject}`} className={secondaryButtonClass}>
                🪡 Kelola Item Pekerjaan Proyek
              </Link>
            </div>
          </div>

          {/* 4 GLOBAL PROJECT KPI CARDS */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Total Modal Bahan Proyek</p>
                <span className="text-lg">📦</span>
              </div>
              <div className="mt-2 text-2xl font-black text-slate-900">{formatRupiah(grandProjectMaterialCost)}</div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Akumulasi belanja bahan baku untuk seluruh target ({formatNumber(grandProjectTarget)} pcs).
              </p>
            </div>

            <div className="rounded-2xl border-2 border-blue-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Total Biaya Produksi (Pengajuan)</p>
                <span className="text-lg">🧵</span>
              </div>
              <div className="mt-2 text-2xl font-black text-blue-900">{formatRupiah(grandProjectProposedWage)}</div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Total biaya produksi yang diajukan ke pemilik proyek ({projectProducts.length} produk).
              </p>
            </div>

            <div className="rounded-2xl border-2 border-blue-500 bg-blue-50/40 p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Grand Total HPP (Nilai Pengajuan Proyek)</p>
                <span className="text-lg">💎</span>
              </div>
              <div className="mt-2 text-2xl font-black text-blue-950">{formatRupiah(grandProjectHppBorongan)}</div>
              <p className="mt-1 text-xs text-blue-900/80 font-medium leading-relaxed">
                Bahan ({formatRupiah(grandProjectMaterialCost)}) + Pengajuan Jahit ({formatRupiah(grandProjectProposedWage)}).
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Modal Riil Operator (Pabrik)</p>
                <span className="text-lg">💵</span>
              </div>
              <div className="mt-2 text-2xl font-black text-slate-800">{formatRupiah(grandProjectHppRiil)}</div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Modal Bersih Upah: {formatRupiah(grandProjectOperatorWage)} · Margin: <b className="text-emerald-700 font-bold">+{formatRupiah(grandProjectHppBorongan - grandProjectHppRiil)}</b>.
              </p>
            </div>
          </div>

          {/* SectionCard: REKAPITULASI MODAL & HPP SEMUA PRODUK DALAM PROYEK */}
          <SectionCard
            title={`Rekapitulasi Kebutuhan & Nilai Pengajuan per Produk · Proyek ${currentProject.name}`}
            description="Daftar semua produk dalam proyek ini beserta rincian biaya bahan baku, biaya produksi pengajuan, dan total HPP pengajuan per unit maupun total proyek."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 font-bold">Produk</th>
                    <th className="py-2.5 font-bold">Target</th>
                    <th className="py-2.5 font-bold">Biaya Bahan / Pcs</th>
                    <th className="py-2.5 font-bold">Total Biaya Bahan</th>
                    <th className="py-2.5 font-bold">Harga Pengajuan / Pcs</th>
                    <th className="py-2.5 font-bold">Total Harga Pengajuan</th>
                    <th className="py-2.5 font-bold text-blue-900">Total HPP Pengajuan / Pcs</th>
                    <th className="py-2.5 font-bold text-blue-950">Total Nilai Pengajuan</th>
                    <th className="py-2.5 font-bold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {productBomRecap.map((pr) => (
                    <tr key={pr.product.id}>
                      <td className="py-2.5">
                        <span className="font-mono text-blue-700 mr-1.5">{pr.product.product_code}</span>
                        {pr.product.name}
                      </td>
                      <td className="py-2.5">{formatNumber(pr.product.target_production)} {pr.product.unit}</td>
                      <td className="py-2.5 font-bold text-slate-700">{formatRupiah(pr.materialCostPerPcs)}</td>
                      <td className="py-2.5 font-bold text-slate-900">{formatRupiah(pr.totalMaterialCost)}</td>
                      <td className="py-2.5 font-bold text-blue-800">{formatRupiah(pr.proposedWagePerPcs)}</td>
                      <td className="py-2.5 font-bold text-blue-950">{formatRupiah(pr.totalProposedWage)}</td>
                      <td className="py-2.5 font-black text-blue-900">{formatRupiah(pr.hppBoronganPerPcs)}</td>
                      <td className="py-2.5 font-black text-blue-950">{formatRupiah(pr.totalHppBorongan)}</td>
                      <td className="py-2.5">
                        <Link
                          href={`/dashboard/masterKebutuhan?project=${selectedProject}&product=${pr.product.id}`}
                          className="rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 transition inline-block"
                        >
                          Buka BOM Produk →
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
                    <td className="py-3 text-slate-900">{formatRupiah(grandProjectMaterialCost)}</td>
                    <td className="py-3">-</td>
                    <td className="py-3 text-blue-900">{formatRupiah(grandProjectProposedWage)}</td>
                    <td className="py-3">-</td>
                    <td className="py-3 text-blue-950">{formatRupiah(grandProjectHppBorongan)}</td>
                    <td className="py-3">-</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </SectionCard>
        </div>
      ) : (
        /* SCENARIO 3: NO PROJECT / PRODUCT SELECTED: RENDER QUICK PRODUCT GRID */
        <MasterKebutuhanProductGrid
          projects={projects}
          products={products.filter((p) => p.status === "AKTIF")}
        />
      )}
    </MasterPageShell>
  );
}
