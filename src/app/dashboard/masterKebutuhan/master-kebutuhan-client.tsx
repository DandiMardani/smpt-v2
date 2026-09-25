"use client";

import { useMemo, useState } from "react";
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
    if (!selectedProjectId) return [];
    return products.filter((p) => p.project_id === selectedProjectId);
  }, [products, selectedProjectId]);

  function handleProjectChange(projectId: number) {
    setSelectedProjectId(projectId);
    setSelectedProductId(0);
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (selectedProjectId) params.set("project", String(selectedProjectId));
    if (selectedProductId) params.set("product", String(selectedProductId));
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    router.push(`/dashboard/masterKebutuhan?${params.toString()}`);
  }

  function handleReset() {
    setSelectedProjectId(0);
    setSelectedProductId(0);
    setSearchQuery("");
    router.push("/dashboard/masterKebutuhan");
  }

  return (
    <SectionCard
      title="Pilih Proyek / Produk"
      description="Pilih Proyek untuk menampilkan Produk dan menyaring daftar kebutuhan bahan."
    >
      <form onSubmit={handleFilterSubmit} className="grid gap-3 md:grid-cols-3">
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
          label="Produk"
          hint={
            selectedProjectId
              ? filteredProducts.length > 0
                ? `${filteredProducts.length} produk tersedia`
                : "Belum ada produk di proyek ini"
              : "Pilih proyek terlebih dahulu"
          }
        >
          <select
            name="product"
            value={selectedProductId || ""}
            onChange={(e) => setSelectedProductId(Number(e.target.value) || 0)}
            disabled={!selectedProjectId || filteredProducts.length === 0}
            className={selectClass}
          >
            <option value="">
              {!selectedProjectId
                ? "Pilih proyek terlebih dahulu"
                : filteredProducts.length === 0
                  ? "Tidak ada produk aktif"
                  : "Semua Produk"}
            </option>
            {filteredProducts.map((product) => (
              <option key={product.id} value={product.id}>
                {product.product_code} · {product.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Cari">
          <input
            name="q"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ID atau nama komponen"
            className={inputClass}
          />
        </Field>

        <div className="md:col-span-3 flex flex-wrap items-center gap-2">
          <button type="submit" className={secondaryButtonClass}>
            Terapkan Filter
          </button>
          {(selectedProjectId || selectedProductId || searchQuery) && (
            <button type="button" onClick={handleReset} className={secondaryButtonClass}>
              Reset Filter
            </button>
          )}
        </div>
      </form>
    </SectionCard>
  );
}

export function MasterKebutuhanCreateForm({
  projects,
  products,
  materials,
  defaultProjectId,
  defaultProductId,
}: {
  projects: ProjectRef[];
  products: ProductRef[];
  materials: MaterialRef[];
  defaultProjectId?: number;
  defaultProductId?: number;
}) {
  const [projectId, setProjectId] = useState<number>(defaultProjectId || 0);
  const [productId, setProductId] = useState<number>(defaultProductId || 0);
  const [componentType, setComponentType] = useState<string>("BAHAN");

  const availableProducts = useMemo(() => {
    if (!projectId) return [];
    return products.filter((p) => p.project_id === projectId);
  }, [products, projectId]);

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === productId);
  }, [products, productId]);

  const selectedProject = useMemo(() => {
    return projects.find((p) => p.id === projectId);
  }, [projects, projectId]);

  return (
    <SectionCard
      title="Tambah Kebutuhan / Komponen (BOM)"
      description="Pilih Proyek dan Produk tujuan, lalu isi kebutuhan bahan atau biaya."
    >
      <form action={saveBomRequirement} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Proyek">
          <select
            name="project_id"
            required
            value={projectId || ""}
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
            !projectId
              ? "Pilih proyek terlebih dahulu"
              : availableProducts.length === 0
                ? "Proyek ini belum memiliki produk aktif"
                : `${availableProducts.length} produk siap dipilih`
          }
        >
          <select
            name="product_id"
            required
            value={productId || ""}
            onChange={(e) => setProductId(Number(e.target.value) || 0)}
            disabled={!projectId || availableProducts.length === 0}
            className={selectClass}
          >
            <option value="">
              {!projectId
                ? "Pilih proyek terlebih dahulu"
                : availableProducts.length === 0
                  ? "Tidak ada produk"
                  : "Pilih Produk"}
            </option>
            {availableProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.product_code} · {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Jenis Komponen">
          <select
            name="component_type"
            value={componentType}
            onChange={(e) => setComponentType(e.target.value)}
            className={selectClass}
          >
            <option value="BAHAN">BAHAN — stok fisik</option>
            <option value="JASA">JASA — costing</option>
            <option value="BIAYA">BIAYA — costing</option>
          </select>
        </Field>

        <Field
          label="Master Bahan"
          hint={componentType === "BAHAN" ? "Wajib untuk jenis BAHAN" : "Diabaikan untuk JASA/BIAYA"}
        >
          <select
            id="bom-material-id"
            name="material_id"
            defaultValue=""
            disabled={componentType !== "BAHAN"}
            required={componentType === "BAHAN"}
            className={selectClass}
          >
            <option value="">Pilih bahan bila jenis BAHAN</option>
            {materials.map((m) => (
              <option
                key={m.id}
                value={m.id}
                data-name={m.name}
                data-unit={m.standard_unit}
                data-calculation-type={m.calculation_type}
              >
                {m.material_code} · {m.name} · {m.standard_unit} · {m.calculation_type}
                {m.status !== "AKTIF" ? " (NONAKTIF)" : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Nama Jasa/Biaya" hint="Diabaikan jika jenis BAHAN.">
          <input
            name="component_name"
            placeholder="Contoh: Sablon, Packing"
            disabled={componentType === "BAHAN"}
            required={componentType !== "BAHAN"}
            className={inputClass}
          />
        </Field>

        <Field label="Satuan Jasa/Biaya" hint="Diabaikan jika jenis BAHAN.">
          <input
            name="unit"
            defaultValue="pcs"
            disabled={componentType === "BAHAN"}
            required={componentType !== "BAHAN"}
            className={inputClass}
          />
        </Field>

        <Field label="Kebutuhan / Unit" hint="Bisa diisi manual atau memakai kalkulator di bawah.">
          <input
            id="bom-qty-per-unit"
            name="qty_per_unit"
            type="number"
            min="0"
            step="0.000001"
            defaultValue="0"
            required
            className={inputClass}
          />
        </Field>

        <Field label="Harga Satuan (Rp)">
          <input
            name="unit_price"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
            required
            className={inputClass}
          />
        </Field>

        <Field label="Sumber Pemenuhan">
          <select name="fulfillment_source" defaultValue="COMPANY_PURCHASE" className={selectClass}>
            <option value="COMPANY_PURCHASE">Perusahaan Beli</option>
            <option value="CUSTOMER_SUPPLIED">Bahan Customer / Titipan</option>
            <option value="VENDOR_SUPPLIED">Disediakan Vendor</option>
            <option value="INTERNAL_STOCK">Stok Internal</option>
            <option value="OTHER">Lainnya</option>
          </select>
        </Field>

        <Field label="Status">
          <select name="status" defaultValue="AKTIF" className={selectClass}>
            <option value="AKTIF">AKTIF</option>
            <option value="NONAKTIF">NONAKTIF</option>
          </select>
        </Field>

        {selectedProduct ? (
          <BomCalculator
            projectLabel={selectedProject?.name ?? "-"}
            productLabel={selectedProduct?.name ?? "-"}
            targetProduct={Number(selectedProduct?.target_production ?? 0)}
            materialSelectId="bom-material-id"
            targetInputId="bom-qty-per-unit"
          />
        ) : null}

        <div className="md:col-span-2 xl:col-span-4 flex items-end pt-2">
          <button
            type="submit"
            disabled={!projectId || !productId}
            className={primaryButtonClass}
          >
            Simpan Kebutuhan
          </button>
        </div>
      </form>
    </SectionCard>
  );
}
