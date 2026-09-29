import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{ source?: string }>;
};

export default async function StokBarangJadiPage({ searchParams }: Props) {
  const supabase = await createClient();
  const resolvedParams = searchParams ? await searchParams : {};
  const currentSource = (resolvedParams.source || "ALL").toUpperCase();

  // 1. Ambil data asli dari tabel logistics_stock_balances dan logistics_stock_ledger
  const [balancesRes, fgRes, locRes, ledgerRes] = await Promise.all([
    supabase
      .from("logistics_stock_balances")
      .select("id, item_kind, finished_good_id, set_id, location_id, quantity, updated_at")
      .eq("item_kind", "FINISHED_GOOD")
      .order("quantity", { ascending: false }),
    supabase
      .from("finished_goods")
      .select("id, name, unit, finished_good_code, product_id, source, category"),
    supabase
      .from("locations")
      .select("id, name"),
    supabase
      .from("logistics_stock_ledger")
      .select("id, event_id, item_kind, finished_good_id, location_id, movement_kind, quantity_delta, unit_snapshot, notes, created_at")
      .eq("item_kind", "FINISHED_GOOD")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const fgMap = new Map((fgRes.data || []).map((f: any) => [f.id, f]));
  const locMap = new Map((locRes.data || []).map((l: any) => [l.id, l.name]));
  const rawBalances = balancesRes.data || [];
  const ledgerLogs = ledgerRes.data || [];

  // 2. Olah data saldo & kategorikan sumber (INTERNAL vs LUAR)
  const items = rawBalances.map((b: any) => {
    const fg = fgMap.get(b.finished_good_id);
    const locName = locMap.get(b.location_id) || "PUSAT";
    const rawSource = (fg?.source || "INTERNAL").toUpperCase();
    const isLuar = rawSource === "LUAR" || rawSource === "VENDOR" || rawSource === "EXTERNAL";
    const sourceKind = isLuar ? "LUAR" : "INTERNAL";

    return {
      id: b.id,
      finished_good_id: b.finished_good_id,
      code: fg?.finished_good_code || `BJ-${String(b.finished_good_id).padStart(6, "0")}`,
      name: fg?.name || "Barang Jadi",
      sourceKind,
      locationName: locName,
      quantity: Number(b.quantity || 0),
      unit: fg?.unit || "PCS",
      category: fg?.category || "Produk Jadi",
    };
  });

  // Hitung total ringkasan
  const totalQtyAll = items.reduce((acc, it) => acc + it.quantity, 0);
  const totalQtyInternal = items.filter((it) => it.sourceKind === "INTERNAL").reduce((acc, it) => acc + it.quantity, 0);
  const totalQtyLuar = items.filter((it) => it.sourceKind === "LUAR").reduce((acc, it) => acc + it.quantity, 0);

  // Filter berdasarkan tab pilihan
  const filteredItems = items.filter((it) => {
    if (currentSource === "INTERNAL") return it.sourceKind === "INTERNAL";
    if (currentSource === "LUAR") return it.sourceKind === "LUAR";
    return true;
  });

  return (
    <div className="space-y-5 pb-12">
      {/* Header Halaman */}
      <div>
        <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600">QC & Logistik</span>
        <h1 className="text-xl font-black text-slate-900">Stok Barang Jadi</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Saldo fisik barang jadi di gudang dari hasil QC internal dan kiriman luar/vendor.
        </p>
      </div>

      {/* Ringkasan Angka: Semua, Internal, & Barang Luar */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
          <span className="block text-[10px] font-bold uppercase text-slate-500">Total Semua</span>
          <p className="mt-1 font-mono text-base sm:text-2xl font-black text-slate-900">
            {totalQtyAll.toLocaleString("id-ID")}
          </p>
          <span className="text-[10px] text-slate-400 font-semibold">{items.length} item</span>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-2xs">
          <span className="block text-[10px] font-bold uppercase text-emerald-800">🏭 Internal</span>
          <p className="mt-1 font-mono text-base sm:text-2xl font-black text-emerald-700">
            {totalQtyInternal.toLocaleString("id-ID")}
          </p>
          <span className="text-[10px] text-emerald-600 font-semibold">Hasil QC</span>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-3 shadow-2xs">
          <span className="block text-[10px] font-bold uppercase text-blue-800">📦 Dari Luar</span>
          <p className="mt-1 font-mono text-base sm:text-2xl font-black text-blue-700">
            {totalQtyLuar.toLocaleString("id-ID")}
          </p>
          <span className="text-[10px] text-blue-600 font-semibold">Vendor / Maklon</span>
        </div>
      </div>

      {/* Tab Filter Sumber Stok */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <Link
          href="/dashboard/stokBarangJadi"
          className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition shadow-2xs ${
            currentSource === "ALL"
              ? "bg-slate-900 text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Semua Stok ({items.length})
        </Link>
        <Link
          href="/dashboard/stokBarangJadi?source=INTERNAL"
          className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition shadow-2xs ${
            currentSource === "INTERNAL"
              ? "bg-emerald-700 text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span>🏭</span> Hasil Internal
        </Link>
        <Link
          href="/dashboard/stokBarangJadi?source=LUAR"
          className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition shadow-2xs ${
            currentSource === "LUAR"
              ? "bg-blue-600 text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span>📦</span> Barang Luar
        </Link>
      </div>

      {/* Daftar Saldo Fisik Barang Jadi (Responsif di Layar HP) */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
          <b className="text-sm font-extrabold text-slate-900">
            Saldo Gudang {currentSource === "INTERNAL" ? "(Internal)" : currentSource === "LUAR" ? "(Barang Luar)" : ""}
          </b>
          <span className="text-[11px] font-semibold text-slate-500">{filteredItems.length} produk</span>
        </div>

        {filteredItems.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">Tidak ada saldo barang jadi untuk kategori ini.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-0">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[10px] font-bold text-slate-500">{item.code}</span>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                      📍 {item.locationName}
                    </span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
                        item.sourceKind === "INTERNAL"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-blue-50 text-blue-700 border border-blue-200"
                      }`}
                    >
                      {item.sourceKind === "INTERNAL" ? "🏭 INTERNAL" : "📦 DARI LUAR"}
                    </span>
                  </div>
                  <p className="text-xs font-extrabold text-slate-900 leading-snug break-words">
                    {item.name}
                  </p>
                </div>

                <div className="text-right shrink-0 pl-2">
                  <span className="font-mono text-base sm:text-lg font-black text-slate-900">
                    {item.quantity.toLocaleString("id-ID")}
                  </span>
                  <span className="ml-1 text-[11px] font-bold uppercase text-slate-500">
                    {item.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rincian Riwayat Mutasi Logistik Terkini */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div>
            <b className="text-sm font-extrabold text-slate-900">Riwayat Mutasi Logistik</b>
            <p className="text-[11px] text-slate-500">20 catatan keluar-masuk barang jadi terakhir</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Terbaru</span>
        </div>

        {ledgerLogs.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">Belum ada catatan mutasi logistik.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {ledgerLogs.map((log: any) => {
              const deltaNum = Number(log.quantity_delta || 0);
              const isPlus = deltaNum > 0;
              const fg = fgMap.get(log.finished_good_id);
              const dateStr = log.created_at
                ? new Date(log.created_at).toLocaleDateString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "-";

              return (
                <div key={log.id} className="flex items-start justify-between gap-3 py-3 first:pt-1 last:pb-0">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${isPlus ? "bg-emerald-500" : "bg-rose-500"}`} />
                      <b className="text-xs font-bold text-slate-800 truncate">
                        {fg?.name || "Barang Jadi"}
                      </b>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight">
                      <span className="font-semibold text-slate-700">{log.movement_kind || "Mutasi"}</span>
                      {log.notes ? ` · ${log.notes}` : ""}
                    </p>
                    <span className="block text-[10px] text-slate-400">{dateStr}</span>
                  </div>

                  <div className="text-right shrink-0 pl-2">
                    <span
                      className={`font-mono text-xs font-black ${
                        isPlus ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {isPlus ? `+${deltaNum.toLocaleString("id-ID")}` : deltaNum.toLocaleString("id-ID")}{" "}
                      {log.unit_snapshot || "PCS"}
                    </span>
                    <span className="block text-[10px] font-semibold text-slate-400">
                      {locMap.get(log.location_id) || "PUSAT"}
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
