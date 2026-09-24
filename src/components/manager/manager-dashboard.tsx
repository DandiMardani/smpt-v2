"use client";

import { useMemo, useState, type ReactNode } from "react";

type IdName = { id: number; name: string };
type ProductRef = { id: number; project_id: number; name: string };
type JsonRow = Record<string, unknown>;

export type ManagerSummary = {
  period?: { from?: string; to?: string };
  production?: {
    active_projects?: number;
    active_products?: number;
    active_spk?: number;
    qty_sah_period?: number;
    top_products?: JsonRow[];
  };
  workforce?: Record<string, number>;
  finance?: Record<string, number>;
  attention?: Record<string, number>;
  filters?: { projects?: IdName[]; products?: ProductRef[] };
  generated_at?: string;
};

type SectionKey = "PRODUCTION" | "MATERIAL" | "WORKFORCE" | "FINANCE" | "ATTENTION" | "HISTORY";

const sectionLabels: Record<SectionKey, string> = {
  PRODUCTION: "Proyek & Produksi",
  MATERIAL: "Material",
  WORKFORCE: "Karyawan",
  FINANCE: "Keuangan",
  ATTENTION: "Perlu Perhatian",
  HISTORY: "Riwayat",
};

const numberFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 });
const currencyFmt = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function num(value: unknown): string {
  return numberFmt.format(n(value));
}
function money(value: unknown): string {
  return currencyFmt.format(n(value));
}
function text(value: unknown): string {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-xs">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-extrabold text-gray-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">{children}</span>;
}

function TableWrap({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-xs"><table className="min-w-full divide-y divide-gray-200 text-sm">{children}</table></div>;
}
function Th({ children }: { children: ReactNode }) {
  return <th className="whitespace-nowrap bg-gray-50/90 px-3.5 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-gray-600">{children}</th>;
}
function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <td className={`whitespace-nowrap border-t border-gray-100 px-3.5 py-2.5 text-gray-800 ${className}`.trim()}>
      {children}
    </td>
  );
}

function renderRows(section: SectionKey, rows: JsonRow[]) {
  if (!rows.length) return <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-4 py-8 text-center text-sm font-medium text-gray-500">Belum ada data untuk filter ini.</div>;

  if (section === "PRODUCTION") {
    return <TableWrap><thead><tr><Th>Project</Th><Th>Produk/Tas</Th><Th>Item</Th><Th>Alur</Th><Th>Target Produk</Th><Th>Target Item</Th><Th>Qty Sah</Th><Th>Equivalent</Th><Th>Sisa Eq.</Th><Th>Over Eq.</Th><Th>Progress</Th><Th>Hasil Periode</Th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><Td>{text(r.project_name)}</Td><Td>{text(r.product_name)}</Td><Td>{text(r.work_item_name)}</Td><Td>{text(r.flow_mode)} {r.flow_order ? `#${text(r.flow_order)}` : ""}</Td><Td>{num(r.target_production)}</Td><Td>{num(r.target_item_qty)}</Td><Td>{num(r.qty_sah)}</Td><Td>{num(r.equivalent_product)}</Td><Td>{num(r.remaining_equivalent)}</Td><Td>{num(r.over_equivalent)}</Td><Td>{num(r.progress_percent)}%</Td><Td>{num(r.qty_sah_period)}</Td></tr>)}</tbody></TableWrap>;
  }

  if (section === "MATERIAL") {
    return <div className="space-y-3"><TableWrap><thead><tr><Th>Project</Th><Th>Produk/Tas</Th><Th>Material</Th><Th>Kebutuhan</Th><Th>Datang Global</Th><Th>Kurang Datang*</Th><Th>Stok Gudang Global</Th><Th>Keluar ke Produksi</Th><Th>Actual Dipakai</Th><Th>Sisa Area Produksi</Th><Th>Total Sisa Terlihat</Th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><Td>{text(r.project_name)}</Td><Td>{text(r.product_name)}</Td><Td>{text(r.material_name)} · {text(r.unit)}</Td><Td>{num(r.total_requirement)}</Td><Td>{num(r.received_global)}</Td><Td>{num(r.shortfall_vs_global_receipt)}</Td><Td>{num(r.warehouse_stock_global)}</Td><Td>{num(r.issued_to_production)}</Td><Td>{num(r.actual_consumed)}</Td><Td>{num(r.production_area_stock)}</Td><Td>{num(r.total_visible_stock)}</Td></tr>)}</tbody></TableWrap><p className="text-xs leading-5 text-amber-800">Catatan: Barang Masuk dan stok Gudang bahan masih global per material. Dashboard tidak menganggap Barang Keluar = actual consumption.</p></div>;
  }

  if (section === "WORKFORCE") {
    return <TableWrap><thead><tr><Th>Nama</Th><Th>Bagian</Th><Th>Sistem Upah</Th><Th>Kehadiran Hari Ini</Th><Th>SPK Aktif</Th><Th>Qty Sah Periode</Th><Th>Upah Borongan Periode</Th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><Td>{text(r.name)}</Td><Td>{text(r.department)} / {text(r.position)}</Td><Td><Badge>{text(r.pay_system)}</Badge></Td><Td>{text(r.attendance_today)}</Td><Td>{num(r.active_spk)}</Td><Td>{num(r.qty_sah_period)}</Td><Td>{money(r.upah_borongan_period)}</Td></tr>)}</tbody></TableWrap>;
  }

  if (section === "FINANCE") {
    return <TableWrap><thead><tr><Th>Tanggal</Th><Th>Sumber</Th><Th>Kode</Th><Th>Arah</Th><Th>Kategori</Th><Th>Nominal</Th><Th>Keterangan</Th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><Td>{text(r.transaction_date)}</Td><Td>{text(r.source)}</Td><Td>{text(r.code)}</Td><Td><Badge>{text(r.direction)}</Badge></Td><Td>{text(r.category)}</Td><Td>{money(r.amount)}</Td><Td>{text(r.description)}</Td></tr>)}</tbody></TableWrap>;
  }

  if (section === "ATTENTION") {
    return <TableWrap><thead><tr><Th>Waktu</Th><Th>Level</Th><Th>Jenis</Th><Th>Project</Th><Th>Produk/Tas</Th><Th>Sumber</Th><Th>Detail</Th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><Td>{text(r.event_at).slice(0, 19).replace("T", " ")}</Td><Td><Badge>{text(r.severity)}</Badge></Td><Td>{text(r.attention_type)}</Td><Td>{text(r.project_name)}</Td><Td>{text(r.product_name)}</Td><Td>{text(r.source_name)}</Td><Td className="max-w-lg whitespace-normal">{text(r.detail)}</Td></tr>)}</tbody></TableWrap>;
  }

  return <TableWrap><thead><tr><Th>Waktu</Th><Th>Jenis</Th><Th>Kode</Th><Th>Project</Th><Th>Produk/Tas</Th><Th>Status</Th><Th>Detail</Th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><Td>{text(r.event_at).slice(0, 19).replace("T", " ")}</Td><Td><Badge>{text(r.event_type)}</Badge></Td><Td>{text(r.code)}</Td><Td>{text(r.project_name)}</Td><Td>{text(r.product_name)}</Td><Td>{text(r.status)}</Td><Td className="max-w-lg whitespace-normal">{text(r.detail)}</Td></tr>)}</tbody></TableWrap>;
}

export function ManagerDashboard({ initialSummary }: { initialSummary: ManagerSummary }) {
  const [summary, setSummary] = useState<ManagerSummary>(initialSummary);
  const [from, setFrom] = useState(initialSummary.period?.from || new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(initialSummary.period?.to || new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = useState(0);
  const [productId, setProductId] = useState(0);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [sectionLoading, setSectionLoading] = useState<SectionKey | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey | null>(null);
  const [rows, setRows] = useState<JsonRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");

  const projects = summary.filters?.projects ?? [];
  const products = summary.filters?.products ?? [];
  const productOptions = useMemo(() => projectId ? products.filter((x) => x.project_id === projectId) : products, [products, projectId]);

  function exportHref(section?: SectionKey) {
    const query = new URLSearchParams({ report: section ? "manager_section" : "manager_dashboard", from, to });
    if (section) query.set("section", section);
    if (projectId) query.set("project", String(projectId));
    if (productId) query.set("product", String(productId));
    return `/api/export/xlsx?${query.toString()}`;
  }

  async function getJson(url: string) {
    const response = await fetch(url, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error || "Data gagal dimuat.");
    return body;
  }

  async function refreshSummary() {
    setSummaryLoading(true); setError("");
    try {
      const data = await getJson(`/api/manager/dashboard?section=summary&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setSummary(data as ManagerSummary);
      setActiveSection(null); setRows([]); setOffset(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ringkasan gagal dimuat.");
    } finally { setSummaryLoading(false); }
  }

  async function loadSection(section: SectionKey, nextOffset = 0, append = false) {
    setSectionLoading(section); setError("");
    try {
      const query = new URLSearchParams({ section, from, to, limit: "50", offset: String(nextOffset) });
      if (projectId) query.set("project", String(projectId));
      if (productId) query.set("product", String(productId));
      const data = await getJson(`/api/manager/dashboard?${query.toString()}`);
      const nextRows = Array.isArray(data?.items) ? data.items as JsonRow[] : [];
      setRows((current) => append ? [...current, ...nextRows] : nextRows);
      setOffset(nextOffset + nextRows.length);
      setActiveSection(section);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detail gagal dimuat.");
    } finally { setSectionLoading(null); }
  }

  const prod = summary.production ?? {};
  const wf = summary.workforce ?? {};
  const fin = summary.finance ?? {};
  const attention = summary.attention ?? {};
  const topProducts = Array.isArray(prod.top_products) ? prod.top_products : [];

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0d6efd]">Executive Dashboard</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">Dashboard Manager</h1><p className="mt-1.5 max-w-3xl text-sm leading-6 text-gray-600">Read only. Ringkasan utama dimuat cepat; detail baru dimuat saat dibuka.</p></div>
          <div className="grid gap-2 sm:grid-cols-[auto_auto_auto]">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs focus:border-[#0d6efd]" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs focus:border-[#0d6efd]" />
            <div className="flex flex-wrap gap-2"><button onClick={refreshSummary} disabled={summaryLoading} className="rounded-xl bg-[#0d6efd] px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-[#0b5ed7] disabled:opacity-60">{summaryLoading ? "Memuat..." : "Terapkan Periode"}</button><a href={exportHref()} className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-xs hover:bg-emerald-100">Export Excel</a></div>
          </div>
        </div>
      </header>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 shadow-xs">{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Proyek Aktif" value={num(prod.active_projects)} />
        <Kpi label="Produk/Tas Aktif" value={num(prod.active_products)} />
        <Kpi label="SPK Aktif" value={num(prod.active_spk)} />
        <Kpi label="Qty Sah Periode" value={num(prod.qty_sah_period)} />
      </section>

      <section className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-gray-900">Proyek & Produksi</h2><p className="text-sm text-gray-500">Actual memakai hasil Checker yang sah pada Output Final.</p></div><button onClick={() => loadSection("PRODUCTION")} className="rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 shadow-xs hover:bg-gray-50">Detail Item</button></div>
        {topProducts.length ? <TableWrap><thead><tr><Th>Project</Th><Th>Produk/Tas</Th><Th>Target</Th><Th>Actual</Th><Th>Sisa</Th><Th>Progress</Th><Th>Status Produk</Th><Th>Status Output Final</Th></tr></thead><tbody>{topProducts.map((r, i) => <tr key={i}><Td>{text(r.project_name)}</Td><Td>{text(r.product_name)}</Td><Td>{num(r.target_production)}</Td><Td>{num(r.actual)}</Td><Td>{num(r.remaining)}</Td><Td>{num(r.progress_percent)}%</Td><Td>{text(r.product_status)}</Td><Td>{r.output_final_configured ? "Siap" : "Belum diset"}</Td></tr>)}</tbody></TableWrap> : <div className="text-sm font-medium text-gray-500">Belum ada Produk/Tas aktif.</div>}
      </section>

      <section className="space-y-3">
        <div><h2 className="text-lg font-bold text-gray-900">Karyawan</h2><p className="text-sm text-gray-500">Ringkasan tenaga kerja. Detail per orang baru dimuat saat dibuka.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Total Karyawan" value={num(wf.total)} hint={`Aktif ${num(wf.active)}`} />
          <Kpi label="Sistem Upah" value={`${num(wf.harian)} / ${num(wf.bulanan)} / ${num(wf.borongan)}`} hint="Harian / Bulanan / Borongan" />
          <Kpi label="Hadir Hari Ini" value={num(wf.hadir_today)} hint={`Belum hadir/data: ${num(wf.belum_hadir)}`} />
          <Kpi label="Operator dengan SPK Aktif" value={num(wf.operator_spk_active)} hint={`SPK aktif: ${num(wf.spk_active)}`} />
          <Kpi label="Qty Sah Periode" value={num(wf.qty_sah_period)} />
          <Kpi label="Upah Borongan Periode" value={money(wf.upah_borongan_period)} />
        </div>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-lg font-bold text-gray-900">Keuangan</h2><p className="text-sm text-gray-500">Executive summary read only. Profit/margin tidak ditampilkan tanpa source revenue yang valid.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Kas Masuk" value={money(fin.kas_masuk)} />
          <Kpi label="Kas Keluar" value={money(fin.kas_keluar)} />
          <Kpi label="Saldo Periode" value={money(fin.saldo)} />
          <Kpi label="Kas Kecil" value={money(fin.kas_kecil)} />
          <Kpi label="Payroll Harian/Bulanan" value={money(fin.payroll_harian_bulanan)} />
          <Kpi label="Payroll Borongan" value={money(fin.payroll_borongan)} />
          <Kpi label="Kasbon Outstanding" value={money(fin.kasbon_outstanding)} />
          <Kpi label="Pengeluaran Operasional" value={money(fin.pengeluaran_operasional)} />
        </div>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-lg font-bold text-gray-900">Perlu Perhatian</h2><p className="text-sm text-gray-500">Alert hanya bersumber dari kondisi yang dapat ditelusuri ke data sistem.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Workflow Anomaly" value={num(attention.workflow_anomaly)} />
          <Kpi label="SPK Terlambat" value={num(attention.spk_terlambat)} />
          <Kpi label="Produk Terlambat" value={num(attention.produk_terlambat)} />
          <Kpi label="Output Final Belum Diset" value={num(attention.output_final_belum_diset)} />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200/90 bg-white p-5 shadow-xs sm:p-6">
        <h2 className="text-lg font-bold text-gray-900">Detail Monitoring</h2>
        <p className="mt-1 text-sm text-gray-500">Filter aktif dipakai untuk detail. Data tidak diambil sebelum tombol section diklik.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select value={projectId || ""} onChange={(e) => { const v=Number(e.target.value)||0; setProjectId(v); setProductId(0); }} className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-xs focus:border-[#0d6efd]"><option value="">Semua Project</option>{projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <select value={productId || ""} onChange={(e) => setProductId(Number(e.target.value)||0)} className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-xs focus:border-[#0d6efd]"><option value="">Semua Produk/Tas</option>{productOptions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <div className="md:col-span-2 flex flex-wrap gap-2">{(Object.keys(sectionLabels) as SectionKey[]).map((section) => <button key={section} onClick={() => loadSection(section)} disabled={sectionLoading !== null} className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition shadow-xs ${activeSection===section ? "border-[#0d6efd] bg-blue-50 text-[#0d6efd]" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}>{sectionLoading===section ? "Memuat..." : sectionLabels[section]}</button>)}</div>
        </div>

        {activeSection ? <div className="mt-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold text-gray-900">{sectionLabels[activeSection]}</h3><div className="flex items-center gap-2"><span className="text-xs text-gray-500">{rows.length} baris termuat</span><a href={exportHref(activeSection)} className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-xs hover:bg-emerald-100">Export section Excel</a></div></div>{renderRows(activeSection, rows)}{rows.length > 0 && rows.length % 50 === 0 ? <button onClick={() => loadSection(activeSection, offset, true)} disabled={sectionLoading !== null} className="rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 shadow-xs hover:bg-gray-50">Muat 50 berikutnya</button> : null}</div> : null}
      </section>
    </div>
  );
}
