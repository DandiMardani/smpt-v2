"use client";

import { useMemo, useState } from "react";
import { Field, inputClass, primaryButtonClass, SectionCard } from "@/components/master/master-ui";
import { recordResult } from "./actions";

type Project = { id: number; project_code: string; name: string };
type Product = { id: number; product_code: string; project_id: number; name: string };
type Component = {
  id: number;
  component_code: string;
  project_id: number;
  product_id: number | null;
  name: string;
  qty_per_product: number | string;
  unit: string;
  color: string;
  notes?: string | null;
  status: string;
};

export function CuttingDailyResultForm({
  projects,
  products,
  components,
  defaultOfficer,
}: {
  projects: Project[];
  products: Product[];
  components: Component[];
  defaultOfficer: string;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<number>(() => {
    return projects.length === 1 ? projects[0].id : 0;
  });

  const availableProducts = useMemo(() => {
    if (!selectedProjectId) return [];
    return products.filter((p) => p.project_id === selectedProjectId);
  }, [products, selectedProjectId]);

  const [selectedProductId, setSelectedProductId] = useState<number>(0);
  const [selectedComponentId, setSelectedComponentId] = useState<number>(0);

  const availableComponents = useMemo(() => {
    return components.filter((c) => {
      if (c.status !== "AKTIF") return false;
      if (selectedProjectId && c.project_id !== selectedProjectId) return false;
      if (selectedProductId && c.product_id && c.product_id !== selectedProductId) return false;
      return true;
    });
  }, [components, selectedProjectId, selectedProductId]);

  const selectedComponent = useMemo(() => {
    return availableComponents.find((c) => c.id === selectedComponentId) || null;
  }, [availableComponents, selectedComponentId]);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  return (
    <SectionCard
      title="✂️ Input Hasil Cutting Harian"
      description="Operator cukup memilih proyek & komponen, lalu masukkan jumlah potong hari ini."
    >
      <form action={recordResult} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="1. Proyek">
          <select
            className={inputClass}
            value={selectedProjectId || ""}
            onChange={(e) => {
              const val = Number(e.target.value) || 0;
              setSelectedProjectId(val);
              setSelectedProductId(0);
              setSelectedComponentId(0);
            }}
          >
            <option value="">-- Semua / Pilih Proyek --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_code} · {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="2. Produk / Model">
          <select
            className={inputClass}
            value={selectedProductId || ""}
            onChange={(e) => {
              setSelectedProductId(Number(e.target.value) || 0);
              setSelectedComponentId(0);
            }}
            disabled={!selectedProjectId || availableProducts.length === 0}
          >
            <option value="">-- Semua Produk --</option>
            {availableProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.product_code} · {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="3. Komponen / Bagian Potong">
          <select
            name="component_id"
            required
            value={selectedComponentId || ""}
            onChange={(e) => setSelectedComponentId(Number(e.target.value) || 0)}
            className={`${inputClass} font-semibold text-blue-900`}
          >
            <option value="">-- Pilih Komponen Potong --</option>
            {availableComponents.map((c) => (
              <option key={c.id} value={c.id}>
                {c.component_code} · {c.name} {c.color ? `(${c.color})` : ""} · {c.unit}
              </option>
            ))}
          </select>
        </Field>

        {selectedComponent ? (
          <div className="sm:col-span-2 lg:col-span-4 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/90 to-indigo-50/70 p-3 text-xs flex flex-wrap items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-xl">🧵</span>
              <div>
                <b className="text-blue-950 font-bold text-xs">
                  {selectedComponent.name} {selectedComponent.color ? `(${selectedComponent.color})` : ""}
                </b>
                {selectedComponent.notes ? (
                  <p className="text-slate-600 mt-0.5">{selectedComponent.notes}</p>
                ) : null}
              </div>
            </div>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">
              Rasio Kebutuhan: {selectedComponent.qty_per_product} {selectedComponent.unit} per unit tas
            </span>
          </div>
        ) : null}

        <Field label="4. Tanggal Potong">
          <input name="result_date" type="date" defaultValue={todayStr} required className={inputClass} />
        </Field>

        <Field label="5. Jumlah Hasil Baik (Pcs)">
          <input
            name="good_qty"
            type="number"
            min="0"
            step="0.0001"
            placeholder="0"
            required
            className={`${inputClass} font-mono font-bold text-base text-emerald-700`}
          />
        </Field>

        <Field label="6. Reject / Cacat (Pcs)">
          <input
            name="reject_qty"
            type="number"
            min="0"
            step="0.0001"
            defaultValue="0"
            className={`${inputClass} font-mono text-rose-700`}
          />
        </Field>

        <Field label="7. Petugas Operator">
          <input
            name="officer"
            defaultValue={defaultOfficer}
            required
            placeholder="Nama operator pemotong"
            className={inputClass}
          />
        </Field>

        <Field label="8. Keterangan (Opsional)">
          <input name="notes" placeholder="Contoh: Sesi Pagi / Meja 1" className={inputClass} />
        </Field>

        <div className="sm:col-span-2 lg:col-span-4 flex justify-end pt-2">
          <button
            type="submit"
            className={`${primaryButtonClass} w-full sm:w-auto px-8 py-3 text-sm font-black shadow-md flex items-center justify-center gap-2`}
          >
            <span>✂️</span>
            <span>Simpan Hasil Potong</span>
          </button>
        </div>
      </form>
    </SectionCard>
  );
}
