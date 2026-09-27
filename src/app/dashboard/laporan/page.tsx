import { cookies } from "next/headers";
import { Card, Empty, Metric, PageShell, TableWrap, Td, Th } from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { money, n, param, qty, type SearchParams } from "@/lib/final/final-utils";
import { resolveProjectCategory } from "@/lib/project-category";
import { createClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<SearchParams> };

function jakartaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function dateParam(q: SearchParams, key: string, fallback: string) {
  const v = param(q, key, fallback);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback;
}
function exportHref(
  report: string,
  from: string,
  to: string,
  extra: Record<string, string> = {}
) {
  return `/api/export/xlsx?${new URLSearchParams({ report, from, to, ...extra }).toString()}`;
}
function fmtDatetime(iso: string) {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
function fmtDate(d: string) {
  if (!d) return "-";
  try {
    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(d));
  } catch {
    return d;
  }
}

// ─── status badge helper ──────────────────────────────────────────────────────
function statusBadge(status: string) {
  const s = String(status ?? "").toUpperCase();
  const map: Record<string, string> = {
    SELESAI:   "bg-emerald-50 text-emerald-700 border-emerald-200",
    DONE:      "bg-emerald-50 text-emerald-700 border-emerald-200",
    AKTIF:     "bg-blue-50 text-blue-700 border-blue-200",
    OPEN:      "bg-blue-50 text-blue-700 border-blue-200",
    PENDING:   "bg-amber-50 text-amber-700 border-amber-200",
    PROSES:    "bg-amber-50 text-amber-700 border-amber-200",
    BATAL:     "bg-red-50 text-red-700 border-red-200",
    REJECTED:  "bg-red-50 text-red-700 border-red-200",
    APPROVED:  "bg-emerald-50 text-emerald-700 border-emerald-200",
    IN:        "bg-sky-50 text-sky-700 border-sky-200",
    OUT:       "bg-orange-50 text-orange-700 border-orange-200",
  };
  const cls = map[s] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {status || "-"}
    </span>
  );
}

// ─── progress bar helper ──────────────────────────────────────────────────────
function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const color =
    clamped >= 100
      ? "bg-emerald-500"
      : clamped >= 60
      ? "bg-blue-500"
      : clamped >= 30
      ? "bg-amber-400"
      : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs tabular-nums text-gray-500">{clamped.toFixed(0)}%</span>
    </div>
  );
}

// ─── export groups ────────────────────────────────────────────────────────────
const EXPORT_GROUPS = [
  {
    label: "🏭 Gudang & Bahan",
    color: "border-sky-200 bg-sky-50/40 text-sky-800",
    items: [
      ["barang_masuk", "Barang Masuk Gudang"],
      ["barang_keluar", "Barang Keluar Gudang"],
      ["log_bahan", "Log Bahan Baku"],
      ["stok_gudang", "Stok Gudang"],
      ["roll_lot", "Stock Roll / Lot"],
      ["permintaan_produksi", "Permintaan Produksi"],
    ],
  },
  {
    label: "⚙️ Produksi",
    color: "border-violet-200 bg-violet-50/40 text-violet-800",
    items: [
      ["cutting", "Cutting"],
      ["sablon", "Sablon / WIP"],
      ["siap_produksi", "Siap Produksi"],
      ["spk", "SPK Produksi"],
      ["checker", "Checker / Qty Sah"],
      ["hasil_produksi", "Hasil Produksi Equivalent"],
      ["qc", "Quality Control"],
    ],
  },
  {
    label: "📦 Barang Jadi & Logistik",
    color: "border-teal-200 bg-teal-50/40 text-teal-800",
    items: [
      ["stok_barang_jadi", "Stok Barang Jadi"],
      ["barang_luar", "Barang Luar"],
      ["transfer_barang_jadi", "Transfer Barang Jadi"],
      ["packing_set", "Packing Set"],
      ["stok_set", "Stok Set"],
      ["target_embarkasi", "Target Embarkasi"],
      ["pengiriman", "Pengiriman Embarkasi"],
      ["reject_embarkasi", "Reject / Masalah Embarkasi"],
    ],
  },
  {
    label: "💰 SDM & Keuangan",
    color: "border-amber-200 bg-amber-50/40 text-amber-800",
    items: [
      ["absensi", "Absensi"],
      ["payroll", "Payroll Harian/Bulanan"],
      ["payroll_borongan", "Payroll Borongan"],
      ["kasbon", "Kasbon"],
      ["kas_kecil", "Kas Kecil"],
      ["keuangan", "Keuangan"],
      ["manufaktur", "Manufaktur"],
      ["audit", "Audit Sistem"],
    ],
  },
] as const;

// ─── input style ─────────────────────────────────────────────────────────────
const inputCls =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 shadow-xs outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
const selectCls =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 shadow-xs outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

// ─── page ─────────────────────────────────────────────────────────────────────
export default async function Page({ searchParams }: Props) {
  await requirePermission("laporan.view");
  const q = await searchParams;
  const cookieStore = await cookies();
  const workspaceCookie = cookieStore.get("smpt_workspace")?.value?.toUpperCase();

  const today = jakartaToday();
  const from = dateParam(q, "from", today);
  const to = dateParam(q, "to", today);

  // workspace filter: param > cookie > SEMUA
  const wsParam = param(q, "ws", "").toUpperCase();
  const ws =
    wsParam === "HAJI" ? "HAJI" : wsParam === "REGULER" ? "REGULER" : wsParam === "SEMUA" ? "SEMUA" : workspaceCookie === "HAJI" ? "HAJI" : workspaceCookie === "REGULER" ? "REGULER" : "SEMUA";

  // project filter
  const projectIdRaw = param(q, "project_id", "");
  const projectId = /^\d+$/.test(projectIdRaw) ? Number(projectIdRaw) : null;

  const s = await createClient();

  // paralel fetch
  const [hr, pr, cr, ar, projRes] = await Promise.all([
    s.rpc("smpt_final_health"),
    // progress produksi — filter by workspace jika dipilih
    (() => {
      let q2 = s.from("v_production_progress").select("*").order("order_id", { ascending: false }).limit(200);
      // v_production_progress mungkin punya kolom project_category atau project_id
      if (projectId) q2 = (q2 as any).eq("project_id", projectId);
      return q2;
    })(),
    // aktivitas keuangan
    s
      .from("v_finance_activity")
      .select("*")
      .gte("transaction_date", from)
      .lte("transaction_date", to)
      .order("transaction_date", { ascending: false })
      .limit(200),
    // audit events
    s
      .from("audit_events")
      .select("id,audit_code,occurred_at,table_name,record_id,action")
      .gte("occurred_at", `${from}T00:00:00+07:00`)
      .lte("occurred_at", `${to}T23:59:59.999+07:00`)
      .order("occurred_at", { ascending: false })
      .limit(80),
    // daftar proyek untuk dropdown filter
    s.from("projects").select("id, name, project_code, product_category, status").order("name").limit(400),
  ]);

  const err = [hr.error, pr.error, cr.error, ar.error, projRes.error].find(Boolean);
  if (err) throw new Error(err.message);

  const h = (hr.data || {}) as Record<string, unknown>;

  // filter proyek by workspace
  const allProjects = (projRes.data ?? []) as Array<{
    id: number;
    name: string;
    project_code: string | null;
    product_category: string | null;
    status: string;
  }>;
  const filteredProjects =
    ws === "SEMUA"
      ? allProjects
      : allProjects.filter((p) => resolveProjectCategory(p) === ws);

  // filter progress produksi by workspace (via project map)
  const projectCatMap = new Map(allProjects.map((p) => [p.id, resolveProjectCategory(p)]));
  const prodRows = ((pr.data ?? []) as any[]).filter((x) => {
    if (ws === "SEMUA") return true;
    const cat = x.product_category ?? projectCatMap.get(x.project_id);
    return cat === ws;
  });

  // ringkasan keuangan dari tabel finance
  const finRows = (cr.data ?? []) as any[];
  const totalMasuk = finRows.filter((x) => x.direction === "IN").reduce((s, x) => s + n(x.amount), 0);
  const totalKeluar = finRows.filter((x) => x.direction === "OUT").reduce((s, x) => s + n(x.amount), 0);

  // extra param untuk export (workspace)
  const extraExport: Record<string, string> = {};
  if (ws !== "SEMUA") extraExport.ws = ws;
  if (projectId) extraExport.project_id = String(projectId);

  const wsLabel = ws === "HAJI" ? "🕋 Haji" : ws === "REGULER" ? "🏭 Reguler" : "Semua Workspace";

  return (
    <PageShell
      eyebrow="Keuangan & Laporan"
      title="Laporan & Export"
      description={`Ringkasan lintas produksi, keuangan, dan audit. Pusat unduh file Excel server-side. Workspace aktif: ${wsLabel}.`}
    >
      {/* ── Filter Panel ─────────────────────────────────────────────────── */}
      <Card title="Filter & Periode">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]" method="get">
          {/* workspace */}
          <label className="text-xs font-bold text-slate-700">
            Workspace
            <select name="ws" defaultValue={ws} className={selectCls}>
              <option value="SEMUA">🌐 Semua Workspace</option>
              <option value="HAJI">🕋 Haji</option>
              <option value="REGULER">🏭 Reguler</option>
            </select>
          </label>

          {/* project filter */}
          <label className="text-xs font-bold text-slate-700">
            Proyek
            <select name="project_id" defaultValue={projectId ?? ""} className={selectCls}>
              <option value="">— Semua Proyek —</option>
              {filteredProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {resolveProjectCategory(p) === "HAJI" ? "🕋" : "🏭"} {p.project_code ? `[${p.project_code}] ` : ""}
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          {/* dari */}
          <label className="text-xs font-bold text-slate-700">
            Dari
            <input name="from" type="date" defaultValue={from} className={inputCls} />
          </label>

          {/* sampai */}
          <label className="text-xs font-bold text-slate-700">
            Sampai
            <input name="to" type="date" defaultValue={to} className={inputCls} />
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:from-blue-700 hover:to-blue-800 transition"
            >
              Terapkan
            </button>
          </div>
        </form>

        {/* Quick export laporan lengkap */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a
            href={exportHref("laporan", from, to, extraExport)}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-xs hover:bg-emerald-100 transition"
          >
            📥 Export Laporan Lengkap Excel
          </a>
          <span className="text-xs text-slate-400">
            {from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`}
            {ws !== "SEMUA" ? ` · ${wsLabel}` : ""}
            {projectId ? ` · Proyek #${projectId}` : ""}
          </span>
        </div>
      </Card>

      {/* ── KPI Metrics ──────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="SPK Aktif" value={n(h.production_orders)} />
        <Metric label="QC Inspeksi" value={n(h.qc_inspections)} />
        <Metric label="Pengiriman Open" value={n(h.shipments_open)} />
        <Metric
          label="Negative Stock"
          value={
            <span className={(n(h.negative_raw_stock) + n(h.negative_logistics_stock)) > 0 ? "text-red-600" : ""}>
              {n(h.negative_raw_stock) + n(h.negative_logistics_stock)}
            </span>
          }
        />
      </div>

      {/* Ringkasan keuangan periode */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label={`Transaksi Masuk (${fmtDate(from)}–${fmtDate(to)})`} value={<span className="text-emerald-700">{money(totalMasuk)}</span>} />
        <Metric label={`Transaksi Keluar`} value={<span className="text-red-600">{money(totalKeluar)}</span>} />
        <Metric label="Net Periode" value={<span className={(totalMasuk - totalKeluar) >= 0 ? "text-emerald-700" : "text-red-600"}>{money(totalMasuk - totalKeluar)}</span>} />
      </div>

      {/* ── Pusat Export Excel ───────────────────────────────────────────── */}
      <Card title="📊 Pusat Export Excel">
        <p className="mb-5 text-xs leading-relaxed text-slate-500">
          Setiap file dibuat di server dengan permission RLS user login. Filter periode & workspace ikut diterapkan.
          <br />
          <span className="font-semibold text-slate-600">Preview jumlah baris</span> ditampilkan sebagai estimasi; download otomatis saat diklik.
        </p>

        <div className="space-y-5">
          {EXPORT_GROUPS.map((group) => (
            <div key={group.label}>
              <p className={`mb-2.5 inline-block rounded-lg border px-2.5 py-1 text-xs font-bold ${group.color}`}>
                {group.label}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.items.map(([key, title]) => (
                  <a
                    key={key}
                    href={exportHref(key, from, to, extraExport)}
                    className="group flex flex-col rounded-xl border border-slate-200/90 bg-white px-3.5 py-3 shadow-xs transition hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-sm"
                  >
                    <span className="text-sm font-bold text-slate-800 group-hover:text-blue-700 transition">
                      {title}
                    </span>
                    <span className="mt-1 text-xs font-normal text-slate-400">Unduh .xlsx</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Progress Produksi ─────────────────────────────────────────────── */}
      <Card title={`📋 Progress Produksi${ws !== "SEMUA" ? ` — ${wsLabel}` : ""}${prodRows.length > 0 ? ` (${prodRows.length} SPK)` : ""}`}>
        {prodRows.length === 0 ? (
          <Empty>Tidak ada data produksi untuk filter ini.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>SPK</Th>
                <Th>Produk / Proyek</Th>
                <Th>Operator</Th>
                <Th>Target</Th>
                <Th>Qty Sah</Th>
                <Th>Reject</Th>
                <Th>Progress</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {prodRows.map((x: any) => {
                const target = n(x.assigned_qty) || n(x.target_qty) || 1;
                const approved = n(x.approved_qty);
                const pct = (approved / target) * 100;
                return (
                  <tr key={x.order_id} className="hover:bg-slate-50/60">
                    <Td>
                      <span className="font-mono font-semibold text-slate-800">{x.spk_code || x.order_code || "-"}</span>
                    </Td>
                    <Td>
                      <div className="text-xs text-slate-700">{x.product_name || x.item_name || "-"}</div>
                      {x.project_name && <div className="text-[11px] text-slate-400">{x.project_name}</div>}
                    </Td>
                    <Td>{x.operator_name || "-"}</Td>
                    <Td className="tabular-nums">{qty(target)}</Td>
                    <Td className="tabular-nums font-semibold text-emerald-700">{qty(approved)}</Td>
                    <Td className="tabular-nums text-red-600">{qty(x.rejected_qty)}</Td>
                    <Td><ProgressBar pct={pct} /></Td>
                    <Td>{statusBadge(x.status)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {/* ── Aktivitas Keuangan ───────────────────────────────────────────── */}
      <Card title={`💳 Aktivitas Keuangan — ${fmtDate(from)} s/d ${fmtDate(to)}${finRows.length > 0 ? ` (${finRows.length} transaksi)` : ""}`}>
        {finRows.length === 0 ? (
          <Empty>Tidak ada transaksi keuangan di periode ini.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Sumber</Th>
                <Th>Kategori</Th>
                <Th>Arah</Th>
                <Th>Nominal</Th>
                <Th>Keterangan</Th>
              </tr>
            </thead>
            <tbody>
              {finRows.map((x: any, i: number) => (
                <tr key={`${x.source}-${x.code}-${i}`} className="hover:bg-slate-50/60">
                  <Td className="tabular-nums text-slate-500 whitespace-nowrap">{fmtDate(x.transaction_date)}</Td>
                  <Td>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                      {x.source || "-"}
                    </span>
                  </Td>
                  <Td className="text-xs text-slate-600">{x.category || "-"}</Td>
                  <Td>{statusBadge(x.direction)}</Td>
                  <Td className={`tabular-nums font-semibold ${x.direction === "IN" ? "text-emerald-700" : "text-red-600"}`}>
                    {money(x.amount)}
                  </Td>
                  <Td className="text-xs text-slate-400 max-w-[200px] truncate">{x.notes || x.description || "-"}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {/* ── Audit Terbaru ────────────────────────────────────────────────── */}
      <Card title={`🔍 Audit Terbaru — ${fmtDate(from)} s/d ${fmtDate(to)}${(ar.data ?? []).length > 0 ? ` (${(ar.data ?? []).length} event)` : ""}`}>
        {(ar.data ?? []).length === 0 ? (
          <Empty>Tidak ada audit event di periode ini.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Waktu</Th>
                <Th>Kode</Th>
                <Th>Tabel</Th>
                <Th>Record ID</Th>
                <Th>Aksi</Th>
              </tr>
            </thead>
            <tbody>
              {(ar.data ?? []).map((x: any) => (
                <tr key={x.id} className="hover:bg-slate-50/60">
                  <Td className="whitespace-nowrap text-xs tabular-nums text-slate-500">{fmtDatetime(x.occurred_at)}</Td>
                  <Td>
                    <span className="font-mono text-xs text-slate-600">{x.audit_code || "-"}</span>
                  </Td>
                  <Td>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700">
                      {x.table_name || "-"}
                    </span>
                  </Td>
                  <Td className="font-mono text-xs text-slate-500">{x.record_id || "-"}</Td>
                  <Td>{statusBadge(x.action)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </PageShell>
  );
}
