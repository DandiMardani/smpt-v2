import { createClient } from "@/lib/supabase/server";

export async function callRpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export function optionalId(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error("ID tidak valid.");
  return n;
}

export function formatQty(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(Number(value ?? 0));
}
