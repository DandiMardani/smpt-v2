"use client";

import { useMemo, useState } from "react";
import { Field, buttonClass, inputClass } from "@/components/final/final-ui";

type ProjectOption = {
  id: number;
  project_code?: string;
  name: string;
};

type ProductOption = {
  id: number;
  project_id: number;
  product_code?: string;
  name: string;
};

type Props = {
  projects: ProjectOption[];
  products: ProductOption[];
  initialProjectId: number;
  initialProductId: number;
};

export function MasterRoutingFilter({
  projects,
  products,
  initialProjectId,
  initialProductId,
}: Props) {
  const [projectId, setProjectId] = useState<string>(
    initialProjectId ? String(initialProjectId) : ""
  );
  const [productId, setProductId] = useState<string>(
    initialProductId ? String(initialProductId) : ""
  );

  const filteredProducts = useMemo(() => {
    if (!projectId) return products;
    return products.filter((p) => p.project_id === Number(projectId));
  }, [projectId, products]);

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextProjectId = e.target.value;
    setProjectId(nextProjectId);
    // If the currently selected product does not belong to the selected project, reset it
    if (productId) {
      const match = products.find(
        (p) => p.id === Number(productId) && (!nextProjectId || p.project_id === Number(nextProjectId))
      );
      if (!match) {
        setProductId("");
      }
    }
  };

  const handleProductChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextProductId = e.target.value;
    setProductId(nextProductId);
    // If project is not set, auto-fill project from product
    if (nextProductId && !projectId) {
      const p = products.find((x) => x.id === Number(nextProductId));
      if (p) setProjectId(String(p.project_id));
    }
  };

  return (
    <form method="get" className="grid gap-3 md:grid-cols-3">
      <Field label="Proyek">
        <select
          name="project"
          value={projectId}
          onChange={handleProjectChange}
          className={inputClass}
        >
          <option value="">Semua Proyek</option>
          {projects.map((x) => (
            <option key={x.id} value={x.id}>
              {x.project_code ? `${x.project_code} · ` : ""}
              {x.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Produk">
        <select
          name="product"
          value={productId}
          onChange={handleProductChange}
          className={inputClass}
          required
        >
          <option value="">
            {projectId
              ? filteredProducts.length
                ? "Pilih Produk"
                : "Tidak ada Produk aktif pada proyek ini"
              : "Pilih Produk"}
          </option>
          {filteredProducts.map((x) => (
            <option key={x.id} value={x.id}>
              {x.product_code ? `${x.product_code} · ` : ""}
              {x.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex items-end">
        <button className={buttonClass}>Buka Alur</button>
      </div>
    </form>
  );
}
