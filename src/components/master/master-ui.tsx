import Link from "next/link";
import type { ReactNode } from "react";

export function MasterPageShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
      </header>
      {children}
    </div>
  );
}

export function Notice({
  success,
  error,
}: {
  success?: string;
  error?: string;
}) {
  if (!success && !error) return null;

  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm font-medium shadow-xs ${
        error
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {error || success}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-shadow duration-200 hover:shadow-md">
      <div className="mb-4">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {description ? <p className="mt-1 text-xs text-slate-500 leading-relaxed">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-semibold text-slate-700 text-xs">{label}</span>
      {children}
      {hint ? <span className="block text-xs leading-5 text-slate-400">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 shadow-xs";

export const selectClass = inputClass;

export const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:from-blue-700 hover:to-blue-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-[0.98]";

export const dangerButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-semibold text-red-700 shadow-xs transition hover:bg-red-100 active:scale-[0.98]";

export function StatusBadge({ status }: { status: string }) {
  const active = ["AKTIF", "BERJALAN", "SELESAI"].includes(status.toUpperCase());
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/10"
          : "border-slate-200 bg-slate-100 text-slate-700"
      }`}
    >
      {status || "-"}
    </span>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-10 text-center text-sm font-medium text-slate-500">
      {text}
    </div>
  );
}

export function SearchForm({
  defaultValue,
  hidden,
  placeholder = "Cari data...",
}: {
  defaultValue?: string;
  hidden?: Record<string, string>;
  placeholder?: string;
}) {
  return (
    <form className="flex flex-col gap-2 sm:flex-row" method="get">
      {Object.entries(hidden ?? {}).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={inputClass}
      />
      <button className={secondaryButtonClass} type="submit">
        Cari
      </button>
    </form>
  );
}

export function Pagination({
  page,
  total,
  basePath,
  params,
}: {
  page: number;
  total: number;
  basePath: string;
  params?: Record<string, string>;
}) {
  if (total <= 1) return null;

  const hrefFor = (nextPage: number) => {
    const query = new URLSearchParams(params ?? {});
    query.set("page", String(nextPage));
    return `${basePath}?${query.toString()}`;
  };

  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600">
      <span className="text-xs font-medium">
        Halaman {page} dari {total}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={secondaryButtonClass}>
            Sebelumnya
          </Link>
        ) : null}
        {page < total ? (
          <Link href={hrefFor(page + 1)} className={secondaryButtonClass}>
            Berikutnya
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function ReadOnlyBanner() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 shadow-xs">
      Akses Anda hanya baca. Tindakan tambah/ubah dibatasi oleh permission server.
    </div>
  );
}
