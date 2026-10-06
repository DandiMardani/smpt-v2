"use client";

import { useMemo, useState, useEffect, Fragment, type ReactNode } from "react";
import Link from "next/link";
import {
  EmbarkasiShipmentTable,
  type ShipmentItem,
} from "@/components/logistics/embarkasi-shipments-table";

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
  filters?: { projects?: IdName[]; products?: ProductRef[] };
  generated_at?: string;
};

type ManagerTab = "HASIL" | "BARANG_JADI" | "EMBARKASI" | "REJECT" | "RIWAYAT";

type CheckHistoryItem = {
  id: number;
  check_code: string;
  check_date: string;
  created_at: string;
  spk_code: string;
  spk_status: string;
  operator_name: string;
  operator_code: string;
  checker_name: string;
  good_qty: number;
  reject_qty: number;
  notes: string;
  status: string;
};

const numberFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 });

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function num(value: unknown): string {
  return numberFmt.format(n(value));
}
function text(value: unknown): string {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function Kpi({
  label,
  value,
  hint,
  icon,
  color = "blue",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: string;
  color?: "blue" | "emerald" | "amber" | "purple" | "rose";
}) {
  const colorMap = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    purple: "bg-purple-50 text-purple-700 border-purple-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border text-base ${colorMap[color]}`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs font-medium text-slate-500">{hint}</p> : null}
    </div>
  );
}

function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  );
}

function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={`whitespace-nowrap bg-slate-50/90 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-600 ${className}`.trim()}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <td className={`whitespace-nowrap border-t border-slate-100 px-4 py-3 text-slate-800 ${className}`.trim()}>
      {children}
    </td>
  );
}

export function ManagerDashboard({ initialSummary }: { initialSummary: ManagerSummary }) {
  const [summary, setSummary] = useState<ManagerSummary>(initialSummary);
  const [from, setFrom] = useState(initialSummary.period?.from || new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(initialSummary.period?.to || new Date().toISOString().slice(0, 10));
  const [projectId, setProjectId] = useState(0);
  const [productId, setProductId] = useState(0);

  // Tabs: HASIL | BARANG_JADI | EMBARKASI | REJECT | RIWAYAT
  const [activeTab, setActiveTab] = useState<ManagerTab>("HASIL");

  const [summaryLoading, setSummaryLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  // Tab 1: HASIL - Item Rows (Routing)
  const [itemRows, setItemRows] = useState<JsonRow[]>([]);
  const [itemLoaded, setItemLoaded] = useState(false);

  // History per item buka/tutup state
  const [expandedItemIds, setExpandedItemIds] = useState<Set<number>>(new Set());
  const [itemHistoryMap, setItemHistoryMap] = useState<
    Record<number, { loading: boolean; error?: string; checks?: CheckHistoryItem[] }>
  >({});

  // Tab 2: BARANG_JADI
  const [fgData, setFgData] = useState<{ items: JsonRow[]; locations: JsonRow[] } | null>(null);
  const [fgLoading, setFgLoading] = useState(false);

  // Tab 3: EMBARKASI & PENGIRIMAN
  const [embData, setEmbData] = useState<{
    targets: JsonRow[];
    shipments: JsonRow[];
    transfers: JsonRow[];
    mr_wu_locations?: JsonRow[];
    mr_wu_stock?: JsonRow[];
    mr_wu_packing_runs?: JsonRow[];
  } | null>(null);
  const [mrWuDailyTargets, setMrWuDailyTargets] = useState<Record<number, number>>({
    2: 300, // Dadap
    3: 200, // Angkasa
    4: 150, // Gudang Utama
  });
  const [editingTargetLocId, setEditingTargetLocId] = useState<number | null>(null);
  const [tempTargetInput, setTempTargetInput] = useState<string>("");
  const [mrWuRunSearch, setMrWuRunSearch] = useState<string>("");
  const [embLoading, setEmbLoading] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string; subtitle?: string } | null>(null);

  // Tab 4: REJECT
  const [rejectData, setRejectData] = useState<{
    production_rejects: JsonRow[];
    qc_rejects: JsonRow[];
    embarkation_issues: JsonRow[];
    summary: { total_production_reject: number; total_qc_reject: number; total_qc_rework: number; total_embarkation_issues: number };
  } | null>(null);
  const [rejectLoading, setRejectLoading] = useState(false);

  // Tab 5: RIWAYAT AKTIVITAS
  const [historyRows, setHistoryRows] = useState<JsonRow[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);

  const projects = summary.filters?.projects ?? [];
  const products = summary.filters?.products ?? [];
  const productOptions = useMemo(
    () => (projectId ? products.filter((x) => x.project_id === projectId) : products),
    [products, projectId]
  );

  async function getJson(url: string) {
    const response = await fetch(url, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error || "Data gagal dimuat.");
    return body;
  }

  async function refreshSummary() {
    setSummaryLoading(true);
    setError("");
    try {
      const data = await getJson(
        `/api/manager/dashboard?section=summary&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      setSummary(data as ManagerSummary);

      // Invalidate on-demand data
      setItemLoaded(false);
      setItemRows([]);
      setFgData(null);
      setEmbData(null);
      setRejectData(null);
      setHistoryLoaded(false);
      setHistoryRows([]);
      setHistoryOffset(0);

      // Reload active tab
      if (activeTab === "HASIL") loadItemDetail();
      if (activeTab === "BARANG_JADI") loadBarangJadi();
      if (activeTab === "EMBARKASI") loadEmbarkasi();
      if (activeTab === "REJECT") loadReject();
      if (activeTab === "RIWAYAT") loadHistory(0, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ringkasan gagal dimuat.");
    } finally {
      setSummaryLoading(false);
    }
  }

  async function loadItemDetail() {
    setDetailLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        section: "PRODUCTION",
        from,
        to,
        limit: "500",
        offset: "0",
      });
      if (projectId) query.set("project", String(projectId));
      if (productId) query.set("product", String(productId));

      const data = await getJson(`/api/manager/dashboard?${query.toString()}`);
      setItemRows(Array.isArray(data?.items) ? (data.items as JsonRow[]) : []);
      setItemLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detail item gagal dimuat.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function toggleItemHistory(workItemId: number) {
    setExpandedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(workItemId)) {
        next.delete(workItemId);
      } else {
        next.add(workItemId);
      }
      return next;
    });

    if (!itemHistoryMap[workItemId]?.checks) {
      setItemHistoryMap((prev) => ({
        ...prev,
        [workItemId]: { loading: true },
      }));

      try {
        const data = await getJson(`/api/manager/dashboard?section=ITEM_HISTORY&work_item_id=${workItemId}`);
        setItemHistoryMap((prev) => ({
          ...prev,
          [workItemId]: { loading: false, checks: data.items || [] },
        }));
      } catch (err: any) {
        setItemHistoryMap((prev) => ({
          ...prev,
          [workItemId]: { loading: false, error: err.message || "Gagal memuat riwayat." },
        }));
      }
    }
  }

  async function loadBarangJadi() {
    if (fgData) return;
    setFgLoading(true);
    try {
      const data = await getJson("/api/manager/dashboard?section=BARANG_JADI");
      setFgData(data);
    } catch (e: any) {
      setError(e.message || "Gagal memuat barang jadi.");
    } finally {
      setFgLoading(false);
    }
  }

  async function loadEmbarkasi() {
    if (embData) return;
    setEmbLoading(true);
    try {
      const data = await getJson("/api/manager/dashboard?section=EMBARKASI");
      setEmbData(data);
    } catch (e: any) {
      setError(e.message || "Gagal memuat data embarkasi & pengiriman.");
    } finally {
      setEmbLoading(false);
    }
  }

  async function loadReject() {
    if (rejectData) return;
    setRejectLoading(true);
    try {
      const data = await getJson("/api/manager/dashboard?section=REJECT");
      setRejectData(data);
    } catch (e: any) {
      setError(e.message || "Gagal memuat data reject.");
    } finally {
      setRejectLoading(false);
    }
  }

  async function loadHistory(offsetVal = 0, append = false) {
    setDetailLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        section: "HISTORY",
        from,
        to,
        limit: "50",
        offset: String(offsetVal),
      });
      if (projectId) query.set("project", String(projectId));
      if (productId) query.set("product", String(productId));

      const data = await getJson(`/api/manager/dashboard?${query.toString()}`);
      const nextItems = Array.isArray(data?.items) ? (data.items as JsonRow[]) : [];
      setHistoryRows((current) => (append ? [...current, ...nextItems] : nextItems));
      setHistoryOffset(offsetVal + nextItems.length);
      setHistoryHasMore(nextItems.length === 50);
      setHistoryLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Riwayat gagal dimuat.");
    } finally {
      setDetailLoading(false);
    }
  }

  // Effect load otomatis saat ganti tab
  useEffect(() => {
    if (activeTab === "HASIL" && !itemLoaded) {
      loadItemDetail();
    } else if (activeTab === "BARANG_JADI") {
      loadBarangJadi();
    } else if (activeTab === "EMBARKASI") {
      loadEmbarkasi();
    } else if (activeTab === "REJECT") {
      loadReject();
    } else if (activeTab === "RIWAYAT" && !historyLoaded) {
      loadHistory(0, false);
    }
  }, [activeTab]);

  const prod = summary.production ?? {};
  const topProducts = Array.isArray(prod.top_products) ? prod.top_products : [];

  const filteredProducts = useMemo(() => {
    return topProducts.filter((r) => {
      if (projectId) {
        const selectedProj = projects.find((p) => p.id === projectId);
        if (selectedProj && r.project_name !== selectedProj.name) return false;
      }
      if (productId) {
        const selectedProd = products.find((p) => p.id === productId);
        if (selectedProd && r.product_name !== selectedProd.name) return false;
      }
      return true;
    });
  }, [topProducts, projectId, productId, projects, products]);

  // Grouping itemRows PER PRODUK
  const groupedProducts = useMemo(() => {
    const map = new Map<
      string,
      {
        product_id: number;
        product_name: string;
        project_name: string;
        target_production: number;
        items: JsonRow[];
      }
    >();

    itemRows.forEach((r) => {
      const prodName = String(r.product_name || "Produk");
      const projName = String(r.project_name || "-");
      const key = `${projName}:::${prodName}`;

      if (!map.has(key)) {
        map.set(key, {
          product_id: Number(r.product_id || 0),
          product_name: prodName,
          project_name: projName,
          target_production: Number(r.target_production || 0),
          items: [],
        });
      }
      map.get(key)!.items.push(r);
    });

    return Array.from(map.values());
  }, [itemRows]);

  return (
    <div className="space-y-6">
      {/* HEADER UTAMA */}
      <header className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-black tracking-wide text-blue-800">
                PORTAL EKSEKUTIF
              </span>
              <span className="text-xs font-semibold text-slate-500">Mode Ringkas & Pengawasan</span>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
              Dashboard Hasil & Pengiriman
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Monitoring hasil produksi per produk, alur kerja borongan, barang jadi, transfer, pengiriman embarkasi, dan log reject.
            </p>
          </div>

          {/* Filter Periode & Proyek */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-1.5 shadow-2xs">
              <span className="text-xs font-bold text-slate-500">Periode:</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
              />
              <span className="text-xs font-medium text-slate-400">s/d</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
              />
              <button
                type="button"
                onClick={refreshSummary}
                disabled={summaryLoading}
                className="ml-1 rounded-xl bg-blue-600 px-3 py-1 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {summaryLoading ? "..." : "Terapkan"}
              </button>
            </div>

            <select
              value={projectId || ""}
              onChange={(e) => {
                const nextProj = Number(e.target.value) || 0;
                setProjectId(nextProj);
                setProductId(0);
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs focus:border-blue-500 focus:outline-none"
            >
              <option value="">Semua Proyek</option>
              {projects.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>

            <select
              value={productId || ""}
              onChange={(e) => setProductId(Number(e.target.value) || 0)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs focus:border-blue-500 focus:outline-none"
            >
              <option value="">Semua Produk</option>
              {productOptions.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* TAB NAVIGATION */}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => setActiveTab("HASIL")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition ${
              activeTab === "HASIL"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200/80"
            }`}
          >
            <span>🏭</span>
            <span>Hasil Produksi (Per Produk)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("BARANG_JADI")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition ${
              activeTab === "BARANG_JADI"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200/80"
            }`}
          >
            <span>📦</span>
            <span>Barang Jadi & Stok</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("EMBARKASI")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition ${
              activeTab === "EMBARKASI"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200/80"
            }`}
          >
            <span>🚚</span>
            <span>Emberkasi & Pengiriman / Transfer</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("REJECT")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition ${
              activeTab === "REJECT"
                ? "bg-rose-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200/80"
            }`}
          >
            <span>⚠️</span>
            <span>Barang Reject</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("RIWAYAT")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition ${
              activeTab === "RIWAYAT"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200/80"
            }`}
          >
            <span>📜</span>
            <span>Log Aktivitas Pabrik</span>
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800 shadow-xs">
          ⚠️ {error}
        </div>
      ) : null}

      {/* ======================================================== */}
      {/* TAB 1: HASIL PRODUKSI (PER PRODUK DENGAN RIWAYAT BUKA/TUTUP) */}
      {/* ======================================================== */}
      {activeTab === "HASIL" && (
        <div className="space-y-6">
          {/* KPI Cards Hasil */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Hasil Sah Periode Ini"
              value={`${num(prod.qty_sah_period)} Pcs`}
              hint="Total output lolos verifikasi checker"
              icon="🎯"
              color="emerald"
            />
            <Kpi
              label="Proyek Berjalan"
              value={num(prod.active_projects)}
              hint="Jumlah proyek manufaktur aktif"
              icon="📂"
              color="blue"
            />
            <Kpi
              label="Produk Dikerjakan"
              value={num(prod.active_products)}
              hint="Item produk dalam proses produksi"
              icon="📦"
              color="amber"
            />
            <Kpi
              label="SPK Sedang Berjalan"
              value={num(prod.active_spk)}
              hint="Surat Perintah Kerja aktif di lini"
              icon="📋"
              color="purple"
            />
          </section>

          {/* Rekap Target vs Capaian per Produk */}
          <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">Rekap Hasil Output per Produk</h2>
                <p className="text-xs text-slate-500">
                  Target proyek vs Actual hasil sah dari Checker pada Output Final produk.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                {filteredProducts.length} Produk Terdata
              </span>
            </div>

            {filteredProducts.length > 0 ? (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Proyek</Th>
                    <Th>Produk</Th>
                    <Th className="text-right">Target</Th>
                    <Th className="text-right">Actual Selesai</Th>
                    <Th className="text-right">Sisa</Th>
                    <Th className="w-48">Progress Capaian</Th>
                    <Th className="text-center">Status</Th>
                    <Th className="text-center">Output Final</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((r, i) => {
                    const actualVal = n(r.actual);
                    const targetVal = n(r.target_production);
                    const pct = targetVal > 0 ? Math.min((actualVal / targetVal) * 100, 100) : 0;
                    const isReady = Boolean(r.output_final_configured);

                    return (
                      <tr key={i} className="hover:bg-slate-50/70 transition">
                        <Td className="font-extrabold text-slate-900">{text(r.project_name)}</Td>
                        <Td className="font-bold text-slate-800">{text(r.product_name)}</Td>
                        <Td className="text-right font-medium">{num(targetVal)}</Td>
                        <Td className="text-right font-black text-emerald-600">{num(actualVal)}</Td>
                        <Td className="text-right font-medium text-slate-500">{num(r.remaining)}</Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-blue-500" : "bg-amber-500"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-slate-700">{num(pct)}%</span>
                          </div>
                        </Td>
                        <Td className="text-center">
                          <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                            {text(r.product_status)}
                          </span>
                        </Td>
                        <Td className="text-center">
                          <span
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 text-xs font-extrabold ${
                              isReady
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {isReady ? "✓ Terpasang" : "Belum Diset"}
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm font-medium text-slate-500">
                Tidak ada produk aktif untuk filter yang dipilih.
              </div>
            )}
          </section>

          {/* Rincian Pengerjaan Dikelompokkan PER PRODUK + Tombol Riwayat Buka-Tutup */}
          <section className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-900">Rincian Tahapan Alur Kerja per Produk</h2>
                <p className="text-xs text-slate-500">
                  Data tahapan kerja dikelompokkan rapi per produk. Klik tombol <span className="font-bold text-blue-600">Riwayat Pengerjaan</span> pada baris item untuk melihat rincian SPK, operator, checker, dan catatan.
                </p>
              </div>
              <button
                type="button"
                onClick={loadItemDetail}
                disabled={detailLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 transition"
              >
                {detailLoading ? "Memuat..." : "🔄 Segarkan Data Alur"}
              </button>
            </div>

            {itemLoaded ? (
              groupedProducts.length > 0 ? (
                groupedProducts.map((prodGroup, groupIdx) => (
                  <div
                    key={groupIdx}
                    className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-xs transition"
                  >
                    {/* Header Card Produk */}
                    <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-lg">
                            📦
                          </span>
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-blue-700">
                              {prodGroup.project_name}
                            </span>
                            <h3 className="text-lg font-black text-slate-900">{prodGroup.product_name}</h3>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-right shadow-2xs">
                            <p className="text-[10px] font-bold uppercase text-slate-400">Target Produk</p>
                            <p className="text-sm font-black text-slate-900">{num(prodGroup.target_production)} Pcs</p>
                          </div>
                          <span className="rounded-full bg-slate-200/80 px-3 py-1 text-xs font-bold text-slate-700">
                            {prodGroup.items.length} Tahapan Kerja
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Tabel Tahapan Kerja Produk ini */}
                    <TableWrap>
                      <thead>
                        <tr>
                          <Th className="min-w-[190px]">Item Pekerjaan</Th>
                          <Th className="min-w-[130px]">Progress</Th>
                          <Th className="w-24 text-center">Riwayat</Th>
                          <Th>Alur Kerja</Th>
                          <Th className="text-right">Target</Th>
                          <Th className="text-right">Qty Sah</Th>
                          <Th className="text-right">Equivalent</Th>
                          <Th className="text-right">Sisa Eq.</Th>
                          <Th className="text-right">Hasil Periode Ini</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {prodGroup.items.map((item, itemIdx) => {
                          const workItemId = Number(item.work_item_id);
                          const isExpanded = expandedItemIds.has(workItemId);
                          const historyState = itemHistoryMap[workItemId];
                          const pct = n(item.progress_percent);

                          return (
                            <Fragment key={`work-item-group-${workItemId || itemIdx}`}>
                              <tr
                                className={`transition ${
                                  isExpanded ? "bg-blue-50/40" : "hover:bg-slate-50/70"
                                }`}
                              >
                                <Td className="min-w-[190px]">
                                  <div className="flex items-start gap-2">
                                    <span className="inline-flex shrink-0 items-center justify-center rounded-lg bg-blue-50 px-1.5 py-0.5 font-mono text-[11px] font-black text-blue-700 border border-blue-200">
                                      #{text(item.flow_order || itemIdx + 1)}
                                    </span>
                                    <div className="min-w-0">
                                      <p className="font-extrabold text-blue-900 leading-snug">{text(item.work_item_name)}</p>
                                      <p className="mt-0.5 text-[11px] text-slate-400 font-medium">
                                        Satuan: {text(item.unit)} · Kebutuhan: {num(item.qty_per_product)}
                                      </p>
                                    </div>
                                  </div>
                                </Td>
                                <Td className="min-w-[130px]">
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-xs font-bold">
                                      <span className={`${pct >= 100 ? "text-emerald-700" : pct >= 50 ? "text-blue-700" : "text-amber-700"}`}>
                                        {num(pct)}%
                                      </span>
                                      <span className="text-[10px] font-semibold text-slate-400">
                                        {num(item.qty_sah)} / {num(item.target_item_qty)}
                                      </span>
                                    </div>
                                    <div className="h-2 w-full min-w-[80px] rounded-full bg-slate-100 overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all duration-300 ${
                                          pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-blue-500" : "bg-amber-500"
                                        }`}
                                        style={{ width: `${Math.min(pct, 100)}%` }}
                                      />
                                    </div>
                                  </div>
                                </Td>
                                <Td className="text-center whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => toggleItemHistory(workItemId)}
                                    className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold shadow-2xs transition ${
                                      isExpanded
                                        ? "bg-slate-800 text-white hover:bg-slate-900"
                                        : "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                    }`}
                                  >
                                    <span>{isExpanded ? "▲ Tutup" : "▼ Riwayat"}</span>
                                  </button>
                                </Td>
                                <Td>
                                  <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                                    {text(item.flow_mode)} {item.flow_order ? `#${text(item.flow_order)}` : ""}
                                  </span>
                                </Td>
                                <Td className="text-right font-medium">{num(item.target_item_qty)}</Td>
                                <Td className="text-right font-black text-emerald-600">{num(item.qty_sah)}</Td>
                                <Td className="text-right font-medium">{num(item.equivalent_product)}</Td>
                                <Td className="text-right font-medium text-slate-500">{num(item.remaining_equivalent)}</Td>
                                <Td className="text-right font-black text-blue-700 bg-blue-50/30">
                                  {num(item.qty_sah_period)}
                                </Td>
                              </tr>

                              {/* BARIS SUB-TABEL RIWAYAT BUKA/TUTUP */}
                              {isExpanded && (
                                <tr key={`history-${itemIdx}`} className="bg-slate-50/90 border-t border-b border-blue-200">
                                  <td colSpan={9} className="p-4 sm:p-5">
                                    <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-xs">
                                      <div className="mb-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-sm">
                                            📜
                                          </span>
                                          <div>
                                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                                              Riwayat Pengerjaan Checker & SPK: {text(item.work_item_name)}
                                            </h4>
                                            <p className="text-[11px] text-slate-500">
                                              Semua transaksi hasil kerja sah, reject, operator, dan verifikasi checker.
                                            </p>
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => toggleItemHistory(workItemId)}
                                          className="text-xs font-bold text-slate-500 hover:text-slate-800"
                                        >
                                          ✕ Tutup
                                        </button>
                                      </div>

                                      {historyState?.loading ? (
                                        <div className="py-6 text-center text-xs font-bold text-slate-400">
                                          Sedang memuat riwayat pengerjaan...
                                        </div>
                                      ) : historyState?.error ? (
                                        <div className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">
                                          ⚠️ {historyState.error}
                                        </div>
                                      ) : historyState?.checks && historyState.checks.length > 0 ? (
                                        <TableWrap>
                                          <thead>
                                            <tr>
                                              <Th>Tanggal</Th>
                                              <Th>Kode Checker</Th>
                                              <Th>No SPK</Th>
                                              <Th>Operator</Th>
                                              <Th>Checker</Th>
                                              <Th className="text-right">Qty Sah</Th>
                                              <Th className="text-right">Reject</Th>
                                              <Th>Catatan / Kondisi</Th>
                                              <Th className="text-center">Status</Th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                            {historyState.checks.map((chk, chkIdx) => (
                                              <tr key={chkIdx} className="hover:bg-slate-50 transition">
                                                <Td className="font-semibold text-slate-900">{chk.check_date}</Td>
                                                <Td className="font-mono text-xs font-bold text-blue-700">
                                                  {chk.check_code}
                                                </Td>
                                                <Td className="font-mono text-xs font-semibold text-slate-700">
                                                  {chk.spk_code}
                                                </Td>
                                                <Td className="font-bold text-slate-800">
                                                  {chk.operator_name}{" "}
                                                  {chk.operator_code ? (
                                                    <span className="text-[11px] font-normal text-slate-500">
                                                      ({chk.operator_code})
                                                    </span>
                                                  ) : null}
                                                </Td>
                                                <Td className="text-slate-600">{chk.checker_name}</Td>
                                                <Td className="text-right font-black text-emerald-600">
                                                  {num(chk.good_qty)}
                                                </Td>
                                                <Td className="text-right font-bold text-rose-600">
                                                  {chk.reject_qty > 0 ? num(chk.reject_qty) : "0"}
                                                </Td>
                                                <Td className="text-slate-600 text-xs italic">{chk.notes || "-"}</Td>
                                                <Td className="text-center">
                                                  <span className="inline-flex rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                                                    {chk.status}
                                                  </span>
                                                </Td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </TableWrap>
                                      ) : (
                                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-xs font-medium text-slate-500">
                                          Belum ada riwayat hasil pengerjaan checker untuk tahapan kerja ini.
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </TableWrap>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm font-medium text-slate-500">
                  Tidak ada tahapan alur kerja untuk filter yang dipilih.
                </div>
              )
            ) : (
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-6 text-center">
                <p className="text-xs font-semibold text-slate-500">
                  Data tahapan kerja disiapkan on-demand agar dashboard tetap cepat dan ringan.
                </p>
                <button
                  type="button"
                  onClick={loadItemDetail}
                  disabled={detailLoading}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
                >
                  {detailLoading ? "Sedang Memuat..." : "Tampilkan Rincian Item Pekerjaan"}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: BARANG JADI & STOK */}
      {/* ======================================================== */}
      {activeTab === "BARANG_JADI" && (
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">Stok & Hasil Barang Jadi</h2>
                <p className="text-xs text-slate-500">
                  Daftar seluruh barang jadi (Internal, Titipan Luar, dan Mitra) beserta saldo stok per lokasi gudang.
                </p>
              </div>
              <button
                type="button"
                onClick={loadBarangJadi}
                disabled={fgLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 transition"
              >
                {fgLoading ? "Memuat..." : "🔄 Segarkan Stok"}
              </button>
            </div>

            {fgLoading ? (
              <div className="py-12 text-center text-sm font-bold text-slate-400">Memuat stok barang jadi...</div>
            ) : fgData && fgData.items.length > 0 ? (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Kode</Th>
                    <Th>Nama Barang Jadi</Th>
                    <Th>Produk Asosiasi</Th>
                    <Th>Kategori / Sumber</Th>
                    <Th className="text-right">Target Produksi</Th>
                    <Th className="text-right">Total Stok Fisik</Th>
                    <Th>Sebaran Stok per Lokasi Gudang / Mitra</Th>
                    <Th className="text-center">Status</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fgData.items.map((item, i) => {
                    const locations = (item.locations as Record<string, number>) || {};
                    const locEntries = Object.entries(locations);

                    return (
                      <tr key={i} className="hover:bg-slate-50/70 transition">
                        <Td className="font-mono text-xs font-bold text-blue-700">{text(item.code)}</Td>
                        <Td className="font-extrabold text-slate-900">{text(item.name)}</Td>
                        <Td className="text-slate-700">{text(item.product_name)}</Td>
                        <Td>
                          <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                            {text(item.category)} · {text(item.source)}
                          </span>
                        </Td>
                        <Td className="text-right font-medium">
                          {num(item.target_production)} {text(item.unit)}
                        </Td>
                        <Td className="text-right font-black text-emerald-600">
                          {num(item.total_stock)} {text(item.unit)}
                        </Td>
                        <Td>
                          {locEntries.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {locEntries.map(([locName, qty], lIdx) => (
                                <span
                                  key={lIdx}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700"
                                >
                                  <span className="text-slate-500">{locName}:</span>
                                  <span className="font-black text-slate-900">{num(qty)}</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Belum ada stok fisik tersimpan</span>
                          )}
                        </Td>
                        <Td className="text-center">
                          <span className="inline-flex rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                            {text(item.status)}
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm font-medium text-slate-500">
                Belum ada data barang jadi terdaftar.
              </div>
            )}
          </section>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 3: EMBERKASI & PENGIRIMAN / TRANSFER BARANG */}
      {/* ======================================================== */}
      {activeTab === "EMBARKASI" && (
        <div className="space-y-6">
          {/* Target Embarkasi */}
          <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">Target Alokasi per Embarkasi</h2>
                <p className="text-xs text-slate-500">
                  Target pengiriman koper, paket isian, dan aksesoris haji ke masing-masing asrama embarkasi.
                </p>
              </div>
              <button
                type="button"
                onClick={loadEmbarkasi}
                disabled={embLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 transition"
              >
                {embLoading ? "Memuat..." : "🔄 Segarkan Alokasi"}
              </button>
            </div>

            {embLoading ? (
              <div className="py-8 text-center text-sm font-bold text-slate-400">Memuat alokasi embarkasi...</div>
            ) : embData && embData.targets.length > 0 ? (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Kode Target</Th>
                    <Th>Embarkasi Tujuan</Th>
                    <Th>Jenis Item / Barang</Th>
                    <Th className="text-right">Target Kebutuhan</Th>
                    <Th className="text-center">Status</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {embData.targets.map((tgt, i) => {
                    const emb = tgt.embarkations as Record<string, unknown>;
                    const fg = tgt.finished_goods as Record<string, unknown>;
                    const setObj = tgt.product_sets as Record<string, unknown>;
                    const itemName = fg?.name || setObj?.name || "-";
                    const itemUnit = fg?.unit || setObj?.unit || "SET";

                    return (
                      <tr key={i} className="hover:bg-slate-50/70 transition">
                        <Td className="font-mono text-xs font-bold text-blue-700">{text(tgt.target_code)}</Td>
                        <Td className="font-extrabold text-slate-900">
                          {text(emb?.name)} {emb?.short_code ? `(${text(emb?.short_code)})` : ""}
                        </Td>
                        <Td className="font-bold text-slate-800">
                          {text(itemName)} <span className="text-xs text-slate-400">[{text(tgt.item_kind)}]</span>
                        </Td>
                        <Td className="text-right font-black text-slate-900">
                          {num(tgt.target_qty)} {text(itemUnit)}
                        </Td>
                        <Td className="text-center">
                          <span className="inline-flex rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                            {text(tgt.status)}
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm font-medium text-slate-500">
                Belum ada target alokasi embarkasi terdaftar.
              </div>
            )}
          </section>

          {/* Riwayat Surat Jalan / Pengiriman ke Embarkasi */}
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-blue-600 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                    DISTRIBUSI EMBARKASI
                  </span>
                  <span className="text-xs font-bold text-slate-600">
                    Manifes & Pelacakan Armada Pengiriman
                  </span>
                </div>
                <h2 className="mt-1 text-lg font-black text-slate-900">
                  Surat Jalan & Pengiriman ke Asrama Embarkasi
                </h2>
                <p className="text-xs text-slate-500">
                  Pencatatan armada kirim dari pabrik/gudang pusat ke embarkasi beserta status fisik diterima, selisih, dan dokumen surat jalan.
                </p>
              </div>
              <Link
                href="/dashboard/pengirimanEmbarkasi"
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-700 shadow-xs hover:bg-blue-100 transition"
              >
                🚚 Kelola Pengiriman Embarkasi →
              </Link>
            </div>

            {(() => {
              const mappedShipments: ShipmentItem[] = (embData?.shipments || []).map((s: any) => ({
                id: Number(s.id),
                shipment_code: String(s.code || ""),
                document_no: s.document_no ? String(s.document_no) : null,
                shipment_date: String(s.date || ""),
                quantity: Number(s.quantity || 0),
                status: String(s.status || "DISIAPKAN"),
                received_qty: s.received_qty !== null && s.received_qty !== undefined ? Number(s.received_qty) : null,
                reject_qty: s.reject_qty !== null && s.reject_qty !== undefined ? Number(s.reject_qty) : null,
                damaged_qty: s.damaged_qty !== null && s.damaged_qty !== undefined ? Number(s.damaged_qty) : null,
                missing_qty: s.missing_qty !== null && s.missing_qty !== undefined ? Number(s.missing_qty) : null,
                driver_name: s.driver ? String(s.driver) : null,
                vehicle_no: s.vehicle_no ? String(s.vehicle_no) : null,
                public_token: null,
                notes: s.notes ? String(s.notes) : null,
                surat_jalan_photo_url: s.surat_jalan_photo_url ? String(s.surat_jalan_photo_url) : null,
                source_location_name: String(s.source_location || "-"),
                embarkation_name: String(s.embarkation || "-"),
                item_name: String(s.item_name || "-"),
              }));

              return (
                <EmbarkasiShipmentTable
                  shipments={mappedShipments}
                  canOperate={false}
                />
              );
            })()}
          </section>

          {/* ======================================================== */}
          {/* MONITORING STOK & PENGIRIMAN PABRIK MITRA MR WU */}
          {/* ======================================================== */}
          <section className="rounded-3xl border-2 border-indigo-200/90 bg-gradient-to-b from-indigo-50/40 via-white to-white p-5 shadow-xs sm:p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-indigo-600 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                    PABRIK MITRA MR WU
                  </span>
                  <span className="text-xs font-bold text-slate-600">
                    Monitoring Fasilitas Mitra & Target Harian ({embData?.mr_wu_locations?.length || 3} Titik)
                  </span>
                </div>
                <h2 className="mt-1 text-lg font-black text-slate-900">
                  Target Harian & Posisi Stok di Pabrik Mitra MR WU
                </h2>
                <p className="text-xs text-slate-500">
                  Pantau capaian target harian perakitan SET koper (fleksibel) dan saldo stok fisik yang siap didispatch ke Embarkasi.
                </p>
              </div>
              <Link
                href="/dashboard/mitraMrWu"
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition"
              >
                🏢 Buka Portal Mitra MR WU →
              </Link>
            </div>

            {/* Target Harian & Summary Cards */}
            {(() => {
              const stocks = (embData?.mr_wu_stock || []) as Array<{
                id: number;
                location_id: number;
                location_name: string;
                item_name: string;
                item_code: string;
                quantity: number;
              }>;

              const locations = (embData?.mr_wu_locations && embData.mr_wu_locations.length > 0)
                ? embData.mr_wu_locations
                : [
                    { id: 2, name: "Pabrik Mitra MR WU (Dadap)", location_code: "MRWU-DAP" },
                    { id: 3, name: "Pabrik Mitra MR WU (Angkasa)", location_code: "MRWU-ANG" },
                    { id: 4, name: "Pabrik Mitra MR WU (Gudang Utama / Sendiri)", location_code: "MRWU-UTM" },
                  ];

              const runs = (embData?.mr_wu_packing_runs || []) as Array<{
                id: number;
                location_id: number;
                location_name: string;
                set_id: number;
                set_name: string;
                set_code: string;
                packing_date: string;
                set_qty: number;
                notes: string;
                created_at: string;
              }>;

              const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

              // Actual packed today per location
              const actualTodayByLoc = new Map<number, number>();
              runs.filter((r) => r.packing_date === todayStr).forEach((r) => {
                const cur = actualTodayByLoc.get(Number(r.location_id)) || 0;
                actualTodayByLoc.set(Number(r.location_id), cur + Number(r.set_qty || 0));
              });

              function getLocIcon(name: string): string {
                const u = (name || "").toUpperCase();
                if (u.includes("DADAP")) return "🏭";
                if (u.includes("ANGKASA")) return "✈️";
                if (u.includes("GUDANG") || u.includes("UTAMA")) return "📦";
                return "🏢";
              }

              return (
                <div className="space-y-6">
                  {/* Dynamic Facility Cards with Target Trackers */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {locations.map((loc: any) => {
                      const locId = Number(loc.id);
                      const locItems = stocks.filter((s) => Number(s.location_id) === locId);
                      const icon = getLocIcon(loc.name);
                      const targetVal = mrWuDailyTargets[locId] ?? (locId === 2 ? 300 : locId === 3 ? 200 : 150);
                      const todayPacked = actualTodayByLoc.get(locId) || 0;
                      const pct = targetVal > 0 ? Math.round((todayPacked / targetVal) * 100) : 0;
                      const isEditing = editingTargetLocId === locId;

                      // Ready SET stock
                      const readySetItem = locItems.find((it) =>
                        String(it.item_name || "").toUpperCase().includes("SET")
                      );
                      const readySetQty = readySetItem ? Number(readySetItem.quantity) : 0;

                      return (
                        <div
                          key={locId}
                          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs hover:shadow-xs transition flex flex-col justify-between"
                        >
                          <div>
                            {/* Card Header */}
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                                {icon} Lokasi #{locId}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400">
                                {loc.location_code || `LOK-${locId}`}
                              </span>
                            </div>

                            <h4 className="mt-2 text-sm font-black text-slate-900 line-clamp-1">{loc.name}</h4>

                            {/* Flexible Target Monitor */}
                            <div className="mt-3 rounded-xl bg-slate-50 p-3 border border-slate-100 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                  🎯 Target Harian:
                                </span>
                                {isEditing ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="1"
                                      className="w-16 rounded border border-indigo-300 px-1 py-0.5 text-xs font-bold text-indigo-700 focus:outline-hidden"
                                      value={tempTargetInput}
                                      onChange={(e) => setTempTargetInput(e.target.value)}
                                      autoFocus
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const parsed = parseInt(tempTargetInput, 10);
                                        if (parsed > 0) {
                                          setMrWuDailyTargets((prev) => ({ ...prev, [locId]: parsed }));
                                        }
                                        setEditingTargetLocId(null);
                                      }}
                                      className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-indigo-700"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingTargetLocId(null)}
                                      className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-300"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTargetLocId(locId);
                                      setTempTargetInput(String(targetVal));
                                    }}
                                    className="inline-flex items-center gap-1 text-[11px] font-extrabold text-indigo-700 hover:text-indigo-900"
                                    title="Klik untuk ubah target harian fleksibel"
                                  >
                                    <span>{targetVal} SET / hari</span>
                                    <span className="text-[10px] text-slate-400">✏️</span>
                                  </button>
                                )}
                              </div>

                              {/* Capaian Hari Ini */}
                              <div className="flex items-baseline justify-between text-xs">
                                <span className="text-slate-600 font-medium">Hasil Packing Hari Ini:</span>
                                <span className="font-black text-slate-900">
                                  {todayPacked} / {targetVal} SET{" "}
                                  <span
                                    className={`ml-1 text-[11px] font-extrabold ${
                                      pct >= 100
                                        ? "text-emerald-700"
                                        : pct >= 70
                                        ? "text-amber-700"
                                        : "text-rose-600"
                                    }`}
                                  >
                                    ({pct}%)
                                  </span>
                                </span>
                              </div>

                              {/* Visual Progress Bar */}
                              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    pct >= 100
                                      ? "bg-emerald-500"
                                      : pct >= 70
                                      ? "bg-amber-500"
                                      : "bg-rose-500"
                                  }`}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>

                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-slate-400">Status Capaian:</span>
                                <span
                                  className={`font-bold ${
                                    pct >= 100
                                      ? "text-emerald-700"
                                      : pct >= 70
                                      ? "text-amber-700"
                                      : "text-rose-600"
                                  }`}
                                >
                                  {pct >= 100
                                    ? "🟢 Target Tercapai"
                                    : pct >= 70
                                    ? "🟡 Mendekati Target"
                                    : "🔴 Perlu Dikejar / Lembur"}
                                </span>
                              </div>
                            </div>

                            {/* Ready SET Stock Card Info */}
                            <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50/70 p-2.5 border border-emerald-100">
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                                  Stok SET Siap Embarkasi:
                                </span>
                                <p className="text-base font-black text-emerald-800">
                                  {num(readySetQty)} <span className="text-xs font-semibold">SET / Pcs</span>
                                </p>
                              </div>
                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                                  readySetQty > 0
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                    : "bg-slate-100 text-slate-500 border-slate-200"
                                }`}
                              >
                                {readySetQty > 0 ? "✅ Ready Kirim" : "Belum Ada Set"}
                              </span>
                            </div>
                          </div>

                          {/* Items Breakdown list */}
                          <div className="mt-3 border-t border-slate-100 pt-2 text-xs">
                            <div className="flex items-center justify-between text-slate-500 text-[11px] mb-1 font-semibold">
                              <span>Komponen Fisik di Lokasi:</span>
                              <span>{locItems.length} Jenis</span>
                            </div>
                            <div className="divide-y divide-slate-100 max-h-32 overflow-y-auto pr-1">
                              {locItems.length > 0 ? (
                                locItems.map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between py-1 text-slate-600">
                                    <span className="truncate pr-2 font-medium">{item.item_name}</span>
                                    <span className="font-bold text-slate-900 shrink-0">
                                      {num(item.quantity)} Pcs
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <p className="py-1 text-slate-400 italic">Belum ada stok fisik</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ======================================================== */}
                  {/* RIWAYAT PENGERJAAN PACKING HARIAN MR WU (HANYA LIHAT / READ-ONLY) */}
                  {/* ======================================================== */}
                  <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                            AUDIT LOG
                          </span>
                          <h3 className="text-base font-black text-slate-900">
                            Riwayat Pencatatan Packing Harian MR WU
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500">
                          Data hasil packing harian yang dilaporkan oleh Admin MR WU (Hanya Akses Lihat untuk Manager).
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Cari lokasi, set koper, catatan..."
                          value={mrWuRunSearch}
                          onChange={(e) => setMrWuRunSearch(e.target.value)}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden"
                        />
                      </div>
                    </div>

                    {(() => {
                      const filteredRuns = runs.filter((r) => {
                        if (!mrWuRunSearch) return true;
                        const s = mrWuRunSearch.toLowerCase();
                        return (
                          (r.location_name && r.location_name.toLowerCase().includes(s)) ||
                          (r.set_name && r.set_name.toLowerCase().includes(s)) ||
                          (r.notes && r.notes.toLowerCase().includes(s)) ||
                          (r.packing_date && r.packing_date.includes(s))
                        );
                      });

                      return filteredRuns.length > 0 ? (
                        <TableWrap>
                          <thead>
                            <tr>
                              <Th>Tanggal Packing</Th>
                              <Th>Lokasi Fasilitas MR WU</Th>
                              <Th>Jenis Set Koper</Th>
                              <Th className="text-right">Hasil Packing Hari Itu</Th>
                              <Th>Catatan Pengerjaan</Th>
                              <Th className="text-slate-400 text-right">Waktu Input</Th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredRuns.map((r) => {
                              const icon = getLocIcon(r.location_name);
                              return (
                                <tr key={r.id} className="hover:bg-slate-50/70 transition">
                                  <Td className="font-semibold text-slate-900">{text(r.packing_date)}</Td>
                                  <Td>
                                    <span className="font-extrabold text-slate-800">
                                      {icon} {text(r.location_name)}
                                    </span>
                                  </Td>
                                  <Td>
                                    <span className="font-bold text-indigo-900">{text(r.set_name)}</span>
                                    {r.set_code && (
                                      <span className="block font-mono text-[10px] text-slate-400">
                                        {r.set_code}
                                      </span>
                                    )}
                                  </Td>
                                  <Td className="text-right font-black text-emerald-700">
                                    +{num(r.set_qty)} <span className="text-xs font-semibold text-slate-500">SET / Pcs</span>
                                  </Td>
                                  <Td className="text-xs text-slate-600 max-w-xs truncate">
                                    {text(r.notes || "-")}
                                  </Td>
                                  <Td className="text-right text-[11px] font-mono text-slate-400">
                                    {r.created_at ? new Date(r.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}
                                  </Td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </TableWrap>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm font-medium text-slate-500">
                          {mrWuRunSearch
                            ? `Tidak ada riwayat packing yang cocok dengan "${mrWuRunSearch}".`
                            : "Belum ada pencatatan hasil packing harian dari Admin MR WU."}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Rincian Detail Stok Fisik MR WU */}
                  {embData?.mr_wu_stock && embData.mr_wu_stock.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                        Rincian Saldo Stok Fisik di Pabrik Mitra MR WU:
                      </h3>
                      <TableWrap>
                        <thead>
                          <tr>
                            <Th>Lokasi Fasilitas</Th>
                            <Th>Kode Barang</Th>
                            <Th>Nama Barang Jadi</Th>
                            <Th className="text-right">Stok Fisik Tersedia</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {embData.mr_wu_stock.map((stk: any, sIdx: number) => (
                            <tr key={sIdx} className="hover:bg-slate-50/70 transition">
                              <Td className="font-bold text-indigo-900">{text(stk.location_name)}</Td>
                              <Td className="font-mono text-xs font-bold text-slate-600">{text(stk.item_code)}</Td>
                              <Td className="font-semibold text-slate-800">{text(stk.item_name)}</Td>
                              <Td className="text-right font-black text-emerald-600">{num(stk.quantity)} Pcs</Td>
                            </tr>
                          ))}
                        </tbody>
                      </TableWrap>
                    </div>
                  )}
                </div>
              );
            })()}
          </section>

          {/* Riwayat Transfer Barang Antar Gudang / Pabrik Mitra */}
          <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs sm:p-6 space-y-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">Transfer Barang Antar Gudang & Pabrik Mitra</h2>
              <p className="text-xs text-slate-500">
                Mutasi fisik stok barang jadi antar titik fasilitas (Gudang Pusat, Pabrik Mitra MR WU, dll) beserta status konfirmasi penerimaan dan foto surat jalan.
              </p>
            </div>

            {embData && embData.transfers.length > 0 ? (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Tgl Transfer</Th>
                    <Th>No Transfer / Dokumen</Th>
                    <Th>Barang Jadi</Th>
                    <Th>Dari Lokasi</Th>
                    <Th>Ke Lokasi Tujuan</Th>
                    <Th className="text-right">Jumlah Transfer</Th>
                    <Th className="text-right">Diterima</Th>
                    <Th className="text-center">Status Kirim</Th>
                    <Th className="text-center">Foto Surat Jalan</Th>
                    <Th>Catatan</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {embData.transfers.map((t, i) => (
                    <tr key={i} className="hover:bg-slate-50/70 transition">
                      <Td className="font-semibold text-slate-900">{text(t.date)}</Td>
                      <Td>
                        <span className="font-mono text-xs font-bold text-blue-700">{text(t.code)}</span>
                        {Boolean(t.document_no) && (
                          <span className="block text-[10px] text-slate-500 font-semibold">{text(t.document_no)}</span>
                        )}
                      </Td>
                      <Td className="font-extrabold text-slate-900">{text(t.item_name)}</Td>
                      <Td className="text-slate-700 font-medium">{text(t.from_location)}</Td>
                      <Td className="text-emerald-700 font-bold">➜ {text(t.to_location)}</Td>
                      <Td className="text-right font-black text-slate-900">
                        {num(t.quantity)} {text(t.unit)}
                      </Td>
                      <Td className="text-right font-black text-emerald-600">
                        {t.received_qty !== null && t.received_qty !== undefined
                          ? `${num(t.received_qty)} ${text(t.unit)}`
                          : "-"}
                      </Td>
                      <Td className="text-center">
                        <span
                          className={`inline-flex rounded-lg px-2.5 py-0.5 text-xs font-bold ${
                            t.delivery_status === "DITERIMA"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {t.delivery_status === "DITERIMA" ? "Diterima" : "Menunggu Konfirmasi"}
                        </span>
                      </Td>
                      <Td className="text-center">
                        {t.surat_jalan_photo_url ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewPhoto({
                                url: String(t.surat_jalan_photo_url),
                                title: `Foto Fisik Surat Jalan Transfer - ${String(t.code || t.document_no || "Transfer")}`,
                                subtitle: `Dari: ${String(t.from_location)} ➜ Ke: ${String(t.to_location)} | Qty: ${num(t.quantity)}`,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 shadow-2xs hover:bg-indigo-100 transition"
                          >
                            📸 Lihat Foto SJ
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Belum ada foto</span>
                        )}
                      </Td>
                      <Td className="text-xs text-slate-500 italic">
                        {text(t.received_notes || t.notes)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm font-medium text-slate-500">
                Belum ada transaksi transfer barang jadi antar lokasi.
              </div>
            )}
          </section>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 4: BARANG REJECT */}
      {/* ======================================================== */}
      {activeTab === "REJECT" && (
        <div className="space-y-6">
          {/* KPI Reject */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Reject Lini Borongan"
              value={`${num(rejectData?.summary.total_production_reject || 0)} Pcs`}
              hint="Reject pengerjaan operator pada SPK"
              icon="⚠️"
              color="rose"
            />
            <Kpi
              label="Reject Inspeksi QC"
              value={`${num(rejectData?.summary.total_qc_reject || 0)} Pcs`}
              hint="Barang afkir lolos ke QC akhir"
              icon="🔍"
              color="amber"
            />
            <Kpi
              label="Rework QC (Bisa Diperbaiki)"
              value={`${num(rejectData?.summary.total_qc_rework || 0)} Pcs`}
              hint="Item perbaikan ulang oleh tim QC"
              icon="🛠️"
              color="blue"
            />
            <Kpi
              label="Kendala / Retur Embarkasi"
              value={`${num(rejectData?.summary.total_embarkation_issues || 0)} Pcs`}
              hint="Reject fisik saat diterima asrama haji"
              icon="🚚"
              color="purple"
            />
          </section>

          {/* Rincian Reject Lini Borongan */}
          <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">Rincian Reject Lini Borongan & Checker</h2>
                <p className="text-xs text-slate-500">
                  Daftar pengerjaan yang dicatat reject oleh checker harian saat verifikasi output borongan.
                </p>
              </div>
              <button
                type="button"
                onClick={loadReject}
                disabled={rejectLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 transition"
              >
                {rejectLoading ? "Memuat..." : "🔄 Segarkan Reject"}
              </button>
            </div>

            {rejectLoading ? (
              <div className="py-8 text-center text-sm font-bold text-slate-400">Memuat log reject...</div>
            ) : rejectData && rejectData.production_rejects.length > 0 ? (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Tgl Periksa</Th>
                    <Th>Kode Checker</Th>
                    <Th>No SPK</Th>
                    <Th>Produk</Th>
                    <Th>Item Pekerjaan</Th>
                    <Th>Operator Borongan</Th>
                    <Th className="text-right">Qty Sah</Th>
                    <Th className="text-right">Reject</Th>
                    <Th>Catatan / Penyebab</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rejectData.production_rejects.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/70 transition">
                      <Td className="font-semibold text-slate-900">{text(r.date)}</Td>
                      <Td className="font-mono text-xs font-bold text-blue-700">{text(r.code)}</Td>
                      <Td className="font-mono text-xs font-semibold text-slate-700">{text(r.spk_code)}</Td>
                      <Td className="font-bold text-slate-800">{text(r.product)}</Td>
                      <Td className="text-blue-900 font-bold">{text(r.work_item)}</Td>
                      <Td className="text-slate-800 font-medium">{text(r.operator)}</Td>
                      <Td className="text-right font-black text-emerald-600">{num(r.good_qty)}</Td>
                      <Td className="text-right font-black text-rose-600 bg-rose-50/40">{num(r.reject_qty)}</Td>
                      <Td className="text-xs text-slate-600 italic">{text(r.notes)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm font-medium text-slate-500">
                Tidak ada reject pengerjaan borongan tercatat (Semua pekerjaan lolos sah 100%).
              </div>
            )}
          </section>

          {/* Rincian Reject QC */}
          <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs sm:p-6 space-y-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">Temuan Reject pada Quality Control (QC)</h2>
              <p className="text-xs text-slate-500">
                Pemeriksaan fisik akhir sebelum barang masuk ke saldo barang jadi siap kirim.
              </p>
            </div>

            {rejectData && rejectData.qc_rejects.length > 0 ? (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Tgl QC</Th>
                    <Th>Kode QC</Th>
                    <Th>Barang Jadi</Th>
                    <Th className="text-right">Diperiksa</Th>
                    <Th className="text-right">Lolos (Baik)</Th>
                    <Th className="text-right">Reject</Th>
                    <Th className="text-right">Rework</Th>
                    <Th>Catatan Kerusakan</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rejectData.qc_rejects.map((q, i) => (
                    <tr key={i} className="hover:bg-slate-50/70 transition">
                      <Td className="font-semibold text-slate-900">{text(q.date)}</Td>
                      <Td className="font-mono text-xs font-bold text-blue-700">{text(q.code)}</Td>
                      <Td className="font-extrabold text-slate-900">{text(q.item)}</Td>
                      <Td className="text-right font-medium">{num(q.inspected_qty)}</Td>
                      <Td className="text-right font-black text-emerald-600">{num(q.good_qty)}</Td>
                      <Td className="text-right font-black text-rose-600 bg-rose-50/40">{num(q.reject_qty)}</Td>
                      <Td className="text-right font-black text-amber-600 bg-amber-50/40">{num(q.rework_qty)}</Td>
                      <Td className="text-xs text-slate-600 italic">{text(q.notes)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm font-medium text-slate-500">
                Tidak ada temuan reject pada pemeriksaan Quality Control.
              </div>
            )}
          </section>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 5: RIWAYAT AKTIVITAS PABRIK */}
      {/* ======================================================== */}
      {activeTab === "RIWAYAT" && (
        <section className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xs sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">Riwayat Aktivitas & Peristiwa Pabrik</h2>
              <p className="text-xs text-slate-500">
                Log kronologis seluruh aktivitas: SPK, input checker, hasil QC, dan pergerakan stok pada periode terpilih.
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadHistory(0, false)}
              disabled={detailLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 transition"
            >
              {detailLoading ? "Memuat..." : "🔄 Segarkan Log"}
            </button>
          </div>

          {historyLoaded ? (
            historyRows.length > 0 ? (
              <div className="space-y-4">
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>Waktu Kejadian</Th>
                      <Th>Kategori Event</Th>
                      <Th>Kode Dokumen</Th>
                      <Th>Proyek</Th>
                      <Th>Produk</Th>
                      <Th>Rincian Transaksi</Th>
                      <Th className="text-center">Status</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyRows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50/70 transition">
                        <Td className="whitespace-nowrap text-xs text-slate-500">
                          {text(r.event_at ? String(r.event_at).slice(0, 16).replace("T", " ") : "-")}
                        </Td>
                        <Td>
                          <span
                            className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-extrabold ${
                              r.event_type === "CHECKER"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : r.event_type === "SPK"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : r.event_type === "QC"
                                ? "bg-purple-50 text-purple-700 border border-purple-200"
                                : "bg-slate-100 text-slate-700 border border-slate-200"
                            }`}
                          >
                            {text(r.event_type)}
                          </span>
                        </Td>
                        <Td className="font-mono text-xs font-bold text-slate-900">{text(r.code)}</Td>
                        <Td className="font-bold text-slate-800">{text(r.project_name)}</Td>
                        <Td className="text-slate-700">{text(r.product_name)}</Td>
                        <Td className="text-xs font-medium text-slate-700">{text(r.detail)}</Td>
                        <Td className="text-center">
                          <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                            {text(r.status)}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>

                {historyHasMore && (
                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => loadHistory(historyOffset, true)}
                      disabled={detailLoading}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 transition"
                    >
                      {detailLoading ? "Memuat data selanjutnya..." : "Muat 50 Riwayat Lebih Lama ↓"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm font-medium text-slate-500">
                Tidak ada peristiwa atau riwayat aktivitas pada rentang periode ini.
              </div>
            )
          ) : (
            <div className="py-12 text-center text-sm font-bold text-slate-400">Memuat log aktivitas...</div>
          )}
        </section>
      )}

      {/* Lightbox / Modal Pratinjau Foto Fisik Surat Jalan */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">{previewPhoto.title}</h3>
                {previewPhoto.subtitle && (
                  <p className="text-xs text-slate-500">{previewPhoto.subtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewPhoto.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                >
                  Buka Tab Baru ↗
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewPhoto(null)}
                  className="rounded-xl bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-300 transition"
                >
                  ✕ Tutup
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-950/90 p-4 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewPhoto.url}
                alt={previewPhoto.title}
                className="max-h-[70vh] w-auto rounded-lg object-contain shadow-md"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
