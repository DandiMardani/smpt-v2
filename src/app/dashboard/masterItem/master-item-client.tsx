"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Field,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  SectionCard,
  selectClass,
} from "@/components/master/master-ui";
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
  const searchParams = useSearchParams();
  const [selectedProjectId, setSelectedProjectId] = useState<number>(initialProjectId || 0);
  const [selectedProductId, setSelectedProductId] = useState<number>(initialProductId || 0);
  const [searchQuery, setSearchQuery] = useState<string>(initialQ || "");

  const filteredProducts = useMemo(() => {
    if (!selectedProjectId) return [];
    return products.filter((p) => p.project_id === selectedProjectId);
  }, [products, selectedProjectId]);

  const routingHref =
    selectedProjectId && selectedProductId
      ? `/dashboard/masterItem/routing?project=${selectedProjectId}&product=${selectedProductId}`
      : "/dashboard/masterItem/routing";

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
    router.push(`/dashboard/masterItem?${params.toString()}`);
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
      description="Pilih Proyek untuk melihat daftar Produk dan menyaring Item Pekerjaan."
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
            placeholder="ID atau nama pekerjaan"
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
          {selectedProjectId && selectedProductId ? (
            <Link href={routingHref} className={secondaryButtonClass}>
              Lihat / Atur Alur
            </Link>
          ) : null}
        </div>
      </form>
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

  const availableProducts = useMemo(() => {
    if (!projectId) return [];
    return products.filter((p) => p.project_id === projectId);
  }, [products, projectId]);

  return (
    <SectionCard
      title="Tambah Item Pekerjaan"
      description="Pilih Proyek dan Produk tujuan, lalu isi rincian pekerjaan. Item baru default MANDIRI."
    >
      <form action={saveWorkItem} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <input type="hidden" name="return_project" value={projectId || ""} />
        <input type="hidden" name="return_product" value={productId || ""} />
        <input type="hidden" name="return_q" value={currentQ || ""} />

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

        <Field label="Nama Pekerjaan">
          <input name="name" required placeholder="Contoh: Jahit Badan, Pasang Resleting" className={inputClass} />
        </Field>

        <Field label="Satuan">
          <select name="unit" defaultValue="Pcs" className={selectClass}>
            {ITEM_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Qty Pekerjaan / Produk" hint="Berapa kali pekerjaan ini dilakukan untuk 1 produk">
          <input
            name="qty_per_product"
            type="number"
            min="1"
            step="1"
            defaultValue="1"
            required
            className={inputClass}
          />
        </Field>

        <Field label="Harga Operator (Rp)" hint="Upah borongan yang diterima pekerja">
          <input
            name="operator_price"
            type="number"
            min="0"
            step="50"
            defaultValue="0"
            required
            className={inputClass}
          />
        </Field>

        <Field label="Harga Pengajuan (Rp)" hint="Harga pengajuan ke klien/atasan">
          <input
            name="proposed_price"
            type="number"
            min="0"
            step="50"
            defaultValue="0"
            required
            className={inputClass}
          />
        </Field>

        <Field label="Status">
          <select name="status" defaultValue="AKTIF" className={selectClass}>
            <option value="AKTIF">AKTIF</option>
            <option value="NONAKTIF">NONAKTIF</option>
          </select>
        </Field>

        <div className="md:col-span-2 xl:col-span-3 flex items-center gap-2 pt-2">
          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
            <input type="checkbox" name="output_final" value="1" className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span>Jadikan Output Final Produk ini (Menandakan pekerjaan selesai per unit produk)</span>
          </label>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={!projectId || !productId}
            className={primaryButtonClass}
          >
            Simpan Item Pekerjaan
          </button>
        </div>
      </form>
    </SectionCard>
  );
}
