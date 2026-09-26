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
import { formatNumber, formatRupiah } from "@/lib/master/page-utils";
import { CurrencyNumberInput } from "@/components/forms/currency-number-input";
import { saveWorkItem } from "./actions";

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

const ITEM_UNITS = ["Pcs", "Set", "Pasang", "Unit"] as const;

export function MasterItemFilter({
  projects,
  products,
  initialProjectId,
  initialProductId,
  initialQ,
}: {
  projects: ProjectRef[];
  products: ProductRef[];
  initialProjectId: number;
  initialProductId: number;
  initialQ: string;
}) {
  const router = useRouter();
  const [selectedProjectId, setSelectedProjectId] = useState<number>(initialProjectId || 0);
  const [selectedProductId, setSelectedProductId] = useState<number>(initialProductId || 0);
  const [searchQuery, setSearchQuery] = useState<string>(initialQ || "");

  const filteredProducts = useMemo(() => {
    if (!selectedProjectId) return products;
    return products.filter((p) => p.project_id === selectedProjectId);
  }, [products, selectedProjectId]);

  const routingHref =
    selectedProjectId && selectedProductId
      ? `/dashboard/masterItem/routing?project=${selectedProjectId}&product=${selectedProductId}`
      : "/dashboard/masterItem/routing";

  const kebutuhanHref =
    selectedProjectId && selectedProductId
      ? `/dashboard/masterKebutuhan?project=${selectedProjectId}&product=${selectedProductId}`
      : "/dashboard/masterKebutuhan";

  function handleProjectChange(projectId: number) {
    setSelectedProjectId(projectId);
    setSelectedProductId(0);
    const params = new URLSearchParams();
    if (projectId) params.set("project", String(projectId));
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    router.push(params.toString() ? `/dashboard/masterItem?${params.toString()}` : "/dashboard/masterItem");
  }

  function handleProductChange(productId: number) {
    setSelectedProductId(productId);
    const p = products.find((x) => x.id === productId);
    const projId = p?.project_id || selectedProjectId;
    if (projId && !selectedProjectId) setSelectedProjectId(projId);
    const params = new URLSearchParams();
    if (projId) params.set("project", String(projId));
    if (productId > 0) params.set("product", String(productId));
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    router.push(params.toString() ? `/dashboard/masterItem?${params.toString()}` : "/dashboard/masterItem");
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (selectedProjectId) params.set("project", String(selectedProjectId));
    if (selectedProductId) params.set("product", String(selectedProductId));
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    router.push(params.toString() ? `/dashboard/masterItem?${params.toString()}` : "/dashboard/masterItem");
  }

  function handleReset() {
    setSelectedProjectId(0);
    setSelectedProductId(0);
    setSearchQuery("");
    router.push("/dashboard/masterItem");
  }

  return (
    <SectionCard
      title="Pilih Proyek / Produk"
      description="Pilih Proyek untuk melihat kalkulasi Modal Global Proyek (semua item & produk), atau pilih Produk spesifik untuk rincian item pekerjaan."
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
                {selectedProjectId ? "Semua Produk (Modal Global Proyek)" : "-- Pilih Produk --"}
              </option>
              {filteredProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.product_code} · {product.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Cari Item">
            <input
              name="q"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kode atau nama pekerjaan..."
              className={inputClass}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={secondaryButtonClass}>
              Cari Item
            </button>
            {(selectedProjectId || selectedProductId || searchQuery) && (
              <button type="button" onClick={handleReset} className={secondaryButtonClass}>
                Reset Filter
              </button>
            )}
          </div>

          {selectedProductId ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link href={routingHref} className={secondaryButtonClass}>
                🔄 Alur Routing
              </Link>
              <Link href={kebutuhanHref} className={secondaryButtonClass}>
                📦 Kebutuhan Bahan (BOM)
              </Link>
            </div>
          ) : null}
        </div>
      </form>
    </SectionCard>
  );
}

export function MasterItemProductGrid({
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
      description="Data Item Pekerjaan dan kalkulasi Total Upah Borongan/Operator dikelompokkan dan dihitung per Produk. Klik salah satu produk di bawah:"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => {
          const project = projectMap.get(p.project_id);
          const targetUrl = `/dashboard/masterItem?project=${p.project_id}&product=${p.id}`;
          return (
            <Link
              key={p.id}
              href={targetUrl}
              className="group block select-none touch-manipulation rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs transition hover:border-blue-400 hover:bg-blue-50/20 hover:shadow-sm active:scale-[0.98]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-blue-600">{p.product_code}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {p.status}
                </span>
              </div>
              <h3 className="mt-1.5 font-bold text-slate-900 text-sm line-clamp-1 group-hover:text-blue-700 transition-colors">{p.name}</h3>
              <p className="mt-0.5 text-xs text-slate-500 font-medium">{project?.name ?? "Proyek"}</p>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                <span className="text-slate-500">
                  Target: <b className="text-slate-800">{formatNumber(p.target_production)} {p.unit}</b>
                </span>
                <span className="inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-blue-50 px-3 py-1.5 font-bold text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition shadow-2xs">
                  Buka Item ➔
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </SectionCard>
  );
}

export function MasterItemCreateForm({
  projects,
  products,
  defaultProjectId,
  defaultProductId,
  currentQ,
}: {
  projects: ProjectRef[];
  products: ProductRef[];
  defaultProjectId?: number;
  defaultProductId?: number;
  currentQ?: string;
}) {
  const [projectId, setProjectId] = useState<number>(defaultProjectId || 0);
  const [productId, setProductId] = useState<number>(defaultProductId || 0);
  const [showProductPicker, setShowProductPicker] = useState<boolean>(!defaultProductId);
  const [qtyPerProduct, setQtyPerProduct] = useState<number>(1);
  const [operatorPrice, setOperatorPrice] = useState<number>(0);
  const [proposedPrice, setProposedPrice] = useState<number>(0);

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

  const subtotalOperator = qtyPerProduct * operatorPrice;
  const subtotalProposed = qtyPerProduct * proposedPrice;

  return (
    <SectionCard
      title="Tambah Item Pekerjaan Baru"
      description="Masukkan rincian pekerjaan dan tarif upah untuk produk ini. Item baru default bertipe alur MANDIRI."
    >
      <form action={saveWorkItem} className="space-y-4">
        <input type="hidden" name="return_project" value={projectId || activeProduct?.project_id || ""} />
        <input type="hidden" name="return_product" value={productId || ""} />
        <input type="hidden" name="return_q" value={currentQ || ""} />
        <input type="hidden" name="project_id" value={projectId || activeProduct?.project_id || ""} />
        <input type="hidden" name="product_id" value={productId || ""} />

        {/* Selected Product Banner */}
        {productId && activeProduct ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 text-xs text-blue-900">
            <div className="flex items-center gap-2">
              <span className="text-base">🏷️</span>
              <div>
                <span className="font-bold text-slate-900">{activeProduct.product_code} · {activeProduct.name}</span>
                <span className="text-slate-500 ml-2">({activeProject?.name ?? "Proyek"})</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowProductPicker(!showProductPicker)}
              className="text-xs font-semibold text-blue-700 hover:underline"
            >
              {showProductPicker ? "Sembunyikan Pilihan Produk" : "Ganti Produk Tujuan"}
            </button>
          </div>
        ) : null}

        {/* Optional Project & Product Dropdowns if changing or not selected */}
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
          <div className="md:col-span-2">
            <Field label="Nama Pekerjaan">
              <input
                name="name"
                required
                placeholder="Contoh: Jahit Badan, Pasang Resleting, Pasang Webbing"
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Satuan">
            <select name="unit" defaultValue="Pcs" className={selectClass}>
              {ITEM_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Qty Pekerjaan / Produk" hint="Berapa kali dilakukan untuk 1 produk">
            <CurrencyNumberInput
              name="qty_per_product"
              value={qtyPerProduct}
              onChange={(val) => setQtyPerProduct(val || 1)}
              min={1}
              required
              placeholder="1"
              className={inputClass}
            />
          </Field>

          <Field
            label="Harga Operator (Rp)"
            hint={
              subtotalOperator > 0
                ? `Subtotal Operator: ${formatRupiah(subtotalOperator)}`
                : "Upah borongan per unit pekerjaan yang diterima pekerja"
            }
          >
            <CurrencyNumberInput
              name="operator_price"
              value={operatorPrice}
              onChange={(val) => setOperatorPrice(val)}
              min={0}
              required
              placeholder="0"
              className={`${inputClass} font-bold text-slate-900`}
            />
          </Field>

          <Field
            label="Harga Pengajuan (Rp)"
            hint={
              subtotalProposed > 0
                ? `Subtotal Pengajuan: ${formatRupiah(subtotalProposed)}`
                : "Tarif borongan yang diajukan ke klien/pemberi kerja"
            }
          >
            <CurrencyNumberInput
              name="proposed_price"
              value={proposedPrice}
              onChange={(val) => setProposedPrice(val)}
              min={0}
              required
              placeholder="0"
              className={`${inputClass} font-bold text-blue-900`}
            />
          </Field>

          <Field label="Pelaksana">
            <select name="executor_scope" defaultValue="OPERATOR_BORONGAN" className={selectClass}>
              <option value="OPERATOR_BORONGAN">OPERATOR BORONGAN</option>
              <option value="PEKERJA_HARIAN">PEKERJA HARIAN</option>
              <option value="KEDUANYA">KEDUANYA (Bisa Harian / Borongan)</option>
            </select>
          </Field>

          <Field label="Kategori Pengajuan">
            <select name="submission_category" defaultValue="BORONGAN" className={selectClass}>
              <option value="BORONGAN">BORONGAN</option>
              <option value="TIDAK_ADA">TIDAK ADA</option>
            </select>
          </Field>

          <Field label="Status">
            <select name="status" defaultValue="AKTIF" className={selectClass}>
              <option value="AKTIF">AKTIF</option>
              <option value="NONAKTIF">NONAKTIF</option>
            </select>
          </Field>

          <div className="md:col-span-2 xl:col-span-3 flex items-center gap-2 pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                name="output_final"
                value="1"
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Jadikan Output Final Produk ini (Menandakan barang jadi selesai dirakit)</span>
            </label>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={!productId}
              className={primaryButtonClass}
            >
              Simpan Item Pekerjaan
            </button>
          </div>
        </div>
      </form>
    </SectionCard>
  );
}
