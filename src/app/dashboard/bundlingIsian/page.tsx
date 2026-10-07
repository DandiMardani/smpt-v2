import Link from "next/link";
import {
  Card,
  Empty,
  Metric,
  Notice,
  PageShell,
  TableWrap,
  Td,
  Th,
} from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { BundlingIsianForm } from "@/components/logistics/bundling-isian-form";

type Props = { searchParams: Promise<SearchParams> };

export default async function BundlingIsianPage({ searchParams }: Props) {
  const access = await requirePermission("bundling_isian.view");
  const canWrite = access.permissionCodes.includes("bundling_isian.write") || access.permissionCodes.includes("*");
  const q = await searchParams;
  const s = await createClient();

  const PUSAT_LOCATION_ID = 1;

  // 1. Fetch finished goods, stock balances at Pusat, and bundling history
  const [fgRes, balancesRes, bundlingRes, bundlingItemsRes] = await Promise.all([
    s.from("finished_goods").select("id, finished_good_code, name, category, source, status").eq("status", "AKTIF").order("name"),
    s.from("logistics_stock_balances").select("*").eq("location_id", PUSAT_LOCATION_ID).eq("item_kind", "FINISHED_GOOD"),
    s.from("finished_goods_bundling").select("*").order("bundling_date", { ascending: false }).limit(200),
    s.from("finished_goods_bundling_items").select("*").limit(2000),
  ]);

  const allFg = fgRes.data || [];
  const fgMap = new Map(allFg.map((f: any) => [Number(f.id), f]));

  const balancesMap = new Map<number, number>();
  (balancesRes.data || []).forEach((b: any) => {
    balancesMap.set(Number(b.finished_good_id), Number(b.quantity || 0));
  });

  // Kata kunci barang yang dikecualikan agar tidak masuk ke bundling isian
  const EXCLUDED_KEYWORDS = ["MAHJONG"];

  // Identify Bundle Goods (category ISIAN or name containing 'ISIAN' or 'PAKET')
  let bundleGoods = allFg.filter((f: any) => {
    const nameUpper = String(f.name || "").toUpperCase();
    const isExcluded = EXCLUDED_KEYWORDS.some((kw) => nameUpper.includes(kw));
    return (nameUpper.includes("ISIAN") || nameUpper.includes("BUNDLE") || nameUpper.includes("PAKET")) && !isExcluded;
  }).map((f: any) => ({
    id: Number(f.id),
    code: f.finished_good_code || `BJ-${f.id}`,
    name: f.name,
  }));

  // Fallback jika belum ada nama spesifik 'ISIAN', ambil barang jadi selain yang dikecualikan
  if (bundleGoods.length === 0) {
    bundleGoods = allFg.filter((f: any) => {
      const nameUpper = String(f.name || "").toUpperCase();
      return !EXCLUDED_KEYWORDS.some((kw) => nameUpper.includes(kw));
    }).slice(0, 5).map((f: any) => ({
      id: Number(f.id),
      code: f.finished_good_code || `BJ-${f.id}`,
      name: f.name,
    }));
  }

  // Identify Component Goods: Sarung Koper, Tas Paspor, Tas Ransel/Kabin, Cover, dsb.
  const componentKeywords = ["PASPOR", "PASPORT", "RANSEL", "KABIN", "COVER", "SARUNG KOPER", "SARUNG", "STEMPEL", "KARTU", "TALI"];
  let availableComponents = allFg.filter((f: any) => {
    const nameUpper = String(f.name || "").toUpperCase();
    const isMatched = componentKeywords.some((kw) => nameUpper.includes(kw));
    const isExcluded = EXCLUDED_KEYWORDS.some((kw) => nameUpper.includes(kw));
    return isMatched && !isExcluded && !nameUpper.includes("ISIAN");
  }).map((f: any) => ({
    id: Number(f.id),
    code: f.finished_good_code || `BJ-${f.id}`,
    name: f.name,
    stock: balancesMap.get(Number(f.id)) || 0,
  }));

  // Fallback jika tidak ada yang cocok
  if (availableComponents.length === 0) {
    availableComponents = allFg.filter((f: any) => {
      const nameUpper = String(f.name || "").toUpperCase();
      return !bundleGoods.some((b) => b.id === Number(f.id)) && !EXCLUDED_KEYWORDS.some((kw) => nameUpper.includes(kw));
    }).slice(0, 5).map((f: any) => ({
      id: Number(f.id),
      code: f.finished_good_code || `BJ-${f.id}`,
      name: f.name,
      stock: balancesMap.get(Number(f.id)) || 0,
    }));
  }

  const bundlingList = bundlingRes.data || [];
  const bundlingItems = bundlingItemsRes.data || [];

  // Metrics
  const totalBundledQty = bundlingList.reduce((sum: number, b: any) => sum + (Number(b.bundle_qty) || 0), 0);
  const currentBundleStock = bundleGoods.reduce((sum: number, b) => sum + (balancesMap.get(b.id) || 0), 0);

  return (
    <PageShell
      eyebrow="QC & Logistik Pusat"
      title="Bundling Isian Koper (Pabrik Pusat)"
      description="Pengemasan & bundling komponen satuan (Tas Paspor, Tas Ransel, Sarung Koper, Kartu/Stempel) menjadi 1 Paket Isian Koper di Pabrik Pusat sebelum ditransfer ke Pabrik Mitra MR WU."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />

      {/* Top Action & Metrics Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 shadow-xs">
        <div>
          <span className="inline-block rounded-md bg-blue-600 px-2.5 py-0.5 text-[10px] font-black tracking-wider text-white uppercase">
            TAHAP 1: PABRIK PUSAT
          </span>
          <h3 className="mt-1 text-base font-extrabold text-slate-900">
            Kemas Paket Isian Sebelum Dikirim ke Mitra MR WU
          </h3>
          <p className="text-xs text-slate-600">
            Setelah dibundle, paket isian koper siap dikirim melalui Surat Jalan Transfer ke Pabrik Mitra MR WU.
          </p>
        </div>
        <Link
          href="/dashboard/transferBarangJadi"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
        >
          <span>🚚</span>
          <span>Transfer Isian ke Pabrik Mitra MR WU →</span>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Total Bundle Selesai Dipacking" value={`${qty(totalBundledQty)} Paket`} />
        <Metric label="Stok Isian Ready di Pusat" value={`${qty(currentBundleStock)} Paket`} />
        <Metric label="Riwayat Transaksi Bundling" value={`${bundlingList.length} Transaksi`} />
      </div>

      {/* Form Input Bundling */}
      {canWrite ? (
        <Card title="📦 Formulir Pengerjaan Bundling Isian Koper (Pusat)">
          <BundlingIsianForm
            bundleGoods={bundleGoods}
            availableComponents={availableComponents}
          />
        </Card>
      ) : null}

      {/* Riwayat Bundling */}
      <Card title={`Riwayat Pengerjaan Bundling Isian (${bundlingList.length} Transaksi)`}>
        {bundlingList.length === 0 ? (
          <Empty>Belum ada riwayat pengerjaan bundling isian koper tercatat.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Kode Bundling</Th>
                <Th>Nama Paket Isian</Th>
                <Th className="text-right">Jumlah Paket</Th>
                <Th>Rincian Komponen Terpotong</Th>
                <Th>Catatan</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bundlingList.map((b: any) => {
                const items = bundlingItems.filter((it: any) => it.bundling_id === b.id);
                return (
                  <tr key={b.id} className="hover:bg-slate-50/70 transition">
                    <Td className="font-semibold text-slate-800">{b.bundling_date}</Td>
                    <Td className="font-mono text-xs font-bold text-blue-700">{b.bundling_code}</Td>
                    <Td className="font-extrabold text-slate-900">{b.bundle_name}</Td>
                    <Td className="text-right font-black text-emerald-700">
                      {qty(b.bundle_qty)} Paket
                    </Td>
                    <Td>
                      {items.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {items.map((it: any) => {
                            const fg = fgMap.get(Number(it.component_finished_good_id));
                            return (
                              <span
                                key={it.id}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                              >
                                <span className="font-medium text-slate-600">{fg?.name || "Item"}:</span>
                                <span className="font-black text-slate-900">{qty(it.total_qty)}</span>
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">-</span>
                      )}
                    </Td>
                    <Td className="text-xs text-slate-500 italic">{b.notes || "-"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </PageShell>
  );
}
