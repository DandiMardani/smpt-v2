"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "@/components/final/final-ui";

export type ManualProjectOption = { id: number; code: string; name: string };
export type ManualProductOption = { id: number; projectId: number; code: string; name: string };
export type ManualItemOption = {
  id: number;
  projectId: number;
  productId: number | null;
  code: string;
  name: string;
  unit: string;
  proposedPrice: number;
  executorScope: string;
  submissionCategory: string;
  eligible: boolean;
};
export type ManualWorkerOption = { id: number; code: string; name: string; department: string | null; position: string | null };

type Props = {
  projects: ManualProjectOption[];
  products: ManualProductOption[];
  items: ManualItemOption[];
  workers: ManualWorkerOption[];
};

export function ManualResultFields({ projects, products, items, workers }: Props) {
  const [projectId, setProjectId] = useState("");
  const [productId, setProductId] = useState("");
  const [itemId, setItemId] = useState("");

  const filteredProducts = useMemo(() => {
    const id = Number(projectId);
    return id ? products.filter((item) => item.projectId === id) : [];
  }, [projectId, products]);

  const filteredItems = useMemo(() => {
    const pId = Number(projectId);
    const product = Number(productId);
    return pId && product ? items.filter((item) => item.projectId === pId && (item.productId === product || item.productId == null)) : [];
  }, [projectId, productId, items]);

  const eligibleItems = useMemo(() => filteredItems.filter((item) => item.eligible && item.productId != null), [filteredItems]);

  const selectedItem = items.find((item) => item.id === Number(itemId));

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
            setItemId("");
          }}
          className={inputClass}
        >
          <option value="">Pilih proyek</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
        </select>
      </Field>

      <Field label="Produk/Tas">
        <select
          name="product_id"
          required
          value={productId}
          onChange={(event) => {
            setProductId(event.target.value);
            setItemId("");
          }}
          disabled={!projectId}
          className={inputClass}
        >
          <option value="">{projectId ? "Pilih Produk/Tas" : "Pilih proyek terlebih dahulu"}</option>
          {filteredProducts.map((product) => <option key={product.id} value={product.id}>{product.code} · {product.name}</option>)}
        </select>
      </Field>

      <Field label="Item Pekerjaan HARIAN / KEDUANYA">
        <select
          name="work_item_id"
          required
          value={itemId}
          onChange={(event) => setItemId(event.target.value)}
          disabled={!productId}
          className={inputClass}
        >
          <option value="">{!productId ? "Pilih Produk/Tas terlebih dahulu" : eligibleItems.length ? "Pilih item pekerjaan" : "Belum ada item eligible HARIAN → BORONGAN"}</option>
          {filteredItems.map((item) => (
            <option key={item.id} value={item.id} disabled={!item.eligible || item.productId == null}>
              {item.code} · {item.name}{item.productId == null ? " · BELUM TERIKAT PRODUK" : ""} · {item.executorScope.replaceAll("_", " ")} · Pengajuan {item.submissionCategory.replaceAll("_", " ")}{item.eligible && item.productId != null ? "" : " · BELUM ELIGIBLE"}
            </option>
          ))}
        </select>
        {productId && filteredItems.length === 0 ? <span className="mt-1 block text-xs text-amber-300">Produk/Tas ini belum mempunyai Item Pekerjaan aktif.</span> : null}
        {productId && filteredItems.length > 0 && eligibleItems.length === 0 ? <span className="mt-1 block text-xs text-amber-300">Item ada, tetapi belum ada yang dikonfigurasi Pelaksana PEKERJA HARIAN/KEDUANYA + Pengajuan BORONGAN di Master Item Pekerjaan.</span> : null}
        {selectedItem ? <span className="mt-1 block text-xs text-slate-500">Harga Pengajuan snapshot Rp {selectedItem.proposedPrice.toLocaleString("id-ID")} / {selectedItem.unit}. Nilai operator HARIAN tetap 0.</span> : null}
      </Field>

      <Field label="Pekerja HARIAN">
        <select name="worker_id" required className={inputClass}>
          <option value="">{workers.length ? "Pilih pekerja" : "Belum ada pekerja HARIAN aktif"}</option>
          {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.code} · {worker.name} · {worker.position || worker.department || "-"}</option>)}
        </select>
        {workers.length === 0 ? <span className="mt-1 block text-xs text-amber-300">Tidak ada Pekerja HARIAN aktif yang terlihat. Pastikan Master Pekerja memakai Sistem Upah HARIAN dan migration dropdown terbaru sudah diterapkan.</span> : null}
      </Field>
    </>
  );
}
