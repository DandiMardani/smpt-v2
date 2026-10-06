"use client";

import { useMemo, useState } from "react";
import { Field, inputClass, primaryButtonClass } from "@/components/master/master-ui";
import { formatNumber } from "@/lib/master/page-utils";

export type SablonCompItem = {
  id: number;
  component_code: string;
  name: string;
  color: string;
  unit: string;
  product_id: number | null;
  product_name?: string;
  qtyInSablon?: number;
};

export function SablonReceiptForm({
  components,
  action,
}: {
  components: SablonCompItem[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [selectedCompId, setSelectedCompId] = useState<number>(0);
  const selectedComp = useMemo(() => components.find((c) => c.id === selectedCompId), [components, selectedCompId]);
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="component_id" value={selectedCompId || ""} />
      <input type="hidden" name="product_id" value={selectedComp?.product_id ?? ""} />

      <Field label="Tanggal Masuk / Terima">
        <input name="receipt_date" type="date" defaultValue={todayStr} required className={inputClass} />
      </Field>

      <Field label="Komponen Hasil Sablon">
        <select
          value={selectedCompId || ""}
          onChange={(e) => setSelectedCompId(Number(e.target.value) || 0)}
          required
          className={`${inputClass} font-semibold`}
        >
          <option value="">-- Pilih Komponen Sablon --</option>
          {components.map((c) => (
            <option key={c.id} value={c.id}>
              {c.component_code} · {c.name} {c.color ? `(${c.color})` : ""}
              {c.product_name ? ` · ${c.product_name}` : ""}
              {c.qtyInSablon !== undefined ? ` [Di Sablon: ${formatNumber(c.qtyInSablon)} ${c.unit}]` : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field label={`Jumlah Diterima (${selectedComp?.unit || "Pcs"})`}>
        <input
          name="quantity"
          type="number"
          min="0.0001"
          step="0.0001"
          placeholder="0"
          required
          className={`${inputClass} font-mono font-bold text-emerald-700`}
        />
      </Field>

      <Field label="Keterangan / No. Surat Jalan">
        <input
          name="notes"
          placeholder="Contoh: Kiriman dari Buaran Surat Jalan #12"
          className={inputClass}
        />
      </Field>

      <div className="sm:col-span-2 lg:col-span-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-500">
          💡 Hasil sablon yang diterima akan otomatis masuk ke <b>Gudang Hasil (WIP)</b> dengan status <b>"Selesai Sablon"</b>.
        </p>
        <button
          type="submit"
          disabled={!selectedCompId}
          className={`${primaryButtonClass} px-6 py-2.5 text-xs font-bold shadow-md flex items-center gap-1.5`}
        >
          <span>📥</span>
          <span>Terima Masuk ke Gudang Hasil</span>
        </button>
      </div>
    </form>
  );
}
