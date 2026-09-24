import type { ReactNode } from "react";

export function FlowNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-sm leading-6 text-blue-900 shadow-xs">
      {children}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
      {children}
    </span>
  );
}

export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-2 text-2xl font-extrabold text-slate-900">{value}</div>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}
