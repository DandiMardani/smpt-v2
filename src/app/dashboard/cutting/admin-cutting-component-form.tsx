"use client";

import { useMemo, useState } from "react";
import { Field, inputClass, primaryButtonClass } from "@/components/master/master-ui";
import { saveComponent } from "./actions";

type Project = { id: number; project_code: string; name: string };
type Product = { id: number; product_code: string; project_id: number; name: string };
type BomOption = {
  id: number;
  project_id: number;
  product_id: number | null;
  material_id: number | null;
  material_code?: string;
  material_name?: string;
  component_name: string;
  qty_per_unit: number;
  unit: string;
  stock_in_warehouse: number;
};

export function AdminCuttingComponentForm({
  projects,
  products,
  boms,
}: {
  projects: Project[];
  products: Product[];
  boms: BomOption[];
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<number>(() => {
    return projects.length === 1 ? projects[0].id : 0;
  });

  const availableProducts = useMemo(() => {
    if (!selectedProjectId) return [];
    return products.filter((p) => p.project_id === selectedProjectId);
  }, [products, selectedProjectId]);

  const [selectedProductId, setSelectedProductId] = useState<number>(0);

  const availableBoms = useMemo(() => {
    if (!selectedProjectId) return [];
    return boms.filter((b) => {
      if (b.project_id !== selectedProjectId) return false;
      if (selectedProductId && b.product_id && b.product_id !== selectedProductId) return false;
      return true;
    });
  }, [boms, selectedProjectId, selectedProductId]);

  const [selectedBomId, setSelectedBomId] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");

  const selectedBom = useMemo(() => {
    return availableBoms.find((b) => b.id === selectedBomId) || null;
  }, [availableBoms, selectedBomId]);

  return (
    <form action={saveComponent} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* 1. Proyek */}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">1. Proyek</span>
          <select
            name="project_id"
            required
            className={inputClass}
            value={selectedProjectId || ""}
            onChange={(e) => {
              const val = Number(e.target.value) || 0;
              setSelectedProjectId(val);
              setSelectedProductId(0);
              setSelectedBomId(0);
            }}
          >
            <option value="">-- Pilih Proyek --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_code} · {p.name}
              </option>
            ))}
          </select>
        </label>

        {/* 2. Produk / Model Tas */}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">2. Produk / Model Tas</span>
          <select
            name="product_id"
            required
            className={inputClass}
            value={selectedProductId || ""}
            onChange={(e) => {
              const val = Number(e.target.value) || 0;
              setSelectedProductId(val);
              setSelectedBomId(0);
            }}
            disabled={!selectedProjectId || availableProducts.length === 0}
          >
            <option value="">-- Pilih Model Tas --</option>
            {availableProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.product_code} · {p.name}
              </option>
            ))}
          </select>
        </label>

        {/* 3. Pilihan Bahan Baku Kain (BOM) */}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-blue-700 font-bold">
            3. Bahan Kain yang Dipotong (BOM)
          </span>
          <select
            className={`${inputClass} border-blue-300 focus:border-blue-600 font-semibold`}
            value={selectedBomId || ""}
            onChange={(e) => {
              const val = Number(e.target.value) || 0;
              setSelectedBomId(val);
              const found = availableBoms.find((b) => b.id === val);
              if (found) {
                const matText = found.material_code ? `[${found.material_code}] ` : "";
                setNotes(`Bahan: ${matText}${found.material_name || found.component_name}`.trim());
              }
            }}
            disabled={!selectedProductId || availableBoms.length === 0}
          >
            <option value="">-- Pilih Bahan Baku Kain --</option>
            {availableBoms.map((b) => (
              <option key={b.id} value={b.id}>
                {b.material_code ? `${b.material_code} · ` : ""}
                {b.material_name || b.component_name} ({b.qty_per_unit} {b.unit}/tas)
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* KARTU INFO BAHAN & SISA STOK GUDANG REAL-TIME */}
      {selectedBom ? (
        <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/90 to-indigo-50/70 p-3.5 text-xs shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🧵</span>
              <div>
                <b className="text-blue-950 font-bold text-sm">
                  {selectedBom.material_code ? `[${selectedBom.material_code}] ` : ""}
                  {selectedBom.material_name || selectedBom.component_name}
                </b>
                <p className="text-slate-600 mt-0.5">
                  Standar BOM: <span className="font-mono font-bold text-slate-900">{selectedBom.qty_per_unit}</span> {selectedBom.unit} per unit produk
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[11px] font-bold uppercase text-slate-500 block">Sisa Stok di Gudang:</span>
                <span className="font-mono font-black text-sm text-emerald-700">
                  {selectedBom.stock_in_warehouse.toLocaleString("id-ID")} {selectedBom.unit}
                </span>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                selectedBom.stock_in_warehouse > 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
              }`}>
                {selectedBom.stock_in_warehouse > 0 ? "✅ Siap Potong" : "⚠️ Stok Habis"}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* FIELD KOMPONEN CUTTING */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="4. Nama Bagian Pola">
          <input
            name="name"
            placeholder="Contoh: BADAN DEPAN, KANTONG 2X"
            required
            className={inputClass}
          />
        </Field>

        <Field label="5. Qty / Rasio per Produk">
          <input
            name="qty_per_product"
            type="number"
            min="0.0001"
            step="0.0001"
            placeholder="Misal: 1 atau 2 atau 4"
            required
            className={inputClass}
          />
        </Field>

        <Field label="6. Satuan Potong">
          <input
            name="unit"
            defaultValue="PCS"
            required
            className={inputClass}
          />
        </Field>

        <Field label="7. Warna Pola">
          <input
            name="color"
            placeholder="Misal: ABU-ABU, HITAM"
            className={inputClass}
          />
        </Field>

        <Field label="8. Status Komponen">
          <select name="status" className={inputClass}>
            <option value="AKTIF">AKTIF</option>
            <option value="NONAKTIF">NONAKTIF</option>
          </select>
        </Field>

        <Field label="9. Keterangan / Spesifikasi Bahan">
          <input
            name="notes"
            placeholder={selectedBom ? `Bahan: ${selectedBom.material_code || ''} ${selectedBom.material_name || ''}` : "Keterangan pola atau bahan..."}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={inputClass}
          />
        </Field>

        <div className="sm:col-span-2 flex items-end">
          <button className={primaryButtonClass}>
            💾 Simpan Komponen Pola
          </button>
        </div>
      </div>
    </form>
  );
}
