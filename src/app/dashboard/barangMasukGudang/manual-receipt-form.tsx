"use client";

import { useMemo, useState } from "react";
import { Field, inputClass, primaryButtonClass } from "@/components/master/master-ui";
import { formatNumber } from "@/lib/master/page-utils";

type Material = {
  id: number;
  material_code: string;
  name: string;
  standard_unit: string;
};

type OpenPoLine = {
  purchase_order_line_id: number;
  purchase_order_id: number;
  po_number: string;
  supplier_name: string;
  material_id: number;
  material_code: string;
  material_name: string;
  ordered_quantity: number | string;
  purchase_unit: string;
  conversion_factor: number | string;
  ordered_stock_quantity: number | string;
  stock_unit: string;
  received_stock_quantity: number | string;
  outstanding_stock_quantity: number | string;
  lot_tracking_mode: string;
};

export function ManualReceiptForm({
  materials,
  openPoLines,
  units,
  action,
}: {
  materials: Material[];
  openPoLines: OpenPoLine[];
  units: string[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [selectedMaterialId, setSelectedMaterialId] = useState<number>(0);
  const [nonPoConfirmed, setNonPoConfirmed] = useState(false);

  const matchingPo = useMemo(() => {
    if (!selectedMaterialId) return [];
    return openPoLines.filter((po) => po.material_id === selectedMaterialId);
  }, [openPoLines, selectedMaterialId]);

  const hasOpenPo = matchingPo.length > 0;
  const canSubmit = !hasOpenPo || nonPoConfirmed;

  return (
    <form action={action} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Field label="Tanggal">
        <input
          name="receipt_date"
          type="date"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
          className={inputClass}
        />
      </Field>

      <Field label="Bahan">
        <select
          name="material_id"
          required
          className={inputClass}
          value={selectedMaterialId || ""}
          onChange={(e) => {
            setSelectedMaterialId(Number(e.target.value) || 0);
            setNonPoConfirmed(false);
          }}
        >
          <option value="">Pilih bahan</option>
          {materials.map((material) => (
            <option key={material.id} value={material.id}>
              {material.material_code} · {material.name} · stok {material.standard_unit}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Qty Diterima">
        <input
          name="quantity"
          type="number"
          min="0.0001"
          step="0.0001"
          required
          placeholder="0"
          className={`${inputClass} font-mono font-bold text-blue-700`}
        />
      </Field>

      <Field label="Satuan Transaksi">
        <select name="input_unit" className={inputClass} defaultValue="">
          <option value="">Sama dengan satuan stok</option>
          {units.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Faktor → Satuan Stok">
        <input
          name="conversion_factor"
          type="number"
          min="0.00000001"
          step="0.00000001"
          className={inputClass}
          placeholder="Opsional; contoh 50 untuk 1 ROLL = 50 METER"
        />
      </Field>

      <Field label="Supplier">
        <input
          name="supplier"
          className={inputClass}
          placeholder="Nama toko / supplier tunai"
        />
      </Field>

      <Field label="No Dokumen / Nota">
        <input
          name="document_no"
          className={inputClass}
          placeholder="Nomor surat jalan / nota beli"
        />
      </Field>

      <Field label="Keterangan">
        <input
          name="notes"
          className={inputClass}
          placeholder="Catatan penerimaan barang"
        />
      </Field>

      {/* Peringatan Kritis Jika Bahan Memiliki PO Terbuka */}
      {hasOpenPo ? (
        <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 shadow-xs">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2.5 max-w-2xl">
              <span className="text-xl">⚠️</span>
              <div>
                <b className="font-bold text-amber-950">
                  Bahan Ini Tercatat Dalam PO Terbuka ({matchingPo[0].po_number})!
                </b>
                <p className="text-amber-800 mt-1 leading-5">
                  Supplier <b>{matchingPo[0].supplier_name}</b> memiliki order untuk bahan ini (Sisa outstanding:{" "}
                  <b>
                    {formatNumber(matchingPo[0].outstanding_stock_quantity)}{" "}
                    {matchingPo[0].stock_unit}
                  </b>
                  ). Penerimaan barang ini <b>wajib melalui kartu Receive From PO di atas</b> agar status PO terselesaikan dan stok tidak dobel.
                </p>
              </div>
            </div>
            <a
              href="#kartu-penerimaan-po"
              className="rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition shadow-2xs whitespace-nowrap"
            >
              ➔ Terima Melalui PO di Atas
            </a>
          </div>

          <div className="mt-3 pt-3 border-t border-amber-200/80 flex items-center gap-2">
            <input
              type="checkbox"
              id="confirm-non-po"
              checked={nonPoConfirmed}
              onChange={(e) => setNonPoConfirmed(e.target.checked)}
              className="h-4 w-4 rounded border-amber-400 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <label
              htmlFor="confirm-non-po"
              className="font-medium text-amber-900 cursor-pointer select-none"
            >
              Saya mengonfirmasi ini adalah <b>Pembelian Tunai / Tambahan Langsung Non-PO</b> (Bukan kiriman dari PO terbuka di atas)
            </label>
          </div>
        </div>
      ) : null}

      <div className="md:col-span-2 xl:col-span-3 flex justify-end pt-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className={`${primaryButtonClass} px-8 py-2.5 text-sm font-bold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Simpan Barang Masuk Manual (Non-PO)
        </button>
      </div>
    </form>
  );
}
