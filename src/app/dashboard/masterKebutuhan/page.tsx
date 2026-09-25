import Link from "next/link";
import {
  EmptyState,
  MasterPageShell,
  Notice,
  ReadOnlyBanner,
  SectionCard,
  StatusBadge,
  secondaryButtonClass,
} from "@/components/master/master-ui";
import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  cleanSearch,
  formatNumber,
  formatRupiah,
  param,
  type SearchParams,
} from "@/lib/master/page-utils";
import { deleteBomRequirement } from "./actions";
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

  const projects = (projectResult.data ?? []) as ProjectRef[];
  const products = (productResult.data ?? []) as ProductRef[];
  const materials = (materialResult.data ?? []) as MaterialRef[];
  const projectMap = new Map(projects.map((item) => [item.id, item]));
  const productMap = new Map(products.map((item) => [item.id, item]));
  const materialMap = new Map(materials.map((item) => [item.id, item]));

  const currentProduct = selectedProduct ? productMap.get(selectedProduct) : undefined;
  if (currentProduct && !selectedProject) {
    selectedProject = currentProduct.project_id;
  }
  const currentProject = selectedProject ? projectMap.get(selectedProject) : undefined;

  let rows: BomRow[] = [];
  let workItems: WorkItemMini[] = [];

  if (selectedProduct) {
    // 1. Query BOM Requirements for this product
    let bomQuery = supabase
      .from("bom_requirements")
      .select("id, requirement_code, project_id, product_id, material_id, component_type, component_name, unit, qty_per_unit, unit_price, status, legacy_total_requirement, legacy_project_level, fulfillment_source, calculation_method, net_usage_per_product, allowance_percent, waste_percent, final_requirement")
      .eq("product_id", selectedProduct)
      .order("component_type", { ascending: true })
      .order("component_name", { ascending: true });

    if (q) bomQuery = bomQuery.or(`requirement_code.ilike.%${q}%,component_name.ilike.%${q}%`);

    // 2. Query Work Items for this product to get proposed / operator wage totals
    const [bomRes, itemRes] = await Promise.all([
      bomQuery,
      supabase
        .from("work_items")
        .select("id, name, qty_per_product, operator_price, proposed_price, status")
        .eq("product_id", selectedProduct)
        .eq("status", "AKTIF"),
    ]);

    if (bomRes.error) throw new Error(`Master Kebutuhan gagal dimuat: ${bomRes.error.message}`);
    rows = (bomRes.data ?? []) as BomRow[];
    workItems = (itemRes.data ?? []) as WorkItemMini[];
  }

  // Cost & Wage Calculations
  const totalOngkosPengajuan = workItems.reduce(
    (sum, item) => sum + Number(item.qty_per_product || 1) * Number(item.proposed_price || 0),
    0
  );
  const totalOngkosOperator = workItems.reduce(
    (sum, item) => sum + Number(item.qty_per_product || 1) * Number(item.operator_price || 0),
    0
  );

  const activeBomRows = rows.filter((x) => x.status === "AKTIF");
  const totalBiayaBahan = activeBomRows.reduce(
    (sum, item) => sum + Number(item.qty_per_unit || 0) * Number(item.unit_price || 0),
    0
  );

  const totalHPPProposed = totalBiayaBahan + totalOngkosPengajuan;
  const targetProduction = Number(currentProduct?.target_production || 0);
  const totalBudgetBahan = targetProduction * totalBiayaBahan;
  const totalBudgetBorongan = targetProduction * totalOngkosPengajuan;

  const itemPekerjaanHref =
    selectedProject && selectedProduct
      ? `/dashboard/masterItem?project=${selectedProject}&product=${selectedProduct}`
      : "/dashboard/masterItem";

  const routingHref =
    selectedProject && selectedProduct
      ? `/dashboard/masterItem/routing?project=${selectedProject}&product=${selectedProduct}`
      : "/dashboard/masterItem/routing";

  return (
    <MasterPageShell
      eyebrow="Master Data"
      title="Master Kebutuhan Bahan (BOM)"
      description="Kelola Bill of Materials (BOM) per Produk. Sistem otomatis mengintegrasikan Total Ongkos Tukang/Operator yang diambil dari Item Pekerjaan untuk kalkulasi estimasi HPP."
    >
      <Notice success={param(params, "success")} error={param(params, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      {/* Product-First Selector */}
      <MasterKebutuhanFilter
        projects={projects}
        products={products}
        initialProjectId={selectedProject}
        initialProductId={selectedProduct}
        initialQ={q}
      />

      {/* IF A PRODUCT IS SELECTED: SHOW DETAILED BOM, WAGE INTEGRATION KPIS, AND BOM FORM */}
      {selectedProduct && currentProduct ? (
        <>
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
              <Link href={itemPekerjaanHref} className={secondaryButtonClass}>
                🪡 Kelola Item Pekerjaan ({workItems.length})
              </Link>
              <Link href={routingHref} className={secondaryButtonClass}>
                🔄 Alur Routing
              </Link>
            </div>
          </div>

          {/* 4 SUMMARY KPI CARDS: ONGKOS BORONGAN, ONGKOS OPERATOR, BIAYA BAHAN, ESTIMASI HPP */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border-2 border-blue-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Ongkos Borongan (Pengajuan)</p>
                <span className="text-lg">🧵</span>
              </div>
              <div className="mt-2 text-2xl font-black text-blue-900">{formatRupiah(totalOngkosPengajuan)}</div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Diambil dari total harga pengajuan Item Pekerjaan ({workItems.length} item).
              </p>
            </div>

            <div className="rounded-2xl border-2 border-emerald-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Ongkos Tukang (Operator)</p>
                <span className="text-lg">🪡</span>
              </div>
              <div className="mt-2 text-2xl font-black text-emerald-900">{formatRupiah(totalOngkosOperator)}</div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Diambil dari total tarif operator Item Pekerjaan produk ini.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Estimasi Biaya Bahan</p>
                <span className="text-lg">📦</span>
              </div>
              <div className="mt-2 text-2xl font-black text-slate-800">{formatRupiah(totalBiayaBahan)}</div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Akumulasi bahan baku & komponen fisik ({activeBomRows.length} komponen).
              </p>
            </div>

            <div className="rounded-2xl border-2 border-amber-200 bg-white p-4 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Estimasi HPP Total / Pcs</p>
                <span className="text-lg">💎</span>
              </div>
              <div className="mt-2 text-2xl font-black text-amber-900">{formatRupiah(totalHPPProposed)}</div>
              <p className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                Bahan ({formatRupiah(totalBiayaBahan)}) + Borongan ({formatRupiah(totalOngkosPengajuan)}).
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
            title={`Rincian Kebutuhan Bahan (${rows.length} komponen)`}
            description={`BOM aktif untuk produk ${currentProduct.name}. Total biaya bahan: ${formatRupiah(totalBiayaBahan)} · Ongkos borongan: ${formatRupiah(totalOngkosPengajuan)}.`}
          >
            {rows.length === 0 ? (
              <EmptyState text="Belum ada komponen kebutuhan bahan untuk produk ini. Silakan input bahan baru di atas." />
            ) : (
              <div className="space-y-3">
                {rows.map((row, idx) => {
                  const material = row.material_id ? materialMap.get(row.material_id) : undefined;
                  const subCost = Number(row.qty_per_unit || 0) * Number(row.unit_price || 0);

                  return (
                    <div
                      key={row.id}
                      className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs hover:border-slate-300 transition"
                    >
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

                          {canWrite ? (
                            <form action={deleteBomRequirement} className="flex items-center pl-2">
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="return_project" value={selectedProject} />
                              <input type="hidden" name="return_product" value={selectedProduct} />
                              <button
                                type="submit"
                                className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                              >
                                🗑️ Hapus
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Grand Total Footer Summary With Integrated Labor Wage */}
                <div className="mt-4 rounded-xl border-2 border-emerald-200 bg-emerald-50/50 p-4.5">
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between border-b border-emerald-200/80 pb-2">
                      <span className="text-slate-600 font-medium">1. Total Estimasi Biaya Bahan (BOM):</span>
                      <b className="font-bold text-slate-900">{formatRupiah(totalBiayaBahan)} / pcs</b>
                    </div>
                    <div className="flex flex-wrap items-center justify-between border-b border-emerald-200/80 pb-2">
                      <span className="text-blue-800 font-medium">2. Total Ongkos Borongan (dari Item Pekerjaan):</span>
                      <b className="font-bold text-blue-900">{formatRupiah(totalOngkosPengajuan)} / pcs</b>
                    </div>
                    <div className="flex flex-wrap items-center justify-between pt-1 text-base">
                      <span className="font-extrabold text-slate-900">Total Estimasi HPP per Produk:</span>
                      <b className="font-black text-emerald-900 text-lg">{formatRupiah(totalHPPProposed)} / pcs</b>
                    </div>
                    <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-1">
                      <span>Total Anggaran Proyek ({formatNumber(targetProduction)} pcs):</span>
                      <span>
                        Bahan: <b>{formatRupiah(totalBudgetBahan)}</b> · Borongan: <b>{formatRupiah(totalBudgetBorongan)}</b>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>
        </>
      ) : (
        /* IF NO PRODUCT SELECTED: RENDER QUICK PRODUCT GRID */
        <MasterKebutuhanProductGrid
          projects={projects}
          products={products.filter((p) => p.status === "AKTIF")}
        />
      )}
    </MasterPageShell>
  );
}
