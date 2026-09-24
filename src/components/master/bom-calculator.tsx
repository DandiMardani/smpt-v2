"use client";

import { useEffect, useMemo, useState } from "react";
import { convertLength, isPiecesUnit, roundQty, toMeter } from "@/lib/units/conversion";

type CalcType = "SHEET" | "LENGTH" | "PCS" | "ROLL_LENGTH";
type Method = "SAMPLE" | "CONSUMPTION" | "MARKER";
type ComponentRow = { name: string; length: number; lengthUnit: string; width: number; widthUnit: string; qty: number };

type MaterialContext = { id: string; name: string; unit: string; calculationType: CalcType };

type Props = {
  projectLabel: string;
  productLabel: string;
  targetProduct: number;
  materialSelectId: string;
  targetInputId: string;
};

const lengthUnits = ["mm", "cm", "meter", "inch", "yard"];

function num(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyless(value: number, decimals = 4) {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: decimals }).format(value || 0);
}

export function BomCalculator({ projectLabel, productLabel, targetProduct, materialSelectId, targetInputId }: Props) {
  const [material, setMaterial] = useState<MaterialContext | null>(null);
  const [method, setMethod] = useState<Method>("SAMPLE");
  const [components, setComponents] = useState<ComponentRow[]>([
    { name: "Komponen 1", length: 0, lengthUnit: "cm", width: 0, widthUnit: "cm", qty: 1 },
  ]);
  const [materialWidth, setMaterialWidth] = useState(150);
  const [materialWidthUnit, setMaterialWidthUnit] = useState("cm");
  const [usageDirect, setUsageDirect] = useState(0);
  const [usageUnit, setUsageUnit] = useState("meter");
  const [markerLength, setMarkerLength] = useState(0);
  const [markerUnit, setMarkerUnit] = useState("meter");
  const [markerYield, setMarkerYield] = useState(1);
  const [allowance, setAllowance] = useState(0.2);
  const [wasteEnabled, setWasteEnabled] = useState(false);
  const [waste, setWaste] = useState(0);
  const [estimatedRollLength, setEstimatedRollLength] = useState(0);
  const [estimatedRollUnit, setEstimatedRollUnit] = useState("meter");
  const [applied, setApplied] = useState<null | { method: Method; snapshot: string }>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const select = document.getElementById(materialSelectId) as HTMLSelectElement | null;
    if (!select) return;
    const sync = () => {
      const option = select.options[select.selectedIndex];
      if (!option?.value) {
        setMaterial(null);
        return;
      }
      const rawType = String(option.dataset.calculationType || "LENGTH").toUpperCase();
      const calculationType = (["SHEET", "LENGTH", "PCS", "ROLL_LENGTH"].includes(rawType) ? rawType : "LENGTH") as CalcType;
      setMaterial({ id: option.value, name: option.dataset.name || option.textContent || "Bahan", unit: option.dataset.unit || "Meter", calculationType });
      setUsageUnit(isPiecesUnit(option.dataset.unit || "") ? "pcs" : "meter");
    };
    sync();
    select.addEventListener("change", sync);
    return () => select.removeEventListener("change", sync);
  }, [materialSelectId]);

  const preview = useMemo(() => {
    try {
      if (!material || targetProduct <= 0) return { totalAreaM2: 0, netUsage: 0, netRequirement: 0, allowanceQty: 0, wasteQty: 0, finalRequirement: 0, effectivePerProduct: 0, estimatedRolls: 0, calcError: "" };

      let totalAreaM2 = 0;
      let netUsage = 0;
      const type = material.calculationType;

      if (method === "SAMPLE") {
        if (type === "PCS") {
          netUsage = components.reduce((sum, row) => sum + Math.max(0, num(row.qty)), 0);
        } else if (type === "SHEET") {
          totalAreaM2 = components.reduce((sum, row) => {
            const length = toMeter(Math.max(0, num(row.length)), row.lengthUnit);
            const width = toMeter(Math.max(0, num(row.width)), row.widthUnit);
            return sum + length * width * Math.max(0, num(row.qty));
          }, 0);
          const widthM = toMeter(Math.max(0, materialWidth), materialWidthUnit);
          if (totalAreaM2 > 0 && widthM <= 0) throw new Error("Lebar material harus lebih dari 0.");
          const meters = widthM > 0 ? totalAreaM2 / widthM : 0;
          netUsage = convertLength(meters, "meter", material.unit);
        } else {
          const meters = components.reduce((sum, row) => {
            const length = toMeter(Math.max(0, num(row.length)), row.lengthUnit);
            return sum + length * Math.max(0, num(row.qty));
          }, 0);
          netUsage = convertLength(meters, "meter", material.unit);
        }
      } else if (method === "CONSUMPTION") {
        netUsage = type === "PCS" ? Math.max(0, usageDirect) : convertLength(Math.max(0, usageDirect), usageUnit, material.unit);
      } else {
        if (type === "PCS") throw new Error("Marker Cutting tidak digunakan untuk material PCS.");
        if (markerYield <= 0) throw new Error("Product Yield harus lebih dari 0.");
        const markerInStandard = convertLength(Math.max(0, markerLength), markerUnit, material.unit);
        netUsage = markerInStandard / markerYield;
      }

      const netRequirement = Math.max(0, targetProduct) * Math.max(0, netUsage);
      const allowanceQty = netRequirement * Math.max(0, allowance) / 100;
      const wasteQty = wasteEnabled ? netRequirement * Math.max(0, waste) / 100 : 0;
      const rawFinal = netRequirement + allowanceQty + wasteQty;
      const finalRequirement = type === "PCS" ? Math.ceil(rawFinal) : rawFinal;
      const effectivePerProduct = targetProduct > 0 ? finalRequirement / targetProduct : 0;

      let estimatedRolls = 0;
      if (type === "ROLL_LENGTH" && estimatedRollLength > 0) {
        const rollLengthStandard = convertLength(estimatedRollLength, estimatedRollUnit, material.unit);
        if (rollLengthStandard > 0) estimatedRolls = Math.ceil(finalRequirement / rollLengthStandard);
      }

      return {
        totalAreaM2: roundQty(totalAreaM2),
        netUsage: roundQty(netUsage),
        netRequirement: roundQty(netRequirement, 4),
        allowanceQty: roundQty(allowanceQty, 4),
        wasteQty: roundQty(wasteQty, 4),
        finalRequirement: roundQty(finalRequirement, 4),
        effectivePerProduct: roundQty(effectivePerProduct),
        estimatedRolls,
        calcError: "",
      };
    } catch (e) {
      return { totalAreaM2: 0, netUsage: 0, netRequirement: 0, allowanceQty: 0, wasteQty: 0, finalRequirement: 0, effectivePerProduct: 0, estimatedRolls: 0, calcError: e instanceof Error ? e.message : "Perhitungan tidak valid." };
    }
  }, [material, method, components, materialWidth, materialWidthUnit, usageDirect, usageUnit, markerLength, markerUnit, markerYield, allowance, wasteEnabled, waste, targetProduct, estimatedRollLength, estimatedRollUnit]);

  function updateComponent(index: number, patch: Partial<ComponentRow>) {
    setApplied(null);
    setComponents((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row));
  }

  function applyResult() {
    setActionError("");
    if (!material) { setActionError("Pilih Master Bahan terlebih dahulu."); return; }
    if (preview.calcError) return;
    const input = document.getElementById(targetInputId) as HTMLInputElement | null;
    if (!input) { setActionError("Input Kebutuhan / Unit tidak ditemukan."); return; }
    input.value = String(preview.effectivePerProduct);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    const snapshot = JSON.stringify({
      version: 1,
      project: projectLabel,
      product: productLabel,
      targetProduct,
      material: { id: material.id, name: material.name, unit: material.unit, calculationType: material.calculationType },
      method,
      components,
      materialWidth,
      materialWidthUnit,
      usageDirect,
      usageUnit,
      markerLength,
      markerUnit,
      markerYield,
      allowancePercent: allowance,
      wasteEnabled,
      wastePercent: wasteEnabled ? waste : 0,
      estimatedRollLength,
      estimatedRollUnit,
      preview,
    });
    setApplied({ method, snapshot });
  }

  return (
    <div className="md:col-span-2 xl:col-span-4 rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50/40 to-white p-5 shadow-xs">
      <input type="hidden" name="calculation_method" value={applied?.method ?? "MANUAL"} />
      <input type="hidden" name="net_usage_per_product" value={applied ? preview.netUsage : ""} />
      <input type="hidden" name="allowance_percent" value={applied ? allowance : 0} />
      <input type="hidden" name="waste_percent" value={applied && wasteEnabled ? waste : 0} />
      <input type="hidden" name="final_requirement" value={applied ? preview.finalRequirement : ""} />
      <input type="hidden" name="calculation_input_snapshot" value={applied?.snapshot ?? ""} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-blue-100/70 pb-3">
        <div>
          <p className="font-semibold text-slate-900 flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-600" />
            Hitung Kebutuhan Bahan (BOM Calculator)
          </p>
          <p className="text-xs text-slate-500">Helper kalkulasi. Hasil baru masuk formulir BOM setelah klik tombol “Gunakan Hasil”.</p>
        </div>
        <select value={method} onChange={(e) => { setApplied(null); setMethod(e.target.value as Method); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
          <option value="SAMPLE">Dari Sample / Tas Jadi</option>
          <option value="CONSUMPTION">Konsumsi per Produk</option>
          <option value="MARKER">Marker Cutting</option>
        </select>
      </div>

      <div className="mt-3 grid gap-2.5 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs text-slate-600 sm:grid-cols-4">
        <div><span className="text-slate-400 font-medium">Project:</span> <span className="font-semibold text-slate-800">{projectLabel}</span></div>
        <div><span className="text-slate-400 font-medium">Product:</span> <span className="font-semibold text-slate-800">{productLabel}</span></div>
        <div><span className="text-slate-400 font-medium">Target:</span> <span className="font-semibold text-slate-800">{moneyless(targetProduct)} pcs</span></div>
        <div><span className="text-slate-400 font-medium">Material:</span> <span className="font-semibold text-slate-800">{material ? `${material.name} (${material.unit})` : "Pilih Bahan..."}</span></div>
      </div>

      {material && method === "SAMPLE" ? (
        <div className="mt-4 space-y-3">
          {components.map((row, index) => (
            <div key={index} className="grid gap-2 rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs sm:grid-cols-6">
              <input value={row.name} onChange={(e) => updateComponent(index, { name: e.target.value })} placeholder="Nama komponen" className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none sm:col-span-2" />
              {material.calculationType !== "PCS" ? <><input type="number" min="0" step="any" value={row.length} onChange={(e) => updateComponent(index, { length: num(e.target.value) })} placeholder="Panjang" className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none" /><select value={row.lengthUnit} onChange={(e) => updateComponent(index, { lengthUnit: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700">{lengthUnits.map((u) => <option key={u}>{u}</option>)}</select></> : null}
              {material.calculationType === "SHEET" ? <><input type="number" min="0" step="any" value={row.width} onChange={(e) => updateComponent(index, { width: num(e.target.value) })} placeholder="Lebar" className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none" /><select value={row.widthUnit} onChange={(e) => updateComponent(index, { widthUnit: e.target.value })} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700">{lengthUnits.map((u) => <option key={u}>{u}</option>)}</select></> : null}
              <input type="number" min="0" step="any" value={row.qty} onChange={(e) => updateComponent(index, { qty: num(e.target.value) })} placeholder="Qty/Produk" className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none" />
              <button type="button" onClick={() => { setApplied(null); setComponents((x) => x.filter((_, i) => i !== index)); }} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-100">Hapus</button>
            </div>
          ))}
          <button type="button" onClick={() => { setApplied(null); setComponents((x) => [...x, { name: `Komponen ${x.length + 1}`, length: 0, lengthUnit: "cm", width: 0, widthUnit: "cm", qty: 1 }]); }} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50">+ Tambah Komponen</button>
          {material.calculationType === "SHEET" ? <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs font-medium text-slate-600">Lebar Material<input type="number" min="0" step="any" value={materialWidth} onChange={(e) => { setApplied(null); setMaterialWidth(num(e.target.value)); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" /></label><label className="text-xs font-medium text-slate-600">Unit Lebar<select value={materialWidthUnit} onChange={(e) => { setApplied(null); setMaterialWidthUnit(e.target.value); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">{lengthUnits.map((u) => <option key={u}>{u}</option>)}</select></label></div> : null}
        </div>
      ) : null}

      {material && method === "CONSUMPTION" ? <div className="mt-4 grid gap-2 sm:grid-cols-2"><label className="text-xs font-medium text-slate-600">Usage per Product<input type="number" min="0" step="any" value={usageDirect} onChange={(e) => { setApplied(null); setUsageDirect(num(e.target.value)); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" /></label>{material.calculationType !== "PCS" ? <label className="text-xs font-medium text-slate-600">Unit<select value={usageUnit} onChange={(e) => { setApplied(null); setUsageUnit(e.target.value); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">{lengthUnits.map((u) => <option key={u}>{u}</option>)}</select></label> : <div className="self-end rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 font-medium">Unit: PCS</div>}</div> : null}

      {material && method === "MARKER" ? <div className="mt-4 grid gap-2 sm:grid-cols-3"><label className="text-xs font-medium text-slate-600">Marker Length<input type="number" min="0" step="any" value={markerLength} onChange={(e) => { setApplied(null); setMarkerLength(num(e.target.value)); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" /></label><label className="text-xs font-medium text-slate-600">Unit<select value={markerUnit} onChange={(e) => { setApplied(null); setMarkerUnit(e.target.value); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">{lengthUnits.map((u) => <option key={u}>{u}</option>)}</select></label><label className="text-xs font-medium text-slate-600">Product Yield<input type="number" min="0.000001" step="any" value={markerYield} onChange={(e) => { setApplied(null); setMarkerYield(num(e.target.value)); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" /></label></div> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-slate-600">Allowance / Cadangan (%)<input type="number" min="0" step="0.01" value={allowance} onChange={(e) => { setApplied(null); setAllowance(num(e.target.value)); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" /></label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 mt-auto cursor-pointer"><input type="checkbox" checked={wasteEnabled} onChange={(e) => { setApplied(null); setWasteEnabled(e.target.checked); }} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" /> Gunakan Waste Produksi</label>
        <label className="text-xs font-medium text-slate-600">Waste Produksi (%)<input type="number" min="0" step="0.01" disabled={!wasteEnabled} value={waste} onChange={(e) => { setApplied(null); setWaste(num(e.target.value)); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 disabled:opacity-40" /></label>
      </div>

      {material?.calculationType === "ROLL_LENGTH" ? <div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-xs font-medium text-slate-600">Estimasi panjang supplier / roll<input type="number" min="0" step="any" value={estimatedRollLength} onChange={(e) => { setApplied(null); setEstimatedRollLength(num(e.target.value)); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" /></label><label className="text-xs font-medium text-slate-600">Unit estimasi<select value={estimatedRollUnit} onChange={(e) => { setApplied(null); setEstimatedRollUnit(e.target.value); }} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">{lengthUnits.map((u) => <option key={u}>{u}</option>)}</select></label></div> : null}

      {(preview.calcError || actionError) ? <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{preview.calcError || actionError}</div> : null}

      <div className="mt-4 grid gap-2.5 rounded-xl border border-blue-100 bg-blue-50/30 p-3.5 text-xs sm:grid-cols-2 lg:grid-cols-4">
        {material?.calculationType === "SHEET" ? <div><span className="text-slate-400">Total Area / Produk</span><div className="text-sm font-semibold text-slate-900">{moneyless(preview.totalAreaM2, 6)} m²</div></div> : null}
        <div><span className="text-slate-400">Net Usage / Produk</span><div className="text-sm font-semibold text-slate-900">{moneyless(preview.netUsage, 6)} {material?.unit || "-"}</div></div>
        <div><span className="text-slate-400">Net Requirement</span><div className="text-sm font-semibold text-slate-900">{moneyless(preview.netRequirement)} {material?.unit || "-"}</div></div>
        <div><span className="text-slate-400">Allowance ({allowance}%)</span><div className="text-sm font-semibold text-slate-900">{moneyless(preview.allowanceQty)} {material?.unit || "-"}</div></div>
        {wasteEnabled ? <div><span className="text-slate-400">Waste ({waste}%)</span><div className="text-sm font-semibold text-slate-900">{moneyless(preview.wasteQty)} {material?.unit || "-"}</div></div> : null}
        <div><span className="text-slate-400">TOTAL KEBUTUHAN</span><div className="text-base font-bold text-blue-600">{moneyless(preview.finalRequirement)} {material?.unit || "-"}</div></div>
        {preview.estimatedRolls > 0 ? <div><span className="text-slate-400">ESTIMASI ROLL</span><div className="text-sm font-semibold text-slate-900">{preview.estimatedRolls} Roll</div></div> : null}
      </div>

      <p className="mt-2 text-[11px] text-slate-400">Estimasi sample untuk kain/lembaran bersifat theoretical. Layout pola, arah kain, trimming, dan marker aktual dapat menghasilkan konsumsi berbeda.</p>
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={applyResult} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition">Gunakan Hasil</button>
        {applied ? <button type="button" onClick={() => setApplied(null)} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Kembali ke Input Manual</button> : null}
        {applied ? <span className="text-xs font-medium text-emerald-600 flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />Hasil kalkulator siap disimpan ke BOM.</span> : null}
      </div>
    </div>
  );
}
