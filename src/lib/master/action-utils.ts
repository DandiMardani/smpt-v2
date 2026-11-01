import { redirect } from "next/navigation";
import { logActionFailure } from "@/lib/logger";

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

function sanitizeDbErrorMessage(rawMessage: string): string | null {
  const msg = rawMessage.toLowerCase();

  // Deteksi constraint duplikat / unique key
  if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
    return "Data dengan nilai yang sama sudah ada / duplikat.";
  }

  // Deteksi relasi / foreign key
  if (msg.includes("foreign key") || msg.includes("violates foreign key")) {
    return "Data terkait tidak ditemukan atau masih digunakan oleh data lain.";
  }

  // Deteksi kolom wajib / not-null
  if (msg.includes("not-null constraint") || msg.includes("null value in column")) {
    return "Ada isian wajib yang belum diisi atau tidak valid.";
  }

  // Deteksi check constraint
  if (msg.includes("check constraint")) {
    return "Nilai atau format data tidak memenuhi ketentuan.";
  }

  // Deteksi RLS / hak akses
  if (
    msg.includes("row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("insufficient privilege")
  ) {
    return "Anda tidak memiliki izin untuk tindakan ini.";
  }

  // Deteksi error database internal mentah (Postgres / PostgREST / Supabase)
  if (
    msg.includes("schema cache") ||
    msg.includes("relation \"") ||
    msg.includes("does not exist") ||
    msg.includes("column \"") ||
    msg.includes("syntax error") ||
    msg.includes("invalid input syntax") ||
    msg.includes("pgrst") ||
    msg.includes("postgres") ||
    msg.includes("supabase") ||
    msg.includes("connection refused") ||
    msg.includes("failed to fetch")
  ) {
    return "Terjadi kesalahan pada sistem database.";
  }

  return null;
}

export function errorMessage(
  error: unknown,
  fallback: string,
  context?: string,
  payload?: unknown,
): string {
  if (
    error &&
    typeof error === "object" &&
    (("digest" in error && String((error as any).digest).startsWith("NEXT_REDIRECT")) ||
      ("message" in error && (error as any).message === "NEXT_REDIRECT"))
  ) {
    throw error;
  }

  // Log error asli secara detail di server console untuk keperluan debugging (tidak bocor ke client)
  console.log(`[SERVER DEBUG] [Error in ${context || fallback}]:`, error);
  logActionFailure(context || fallback, payload, error);

  let rawMessage = "";
  let errorCode: string | undefined;

  if (error && typeof error === "object") {
    const candidate = error as {
      code?: string;
      message?: string;
      details?: string;
    };
    errorCode = candidate.code;
    rawMessage = candidate.message || candidate.details || "";
  } else if (error instanceof Error) {
    rawMessage = error.message;
  } else if (typeof error === "string") {
    rawMessage = error;
  }

  // Filter berdasarkan Postgres Error Codes
  if (errorCode === "23505") {
    return "Data dengan nilai yang sama sudah ada / duplikat.";
  }
  if (errorCode === "23503") {
    return "Data terkait tidak ditemukan atau masih digunakan oleh data lain.";
  }
  if (errorCode === "23502") {
    return "Ada isian wajib yang belum diisi atau tidak valid.";
  }
  if (errorCode === "23514") {
    return "Data yang dimasukkan tidak memenuhi ketentuan.";
  }
  if (errorCode === "42501") {
    return "Anda tidak memiliki izin untuk tindakan ini.";
  }
  if (errorCode === "22P02") {
    return "Format data tidak valid.";
  }
  if (
    errorCode &&
    (errorCode.startsWith("23") ||
      errorCode.startsWith("42") ||
      errorCode.startsWith("08") ||
      errorCode.startsWith("XX") ||
      errorCode.startsWith("PGRST"))
  ) {
    return "Terjadi kesalahan pada sistem database.";
  }

  // Saring teks pesan error jika mengandung detail internal Postgres/Supabase
  if (rawMessage) {
    const sanitized = sanitizeDbErrorMessage(rawMessage);
    if (sanitized) return sanitized;
    return rawMessage;
  }

  return fallback;
}

export function redirectWithMessage(
  path: string,
  type: "success" | "error",
  message: string,
  options?: { context?: string; payload?: unknown; error?: unknown },
): never {
  if (type === "error") {
    logActionFailure(
      options?.context || `redirectWithMessage:${path}`,
      options?.payload,
      options?.error || message,
    );
  }
  const params = new URLSearchParams({ [type]: message });
  redirect(`${path}?${params.toString()}`);
}
