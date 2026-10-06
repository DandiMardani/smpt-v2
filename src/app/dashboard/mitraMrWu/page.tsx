import Link from "next/link";
import {
  Badge,
  Card,
  Empty,
  Metric,
  Notice,
  PageShell,
  TableWrap,
  Td,
  Th,
  inputClass,
  buttonClass,
} from "@/components/final/final-ui";
import { getCurrentAccessContext } from "@/lib/access/current-user";
import { param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { MrWuTransferConfirmModal } from "@/components/logistics/mr-wu-transfer-confirm-modal";
import { recordMrWuDailyPackingAction } from "@/lib/final/actions";
import {
  EmbarkasiShipmentTable,
  type ShipmentItem,
} from "@/components/logistics/embarkasi-shipments-table";

type Props = { searchParams: Promise<SearchParams> };

function getLocationIcon(name: string): string {
  const upper = (name || "").toUpperCase();
  if (upper.includes("DADAP")) return "🏭";
  if (upper.includes("ANGKASA")) return "✈️";
  if (upper.includes("GUDANG") || upper.includes("UTAMA")) return "📦";
  return "🏢";
}

function getStockStatusBadge(quantity: number, isSet: boolean) {
  if (quantity > 100) {
    return {
      label: isSet ? "🟢 Ready Kirim" : "🟢 Stok Aman",
      classes: "bg-emerald-100 text-emerald-800 border-emerald-300",
    };
  }
  if (quantity > 0) {
    return {
      label: isSet ? "🟡 Menipis" : "🟡 Menipis",
      classes: "bg-amber-100 text-amber-800 border-amber-300",
    };
  }
  return {
    label: isSet ? "🔴 Belum Ada Set" : "🔴 Kosong",
    classes: "bg-rose-100 text-rose-800 border-rose-300",
  };
}

export default async function MitraMrWuPage({ searchParams }: Props) {
  const access = await getCurrentAccessContext();
  const q = await searchParams;
  const s = await createClient();

  // Query MR WU locations dynamically (supports 3, 4, or more locations)
  const { data: allMrWuLocs } = await s
    .from("locations")
    .select("*")
    .eq("status", "AKTIF")
    .neq("location_code", "LOK-00101")
    .or("name.ilike.%MR WU%,notes.ilike.%MR WU%,name.ilike.%Dadap%,name.ilike.%Angkasa%,id.in.(2,3,4)")
    .order("id");

  const mrWuLocations = (allMrWuLocs && allMrWuLocs.length > 0) ? allMrWuLocs : [
    { id: 2, name: "Pabrik Mitra MR WU (Dadap)", location_code: "MRWU-DAP", notes: "Dadap" },
    { id: 3, name: "Pabrik Mitra MR WU (Angkasa)", location_code: "MRWU-ANG", notes: "Angkasa" },
    { id: 4, name: "Pabrik Mitra MR WU (Gudang Utama)", location_code: "MRWU-UTM", notes: "Gudang Utama" },
  ];
  const mrWuLocationIds = mrWuLocations.map((l: any) => Number(l.id));

  const [stockRes, fgRes, setRes, transRes, packingRes, embShipRes, embTargetRes, embRes] = await Promise.all([
    s.from("logistics_stock_balances").select("*").in("location_id", mrWuLocationIds),
    s.from("finished_goods").select("*"),
    s.from("product_sets").select("*").eq("status", "AKTIF"),
    s
      .from("finished_goods_transfers")
      .select("*")
      .in("destination_location_id", mrWuLocationIds)
      .order("transfer_date", { ascending: false })
      .limit(300),
    s
      .from("packing_runs")
      .select("*")
      .in("location_id", mrWuLocationIds)
      .order("packing_date", { ascending: false })
      .limit(50),
    s
      .from("embarkation_shipments")
      .select("*")
      .in("source_location_id", mrWuLocationIds)
      .order("shipment_date", { ascending: false })
      .limit(200),
    s.from("embarkation_targets").select("*").eq("status", "AKTIF"),
    s.from("embarkations").select("id, embarkation_code, short_code, name"),
  ]);

  const locMap = new Map(mrWuLocations.map((x: any) => [Number(x.id), x]));
  const fgMap = new Map((fgRes.data ?? []).map((x: any) => [Number(x.id), x]));
  const setMap = new Map((setRes.data ?? []).map((x: any) => [Number(x.id), x]));
  const embMap = new Map((embRes.data ?? []).map((x: any) => [x.id, x]));
  const targetMap = new Map((embTargetRes.data ?? []).map((x: any) => [x.id, x]));
  const productSets = setRes.data ?? [];
  const recentPackingRuns = packingRes.data ?? [];

  const balances = (stockRes.data ?? []).filter((b: any) => Number(b.quantity) > 0);
  const transfers = transRes.data ?? [];

  const mrWuShipments: ShipmentItem[] = (embShipRes.data ?? []).map((x: any) => {
    const target = targetMap.get(x.target_id);
    const emb = target ? embMap.get(target.embarkation_id) : null;
    const item = target
      ? target.item_kind === "SET"
        ? setMap.get(target.set_id)
        : fgMap.get(target.finished_good_id)
      : null;
    const srcLoc = locMap.get(x.source_location_id);

    return {
      id: x.id,
      shipment_code: x.shipment_code || `SJ-${x.id}`,
      document_no: x.document_no,
      shipment_date: x.shipment_date,
      source_location_name: srcLoc?.name || `Lokasi MR WU #${x.source_location_id}`,
      embarkation_name: emb?.name || "Asrama Haji Embarkasi",
      embarkation_code: emb?.short_code || emb?.embarkation_code || "EMB",
      item_name: item?.name || "Set Koper Haji",
      quantity: Number(x.quantity),
      driver_name: x.driver_name,
      vehicle_no: x.vehicle_no,
      status: x.status,
      received_qty: x.received_qty != null ? Number(x.received_qty) : null,
      reject_qty: x.reject_qty != null ? Number(x.reject_qty) : null,
      damaged_qty: x.damaged_qty != null ? Number(x.damaged_qty) : null,
      missing_qty: x.missing_qty != null ? Number(x.missing_qty) : null,
      notes: x.notes,
      public_token: x.public_token,
      surat_jalan_photo_url: x.surat_jalan_photo_url,
    };
  });

  // Summary Metrics
  const pendingTransfers = transfers.filter((t: any) => t.delivery_status !== "DITERIMA");
  const receivedTransfers = transfers.filter((t: any) => t.delivery_status === "DITERIMA");

  const canConfirm =
    access.role === "ADMIN_MR_WU" ||
    access.role === "ADMIN" ||
    access.role === "MANAGER" ||
    access.permissionCodes.includes("mr_wu.confirm") ||
    access.permissionCodes.includes("*");

  // Stock per location breakdown
  const stockByLoc = new Map<number, { locName: string; items: any[] }>();
  mrWuLocationIds.forEach((locId) => {
    const loc = locMap.get(locId);
    stockByLoc.set(locId, {
      locName: loc?.name || `Lokasi MR WU #${locId}`,
      items: [],
    });
  });

  balances.forEach((b: any) => {
    const entry = stockByLoc.get(Number(b.location_id));
    if (entry) {
      let itemName = "Barang";
      let itemCode = "-";
      let itemUnit = "Pcs";

      const setInfo = b.set_id ? setMap.get(Number(b.set_id)) : null;
      const fgInfo = b.finished_good_id ? fgMap.get(Number(b.finished_good_id)) : null;

      if (b.item_kind === "SET" || setInfo) {
        itemName = setInfo?.name || "Set Koper Haji";
        itemCode = setInfo?.set_code || (b.set_id ? `SET-${b.set_id}` : "-");
        itemUnit = setInfo?.unit || "SET";
      } else if (fgInfo) {
        itemName = fgInfo?.name || "Barang Jadi";
        itemCode = fgInfo?.finished_good_code || (b.finished_good_id ? `BJ-${b.finished_good_id}` : "-");
        itemUnit = fgInfo?.unit || "Pcs";
      }

      entry.items.push({
        ...b,
        name: itemName,
        code: itemCode,
        unit: itemUnit,
      });
    }
  });

  return (
    <PageShell
      eyebrow="Mitra Rekanan"
      title="Portal & Gudang Mitra MR WU"
      description="Monitoring posisi stok fisik di 3 gudang MR WU dan konfirmasi penerimaan pengiriman dari pabrik pusat."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />

      {/* Top Metrics */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Total Pengiriman Masuk" value={`${transfers.length} Surat Jalan`} />
        <Metric label="Sudah Dikonfirmasi Tiba" value={`${receivedTransfers.length} Transaksi`} />
        <Metric
          label="Menunggu Konfirmasi"
          value={
            pendingTransfers.length > 0 ? (
              <span className="text-amber-600 font-bold">{pendingTransfers.length} Kiriman</span>
            ) : (
              "Semua Tiba"
            )
          }
        />
      </div>

      {/* ======================================================== */}
      {/* 1. STOK SET SIAP KIRIM KE EMBARKASI (LOKASI MR WU) */}
      {/* ======================================================== */}
      {(() => {
        const setBalancesByLoc = new Map<number, number>();
        mrWuLocationIds.forEach((locId) => setBalancesByLoc.set(locId, 0));
        balances.filter((b: any) => b.item_kind === "SET").forEach((b: any) => {
          const cur = setBalancesByLoc.get(Number(b.location_id)) || 0;
          setBalancesByLoc.set(Number(b.location_id), cur + Number(b.quantity || 0));
        });

        const isianBalancesByLoc = new Map<number, number>();
        mrWuLocationIds.forEach((locId) => isianBalancesByLoc.set(locId, 0));
        balances.filter((b: any) => {
          const fg = fgMap.get(Number(b.finished_good_id));
          const name = String(fg?.name || "").toUpperCase();
          return name.includes("ISIAN") || name.includes("BUNDLE");
        }).forEach((b: any) => {
          const cur = isianBalancesByLoc.get(Number(b.location_id)) || 0;
          isianBalancesByLoc.set(Number(b.location_id), cur + Number(b.quantity || 0));
        });

        const totalSetReady = Array.from(setBalancesByLoc.values()).reduce((a, b) => a + b, 0);
        const totalIsianAvailable = Array.from(isianBalancesByLoc.values()).reduce((a, b) => a + b, 0);

        return (
          <div className="space-y-4">
            <section className="rounded-3xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 via-teal-50 to-white p-5 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-200/60 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-emerald-700 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                      SIAP DISPATCH
                    </span>
                    <span className="text-xs font-bold text-emerald-900">
                      Total: {qty(totalSetReady)} SET / Pcs Siap Embarkasi
                    </span>
                  </div>
                  <h2 className="mt-1 text-lg font-black text-slate-900">
                    Stok SET Koper Siap Kirim ke Asrama Embarkasi (per Titik Fasilitas MR WU)
                  </h2>
                  <p className="text-xs text-slate-600">
                    Gudang Pusat / Manager memantau saldo SET ini untuk penjadwalan armada truk ke Embarkasi. Begitu surat jalan dikirim, stok otomatis terpotong dari titik ini.
                  </p>
                </div>
                <Link
                  href="/dashboard/pengirimanEmbarkasi"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 transition"
                >
                  <span>🚚</span>
                  <span>Jadwalkan Kirim ke Embarkasi →</span>
                </Link>
              </div>

              {/* Dynamic Lokasi Set Cards */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mrWuLocations.map((loc: any) => {
                  const setQty = setBalancesByLoc.get(Number(loc.id)) || 0;
                  const isianQty = isianBalancesByLoc.get(Number(loc.id)) || 0;
                  const badge = getStockStatusBadge(setQty, true);
                  const icon = getLocationIcon(loc.name);
                  return (
                    <div
                      key={loc.id}
                      className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-2xs hover:shadow-xs transition flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-extrabold text-slate-800 truncate">
                            {icon} {loc.name}
                          </span>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold border shrink-0 ${badge.classes}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <div className="mt-2 flex items-baseline justify-between">
                          <span className="text-xs text-slate-500">Stok SET Siap:</span>
                          <span className="text-2xl font-black text-emerald-700">
                            {qty(setQty)} <span className="text-xs font-bold text-slate-500">SET / Pcs</span>
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 border-t border-slate-100 pt-2 flex items-center justify-between text-xs text-slate-600">
                        <span>Isian Koper dari Pusat:</span>
                        <span className="font-bold text-indigo-700">{qty(isianQty)} Pcs</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Analisis Kesiapan / Kelengkapan Komponen */}
              <div className="mt-4 rounded-2xl border border-emerald-200/80 bg-white/90 p-4 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 uppercase tracking-wide text-[11px]">
                    Status Kelengkapan Isian Koper di MR WU:
                  </span>
                  <span className="font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                    Total {qty(totalIsianAvailable)} Isian Koper Diterima dari Pusat
                  </span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Semua isian koper yang telah diterima dan dikonfirmasi oleh Admin MR WU siap dirakit menjadi SET utuh bersama koper besar & koper kecil.
                  Jika target pengiriman adalah 1.000 Set, pastikan stok isian koper dari Pusat sudah mencapai minimal 1.000 Pcs.
                </p>
              </div>
            </section>

            {/* ======================================================== */}
            {/* 2. FORM INPUT HASIL PACKING SET HARIAN DI MR WU */}
            {/* ======================================================== */}
            <Card title="📦 Input Hasil Packing SET Koper Harian di MR WU">
              <form action={recordMrWuDailyPackingAction} className="space-y-4">
                <input type="hidden" name="return_path" value="/dashboard/mitraMrWu" />
                <p className="text-xs text-slate-500">
                  Admin MR WU mencatat berapa banyak SET Koper Lengkap (Koper Besar + Koper Kecil + Isian + Kardus) yang berhasil dirakit & dipacking hari ini di setiap titik pabrik.
                </p>

                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Lokasi Pabrik MR WU
                    </label>
                    <select name="location_id" required className={inputClass}>
                      {mrWuLocations.map((loc: any) => (
                        <option key={loc.id} value={loc.id}>
                          {getLocationIcon(loc.name)} {loc.name} {loc.location_code ? `(${loc.location_code})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Tanggal Packing
                    </label>
                    <input
                      name="packing_date"
                      type="date"
                      required
                      defaultValue={new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Jenis Set Koper
                    </label>
                    <select name="set_id" required className={inputClass}>
                      {productSets.length > 0 ? (
                        productSets.map((ps: any) => (
                          <option key={ps.id} value={ps.id}>
                            {ps.set_code} · {ps.name} ({ps.unit || "SET"})
                          </option>
                        ))
                      ) : (
                        <option value="">Memuat jenis set koper...</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Jumlah SET Jadi Hari Ini
                    </label>
                    <input
                      name="set_qty"
                      type="number"
                      min="1"
                      step="1"
                      required
                      placeholder="Contoh: 150"
                      className={`${inputClass} font-black text-emerald-700`}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Catatan (Opsional)
                  </label>
                  <input
                    name="notes"
                    type="text"
                    placeholder="Misal: Hasil packing shift siang koper Garuda"
                    className={inputClass}
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button type="submit" className={buttonClass}>
                    ✅ Simpan Hasil Packing SET Hari Ini
                  </button>
                </div>
              </form>

              {/* Riwayat Packing Terakhir */}
              {recentPackingRuns.length > 0 && (
                <div className="mt-5 border-t border-slate-100 pt-4 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Riwayat Pencatatan Packing Terakhir di MR WU:
                  </h4>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/80 bg-slate-50/50 overflow-hidden text-xs">
                    {recentPackingRuns.slice(0, 5).map((pr: any) => {
                      const loc = locMap.get(Number(pr.location_id));
                      const setObj = setMap.get(Number(pr.set_id));
                      return (
                        <div key={pr.id} className="flex items-center justify-between p-2.5">
                          <div>
                            <span className="font-bold text-slate-800">{loc?.name || `Lokasi #${pr.location_id}`}</span>
                            <span className="text-slate-400 mx-1.5">·</span>
                            <span className="text-slate-600">{setObj?.name || `Set #${pr.set_id}`}</span>
                            <span className="text-slate-400 mx-1.5">·</span>
                            <span className="text-slate-500">{pr.packing_date}</span>
                          </div>
                          <span className="font-black text-emerald-700 text-sm">
                            +{qty(pr.set_qty)} SET / Pcs
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          </div>
        );
      })()}

      {/* Locations Stock Overview */}
      <Card title={`Posisi Stok Fisik di Lokasi Pabrik Mitra MR WU (${mrWuLocations.length} Titik Fasilitas)`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mrWuLocationIds.map((locId) => {
            const data = stockByLoc.get(locId);
            const loc = locMap.get(locId);
            const icon = getLocationIcon(loc?.name || "");

            return (
              <div
                key={locId}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs transition hover:shadow-sm flex flex-col justify-between"
              >
                <div className="border-b border-gray-100 pb-3">
                  <span className="font-mono text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                    {loc?.location_code || `LOK-${locId}`}
                  </span>
                  <h3 className="mt-1 font-bold text-gray-900 text-sm">{data?.locName}</h3>
                  <p className="text-xs text-gray-500 line-clamp-1">{loc?.notes || "Gudang perakitan & isian koper"}</p>
                </div>

                {/* Items breakdown list */}
                <div className="mt-3 pt-1">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Rincian Barang:
                    </span>
                    <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                      {data?.items.length || 0} Jenis
                    </span>
                  </div>

                  {data?.items && data.items.length > 0 ? (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                      {data.items.map((it: any) => {
                        const isSet = it.item_kind === "SET";
                        const itemBadge = getStockStatusBadge(Number(it.quantity || 0), isSet);
                        return (
                          <div
                            key={it.id}
                            className="flex items-center justify-between text-xs rounded-xl bg-gray-50/80 p-2.5 border border-gray-100/90"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5">
                                <p className="font-bold text-gray-900 line-clamp-1">{it.name}</p>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${itemBadge.classes}`}>
                                  {itemBadge.label}
                                </span>
                              </div>
                              <p className="font-mono text-[10px] text-gray-500">{it.code}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-black text-gray-900 text-sm">
                                {qty(it.quantity)}
                              </span>
                              <span className="text-[10px] font-semibold text-gray-500 ml-1">{it.unit}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 italic py-4 text-center">Belum ada stok fisik tercatat di lokasi ini.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Outgoing Shipments to Embarkasi from MR WU */}
      <EmbarkasiShipmentTable
        title="Daftar Pengiriman Set ke Asrama Haji / Embarkasi (dari Lokasi MR WU)"
        shipments={mrWuShipments}
        canOperate={false}
      />

      {/* Incoming Deliveries from Pusat */}
      <Card title={`Daftar Pengiriman Masuk dari Pabrik Pusat (${transfers.length} Transaksi)`}>
        {transfers.length === 0 ? (
          <Empty>Belum ada riwayat pengiriman dari pabrik pusat ke lokasi MR WU.</Empty>
        ) : (
          <div className="space-y-4">
            {transfers.map((t: any) => {
              const fg = fgMap.get(t.finished_good_id);
              const destLoc = locMap.get(t.destination_location_id);
              const isReceived = t.delivery_status === "DITERIMA";

              return (
                <div
                  key={t.id}
                  className={`rounded-2xl border p-5 shadow-xs transition hover:shadow-sm ${
                    isReceived ? "border-gray-200 bg-white" : "border-amber-300 bg-amber-50/20"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                          {t.transfer_code}
                        </span>
                        {t.document_no ? (
                          <span className="text-xs font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">
                            SJ: {t.document_no}
                          </span>
                        ) : null}
                        <b className="text-base text-gray-900">
                          {destLoc?.name || `Lokasi #${t.destination_location_id}`}
                        </b>
                      </div>
                      <p className="mt-1 text-xs text-gray-600">
                        Barang: <b className="text-gray-900">{fg?.name || `Barang #${t.finished_good_id}`}</b> · Tanggal: <b className="text-gray-900">{t.transfer_date}</b>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <MrWuTransferConfirmModal
                        transfer={{
                          id: t.id,
                          transfer_code: t.transfer_code,
                          document_no: t.document_no,
                          transfer_date: t.transfer_date,
                          quantity: Number(t.quantity),
                          notes: t.notes,
                          finished_good_name: fg?.name || "Barang Jadi",
                          source_location_name: "Pabrik Pusat SMPT",
                          destination_location_name: destLoc?.name || "Gudang MR WU",
                          delivery_status: t.delivery_status || "DITERIMA",
                          received_qty: t.received_qty,
                          reject_qty: t.reject_qty,
                          damaged_qty: t.damaged_qty,
                          received_notes: t.received_notes,
                          surat_jalan_photo_url: t.surat_jalan_photo_url,
                        }}
                        returnPath="/dashboard/mitraMrWu"
                        canConfirm={canConfirm}
                      />
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          isReceived
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-100 text-amber-800 border border-amber-300 animate-pulse"
                        }`}
                      >
                        {isReceived ? "✅ SUDAH DITERIMA" : "⏳ MENUNGGU KONFIRMASI"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2 md:grid-cols-4 bg-gray-50/70 p-3 rounded-xl border border-gray-100">
                    <div>
                      <span className="text-gray-500 block">Jumlah Dikirim:</span>
                      <span className="font-bold text-gray-900 text-sm">{qty(t.quantity)} Unit/Pcs</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Status Diterima:</span>
                      <span className="font-semibold text-gray-800">
                        {isReceived ? `${qty(t.received_qty)} Unit Diterima` : "Belum Konfirmasi"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Driver / Armada:</span>
                      <span className="font-medium text-gray-800">
                        {t.driver_name || "-"} {t.vehicle_no ? `(${t.vehicle_no})` : ""}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Surat Jalan Fisik:</span>
                      {t.surat_jalan_photo_url ? (
                        <span className="font-bold text-emerald-700">📸 Foto Tersimpan</span>
                      ) : (
                        <span className="text-amber-700 font-medium">Belum Ada Foto</span>
                      )}
                    </div>
                  </div>

                  {t.notes ? (
                    <p className="mt-2 text-xs text-gray-500 italic">
                      Catatan Pengiriman: {t.notes}
                    </p>
                  ) : null}

                  {t.received_notes ? (
                    <div className="mt-2 text-xs text-emerald-800 bg-emerald-50/60 p-2 rounded-lg border border-emerald-100">
                      <b>Catatan Penerima MR WU:</b> {t.received_notes}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </PageShell>
  );
}
