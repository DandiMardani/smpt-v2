"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "@/components/final/final-ui";

type ProjectOption = {
  id: number;
  name: string;
};

type ProductOption = {
  id: number;
  project_id: number;
  name: string;
};

type Props = {
  projects: ProjectOption[];
  products: ProductOption[];
};

export function SpkProjectProductFields({ projects, products }: Props) {
  const [projectId, setProjectId] = useState("");
  const [productId, setProductId] = useState("");

  const filteredProducts = useMemo(() => {
    const selectedProjectId = Number(projectId);
    if (!selectedProjectId) return [];
    return products.filter((item) => item.project_id === selectedProjectId);
  }, [projectId, products]);

  const hasSelectedProject = Boolean(projectId);
  const hasProducts = filteredProducts.length > 0;

  return (
    <>
      <Field label="Proyek">
        <select
          name="project_id"
          required
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setProductId("");
          }}
          className={inputClass}
        >
          <option value="">Pilih proyek</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Produk/Tas">
        <select
          name="product_id"
          required
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
          disabled={!hasSelectedProject || !hasProducts}
          className={inputClass}
          aria-describedby="spk-product-help"
        >
          <option value="">
            {!hasSelectedProject
              ? "Pilih proyek terlebih dahulu"
              : hasProducts
                ? "Pilih Produk/Tas"
                : "Produk/Tas aktif tidak tersedia"}
          </option>
          {filteredProducts.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <span id="spk-product-help" className="mt-1 block text-xs text-slate-500">
          {!hasSelectedProject
            ? "Produk/Tas akan tersedia setelah proyek dipilih."
            : hasProducts
              ? `${filteredProducts.length} Produk/Tas aktif tersedia untuk proyek ini.`
              : "Proyek ini belum memiliki Produk/Tas aktif. Tambahkan atau aktifkan Produk/Tas pada Master Produk/Tas Proyek."}
        </span>
      </Field>
    </>
  );
}
