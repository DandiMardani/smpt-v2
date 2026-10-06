import Link from "next/link";
import { requirePermission } from "@/lib/access/current-user";
import { qty } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";

export default async function PrintManifestPage() {
  await requirePermission("pengiriman_embarkasi.view");
  const s = await createClient();

  const [tr, lr, sr, er, fr, setr] = await Promise.all([
    s.from("embarkation_targets").select("*").limit(500),
    s.from("locations").select("id, name"),
    s.from("embarkation_shipments").select("*").order("shipment_date", { ascending: false }).limit(500),
    s.from("embarkations").select("id, embarkation_code, short_code, name"),
    s.from("finished_goods").select("id, finished_good_code, name"),
    s.from("product_sets").select("id, set_code, name"),
  ]);

  const embMap = new Map((er.data ?? []).map((x: any) => [x.id, x]));
  const locMap = new Map((lr.data ?? []).map((x: any) => [x.id, x.name]));
  const fgMap = new Map((fr.data ?? []).map((x: any) => [x.id, x]));
  const setMap = new Map((setr.data ?? []).map((x: any) => [x.id, x]));
  const targetMap = new Map((tr.data ?? []).map((x: any) => [x.id, x]));

  const shipments = sr.data ?? [];
  const totalSentQty = shipments.reduce((sum: number, x: any) => sum + (Number(x.quantity) || 0), 0);
  const totalReceivedQty = shipments.reduce((sum: number, x: any) => sum + (Number(x.received_qty) || 0), 0);
  const totalRejectQty = shipments.reduce((sum: number, x: any) => sum + (Number(x.reject_qty) || 0), 0);
  const totalDamagedQty = shipments.reduce((sum: number, x: any) => sum + (Number(x.damaged_qty) || 0), 0);

  const printDate = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-neutral-100 p-4 sm:p-8 print:bg-white print:p-0">
      {/* Control Bar (hidden in print) */}
      <div className="mx-auto mb-6 flex max-w-6xl items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm print:hidden">
        <Link
          href="/dashboard/pengirimanEmbarkasi"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900"
        >
          ← Kembali ke Tracking Pengiriman
        </Link>
        <div className="flex items-center gap-2">
          <button
            id="print-btn"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-sky-700 active:scale-95"
          >
            🖨️ Cetak / Simpan PDF Rekap
          </button>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.getElementById('print-btn')?.addEventListener('click', function() {
              window.print();
            });
          `,
        }}
      />

      {/* Official Manifest Report Sheet */}
      <div className="mx-auto max-w-6xl rounded-2xl border border-gray-300 bg-white p-8 sm:p-10 shadow-md print:max-w-none print:border-none print:p-6 print:shadow-none font-sans text-gray-900">
        {/* Company Header */}
        <div className="border-b-2 border-gray-900 pb-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-gray-900">
                PT KREASI DINAMIKA NUSANTARA
              </h1>
              <p className="text-xs font-semibold tracking-wide text-gray-600 uppercase">
                Laporan Rekapitulasi & Manifest Distribusi Fisik Embarkasi Haji
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                Kawasan Pergudangan Dadap, Tangerang · Periode Operasional 2026
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block rounded-md border-2 border-gray-900 px-3 py-1 font-mono text-xs font-bold uppercase tracking-widest text-gray-900">
                DOKUMEN RESMI
              </span>
              <p className="mt-1 font-mono text-xs text-gray-600">
                Tgl Cetak: <b>{printDate}</b>
              </p>
            </div>
          </div>
        </div>

        {/* Metrics Summary */}
        <div className="mt-4 grid grid-cols-4 gap-3 text-xs">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <span className="text-gray-500 font-medium block">Total Pengiriman</span>
            <span className="text-base font-black text-gray-900">{shipments.length} Surat Jalan</span>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
            <span className="text-blue-700 font-medium block">Total Fisik Terkirim</span>
            <span className="text-base font-black text-blue-900">{qty(totalSentQty)} Unit / SET</span>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <span className="text-emerald-700 font-medium block">Total Tiba di Asrama</span>
            <span className="text-base font-black text-emerald-900">{qty(totalReceivedQty)} Unit / SET</span>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <span className="text-amber-700 font-medium block">Reject / Rusak Fisik</span>
            <span className="text-base font-black text-amber-900">{qty(totalRejectQty + totalDamagedQty)} Unit</span>
          </div>
        </div>

        {/* Detailed Table */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300 text-[11px]">
            <thead>
              <tr className="bg-gray-100 text-gray-800 uppercase tracking-wider font-bold">
                <th className="border border-gray-300 px-2 py-2 text-center w-8">No</th>
                <th className="border border-gray-300 px-2.5 py-2 text-left">Kode & No. SJ</th>
                <th className="border border-gray-300 px-2.5 py-2 text-left">Tanggal</th>
                <th className="border border-gray-300 px-2.5 py-2 text-left">Tujuan Embarkasi</th>
                <th className="border border-gray-300 px-2.5 py-2 text-left">Barang / Item</th>
                <th className="border border-gray-300 px-2.5 py-2 text-left">Asal Gudang</th>
                <th className="border border-gray-300 px-2 py-2 text-left">Driver / Armada</th>
                <th className="border border-gray-300 px-2.5 py-2 text-right">Qty Kirim</th>
                <th className="border border-gray-300 px-2.5 py-2 text-right">Qty Terima</th>
                <th className="border border-gray-300 px-2.5 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((x: any, idx: number) => {
                const target = targetMap.get(x.target_id);
                const emb = target ? embMap.get(target.embarkation_id) : null;
                const item = target ? (target.item_kind === "SET" ? setMap.get(target.set_id) : fgMap.get(target.finished_good_id)) : null;
                const srcLoc = locMap.get(x.source_location_id) || "-";

                return (
                  <tr key={x.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/40"}>
                    <td className="border border-gray-300 px-2 py-1.5 text-center font-medium">{idx + 1}</td>
                    <td className="border border-gray-300 px-2.5 py-1.5">
                      <div className="font-mono font-bold text-sky-700">{x.shipment_code}</div>
                      {x.document_no ? <div className="text-[10px] text-gray-600 font-semibold">SJ: {x.document_no}</div> : null}
                    </td>
                    <td className="border border-gray-300 px-2.5 py-1.5 whitespace-nowrap">{x.shipment_date}</td>
                    <td className="border border-gray-300 px-2.5 py-1.5 font-bold text-gray-900">{emb?.name || "Embarkasi"}</td>
                    <td className="border border-gray-300 px-2.5 py-1.5">
                      <div className="font-medium text-gray-800">{item?.name || "Item Target"}</div>
                      <div className="text-[10px] text-gray-500 font-mono">{target?.item_kind}</div>
                    </td>
                    <td className="border border-gray-300 px-2.5 py-1.5 text-gray-600">{srcLoc}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-gray-700">
                      {x.driver_name || "-"} {x.vehicle_no ? `(${x.vehicle_no})` : ""}
                    </td>
                    <td className="border border-gray-300 px-2.5 py-1.5 text-right font-black text-gray-900">
                      {qty(x.quantity)}
                    </td>
                    <td className="border border-gray-300 px-2.5 py-1.5 text-right font-bold text-emerald-800">
                      {x.status === "DITERIMA" ? qty(x.received_qty) : "-"}
                    </td>
                    <td className="border border-gray-300 px-2.5 py-1.5 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        x.status === "DITERIMA"
                          ? "bg-emerald-100 text-emerald-800"
                          : x.status === "DIKIRIM"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-amber-100 text-amber-800"
                      }`}>
                        {x.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-bold">
                <td colSpan={7} className="border border-gray-300 px-3 py-2 text-right uppercase">
                  Grand Total Keseluruhan:
                </td>
                <td className="border border-gray-300 px-2.5 py-2 text-right font-black text-sm text-gray-900">
                  {qty(totalSentQty)}
                </td>
                <td className="border border-gray-300 px-2.5 py-2 text-right font-black text-sm text-emerald-900">
                  {qty(totalReceivedQty)}
                </td>
                <td className="border border-gray-300 px-2.5 py-2 text-center text-[10px] text-gray-600">
                  Unit / SET
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Official Signatures */}
        <div className="mt-8 grid grid-cols-2 gap-8 text-center text-xs">
          <div className="flex flex-col justify-between h-28">
            <p className="font-semibold text-gray-700">Dibuat & Divalidasi Oleh (Staf Logistik):</p>
            <div>
              <div className="border-b border-gray-900 w-1/2 mx-auto mb-1"></div>
              <p className="font-bold text-gray-900">Bagian Operasional & Distribusi</p>
            </div>
          </div>

          <div className="flex flex-col justify-between h-28">
            <p className="font-semibold text-gray-700">Mengetahui (Manager Operasional):</p>
            <div>
              <div className="border-b border-gray-900 w-1/2 mx-auto mb-1"></div>
              <p className="font-bold text-gray-900">Manager Operasional & Pabrik</p>
            </div>
          </div>
        </div>

        {/* Footer print info */}
        <div className="mt-8 border-t border-gray-200 pt-3 flex justify-between text-[10px] text-gray-400">
          <span>Dicetak melalui Sistem Manajemen Pabrik & Distribusi SMPT V2</span>
          <span>Waktu Cetak: {printDate}</span>
        </div>
      </div>
    </div>
  );
}
