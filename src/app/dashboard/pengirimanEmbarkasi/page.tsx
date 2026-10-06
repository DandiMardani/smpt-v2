import {
  Field,
  Metric,
  Notice,
  PageShell,
  ReadOnly,
  buttonClass,
  inputClass,
} from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { createShipmentAction } from "@/lib/final/actions";
import { ShipmentExportActions } from "@/components/logistics/shipment-export-actions";
import {
  EmbarkasiShipmentTable,
  type ShipmentItem,
} from "@/components/logistics/embarkasi-shipments-table";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("pengiriman_embarkasi.view");
  const isPetugasEmbarkasi =
    a.role === "ADMIN_EMBARKASI" ||
    a.role === "PETUGAS_EMBARKASI" ||
    a.role === "MANAGER";
  const can =
    !isPetugasEmbarkasi &&
    (a.role === "ADMIN" || a.permissionCodes.includes("pengiriman_embarkasi.operate"));
  const q = await searchParams;
  const s = await createClient();

  const [tr, lr, sr, er, fr, setr] = await Promise.all([
    s.from("embarkation_targets").select("*").eq("status", "AKTIF").limit(500),
    s.from("locations").select("id, name, status").eq("status", "AKTIF"),
    s.from("embarkation_shipments").select("*").order("shipment_date", { ascending: false }).limit(500),
    s.from("embarkations").select("id, embarkation_code, short_code, name"),
    s.from("finished_goods").select("id, finished_good_code, name"),
    s.from("product_sets").select("id, set_code, name"),
  ]);

  const e = [tr.error, lr.error, sr.error, er.error, fr.error, setr.error].find(Boolean);
  if (e) throw new Error(e.message);

  const embMap = new Map((er.data ?? []).map((x: any) => [x.id, x]));
  const locMap = new Map((lr.data ?? []).map((x: any) => [x.id, x.name]));
  const fgMap = new Map((fr.data ?? []).map((x: any) => [x.id, x]));
  const setMap = new Map((setr.data ?? []).map((x: any) => [x.id, x]));
  const targetMap = new Map((tr.data ?? []).map((x: any) => [x.id, x]));

  const shipments = sr.data ?? [];
  const totalSentQty = shipments.reduce((sum: number, x: any) => sum + (Number(x.quantity) || 0), 0);
  const totalReceivedQty = shipments.reduce((sum: number, x: any) => sum + (Number(x.received_qty) || 0), 0);

  // Kalkulasi Rangkuman Kuota & Progres per Embarkasi Target
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

  const targetSummaries = (tr.data ?? []).map((t: any) => {
    const emb = embMap.get(t.embarkation_id);
    const item = t.item_kind === "SET" ? setMap.get(t.set_id) : fgMap.get(t.finished_good_id);

    const targetShipments = shipments.filter((s: any) => s.target_id === t.id && s.status !== "DIBATALKAN");
    const sentShipments = targetShipments.filter((s: any) => s.status === "DIKIRIM" || s.status === "DITERIMA");
    const receivedShipments = targetShipments.filter((s: any) => s.status === "DITERIMA");

    const sentQty = sentShipments.reduce((sum: number, s: any) => sum + (Number(s.quantity) || 0), 0);
    const receivedQty = receivedShipments.reduce((sum: number, s: any) => sum + (Number(s.received_qty ?? s.quantity) || 0), 0);
    const targetQty = Number(t.target_qty) || 0;
    const remainingQty = Math.max(0, targetQty - sentQty);
    const progressPct = targetQty > 0 ? Math.min(100, Math.round((sentQty / targetQty) * 100)) : 0;

    // Tanggal pengiriman terakhir
    const dates = targetShipments
      .map((s: any) => s.shipment_date)
      .filter(Boolean)
      .sort()
      .reverse();
    const lastShipmentDate = dates[0] || "-";

    // Dateline default per embarkasi jika belum ditentukan khusus
    const deadlineMatch = (t.notes || "").match(/\[DATELINE:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\]/);
    const defaultDeadline =
      emb?.short_code === "JKS" ? "2026-05-15" : emb?.short_code === "JKG" ? "2026-05-18" : "2026-05-20";
    const deadline = deadlineMatch ? deadlineMatch[1] : defaultDeadline;

    return {
      id: t.id,
      embarkationName: emb?.name || `Embarkasi #${t.embarkation_id}`,
      shortCode: emb?.short_code || "-",
      itemName: item?.name || "Item Target",
      targetQty,
      sentQty,
      receivedQty,
      remainingQty,
      progressPct,
      lastShipmentDate,
      deadline,
      shipmentCount: targetShipments.length,
    };
  });

  const formattedShipments: ShipmentItem[] = shipments.map((x: any) => {
    const target = targetMap.get(x.target_id);
    const emb = target ? embMap.get(target.embarkation_id) : null;
    const item = target
      ? target.item_kind === "SET"
        ? setMap.get(target.set_id)
        : fgMap.get(target.finished_good_id)
      : null;
    const srcLoc = locMap.get(x.source_location_id) || `Gudang #${x.source_location_id}`;

    const matchDeadline = (x.notes || "").match(/\[DATELINE:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\]/);
    const deliveryDeadline = matchDeadline ? matchDeadline[1] : null;
    const cleanNotes = (x.notes || "").replace(/\[DATELINE:\s*[0-9]{4}-[0-9]{2}-[0-9]{2}\]\s*/, "");

    return {
      id: x.id,
      shipment_code: x.shipment_code,
      document_no: x.document_no || null,
      shipment_date: x.shipment_date,
      quantity: Number(x.quantity || 0),
      status: x.status,
      received_qty: x.received_qty !== null ? Number(x.received_qty) : null,
      reject_qty: x.reject_qty !== null ? Number(x.reject_qty) : null,
      damaged_qty: x.damaged_qty !== null ? Number(x.damaged_qty) : null,
      missing_qty: x.missing_qty !== null ? Number(x.missing_qty) : null,
      driver_name: x.driver_name || null,
      vehicle_no: x.vehicle_no || null,
      public_token: x.public_token || null,
      notes: cleanNotes || null,
      delivery_deadline: deliveryDeadline,
      surat_jalan_photo_url: x.surat_jalan_photo_url || null,
      source_location_name: srcLoc,
      embarkation_name: emb?.name || `Embarkasi #${target?.embarkation_id || "-"}`,
      embarkation_code: emb?.short_code || null,
      item_name: item?.name || "Item Target",
    };
  });

  return (
    <PageShell
      eyebrow="Distribusi & Logistik Haji"
      title="Pengiriman & Tracking Embarkasi"
      description="Penerbitan surat jalan armada truk ke asrama haji, tracking pengiriman, dan konfirmasi penerimaan fisik."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />

      {/* Summary Metrics */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Total Pengiriman" value={`${shipments.length} Surat Jalan`} />
        <Metric label="Total Fisik Dikirim" value={`${qty(totalSentQty)} Unit / SET`} />
        <Metric label="Total Tiba di Embarkasi" value={`${qty(totalReceivedQty)} Unit / SET`} />
      </div>

      {/* Rangkuman Progres Kuota & Dateline Embarkasi */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-base">
              📊
            </span>
            <div>
              <h2 className="text-base font-black text-slate-900">
                Rangkuman Kuota & Dateline Pengiriman Embarkasi
              </h2>
              <p className="text-xs text-slate-500">
                Monitoring kuota koper terkirim, sisa kurang, persentase pemenuhan, dan batas waktu tiba per embarkasi.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 border border-slate-200">
            {targetSummaries.length} Target Kuota Aktif
          </span>
        </div>

        {/* Tabel Ringkasan Desktop */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead>
              <tr className="bg-slate-50/90 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-3 text-left">Embarkasi Tujuan</th>
                <th className="py-2.5 px-3 text-left">Item Target</th>
                <th className="py-2.5 px-3 text-right">Target Kuota</th>
                <th className="py-2.5 px-3 text-right">Terkirim</th>
                <th className="py-2.5 px-3 text-right">Sisa Kurang</th>
                <th className="py-2.5 px-3 text-center">Progres %</th>
                <th className="py-2.5 px-3 text-center">Tgl Kirim Terakhir</th>
                <th className="py-2.5 px-3 text-center">Dateline Tiba</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {targetSummaries.map((ts: any) => {
                const isLate = todayStr > ts.deadline;
                const isToday = todayStr === ts.deadline;
                const isFinished = ts.remainingQty === 0 && ts.targetQty > 0;

                return (
                  <tr key={ts.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          {ts.shortCode}
                        </span>
                        <span className="font-extrabold text-slate-900 text-sm">
                          {ts.embarkationName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-700 font-medium">
                      {ts.itemName}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-slate-900">
                      {qty(ts.targetQty)} SET
                    </td>
                    <td className="py-3 px-3 text-right font-extrabold text-blue-700">
                      {qty(ts.sentQty)} SET
                      {ts.receivedQty > 0 && (
                        <span className="block text-[10px] text-emerald-600 font-semibold">
                          ({qty(ts.receivedQty)} tiba)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {isFinished ? (
                        <span className="font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          ✓ LENGKAP
                        </span>
                      ) : (
                        <span className="font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          {qty(ts.remainingQty)} SET
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="w-28 mx-auto space-y-1">
                        <div className="flex justify-between text-[11px] font-bold">
                          <span className={ts.progressPct >= 100 ? "text-emerald-700" : "text-slate-700"}>
                            {ts.progressPct}%
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              ts.progressPct >= 100
                                ? "bg-emerald-500"
                                : ts.progressPct >= 50
                                ? "bg-blue-600"
                                : "bg-amber-500"
                            }`}
                            style={{ width: `${Math.min(ts.progressPct, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-slate-600">
                      {ts.lastShipmentDate !== "-" ? `📅 ${ts.lastShipmentDate}` : "-"}
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {isFinished ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          🏁 Selesai Target
                        </span>
                      ) : isLate ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                          ⚠️ Lewat ({ts.deadline})
                        </span>
                      ) : isToday ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                          ⏰ Hari Ini ({ts.deadline})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
                          🎯 {ts.deadline}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Ringkasan Cards Mobile */}
        <div className="lg:hidden grid gap-3 sm:grid-cols-2">
          {targetSummaries.map((ts: any) => {
            const isLate = todayStr > ts.deadline;
            const isToday = todayStr === ts.deadline;
            const isFinished = ts.remainingQty === 0 && ts.targetQty > 0;

            return (
              <div
                key={ts.id}
                className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                      {ts.shortCode}
                    </span>
                    <span className="font-extrabold text-slate-900 text-sm">
                      {ts.embarkationName}
                    </span>
                  </div>
                  <span className="text-xs font-black text-slate-800">
                    {ts.progressPct}%
                  </span>
                </div>

                <p className="text-xs text-slate-600 font-medium">📦 {ts.itemName}</p>

                {/* Progress bar */}
                <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      ts.progressPct >= 100
                        ? "bg-emerald-500"
                        : ts.progressPct >= 50
                        ? "bg-blue-600"
                        : "bg-amber-500"
                    }`}
                    style={{ width: `${Math.min(ts.progressPct, 100)}%` }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-1.5 pt-1 text-center">
                  <div className="rounded-xl bg-white p-1.5 border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 block font-bold uppercase">Target</span>
                    <span className="text-xs font-extrabold text-slate-900">{qty(ts.targetQty)}</span>
                  </div>
                  <div className="rounded-xl bg-blue-50/60 p-1.5 border border-blue-200/80">
                    <span className="text-[10px] text-blue-600 block font-bold uppercase">Terkirim</span>
                    <span className="text-xs font-black text-blue-700">{qty(ts.sentQty)}</span>
                  </div>
                  <div className="rounded-xl bg-rose-50/60 p-1.5 border border-rose-200/80">
                    <span className="text-[10px] text-rose-600 block font-bold uppercase">Kurang</span>
                    <span className="text-xs font-black text-rose-700">{qty(ts.remainingQty)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/60 text-slate-500">
                  <span>📅 Kirim Terakhir: {ts.lastShipmentDate}</span>
                  <span>
                    {isFinished ? (
                      <b className="text-emerald-700">✓ Selesai</b>
                    ) : isLate ? (
                      <b className="text-rose-700">Lewat: {ts.deadline}</b>
                    ) : isToday ? (
                      <b className="text-amber-700">Hari ini: {ts.deadline}</b>
                    ) : (
                      <span>Dateline: {ts.deadline}</span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>


      {/* Collapsible Form Buat Surat Jalan (Mobile-Friendly, tidak menutupi tabel) */}
      {can ? (
        <details className="group rounded-3xl border border-slate-200/90 bg-white shadow-xs overflow-hidden transition">
          <summary className="cursor-pointer list-none p-4 sm:p-5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition select-none">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-lg shrink-0">
                🚚
              </span>
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                  Buat Surat Jalan Pengiriman ke Embarkasi
                </h3>
                <p className="text-xs text-slate-500">
                  Klik untuk membuka formulir penerbitan draft pengiriman armada baru
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 shadow-2xs group-open:bg-slate-100 group-open:text-slate-700 group-open:border-slate-200 transition">
              <span className="group-open:hidden">➕ Buka Form Input</span>
              <span className="hidden group-open:inline">▲ Tutup Form</span>
            </span>
          </summary>

          <div className="border-t border-slate-100 p-4 sm:p-5 pt-4 bg-slate-50/40">
            <form action={createShipmentAction} className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              <Field label="Target Embarkasi">
                <select name="target_id" required className={inputClass}>
                  <option value="">-- Pilih Target Embarkasi --</option>
                  {(tr.data ?? []).map((x: any) => {
                    const emb = embMap.get(x.embarkation_id);
                    const item = x.item_kind === "SET" ? setMap.get(x.set_id) : fgMap.get(x.finished_good_id);
                    const short = emb?.short_code ? `[${emb.short_code}] ` : "";
                    return (
                      <option key={x.id} value={x.id}>
                        {short}{emb?.name || `Embarkasi #${x.embarkation_id}`} ➔ {item?.name || "Item"} (Target: {qty(x.target_qty)})
                      </option>
                    );
                  })}
                </select>
              </Field>

              <Field label="Tanggal Pengiriman">
                <input
                  name="shipment_date"
                  type="date"
                  required
                  className={inputClass}
                  defaultValue={new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())}
                />
              </Field>

              <Field label="Lokasi Asal (Gudang/Pabrik)">
                <select name="source_location_id" required className={inputClass}>
                  <option value="">-- Pilih Lokasi Asal --</option>
                  {(lr.data ?? []).map((x: any) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Jumlah Pengiriman (Qty)">
                <input name="quantity" type="number" min="1" step="any" required className={inputClass} placeholder="Contoh: 300" />
              </Field>

              <Field label="No. Surat Jalan / Dokumen">
                <input name="document_no" className={inputClass} placeholder="Contoh: SJ-EMB/2026/001" />
              </Field>

              <Field label="Nama Driver / Ekspedisi">
                <input name="driver_name" className={inputClass} placeholder="Nama sopir / vendor armada" />
              </Field>

              <Field label="No. Polisi / Armada">
                <input name="vehicle_no" className={inputClass} placeholder="Contoh: B 9123 XYZ" />
              </Field>

              <Field label="Dateline Tiba di Asrama Haji">
                <input
                  name="delivery_deadline"
                  type="date"
                  className={inputClass}
                  placeholder="Target tiba di asrama haji"
                />
              </Field>

              <Field label="Catatan Pengiriman">
                <input name="notes" className={inputClass} placeholder="Catatan muatan, rit, kontainer" />
              </Field>

              <div className="sm:col-span-2 md:col-span-4 flex justify-end pt-1">
                <button type="submit" className={buttonClass}>
                  📄 Terbitkan Draft Surat Jalan
                </button>
              </div>
            </form>
          </div>
        </details>
      ) : null}

      {/* Header Tabel & Export */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div>
          <h2 className="text-lg font-black text-slate-900">
            Daftar Surat Jalan & Manifest Pengiriman ({shipments.length})
          </h2>
          <p className="text-xs text-slate-500">
            Tabel manifes pengiriman koper haji ke asrama embarkasi dengan riwayat dan status penerimaan fisik.
          </p>
        </div>
        <ShipmentExportActions />
      </div>

      {/* Interactive, Mobile-Friendly Table with Collapsible Drawer ("Buka / Tutup") */}
      <EmbarkasiShipmentTable shipments={formattedShipments} canOperate={can} />
    </PageShell>
  );
}
