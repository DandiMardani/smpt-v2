"use client";

import { useState } from "react";
import { secondaryClass } from "@/components/final/final-ui";

const GROUPS = [
  ["PROCUREMENT", "Procurement + raw stock flow"],
  ["RAW_MATERIAL_FLOW", "Gudang / Cutting / WIP + PO terkait"],
  ["PRODUCTION_QC_LOGISTICS", "SPK / Checker / QC / FG / Packing / Shipment"],
  ["HR_FINANCE", "Attendance / Payroll / Finance"],
] as const;

export function ResetGroupSelector() {
  const [selected, setSelected] = useState<string[]>([]);
  const allSelected = selected.length === GROUPS.length;

  function toggle(value: string, checked: boolean) {
    setSelected((current) => checked ? [...new Set([...current, value])] : current.filter((item) => item !== value));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryClass} onClick={() => setSelected(GROUPS.map(([value]) => value))} disabled={allSelected}>Select All</button>
        <button type="button" className={secondaryClass} onClick={() => setSelected([])} disabled={!selected.length}>Clear All</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 text-sm text-slate-700">
        {GROUPS.map(([value, label]) => (
          <label key={value} className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs hover:bg-slate-50 transition cursor-pointer">
            <input
              type="checkbox"
              name="groups"
              value={value}
              checked={selected.includes(value)}
              onChange={(event) => toggle(value, event.currentTarget.checked)}
              className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="font-medium text-slate-800">{label}</span>
          </label>
        ))}
      </div>
      <select
        name="_group_validation"
        value={selected.length ? "ok" : ""}
        onChange={() => undefined}
        required
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-field-label="Kelompok Reset"
        data-validation-message="Pilih minimal satu kelompok data untuk Selective Reset."
      >
        <option value="">Belum dipilih</option>
        <option value="ok">Sudah dipilih</option>
      </select>
    </div>
  );
}
