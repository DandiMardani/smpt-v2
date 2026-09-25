import { redirect } from "next/navigation";

export function getText(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim().replace(/\s+/g, " ");
}

export function getId(formData: FormData, key: string): number {
  const value = Number(getText(formData, key));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${key} tidak valid.`);
  }
  return value;
}

export function getOptionalId(formData: FormData, key: string): number | null {
  const raw = getText(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${key} tidak valid.`);
  }
  return value;
}

function sanitizeNumericString(raw: string): string {
  let s = raw.trim().replace(/^rp\.?\s*/i, "").replace(/\s+/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+(,\d+)$/.test(s) && !s.includes(".")) {
    s = s.replace(",", ".");
  } else if (s.includes(".")) {
    if ((s.match(/\./g) || []).length > 1) {
      s = s.replace(/\./g, "");
    }
  }
  return s;
}

export function getInteger(
  formData: FormData,
  key: string,
  options: { min?: number } = {},
): number {
  const raw = sanitizeNumericString(getText(formData, key));
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${key} harus berupa bilangan bulat.`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new Error(`${key} minimal ${options.min}.`);
  }
  return value;
}

export function getNumber(
  formData: FormData,
  key: string,
  options: { min?: number } = {},
): number {
  const raw = sanitizeNumericString(getText(formData, key));
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${key} harus berupa angka.`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new Error(`${key} minimal ${options.min}.`);
  }
  return value;
}

export function getBoolean(formData: FormData, key: string): boolean {
  const value = String(formData.get(key) ?? "").toLowerCase();
  return ["1", "true", "on", "yes", "ya"].includes(value);
}

export function getOptionalDate(formData: FormData, key: string): string | null {
  const raw = getText(formData, key);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`${key} tidak valid.`);
  }
  return raw;
}

export function requireOneOf(value: string, allowed: readonly string[], label: string): string {
  if (!allowed.includes(value)) {
    throw new Error(`${label} tidak valid.`);
  }
  return value;
}

export function errorMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    (("digest" in error && String((error as any).digest).startsWith("NEXT_REDIRECT")) ||
      ("message" in error && (error as any).message === "NEXT_REDIRECT"))
  ) {
    throw error;
  }

  if (error && typeof error === "object") {
    const candidate = error as {
      code?: string;
      message?: string;
      details?: string;
    };

    if (candidate.code === "23505") {
      return "Data dengan nilai yang sama sudah tersedia.";
    }
    if (candidate.code === "23503") {
      return "Data tidak dapat diubah/dihapus karena masih dipakai data lain.";
    }
    if (candidate.code === "42501") {
      return candidate.message || "Anda tidak memiliki izin untuk tindakan ini.";
    }
    if (candidate.message) return candidate.message;
    if (candidate.details) return candidate.details;
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function redirectWithMessage(
  path: string,
  type: "success" | "error",
  message: string,
): never {
  const params = new URLSearchParams({ [type]: message });
  redirect(`${path}?${params.toString()}`);
}
