export const WORKER_DEPARTMENTS = [
  "PRODUKSI",
  "CUTTING",
  "SABLON",
  "QC",
  "GUDANG",
  "PACKING",
  "LOGISTIK",
  "ADMINISTRASI",
  "UMUM",
] as const;

export const WORKER_POSITIONS = [
  "OPERATOR JAHIT",
  "SPV PRODUKSI",
  "CUTTING",
  "SABLON",
  "CHECKER",
  "QC",
  "GUDANG",
  "HELPER",
  "PACKING",
  "ADMINISTRASI",
  "DRIVER",
] as const;

export const PAY_SYSTEMS = ["HARIAN", "BULANAN", "BORONGAN"] as const;

export function isSewingOperator(position: unknown) {
  const value = String(position ?? "").trim().toUpperCase();
  return value === "OPERATOR JAHIT" || value.includes("OPERATOR") || value.includes("JAHIT");
}

export function isProductionSupervisor(position: unknown) {
  const value = String(position ?? "").trim().toUpperCase();
  return value === "SPV PRODUKSI" || value.includes("SUPERVISOR") || value.includes("SPV");
}
