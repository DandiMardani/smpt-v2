import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function StokBarangJadiPage() {
  const supabase = await createClient();

  // 1. Ambil Saldo Barang Jadi per Lokasi
  const { data: rawBalances } = await supabase
    .from("v_logistics_stock_balances")
    .select("*")
    .eq("item_kind", "FINISHED_GOOD")
    .order("balance", { ascending: false });

  // 2. Ambil Master Barang Jadi untuk kelengkapan nama produk
  const { data: finishedGoods } = await supabase
    .from("finished_goods")
    .select("id, name, unit, finished_good_code, product_id, project_products(name, product_code)");

  // 3. Ambil 20 Riwayat Mutasi / Log Pergerakan Terkini
  const { data: logs } = await supabase
    .from("logistics_stock_moves")
    .select(`
      id,
      created_at,
      delta,
      kind,
      unit,
      notes,
      locations (name),
      finished_goods (name, finished_good_code)
    `)
    .eq("item_kind", "FINISHED_GOOD")
    .order("created_at", { ascending: false })
    .limit(20);

  const fgMap = new Map((finishedGoods || []).map((f: any) => [f.id, f]));
  const balances = rawBalances || [];

  // Hitung ringkasan atas
  const totalQty = balances.reduce((acc: number, item: any) => acc + Number(item.balance || 0), 0);
  const totalKombinasi = balances.length;

  return (
    <div className="space-y-6 pb-12">
      {/* Header Halaman */}
      <div>
        <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600">QC & Logistik</span>
        <h1 className="text-xl font-black text-slate-900">Stok Barang Jadi</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Saldo fisik barang lolos verifikasi QC yang tersimpan di gudang siap kirim.
        </p>
      </div>

      {/* Ringkasan Angka Atas */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-bold uppercase text-slate-500">Kombinasi Stok</span>
          <p className="mt-1 font-mono text-2xl font-black text-slate-900">{totalKombinasi}</p>
        </div>
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 shadow-xs">
          <span className="text-[11px] font-bold uppercase text-indigo-700">Total Qty Fisik</span>
          <p className="mt-1 font-mono text-2xl font-black text-indigo-900">
            {totalQty.toLocaleString("id-ID")} <span className="text-xs font-semibold text-indigo-700">pcs</span>
          </p>
        </div>
      </div>

      {/* Daftar Saldo Barang Jadi (Mobile-Friendly Card View) */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <b className="text-sm font-extrabold text-slate-900">Saldo Fisik Tersedia</b>
          <span className="text-[11px] font-medium text-slate-500">{balances.length} Produk</span>
        </div>

        {balances.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">Belum ada saldo barang jadi di gudang.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {balances.map((row: any, idx: number) => {
              const fg = fgMap.get(row.finished_good_id);
              const displayName = fg?.name || fg?.project_products?.name || "Barang Jadi";
              const code = fg?.finished_good_code || `BJ-${String(row.finished_good_id).padStart(6, "0")}`;
              const qtyVal = Number(row.balance || 0);

              return (
                <div key={idx} className="flex items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[10px] font-bold text-slate-400">{code}</span>
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                        {row.location_name || "PUSAT"}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs font-bold text-slate-800">{displayName}</p>
                  </div>

                  <div className="text-right">
                    <span className="font-mono text-base font-black text-slate-900">
                      {qtyVal.toLocaleString("id-ID")}
                    </span>
                    <span className="ml-1 text-[11px] font-semibold text-slate-500 uppercase">
                      {row.unit || "PCS"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bagian Baru: Rincian Log / Riwayat Mutasi Stok */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <b className="text-sm font-extrabold text-slate-900">Rincian Riwayat Mutasi</b>
            <p className="text-[11px] text-slate-500">Log pergerakan barang masuk & keluar gudang terkini</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Terbaru</span>
        </div>

        {(!logs || logs.length === 0) ? (
          <p className="py-6 text-center text-xs text-slate-400">Belum ada riwayat mutasi logistik.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((log: any) => {
              const deltaNum = Number(log.delta || 0);
              const isPlus = deltaNum > 0;
              const dateStr = log.created_at ? new Date(log.created_at).toLocaleDateString("id-ID", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit"
              }) : "-";

              return (
                <div key={log.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${isPlus ? "bg-emerald-500" : "bg-rose-500"}`} />
                      <b className="text-xs font-bold text-slate-800">
                        {log.finished_goods?.name || "Barang Jadi"}
                      </b>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {log.kind || "Mutasi"} · <span className="font-medium text-slate-700">{log.notes || "-"}</span>
                    </p>
                    <span className="block text-[10px] text-slate-400">{dateStr}</span>
                  </div>

                  <div className="text-right">
                    <span className={`font-mono text-xs font-black ${isPlus ? "text-emerald-600" : "text-rose-600"}`}>
                      {isPlus ? `+${deltaNum}` : deltaNum} {log.unit || "PCS"}
                    </span>
                    <span className="block text-[10px] text-slate-400 font-semibold">
                      {log.locations?.name || "PUSAT"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
