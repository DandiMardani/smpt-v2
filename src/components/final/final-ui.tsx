import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-[#0d6efd] focus:ring-2 focus:ring-blue-100 shadow-xs";

export const buttonClass =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-[#0d6efd] px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-[#0b5ed7] active:bg-[#0a58ca]";

export const dangerClass =
  "inline-flex min-h-9 items-center justify-center rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-red-700";

export const secondaryClass =
  "inline-flex min-h-9 items-center justify-center rounded-xl border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 shadow-xs transition hover:bg-gray-50";

export function PageShell({
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
      <header className="border-b border-gray-200/90 pb-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0d6efd]">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">{title}</h1>
        <p className="mt-1.5 max-w-4xl text-sm leading-6 text-gray-600">{description}</p>
      </header>
      {children}
    </div>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs transition hover:shadow-sm sm:p-6">
      <h2 className="mb-4 text-base font-bold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-gray-700">{label}</span>
      {children}
    </label>
  );
}

export function Notice({ success, error }: { success?: string; error?: string }) {
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

export function ReadOnly() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
      Mode baca saja. Akun ini tidak memiliki permission operasional untuk modul ini.
    </div>
  );
}

export function Flow({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-sm leading-6 text-blue-900 shadow-xs">
      {children}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
      {children}
    </span>
  );
}

export function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs sm:p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <div className="mt-2 text-2xl font-extrabold text-gray-900">{value}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 p-6 text-center text-sm font-medium text-gray-500">
      {children}
    </p>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-xs">
      <table className="min-w-full divide-y divide-gray-200 text-sm">{children}</table>
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap bg-gray-50/90 px-3.5 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-gray-600">
      {children}
    </th>
  );
}

export function Td({ children }: { children: ReactNode }) {
  return (
    <td className="whitespace-nowrap border-t border-gray-100 px-3.5 py-2.5 align-top text-gray-800">
      {children}
    </td>
  );
}
