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

  // 1. Ambil data Paket Isian, Resep, Saldo Komponen, dan Riwayat Packing
  const [
    packagesRes,
    recipesRes,
    pkgBalancesRes,
    fgRes,
    fgBalancesRes,
    packingHistoryRes,
    packingItemsRes,
  ] = await Promise.all([
    s.from("bundle_packages").select("*").eq("status", "AKTIF").order("name"),
    s.from("bundle_package_recipes").select("*"),
    s.from("bundle_package_balances").select("*").eq("location_id", PUSAT_LOCATION_ID),
    s.from("finished_goods").select("id, finished_good_code, name, status").eq("status", "AKTIF").order("name"),
    s.from("logistics_stock_balances").select("*").eq("location_id", PUSAT_LOCATION_ID).eq("item_kind", "FINISHED_GOOD"),
    s.from("bundle_package_packings").select("*").order("packing_date", { ascending: false }).limit(200),
    s.from("bundle_package_packing_items").select("*").limit(2000),
  ]);

  const packages = (packagesRes.data || []).map((p: any) => ({
    id: Number(p.id),
    code: p.package_code,
    name: p.name,
    description: p.description,
  }));

  const allRecipes = (recipesRes.data || []).map((r: any) => ({
    package_id: Number(r.package_id),
    finished_good_id: Number(r.finished_good_id),
    qty_per_bundle: Number(r.qty_per_bundle || 1),
  }));

  const fgBalancesMap = new Map<number, number>();
  (fgBalancesRes.data || []).forEach((b: any) => {
    fgBalancesMap.set(Number(b.finished_good_id), Number(b.quantity || 0));
  });

  const EXCLUDED_KEYWORDS = ["MAHJONG", "DUMMY"];
  const allFg = (fgRes.data || [])
    .filter((f: any) => {
      const nameUpper = String(f.name || "").toUpperCase();
      return !EXCLUDED_KEYWORDS.some((kw) => nameUpper.includes(kw));
    })
    .map((f: any) => ({
      id: Number(f.id),
      code: f.finished_good_code || `BJ-${f.id}`,
      name: f.name,
      stock: fgBalancesMap.get(Number(f.id)) || 0,
    }));

  const fgMap = new Map(allFg.map((f) => [f.id, f]));
  const packageMap = new Map(packages.map((p) => [p.id, p]));

  const packingList = packingHistoryRes.data || [];
  const packingItems = packingItemsRes.data || [];

  // Hitung Metrik Operasional
  const totalPacked = packingList.reduce((sum: number, p: any) => sum + (Number(p.quantity) || 0), 0);
  const totalReadyStock = (pkgBalancesRes.data || []).reduce((sum: number, b: any) => sum + (Number(b.quantity) || 0), 0);

  return (
    <PageShell
      eyebrow="QC & Logistik Pusat"
      title="Bundling Isian Koper (Pabrik Pusat)"
      description="Pengemasan & bundling komponen satuan menjadi Paket Isian Koper (JKS, JKG, dll) sebelum ditransfer ke Pabrik Mitra MR WU."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 shadow-xs">
        <div>
          <span className="inline-block rounded-md bg-blue-600 px-2.5 py-0.5 text-[10px] font-black tracking-wider text-white uppercase">
            TAHAP 1: PABRIK PUSAT
          </span>
          <h3 className="mt-1 text-base font-extrabold text-slate-900">
            Kemas Paket Isian Sebelum Dikirim ke Mitra MR WU
          </h3>
          <p className="text-xs text-slate-600">
            Pilih paket (JKS / JKG) sesuai kloter pengerjaan hari ini. Komponen satuan akan otomatis terpotong dari gudang.
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

      {/* Metrik Stok */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="📦 Total Selesai Dipacking" value={`${qty(totalPacked)} Pcs`} />
        <Metric label="🏢 Sisa Stok Ready di Pusat" value={`${qty(totalReadyStock)} Pcs`} />
        <Metric label="📋 Riwayat Transaksi Packing" value={`${packingList.length} Transaksi`} />
      </div>

      {/* Formulir 2 Tab (Input Harian & Atur Resep) */}
      {canWrite ? (
        <Card title="📦 Manajemen Bundling & Resep Paket Isian">
          <BundlingIsianForm
            packages={packages}
            allRecipes={allRecipes}
            availableComponents={allFg}
          />
        </Card>
      ) : null}

      {/* Riwayat Pengerjaan Packing Harian */}
      <Card title={`Riwayat Pengerjaan Packing Isian (${packingList.length} Transaksi)`}>
        {packingList.length === 0 ? (
          <Empty>Belum ada riwayat pengerjaan packing isian koper tercatat.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Kode Transaksi</Th>
                <Th>Nama Paket Isian</Th>
                <Th className="text-right">Jumlah Selesai</Th>
                <Th>Rincian Komponen Terpotong</Th>
                <Th>Catatan</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {packingList.map((p: any) => {
                const items = packingItems.filter((it: any) => it.packing_id === p.id);
                const pkg = packageMap.get(Number(p.package_id));
                return (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition">
                    <Td className="font-semibold text-slate-800">{p.packing_date}</Td>
                    <Td className="font-mono text-xs font-bold text-blue-700">{p.packing_code}</Td>
                    <Td className="font-extrabold text-slate-900">{pkg?.name || `Paket #${p.package_id}`}</Td>
                    <Td className="text-right font-black text-emerald-700">
                      {qty(p.quantity)} Pcs
                    </Td>
                    <Td>
                      {items.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {items.map((it: any) => {
                            const fg = fgMap.get(Number(it.finished_good_id));
                            return (
                              <span
                                key={it.id}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                              >
                                <span className="font-medium text-slate-600">{fg?.name || "Item"}:</span>
                                <span className="font-black text-slate-900">{qty(it.total_qty)} Pcs</span>
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">-</span>
                      )}
                    </Td>
                    <Td className="text-xs text-slate-500 italic">{p.notes || "-"}</Td>
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
