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

  // 1. Ambil Saldo Fisik Gudang, Master Barang, Lokasi, Ledger Gudang, dan Transaksi Maklon
  const [balancesRes, fgRes, locRes, ledgerRes, mfgRes] = await Promise.all([
    supabase
      .from("logistics_stock_balances")
      .select("id, item_kind, finished_good_id, set_id, location_id, quantity, updated_at")
      .eq("item_kind", "FINISHED_GOOD")
      .order("quantity", { ascending: false }),
    supabase
      .from("finished_goods")
      .select("id, name, unit, finished_good_code, product_id, source, category, project_products(name)"),
    supabase
      .from("locations")
      .select("id, name"),
    supabase
      .from("logistics_stock_ledger")
      .select("id, event_id, item_kind, finished_good_id, location_id, movement_kind, quantity_delta, unit_snapshot, notes, created_at")
      .eq("item_kind", "FINISHED_GOOD")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("manufacturing_transactions")
      .select("id, manufacturing_code, flow_type, finished_good_id, quantity, unit, description, status, transaction_date, created_at")
      .not("finished_good_id", "is", null)
      .eq("status", "AKTIF")
      .order("created_at", { ascending: false }),
  ]);

  const fgMap = new Map((fgRes.data || []).map((f: any) => [f.id, f]));
  const locMap = new Map((locRes.data || []).map((l: any) => [l.id, l.name]));
  const rawBalances = balancesRes.data || [];
  const ledgerLogs = ledgerRes.data || [];
  const rawMfg = mfgRes.data || [];

  // 2. Hitung Sisa Stok Titipan Maklon (TITIPAN - PENGIRIMAN)
  const maklonBalancesMap = new Map<number, { qty: number; unit: string; vendorNote: string }>();
  rawMfg.forEach((tx: any) => {
    const fgId = Number(tx.finished_good_id);
    const flow = (tx.flow_type || "").toUpperCase();
    const qty = Number(tx.quantity || 0);
    const delta = flow === "TITIPAN" || flow === "MASUK" || flow === "IN" ? qty : -qty;

    const prev = maklonBalancesMap.get(fgId) || {
      qty: 0,
      unit: tx.unit || "PCS",
      vendorNote: tx.description || "Supplier Maklon",
    };
    prev.qty += delta;
    if (tx.description) prev.vendorNote = tx.description;
    maklonBalancesMap.set(fgId, prev);
  });

  // 3. Olah Item Stok Fisik di Rak Gudang (PUSAT)
  const warehouseItems = rawBalances.map((b: any) => {
    const fg = fgMap.get(b.finished_good_id);
    const locName = locMap.get(b.location_id) || "PUSAT";
    const rawSource = (fg?.source || "INTERNAL").toUpperCase();
    const isLuar = rawSource !== "INTERNAL";
    const sourceKind = isLuar ? "LUAR" : "INTERNAL";

    return {
      id: `wh-${b.id}`,
      finished_good_id: b.finished_good_id,
      code: fg?.finished_good_code || `BJ-${String(b.finished_good_id).padStart(6, "0")}`,
      name: (fg?.project_products as any)?.name || fg?.name || "Barang Jadi",
      sourceKind,
      typeTag: sourceKind === "INTERNAL" ? "🏭 INTERNAL" : "📦 LUAR (GUDANG)",
      locationName: locName,
      locationBadge: `📍 ${locName}`,
      quantity: Number(b.quantity || 0),
      unit: fg?.unit || "PCS",
      isMaklon: false,
    };
  });

  // 4. Olah Item Titipan Maklon Luar (Siap Kirim Langsung)
  const maklonItems: any[] = [];
  maklonBalancesMap.forEach((val, fgId) => {
    if (val.qty > 0) {
      const fg = fgMap.get(fgId);
      maklonItems.push({
        id: `maklon-${fgId}`,
        finished_good_id: fgId,
        code: fg?.finished_good_code || `BJ-${String(fgId).padStart(6, "0")}`,
        name: (fg?.project_products as any)?.name || fg?.name || "Barang Jadi",
        sourceKind: "MAKLON",
        typeTag: "🚚 TITIPAN MAKLON",
        locationName: val.vendorNote,
        locationBadge: `🚚 ${val.vendorNote}`,
        quantity: val.qty,
        unit: val.unit,
        isMaklon: true,
      });
    }
  });

  // Gabungkan semua item stok
  const allItems = [...warehouseItems, ...maklonItems];

  // Hitung ringkasan akumulasi
  const totalQtyAll = allItems.reduce((acc, it) => acc + it.quantity, 0);
  const totalQtyInternal = warehouseItems.filter((it) => it.sourceKind === "INTERNAL").reduce((acc, it) => acc + it.quantity, 0);
  const totalQtyGudangLuar = warehouseItems.filter((it) => it.sourceKind === "LUAR").reduce((acc, it) => acc + it.quantity, 0);
  const totalQtyMaklon = maklonItems.reduce((acc, it) => acc + it.quantity, 0);

  // Filter berdasarkan Tab
  const filteredItems = allItems.filter((it) => {
    if (currentSource === "INTERNAL") return it.sourceKind === "INTERNAL";
    if (currentSource === "LUAR") return it.sourceKind === "LUAR";
    if (currentSource === "MAKLON") return it.sourceKind === "MAKLON";
    return true;
  });

  // Gabungkan riwayat mutasi dari gudang & maklon
  const combinedHistory = [
    ...ledgerLogs.map((l: any) => ({
      id: `led-${l.id}`,
      created_at: l.created_at,
      title: (fgMap.get(l.finished_good_id)?.project_products as any)?.name || fgMap.get(l.finished_good_id)?.name || "Barang Jadi",
      desc: `${l.movement_kind || "Mutasi Gudang"}${l.notes ? ` · ${l.notes}` : ""}`,
      delta: Number(l.quantity_delta || 0),
      unit: l.unit_snapshot || "PCS",
      badge: locMap.get(l.location_id) || "PUSAT",
    })),
    ...rawMfg.slice(0, 15).map((m: any) => {
      const isPlus = m.flow_type === "TITIPAN" || m.flow_type === "MASUK";
      const delta = isPlus ? Number(m.quantity || 0) : -Number(m.quantity || 0);
      return {
        id: `mfg-${m.id}`,
        created_at: m.created_at,
        title: (fgMap.get(m.finished_good_id)?.project_products as any)?.name || fgMap.get(m.finished_good_id)?.name || "Barang Jadi",
        desc: `${m.flow_type || "Maklon"}${m.description ? ` · ${m.description}` : ""}`,
        delta,
        unit: m.unit || "PCS",
        badge: "MAKLON",
      };
    }),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);

  return (
    <div className="space-y-5 pb-12">
      {/* Header Halaman */}
      <div>
        <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600">QC & Logistik</span>
        <h1 className="text-xl font-black text-slate-900">Stok Barang Jadi</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Monitoring fisik di rak gudang pusat dan titipan siap kirim di maklon/supplier luar.
        </p>
      </div>

      {/* Ringkasan Angka: Semua, Internal, Gudang Luar, & Titipan Maklon */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs">
          <span className="block text-[10px] font-bold uppercase text-slate-500">Total Siap Kirim</span>
          <p className="mt-1 font-mono text-lg sm:text-2xl font-black text-slate-900">
            {totalQtyAll.toLocaleString("id-ID")}
          </p>
          <span className="text-[10px] text-slate-400 font-semibold">Gudang + Maklon</span>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-2xs">
          <span className="block text-[10px] font-bold uppercase text-emerald-800">🏭 Internal</span>
          <p className="mt-1 font-mono text-lg sm:text-2xl font-black text-emerald-700">
            {totalQtyInternal.toLocaleString("id-ID")}
          </p>
          <span className="text-[10px] text-emerald-600 font-semibold">Di Rak Pusat</span>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-3 shadow-2xs">
          <span className="block text-[10px] font-bold uppercase text-blue-800">📦 Gudang (Luar)</span>
          <p className="mt-1 font-mono text-lg sm:text-2xl font-black text-blue-700">
            {totalQtyGudangLuar.toLocaleString("id-ID")}
          </p>
          <span className="text-[10px] text-blue-600 font-semibold">Di Rak Pusat</span>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 shadow-2xs">
          <span className="block text-[10px] font-bold uppercase text-amber-800">🚚 Titipan Maklon</span>
          <p className="mt-1 font-mono text-lg sm:text-2xl font-black text-amber-700">
            {totalQtyMaklon.toLocaleString("id-ID")}
          </p>
          <span className="text-[10px] text-amber-600 font-semibold">Standby di Supplier</span>
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
          Semua ({allItems.length})
        </Link>
        <Link
          href="/dashboard/stokBarangJadi?source=INTERNAL"
          className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition shadow-2xs ${
            currentSource === "INTERNAL"
              ? "bg-emerald-700 text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span>🏭</span> Internal
        </Link>
        <Link
          href="/dashboard/stokBarangJadi?source=LUAR"
          className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition shadow-2xs ${
            currentSource === "LUAR"
              ? "bg-blue-600 text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span>📦</span> Luar (Gudang)
        </Link>
        <Link
          href="/dashboard/stokBarangJadi?source=MAKLON"
          className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition shadow-2xs ${
            currentSource === "MAKLON"
              ? "bg-amber-600 text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span>🚚</span> Titipan Maklon
        </Link>
      </div>

      {/* Daftar Saldo Stok Gabungan (Pusat & Maklon) */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
          <b className="text-sm font-extrabold text-slate-900">
            Saldo Barang Jadi {currentSource !== "ALL" ? `(${currentSource})` : ""}
          </b>
          <span className="text-[11px] font-semibold text-slate-500">{filteredItems.length} produk</span>
        </div>

        {filteredItems.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">Tidak ada saldo barang untuk kategori ini.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-0">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[10px] font-bold text-slate-500">{item.code}</span>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                      {item.locationBadge}
                    </span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
                        item.sourceKind === "INTERNAL"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : item.sourceKind === "MAKLON"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-blue-50 text-blue-700 border border-blue-200"
                      }`}
                    >
                      {item.typeTag}
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

      {/* Rincian Riwayat Mutasi Gabungan (Gudang + Pengiriman Maklon) */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-xs">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div>
            <b className="text-sm font-extrabold text-slate-900">Riwayat Mutasi Terpadu</b>
            <p className="text-[11px] text-slate-500">Aktivitas gudang pusat & pengiriman maklon terkini</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Terbaru</span>
        </div>

        {combinedHistory.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">Belum ada catatan mutasi.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {combinedHistory.map((log: any) => {
              const isPlus = log.delta > 0;
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
                        {log.title}
                      </b>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-tight">
                      {log.desc}
                    </p>
                    <span className="block text-[10px] text-slate-400">{dateStr}</span>
                  </div>

                  <div className="text-right shrink-0 pl-2">
                    <span
                      className={`font-mono text-xs font-black ${
                        isPlus ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {isPlus ? `+${log.delta.toLocaleString("id-ID")}` : log.delta.toLocaleString("id-ID")}{" "}
                      {log.unit}
                    </span>
                    <span className="block text-[10px] font-semibold text-slate-400">
                      {log.badge}
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
