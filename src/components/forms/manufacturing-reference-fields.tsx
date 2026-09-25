"use client";

import { useMemo, useState, type ReactNode } from "react";

type ProjectOption = { id: number; name: string };
type ProductOption = { id: number; project_id: number; name: string };
type FinishedGoodOption = {
  id: number;
  project_id: number;
  product_id: number | null;
  finished_good_code: string;
  name: string;
};

type Props = {
  projects: ProjectOption[];
  products: ProductOption[];
  finishedGoods: FinishedGoodOption[];
  className: string;
};

function Label({ text, children, help }: { text: string; children: ReactNode; help?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-400">{text}</span>
      {children}
      {help ? <span className="mt-1 block text-xs text-slate-500">{help}</span> : null}
    </label>
  );
}

export function ManufacturingReferenceFields({ projects, products, finishedGoods, className }: Props) {
  const [projectId, setProjectId] = useState("");
  const [productId, setProductId] = useState("");
  const [finishedGoodId, setFinishedGoodId] = useState("");

  const scopedProducts = useMemo(
    () => (projectId ? products.filter((row) => row.project_id === Number(projectId)) : []),
    [projectId, products],
  );

  const scopedFinishedGoods = useMemo(() => {
    if (!projectId) return finishedGoods;
    return finishedGoods.filter((row) => {
      if (row.project_id !== Number(projectId)) return false;
      if (!productId) return true;
      return row.product_id === Number(productId) || row.product_id === null;
    });
  }, [projectId, productId, finishedGoods]);

  return (
    <>
      <Label text="Proyek">
        <select
          name="project_id"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setProductId("");
            setFinishedGoodId("");
          }}
          className={className}
        >
          <option value="">-</option>
          {projects.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </Label>

      <Label text="Produk" help={!projectId ? "Pilih Proyek bila transaksi terkait Produk." : scopedProducts.length ? undefined : "Proyek ini belum memiliki Produk aktif."}>
        <select
          name="product_id"
          value={productId}
          onChange={(event) => {
            setProductId(event.target.value);
            setFinishedGoodId("");
          }}
          disabled={!projectId}
          className={className}
        >
          <option value="">-</option>
          {scopedProducts.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </Label>

      <Label
        text="Barang Jadi"
        help={projectId && scopedFinishedGoods.length === 0 ? "Tidak ada Barang Jadi aktif yang sesuai Proyek/Produk yang dipilih." : undefined}
      >
        <select name="finished_good_id" value={finishedGoodId} onChange={(event) => setFinishedGoodId(event.target.value)} className={className}>
          <option value="">-</option>
          {scopedFinishedGoods.map((row) => (
            <option key={row.id} value={row.id}>{row.finished_good_code} · {row.name}</option>
          ))}
        </select>
      </Label>
    </>
  );
}
