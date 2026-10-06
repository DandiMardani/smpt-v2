import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/access/current-user";
import { qty } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function SuratJalanPage({ params }: Props) {
  await requirePermission("pengiriman_embarkasi.view");
  const { id } = await params;
  const s = await createClient();

  const [shipRes, trRes, embRes, locRes, fgRes, setRes] = await Promise.all([
    s.from("embarkation_shipments").select("*").eq("id", id).maybeSingle(),
    s.from("embarkation_targets").select("*"),
    s.from("embarkations").select("*"),
    s.from("locations").select("*"),
    s.from("finished_goods").select("*"),
    s.from("product_sets").select("*"),
  ]);

  if (!shipRes.data) notFound();

  const ship = shipRes.data;
  const embMap = new Map((embRes.data ?? []).map((x: any) => [x.id, x]));
  const locMap = new Map((locRes.data ?? []).map((x: any) => [x.id, x]));
  const fgMap = new Map((fgRes.data ?? []).map((x: any) => [x.id, x]));
  const setMap = new Map((setRes.data ?? []).map((x: any) => [x.id, x]));
  const targetMap = new Map((trRes.data ?? []).map((x: any) => [x.id, x]));

  const target = targetMap.get(ship.target_id);
  const emb = target ? embMap.get(target.embarkation_id) : null;
  const item = target ? (target.item_kind === "SET" ? setMap.get(target.set_id) : fgMap.get(target.finished_good_id)) : null;
  const srcLoc = locMap.get(ship.source_location_id);

  const printDate = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-neutral-100 p-4 sm:p-8 print:bg-white print:p-0">
      {/* Control Bar (hidden in print) */}
      <div className="mx-auto mb-6 flex max-w-4xl items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm print:hidden">
        <Link
          href="/dashboard/pengirimanEmbarkasi"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900"
        >
          ← Kembali ke Tracking Pengiriman
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {}}
            id="print-btn"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-sky-700 active:scale-95"
          >
            🖨️ Cetak / Simpan PDF
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

      {/* Official Surat Jalan Sheet */}
      <div className="mx-auto max-w-4xl rounded-2xl border border-gray-300 bg-white p-8 sm:p-12 shadow-md print:max-w-none print:border-none print:p-6 print:shadow-none font-sans text-gray-900">
        {/* Company Header */}
        <div className="border-b-2 border-gray-900 pb-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-gray-900">
                PT KREASI DINAMIKA NUSANTARA
              </h1>
              <p className="text-xs font-semibold tracking-wide text-gray-600 uppercase">
                Divisi Logistik & Distribusi Perlengkapan Haji
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Kawasan Industri Pergudangan Dadap & Kosambi, Tangerang, Banten · Telp: (021) 5595-XXXX
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block rounded-md border-2 border-gray-900 px-3 py-1 font-mono text-xs font-bold uppercase tracking-widest text-gray-900">
                SURAT JALAN
              </span>
              <p className="mt-1.5 font-mono text-xs text-gray-600">
                No: <b>{ship.document_no || ship.shipment_code}</b>
              </p>
              <p className="font-mono text-xs text-gray-500">
                Ref: {ship.shipment_code}
              </p>
            </div>
          </div>
        </div>

        {/* Document Meta Information */}
        <div className="mt-6 grid grid-cols-2 gap-6 rounded-xl border border-gray-200 bg-gray-50/70 p-4 text-xs">
          <div className="space-y-1.5">
            <div>
              <span className="text-gray-500 font-medium">Asal Pengiriman:</span>
              <p className="font-bold text-gray-900">{srcLoc?.name || "Gudang Utama / Pabrik"}</p>
              <p className="text-[11px] text-gray-500">{srcLoc?.notes || "Pusat Distribusi SMPT"}</p>
            </div>
            <div className="pt-1">
              <span className="text-gray-500 font-medium">Tanggal Berangkat:</span>
              <p className="font-bold text-gray-900">{ship.shipment_date || "-"}</p>
            </div>
            <div>
              <span className="text-gray-500 font-medium">Tracking Token:</span>
              <p className="font-mono font-bold text-gray-700">{ship.public_token || "-"}</p>
            </div>
          </div>

          <div className="space-y-1.5 border-l border-gray-200 pl-6">
            <div>
              <span className="text-gray-500 font-medium">Tujuan Penerima (Embarkasi):</span>
              <p className="font-bold text-base text-gray-900">{emb?.name || "Asrama Haji Embarkasi"}</p>
              <p className="font-mono text-[11px] text-gray-600">Kode Embarkasi: {emb?.embarkation_code || "-"}</p>
            </div>
            <div className="pt-1">
              <span className="text-gray-500 font-medium">Armada & Pengemudi:</span>
              <p className="font-bold text-gray-900">
                {ship.driver_name || "Driver Internal"} {ship.vehicle_no ? `· Plat: ${ship.vehicle_no}` : ""}
              </p>
            </div>
            <div>
              <span className="text-gray-500 font-medium">Status Pengiriman:</span>
              <p className="font-bold uppercase text-sky-800">
                {ship.status}
              </p>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-800">
            Rincian Muatan Barang
          </h2>
          <table className="w-full border-collapse border border-gray-300 text-xs">
            <thead>
              <tr className="bg-gray-100 text-gray-800">
                <th className="border border-gray-300 px-3 py-2 text-center w-12">No.</th>
                <th className="border border-gray-300 px-3 py-2 text-left">Kode & Nama Barang</th>
                <th className="border border-gray-300 px-3 py-2 text-center w-24">Satuan</th>
                <th className="border border-gray-300 px-3 py-2 text-right w-32">Qty Dikirim</th>
                <th className="border border-gray-300 px-3 py-2 text-right w-32">Qty Diterima</th>
                <th className="border border-gray-300 px-3 py-2 text-left">Keterangan</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 px-3 py-3 text-center font-medium">1</td>
                <td className="border border-gray-300 px-3 py-3">
                  <div className="font-bold text-gray-900">{item?.name || "Koper Haji / Tas Embarkasi"}</div>
                  <div className="font-mono text-[11px] text-gray-500">
                    {item?.set_code || item?.finished_good_code || "ITEM-EMB"}
                  </div>
                </td>
                <td className="border border-gray-300 px-3 py-3 text-center font-medium">
                  {target?.item_kind === "SET" ? "SET" : "UNIT / PCS"}
                </td>
                <td className="border border-gray-300 px-3 py-3 text-right font-black text-sm text-gray-900">
                  {qty(ship.quantity)}
                </td>
                <td className="border border-gray-300 px-3 py-3 text-right font-bold text-sm text-gray-800">
                  {ship.status === "DITERIMA" ? qty(ship.received_qty) : "-"}
                </td>
                <td className="border border-gray-300 px-3 py-3 text-gray-600 text-[11px]">
                  {ship.notes || "Kondisi baru siap distribusi ke jemaah haji"}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold">
                <td colSpan={3} className="border border-gray-300 px-3 py-2.5 text-right uppercase">
                  Total Muatan Fisik:
                </td>
                <td className="border border-gray-300 px-3 py-2.5 text-right font-black text-sm text-gray-900">
                  {qty(ship.quantity)}
                </td>
                <td className="border border-gray-300 px-3 py-2.5 text-right font-black text-sm text-gray-900">
                  {ship.status === "DITERIMA" ? qty(ship.received_qty) : "-"}
                </td>
                <td className="border border-gray-300 px-3 py-2.5 text-gray-500 text-[11px]">
                  {ship.status === "DITERIMA" && (Number(ship.reject_qty) > 0 || Number(ship.damaged_qty) > 0 || Number(ship.missing_qty) > 0) ? (
                    <span className="text-red-700">
                      Selisih: Rj {qty(ship.reject_qty)} · Rsk {qty(ship.damaged_qty)} · Krg {qty(ship.missing_qty)}
                    </span>
                  ) : (
                    "Lengkap & Baik"
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Catatan / Terms */}
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/50 p-3 text-[11px] text-gray-600">
          <p className="font-semibold text-gray-800 mb-0.5">Syarat & Ketentuan Pengiriman:</p>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li>Surat jalan ini adalah bukti serah terima resmi muatan logistik koper haji dari pihak penyedia ke panitia embarkasi.</li>
            <li>Barang yang diterima harap diperiksa jumlah fisik karton dan segel sebelum ditandatangani.</li>
            <li>Surat jalan asli bertanda tangan & stempel basah harus difoto dan diarsipkan ke sistem SMPT.</li>
          </ol>
        </div>

        {/* 3 Column Official Signatures */}
        <div className="mt-8 grid grid-cols-3 gap-6 pt-4 text-center text-xs">
          <div className="flex flex-col justify-between h-32">
            <div>
              <p className="font-medium text-gray-600">Pengirim (Gudang/Logistik):</p>
              <p className="font-bold text-gray-900">PT KREASI DINAMIKA NUSANTARA</p>
            </div>
            <div>
              <div className="border-b border-gray-900 w-3/4 mx-auto mb-1"></div>
              <p className="font-semibold text-gray-800">( Staf Logistik / Gudang )</p>
              <p className="text-[10px] text-gray-500">Tgl: {ship.shipment_date || printDate}</p>
            </div>
          </div>

          <div className="flex flex-col justify-between h-32">
            <div>
              <p className="font-medium text-gray-600">Pembawa (Sopir / Ekspedisi):</p>
              <p className="font-bold text-gray-900">{ship.driver_name || "Sopir Pengangkut"}</p>
            </div>
            <div>
              <div className="border-b border-gray-900 w-3/4 mx-auto mb-1"></div>
              <p className="font-semibold text-gray-800">( {ship.driver_name || "Sopir"} )</p>
              <p className="text-[10px] text-gray-500">Nopol: {ship.vehicle_no || "-"}</p>
            </div>
          </div>

          <div className="flex flex-col justify-between h-32">
            <div>
              <p className="font-medium text-gray-600">Penerima (Panitia Asrama Haji):</p>
              <p className="font-bold text-gray-900">{emb?.name || "Embarkasi Haji"}</p>
            </div>
            <div>
              <div className="border-b border-gray-900 w-3/4 mx-auto mb-1"></div>
              <p className="font-semibold text-gray-800">( Tanda Tangan & Cap Asrama )</p>
              <p className="text-[10px] text-gray-500">Tgl Diterima: {ship.received_at ? new Date(ship.received_at).toLocaleDateString("id-ID") : "....................."}</p>
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
