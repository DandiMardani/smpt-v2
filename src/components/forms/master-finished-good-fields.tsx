"use client";

import { useMemo, useState } from "react";

type Project = { id: number; name: string };
type Product = { id: number; project_id: number; name: string };
type WorkItem = { id: number; project_id: number; product_id: number | null; name: string; output_final?: boolean };

type Props = {
  projects: Project[];
  products: Product[];
  workItems: WorkItem[];
  className: string;
};

export function MasterFinishedGoodFields({ projects, products, workItems, className }: Props) {
  const [projectId, setProjectId] = useState("");
  const [productId, setProductId] = useState("");

  const ps = useMemo(() => (projectId ? products.filter((x) => x.project_id === Number(projectId)) : []), [products, projectId]);
  const ws = useMemo(() => (projectId && productId ? workItems.filter((x) => x.project_id === Number(projectId) && x.product_id === Number(productId)) : []), [workItems, projectId, productId]);

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-400">Proyek (Opsional)</span>
        <select
          name="project_id"
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setProductId("");
          }}
          className={className}
        >
          <option value="">Umum / Tanpa Proyek (Stok Bebas)</option>
          {projects.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-400">Produk</span>
        <select
          name="product_id"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          disabled={!projectId}
          className={className}
        >
          <option value="">{projectId ? "Pilih Produk (Opsional)" : "- (Tanpa Proyek)"}</option>
          {ps.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-slate-400">Output Final (SPK)</span>
        <select name="final_work_item_id" className={className} disabled={!productId}>
          <option value="">-</option>
          {ws.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {x.output_final ? " · OUTPUT FINAL" : ""}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-slate-500">Tautkan ke SPK jika hasil jahitan akhir internal.</span>
      </label>
    </>
  );
}
