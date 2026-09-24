import { Card, Metric, PageShell, TableWrap, Td, Th } from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { money, n, param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";

type Props = { searchParams: Promise<SearchParams> };

function jakartaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function dateParam(q: SearchParams, key: string, fallback: string) {
  const v = param(q, key, fallback);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback;
}
function exportHref(report: string, from: string, to: string) {
  return `/api/export/xlsx?${new URLSearchParams({ report, from, to }).toString()}`;
}

const exports = [
  ["barang_masuk", "Barang Masuk Gudang"], ["barang_keluar", "Barang Keluar Gudang"], ["log_bahan", "Log Bahan Baku"], ["stok_gudang", "Stok Gudang"], ["roll_lot", "Stock Roll / Lot"],
  ["permintaan_produksi", "Permintaan Produksi"], ["cutting", "Cutting"], ["sablon", "Sablon / WIP"], ["siap_produksi", "Siap Produksi / Consumption"],
  ["spk", "SPK Produksi"], ["checker", "Checker / Qty Sah"], ["hasil_produksi", "Hasil Produksi Equivalent"], ["qc", "Quality Control"],
  ["stok_barang_jadi", "Stok Barang Jadi"], ["barang_luar", "Barang Luar"], ["transfer_barang_jadi", "Transfer Barang Jadi"], ["packing_set", "Packing Set"], ["stok_set", "Stok Set"],
  ["target_embarkasi", "Target Embarkasi"], ["pengiriman", "Pengiriman Embarkasi"], ["reject_embarkasi", "Reject / Masalah Embarkasi"],
  ["absensi", "Absensi"], ["payroll", "Payroll Harian/Bulanan"], ["payroll_borongan", "Payroll Borongan"], ["kasbon", "Kasbon"], ["kas_kecil", "Kas Kecil"],
  ["keuangan", "Keuangan"], ["manufaktur", "Manufaktur"], ["audit", "Audit Sistem"],
] as const;

export default async function Page({ searchParams }: Props) {
  await requirePermission("laporan.view");
  const q = await searchParams;
  const today = jakartaToday();
  const from = dateParam(q, "from", today);
  const to = dateParam(q, "to", today);
  const s = await createClient();
  const [hr, pr, cr, ar] = await Promise.all([
    s.rpc("smpt_final_health"),
    s.from("v_production_progress").select("*").limit(300),
    s.from("v_finance_activity").select("*").gte("transaction_date", from).lte("transaction_date", to).order("transaction_date", { ascending: false }).limit(300),
    s.from("audit_events").select("id,audit_code,occurred_at,table_name,record_id,action").gte("occurred_at", `${from}T00:00:00+07:00`).lte("occurred_at", `${to}T23:59:59.999+07:00`).order("occurred_at", { ascending: false }).limit(100),
  ]);
  const e = [hr.error, pr.error, cr.error, ar.error].find(Boolean);
  if (e) throw new Error(e.message);
  const h = (hr.data || {}) as Record<string, unknown>;

  return <PageShell eyebrow="Keuangan & Laporan" title="Laporan" description="Ringkasan lintas produksi, stok, keuangan, audit, dan pusat Export Excel server-side. Manager tetap monitoring/read-only.">
    <Card title="Periode Laporan / Export">
      <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto]" method="get">
        <label className="text-xs font-bold text-slate-700">Dari<input name="from" type="date" defaultValue={from} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 shadow-xs outline-none focus:border-blue-600"/></label>
        <label className="text-xs font-bold text-slate-700">Sampai<input name="to" type="date" defaultValue={to} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 shadow-xs outline-none focus:border-blue-600"/></label>
        <div className="flex items-end"><button className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:from-blue-700 hover:to-blue-800 transition">Terapkan</button></div>
      </form>
      <div className="mt-4 flex flex-wrap gap-2"><a href={exportHref("laporan", from, to)} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-xs hover:bg-emerald-100 transition">Export Laporan Lengkap Excel</a></div>
    </Card>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="SPK" value={n(h.production_orders)}/><Metric label="QC Aktif" value={n(h.qc_inspections)}/><Metric label="Shipment Open" value={n(h.shipments_open)}/><Metric label="Negative Stock" value={n(h.negative_raw_stock) + n(h.negative_logistics_stock)}/></div>

    <Card title="Pusat Export Excel">
      <p className="mb-4 text-xs leading-relaxed text-slate-500">Setiap file dibuat di server, memakai permission/RLS user login. Data besar dipaging server-side; browser hanya menerima file akhir.</p>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {exports.map(([key, title]) => <a key={key} href={exportHref(key, from, to)} className="rounded-xl border border-slate-200/90 bg-white px-3.5 py-3 text-sm font-bold text-slate-800 shadow-xs hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-700 transition">{title}<span className="mt-1 block text-xs font-normal text-slate-400">Unduh .xlsx</span></a>)}
      </div>
    </Card>

    <Card title="Progress Produksi"><TableWrap><thead><tr><Th>SPK</Th><Th>Operator</Th><Th>Assigned</Th><Th>Qty Sah</Th><Th>Reject</Th><Th>Status</Th></tr></thead><tbody>{(pr.data ?? []).map((x: any) => <tr key={x.order_id}><Td>{x.spk_code}</Td><Td>{x.operator_name}</Td><Td>{qty(x.assigned_qty)}</Td><Td>{qty(x.approved_qty)}</Td><Td>{qty(x.rejected_qty)}</Td><Td>{x.status}</Td></tr>)}</tbody></TableWrap></Card>
    <Card title="Aktivitas Keuangan"><TableWrap><thead><tr><Th>Sumber</Th><Th>Tanggal</Th><Th>Arah</Th><Th>Kategori</Th><Th>Nominal</Th></tr></thead><tbody>{(cr.data ?? []).map((x: any, i: number) => <tr key={`${x.source}-${x.code}-${i}`}><Td>{x.source}</Td><Td>{x.transaction_date}</Td><Td>{x.direction}</Td><Td>{x.category}</Td><Td>{money(x.amount)}</Td></tr>)}</tbody></TableWrap></Card>
    <Card title="Audit Terbaru"><TableWrap><thead><tr><Th>Waktu</Th><Th>Tabel</Th><Th>Record</Th><Th>Aksi</Th></tr></thead><tbody>{(ar.data ?? []).map((x: any) => <tr key={x.id}><Td>{x.occurred_at}</Td><Td>{x.table_name}</Td><Td>{x.record_id || "-"}</Td><Td>{x.action}</Td></tr>)}</tbody></TableWrap></Card>
  </PageShell>;
}
