export type LengthUnit = "mm" | "cm" | "meter" | "inch" | "yard";

const TO_METER: Record<LengthUnit, number> = {
  mm: 0.001,
  cm: 0.01,
  meter: 1,
  inch: 0.0254,
  yard: 0.9144,
};

export function normalizeLengthUnit(unit: string): LengthUnit | null {
  const key = String(unit || "").trim().toLowerCase().replace(/[ ._-]+/g, "");
  if (["mm", "millimeter", "milimeter"].includes(key)) return "mm";
  if (["cm", "centimeter", "sentimeter"].includes(key)) return "cm";
  if (["m", "meter", "metre"].includes(key)) return "meter";
  if (["in", "inch", "inches", "inci"].includes(key)) return "inch";
  if (["yd", "yard", "yards"].includes(key)) return "yard";
  return null;
}

export function convertLength(value: number, fromUnit: string, toUnit: string): number {
  if (!Number.isFinite(value)) return 0;
  const from = normalizeLengthUnit(fromUnit);
  const to = normalizeLengthUnit(toUnit);
  if (!from || !to) {
    if (String(fromUnit).trim().toLowerCase() === String(toUnit).trim().toLowerCase()) return value;
    throw new Error(`Konversi ${fromUnit} → ${toUnit} tidak didukung.`);
  }
  return (value * TO_METER[from]) / TO_METER[to];
}

export function toMeter(value: number, unit: string): number {
  return convertLength(value, unit, "meter");
}

export function isPiecesUnit(unit: string): boolean {
  const key = String(unit || "").trim().toLowerCase().replace(/[ ._-]+/g, "");
  return ["pcs", "pc", "piece", "pieces", "buah", "unit"].includes(key);
}

export function roundQty(value: number, decimals = 6): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
