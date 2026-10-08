"use client";

import { useState } from "react";
import { formatNumber } from "@/lib/master/page-utils";
import {
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/master/master-ui";
import { adjustMaterialStock } from "./actions";

export type RawStockItem = {
  id: number;
  material_id: number;
  location_id: number;
  quantity: number | string;
  code?: string;
  name?: string;
  unit?: string;
};

export function RawStockClient({
  items,
  canWrite,
}: {
  items: RawStockItem[];
  canWrite: boolean;
}) {
  const [selectedItem, setSelectedItem] = useState<RawStockItem | null>(null);
  const [actualQty, setActualQty] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const handleOpen = (item: RawStockItem) => {
    setSelectedItem(item);
    setActualQty(String(item.quantity));
    setNotes("");
  };

  const handleClose = () => {
    setSelectedItem(null);
  };

  const currentQtyNum = selectedItem ? Number(selectedItem.quantity) : 0;
  const actualQtyNum = actualQty === "" ? 0 : Number(actualQty);
  const diff = actualQtyNum - currentQtyNum;

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((b) => (
          <div
            key={b.id}
            className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs"
          >
            <div>
              <b className="font-bold text-slate-900">
                {b.code} · {b.name}
              </b>
              <p className="mt-2 text-2xl font-bold text-blue-600">
                {formatNumber(b.quantity)}{" "}
                <span className="text-sm font-normal text-slate-500">
                  {b.unit}
                </span>
              </p>
            </div>

            {canWrite && (
              <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => handleOpen(b)}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
                >
                  Opname / Koreksi
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal Dialog Form Stock Opname */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Stock Opname Material</h3>
            <p className="mt-1 text-sm text-slate-500">
              {selectedItem.code} · {selectedItem.name}
            </p>

            <form action={adjustMaterialStock} className="mt-4 space-y-4">
              <input type="hidden" name="balance_id" value={selectedItem.id} />
              <input type="hidden" name="material_id" value={selectedItem.material_id} />
              <input type="hidden" name="location_id" value={selectedItem.location_id} />
              <input type="hidden" name="current_quantity" value={selectedItem.quantity} />
              <input type="hidden" name="unit" value={selectedItem.unit || ""} />

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">
                  Stok di Sistem Saat Ini
                </label>
                <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-800">
                  {formatNumber(selectedItem.quantity)} {selectedItem.unit}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Stok Fisik Aktual Gudang
                </label>
                <input
                  type="number"
                  step="any"
                  name="actual_quantity"
                  required
                  value={actualQty}
                  onChange={(e) => setActualQty(e.target.value)}
                  className={inputClass}
                  placeholder="Masukkan hitungan fisik riil..."
                />
              </div>

              <div className="rounded-lg bg-blue-50/70 p-3 text-xs text-slate-700">
                <span>Selisih Penyesuaian: </span>
                <b
                  className={
                    diff < 0
                      ? "text-red-600 font-bold"
                      : diff > 0
                      ? "text-emerald-600 font-bold"
                      : "text-slate-600"
                  }
                >
                  {diff > 0 ? `+${diff}` : diff} {selectedItem.unit}
                </b>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Alasan Penyesuaian / Catatan
                </label>
                <textarea
                  rows={2}
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contoh: Selisih susut kain potong, koreksi timbang ulang..."
                  className={inputClass}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className={secondaryButtonClass}
                >
                  Batal
                </button>
                <button type="submit" className={primaryButtonClass}>
                  Simpan Penyesuaian
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
