export const MASTER_PAGE_SIZE = 10;

export type SearchParams = Record<
  string,
  string | string[] | undefined
>;

export function param(
  params: SearchParams,
  key: string,
  fallback = "",
): string {
  const value = params[key];
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export function positivePage(value: string): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function pageRange(page: number, pageSize = MASTER_PAGE_SIZE) {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function cleanSearch(value: string): string {
  return value
    .trim()
    .replace(/[%,()_]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export function totalPages(count: number, pageSize = MASTER_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(count / pageSize));
}

export function formatNumber(value: number | string | null | undefined): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(numeric)
    : "0";
}

export function formatRupiah(value: number | string | null | undefined): string {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}
