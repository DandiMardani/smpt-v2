"use client";

import { useMemo, useState, type ReactNode } from "react";

type ProjectOption = { id: number; name: string; code?: string | null };
type ProductOption = { id: number; project_id: number; name: string; code?: string | null };
type BomOption = { id: number; project_id: number; product_id: number | null; label: string };

type PairProps = {
  projects: ProjectOption[];
  products: ProductOption[];
  className: string;
  projectRequired?: boolean;
  productRequired?: boolean;
  productEmptyLabel?: string;
};

function Wrap({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-400">{label}</span>{children}{help ? <span className="mt-1 block text-xs text-slate-500">{help}</span> : null}</label>;
}

export function ProjectProductFields({ projects, products, className, projectRequired = true, productRequired = true, productEmptyLabel = "Umum proyek" }: PairProps) {
  const [projectId, setProjectId] = useState("");
  const [productId, setProductId] = useState("");
  const filteredProducts = useMemo(() => products.filter((x) => x.project_id === Number(projectId)), [projectId, products]);
  return <>
    <Wrap label="Proyek">
      <select name="project_id" required={projectRequired} value={projectId} onChange={(e) => { setProjectId(e.target.value); setProductId(""); }} className={className}>
        <option value="">{projectRequired ? "Pilih proyek" : "-"}</option>
        {projects.map((x) => <option key={x.id} value={x.id}>{x.code ? `${x.code} · ` : ""}{x.name}</option>)}
      </select>
    </Wrap>
    <Wrap label="Produk" help={!projectId ? "Pilih proyek terlebih dahulu." : filteredProducts.length ? `${filteredProducts.length} Produk tersedia.` : "Proyek ini belum memiliki Produk aktif."}>
      <select name="product_id" required={productRequired} value={productId} onChange={(e) => setProductId(e.target.value)} disabled={!projectId} className={className}>
        <option value="">{!projectId ? "Pilih proyek terlebih dahulu" : productRequired ? "Pilih Produk" : productEmptyLabel}</option>
        {filteredProducts.map((x) => <option key={x.id} value={x.id}>{x.code ? `${x.code} · ` : ""}{x.name}</option>)}
      </select>
    </Wrap>
  </>;
}

export function ProjectProductBomFields({ projects, products, boms, className, productRequired = false }: PairProps & { boms: BomOption[] }) {
  const [projectId, setProjectId] = useState("");
  const [productId, setProductId] = useState("");
  const [bomId, setBomId] = useState("");
  const filteredProducts = useMemo(() => products.filter((x) => x.project_id === Number(projectId)), [projectId, products]);
  const filteredBoms = useMemo(() => boms.filter((x) => x.project_id === Number(projectId) && (x.product_id === null || (productId && x.product_id === Number(productId)))), [projectId, productId, boms]);
  return <>
    <Wrap label="Proyek">
      <select name="project_id" required value={projectId} onChange={(e) => { setProjectId(e.target.value); setProductId(""); setBomId(""); }} className={className}>
        <option value="">Pilih proyek</option>{projects.map((x) => <option key={x.id} value={x.id}>{x.code ? `${x.code} · ` : ""}{x.name}</option>)}
      </select>
    </Wrap>
    <Wrap label="Produk" help={!projectId ? "Pilih proyek terlebih dahulu." : undefined}>
      <select name="product_id" required={productRequired} value={productId} onChange={(e) => { setProductId(e.target.value); setBomId(""); }} disabled={!projectId} className={className}>
        <option value="">{productRequired ? "Pilih Produk" : "Umum proyek"}</option>{filteredProducts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    </Wrap>
    <Wrap label="Bahan / BOM" help={projectId && filteredBoms.length === 0 ? "Tidak ada BOM aktif yang sesuai pilihan proyek/produk." : undefined}>
      <select name="bom_requirement_id" required value={bomId} onChange={(e) => setBomId(e.target.value)} disabled={!projectId} className={className}>
        <option value="">Pilih bahan</option>{filteredBoms.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
      </select>
    </Wrap>
  </>;
}
