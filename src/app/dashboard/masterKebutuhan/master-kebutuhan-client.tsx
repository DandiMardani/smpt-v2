"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Field,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  SectionCard,
  selectClass,
} from "@/components/master/master-ui";
import { BomCalculator } from "@/components/master/bom-calculator";
import { CurrencyNumberInput } from "@/components/forms/currency-number-input";
import { formatNumber, formatRupiah } from "@/lib/master/page-utils";
import { saveBomRequirement } from "./actions";

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
  calculation_type: "SHEET" | "LENGTH" | "PCS" | "ROLL_LENGTH";
  status: string;
};

export function MasterKebutuhanFilter({
  projects,
  products,
  initialProjectId,
  initialProductId,
  initialQ,
  initialCategory,
}: {
  projects: ProjectRef[];
  products: ProductRef[];
  initialProjectId: number;
  initialProductId: number;
  initialQ: string;
  initialCategory?: string;
}) {
  const router = useRouter();
  const [selectedProjectId, setSelectedProjectId] = useState<number>(initialProjectId || 0);
  const [selectedProductId, setSelectedProductId] = useState<number>(initialProductId || 0);
  const [searchQuery, setSearchQuery] = useState<string>(initialQ || "");

  const filteredProducts = useMemo(() => {
    if (!selectedProjectId) return products;
    return products.filter((p) => p.project_id === selectedProjectId);
  }, [products, selectedProjectId]);

  const itemPekerjaanHref =
    selectedProjectId && selectedProductId
      ? `/dashboard/masterItem?project=${selectedProjectId}&product=${selectedProductId}${initialCategory ? `&category=${initialCategory}` : ""}`
      : "/dashboard/masterItem";

  const routingHref =
    selectedProjectId && selectedProductId
      ? `/dashboard/masterItem/routing?project=${selectedProjectId}&product=${selectedProductId}${initialCategory ? `&category=${initialCategory}` : ""}`
      : "/dashboard/masterItem/routing";

  function handleProjectChange(projectId: number) {
    setSelectedProjectId(projectId);
    setSelectedProductId(0);
    const params = new URLSearchParams();
    if (initialCategory) params.set("category", initialCategory);
    if (projectId) params.set("project", String(projectId));
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    router.push(params.toString() ? `/dashboard/masterKebutuhan?${params.toString()}` : "/dashboard/masterKebutuhan");
  }

  function handleProductChange(productId: number) {
    setSelectedProductId(productId);
    const p = products.find((x) => x.id === productId);
    const projId = p?.project_id || selectedProjectId;
    if (projId && !selectedProjectId) setSelectedProjectId(projId);
    const params = new URLSearchParams();
    if (initialCategory) params.set("category", initialCategory);
    if (projId) params.set("project", String(projId));
    if (productId > 0) params.set("product", String(productId));
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    router.push(params.toString() ? `/dashboard/masterKebutuhan?${params.toString()}` : "/dashboard/masterKebutuhan");
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (initialCategory) params.set("category", initialCategory);
    if (selectedProjectId) params.set("project", String(selectedProjectId));
    if (selectedProductId) params.set("product", String(selectedProductId));
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    router.push(params.toString() ? `/dashboard/masterKebutuhan?${params.toString()}` : "/dashboard/masterKebutuhan");
  }

  function handleReset() {
    setSelectedProjectId(0);
    setSelectedProductId(0);
    setSearchQuery("");
    const resetUrl = initialCategory ? `/dashboard/masterKebutuhan?category=${initialCategory}` : "/dashboard/masterKebutuhan";
    router.push(resetUrl);
  }

  return (
    <SectionCard
      title="Pilih Proyek / Produk"
      description="Pilih Proyek untuk melihat kalkulasi Modal & HPP Global Proyek (semua item & produk), atau pilih Produk spesifik untuk rincian BOM."
    >
      <form onSubmit={handleFilterSubmit} className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Proyek">
            <select
              name="project"
              value={selectedProjectId || ""}
              onChange={(e) => handleProjectChange(Number(e.target.value) || 0)}
              className={selectClass}
            >
              <option value="">Semua proyek</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.project_code} · {project.name}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Pilih Produk"
            hint={
              selectedProjectId
                ? filteredProducts.length > 0
                  ? `${filteredProducts.length} produk tersedia pada proyek ini`
                  : "Belum ada produk di proyek ini"
                : "Pilih proyek untuk modal global atau pilih produk langsung"
            }
          >
            <select
              name="product"
              value={selectedProductId || ""}
              onChange={(e) => handleProductChange(Number(e.target.value) || 0)}
              className={`${selectClass} ${!selectedProductId && selectedProjectId ? "border-blue-400 bg-blue-50/20 font-semibold" : selectedProductId ? "border-emerald-400 bg-emerald-50/20 font-bold text-emerald-950" : ""}`}
            >
              <option value="">
                {selectedProjectId ? "Semua Produk (Modal & HPP Global Proyek)" : "-- Pilih Produk --"}
              </option>
              {filteredProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.product_code} · {product.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Cari Komponen">
            <input
              name="q"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kode atau nama komponen..."
              className={inputClass}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={secondaryButtonClass}>
              Cari Komponen
            </button>
            {(selectedProjectId || selectedProductId || searchQuery) && (
              <button type="button" onClick={handleReset} className={secondaryButtonClass}>
                Reset Filter
              </button>
            )}
          </div>

          {selectedProductId ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link href={itemPekerjaanHref} className={secondaryButtonClass}>
                🪡 Item Pekerjaan & Upah
              </Link>
              <Link href={routingHref} className={secondaryButtonClass}>
                🔄 Alur Routing
              </Link>
            </div>
          ) : null}
        </div>
      </form>
    </SectionCard>
  );
}

export function MasterKebutuhanProductGrid({
  projects,
  products,
}: {
  projects: ProjectRef[];
  products: ProductRef[];
}) {
  const router = useRouter();
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  return (
    <SectionCard
      title="🎯 Silakan Pilih Produk"
      description="Kebutuhan Bahan (BOM) dan kalkulasi Ongkos Tukang / Operator dihitung per Produk. Klik salah satu produk di bawah:"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => {
          const project = projectMap.get(p.project_id);
          const targetUrl = `/dashboard/masterKebutuhan?project=${p.project_id}&product=${p.id}`;
          return (
            <Link
              key={p.id}
              href={targetUrl}
              className="group block select-none touch-manipulation rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs transition hover:border-emerald-400 hover:bg-emerald-50/20 hover:shadow-sm active:scale-[0.98]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-emerald-700">{p.product_code}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {p.status}
                </span>
              </div>
              <h3 className="mt-1.5 font-bold text-slate-900 text-sm line-clamp-1 group-hover:text-emerald-700 transition-colors">{p.name}</h3>
              <p className="mt-0.5 text-xs text-slate-500 font-medium">{project?.name ?? "Proyek"}</p>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                <span className="text-slate-500">
                  Target: <b className="text-slate-800">{formatNumber(p.target_production)} {p.unit}</b>
                </span>
                <span className="inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-emerald-50 px-3 py-1.5 font-bold text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition shadow-2xs">
                  Buka BOM ➔
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </SectionCard>
  );
}

export function MasterKebutuhanCreateForm({
  projects,
  products,
  materials,
  defaultProjectId,
  defaultProductId,
  currentQ,
}: {
  projects: ProjectRef[];
  products: ProductRef[];
  materials: MaterialRef[];
  defaultProjectId?: number;
  defaultProductId?: number;
  currentQ?: string;
}) {
  const [projectId, setProjectId] = useState<number>(defaultProjectId || 0);
  const [productId, setProductId] = useState<number>(defaultProductId || 0);
  const [showProductPicker, setShowProductPicker] = useState<boolean>(!defaultProductId);
  const [componentType, setComponentType] = useState<string>("BAHAN");
  const [materialId, setMaterialId] = useState<string>("");
  const [componentName, setComponentName] = useState<string>("");
  const [unit, setUnit] = useState<string>("Meter");
  const [qtyPerUnit, setQtyPerUnit] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [calculatorSnapshot, setCalculatorSnapshot] = useState<Record<string, unknown> | null>(null);

  const availableProducts = useMemo(() => {
    if (!projectId) return products;
    return products.filter((p) => p.project_id === projectId);
  }, [products, projectId]);

  const activeProduct = useMemo(() => {
    return products.find((p) => p.id === productId);
  }, [products, productId]);

  const activeProject = useMemo(() => {
    return projects.find((p) => p.id === (activeProduct?.project_id || projectId));
  }, [projects, activeProduct, projectId]);

  const selectedMaterial = useMemo(() => {
    return materials.find((m) => m.id === Number(materialId));
  }, [materials, materialId]);

  function handleMaterialChange(matId: string) {
    setMaterialId(matId);
    const m = materials.find((x) => x.id === Number(matId));
    if (m) {
      setComponentName(m.name);
      setUnit(m.standard_unit);
    }
  }

  const subtotalCost = qtyPerUnit * unitPrice;

  return (
    <SectionCard
      title="Tambah Kebutuhan / Komponen (BOM) Baru"
      description="Masukkan kebutuhan bahan baku, aksesoris, atau jasa untuk produk ini."
    >
      <form action={saveBomRequirement} className="space-y-4">
        <input type="hidden" name="return_project" value={projectId || activeProduct?.project_id || ""} />
        <input type="hidden" name="return_product" value={productId || ""} />
        <input type="hidden" name="return_q" value={currentQ || ""} />
        <input type="hidden" name="project_id" value={projectId || activeProduct?.project_id || ""} />
        <input type="hidden" name="product_id" value={productId || ""} />

        {/* Selected Product Banner */}
        {productId && activeProduct ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-xs text-emerald-950">
            <div className="flex items-center gap-2">
              <span className="text-base">📦</span>
              <div>
                <span className="font-bold text-slate-900">{activeProduct.product_code} · {activeProduct.name}</span>
                <span className="text-slate-500 ml-2">({activeProject?.name ?? "Proyek"})</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowProductPicker(!showProductPicker)}
              className="text-xs font-semibold text-emerald-800 hover:underline"
            >
              {showProductPicker ? "Sembunyikan Pilihan Produk" : "Ganti Produk Tujuan"}
            </button>
          </div>
        ) : null}

        {/* Optional Project & Product Dropdowns if changing */}
        {showProductPicker || !productId ? (
          <div className="grid gap-4 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 md:grid-cols-2">
            <Field label="Proyek">
              <select
                required
                value={projectId || activeProduct?.project_id || ""}
                onChange={(e) => {
                  const val = Number(e.target.value) || 0;
                  setProjectId(val);
                  setProductId(0);
                }}
                className={selectClass}
              >
                <option value="">Pilih proyek</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_code} · {p.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Produk"
              hint={
                !projectId && !activeProduct?.project_id
                  ? "Pilih proyek terlebih dahulu"
                  : availableProducts.length === 0
                    ? "Proyek ini belum memiliki produk aktif"
                    : `${availableProducts.length} produk siap dipilih`
              }
            >
              <select
                required
                value={productId || ""}
                onChange={(e) => setProductId(Number(e.target.value) || 0)}
                className={selectClass}
              >
                <option value="">Pilih Produk</option>
                {availableProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.product_code} · {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : null}

        {/* Input Fields */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Jenis Komponen">
            <select
              name="component_type"
              value={componentType}
              onChange={(e) => setComponentType(e.target.value)}
              className={selectClass}
            >
              <option value="BAHAN">BAHAN (Fisik / Material)</option>
              <option value="JASA">JASA (Maklon / Sablon Luar / Printing)</option>
              <option value="BIAYA">BIAYA (Packaging / QC / Lainnya)</option>
            </select>
          </Field>

          {componentType === "BAHAN" ? (
            <Field label="Pilih Bahan Fisik">
              <select
                id="bom-material-id"
                name="material_id"
                required
                value={materialId}
                onChange={(e) => handleMaterialChange(e.target.value)}
                className={selectClass}
              >
                <option value="">Pilih Material</option>
                {materials.map((m) => (
                  <option
                    key={m.id}
                    value={m.id}
                    data-name={m.name}
                    data-unit={m.standard_unit}
                    data-calculation-type={m.calculation_type}
                  >
                    {m.material_code} · {m.name} ({m.standard_unit})
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Nama Komponen / Jasa">
              <input
                name="component_name"
                required
                value={componentName}
                onChange={(e) => setComponentName(e.target.value)}
                placeholder="Contoh: Ongkos Sablon, Tag Box"
                className={inputClass}
              />
            </Field>
          )}

          {componentType === "BAHAN" && (
            <input type="hidden" name="component_name" value={selectedMaterial?.name || componentName} />
          )}

          <Field label="Satuan">
            <input
              name="unit"
              required
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Kebutuhan per Produk" hint="Qty material yang dibutuhkan untuk 1 pcs produk">
            <input
              id="bom-qty-per-unit"
              name="qty_per_unit"
              type="number"
              min="0.0001"
              step="any"
              value={qtyPerUnit || ""}
              onChange={(e) => setQtyPerUnit(e.target.value === "" ? 0 : Number(e.target.value))}
              required
              className={inputClass}
            />
          </Field>

          <Field
            label="Harga Satuan (Rp)"
            hint={
              subtotalCost > 0
                ? `Estimasi Biaya / Pcs: ${formatRupiah(subtotalCost)}`
                : "Estimasi harga beli bahan per satuan"
            }
          >
            <CurrencyNumberInput
              name="unit_price"
              value={unitPrice}
              onChange={(val) => setUnitPrice(val)}
              min={0}
              required
              placeholder="0"
              className={`${inputClass} font-bold text-slate-900`}
            />
          </Field>

          <Field label="Sumber Pengadaan">
            <select name="fulfillment_source" defaultValue="COMPANY_PURCHASE" className={selectClass}>
              <option value="COMPANY_PURCHASE">PENGADAAN PERUSAHAAN</option>
              <option value="CUSTOMER_SUPPLIED">DIPASOK CUSTOMER</option>
              <option value="VENDOR_SUPPLIED">DIPASOK VENDOR</option>
              <option value="INTERNAL_STOCK">STOK INTERNAL</option>
              <option value="OTHER">LAINNYA</option>
            </select>
          </Field>

          <Field label="Status">
            <select name="status" defaultValue="AKTIF" className={selectClass}>
              <option value="AKTIF">AKTIF</option>
              <option value="NONAKTIF">NONAKTIF</option>
            </select>
          </Field>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={!productId}
              className={primaryButtonClass}
            >
              Simpan Kebutuhan Bahan
            </button>
          </div>
        </div>

        {/* Optional Calculator */}
        {selectedMaterial && (
          <div className="border-t border-slate-100 pt-3">
            <BomCalculator
              projectLabel={activeProject?.name ?? "-"}
              productLabel={activeProduct?.name ?? "-"}
              targetProduct={Number(activeProduct?.target_production || 0)}
              materialSelectId="bom-material-id"
              targetInputId="bom-qty-per-unit"
            />
          </div>
        )}
      </form>
    </SectionCard>
  );
}
