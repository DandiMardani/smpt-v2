"use client";

import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/master/page-utils";
import { createClientShipmentAction } from "./actions";

type AvailableFinishedGood = {
  id: number;
  finished_good_code: string;
  name: string;
  unit: string;
  available_qty: number;
};

type RecentShipment = {
  id: number;
  transfer_code: string;
  transfer_date: string;
  finished_good_name: string;
  finished_good_code: string;
  customer_name: string;
  quantity: number;
  notes: string;
};

export function PengirimanKlienClient({
  finishedGoods,
  recentShipments,
  canWrite,
}: {
  finishedGoods: AvailableFinishedGood[];
  recentShipments: RecentShipment[];
  canWrite: boolean;
}) {
  const [selectedFgId, setSelectedFgId] = useState<number>(finishedGoods[0]?.id || 0);
  const [sendQty, setSendQty] = useState<number>(1);
  const [printShipment, setPrintShipment] = useState<RecentShipment | null>(null);

  const activeFg = useMemo(() => {
    return finishedGoods.find((f) => f.id === selectedFgId) || finishedGoods[0];
  }, [finishedGoods, selectedFgId]);

  const maxAvailable = activeFg?.available_qty || 0;
  const todayStr = new Date().toISOString().split("T")[0];
  const defaultDocNo = `SJ-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`;

  return (
    <div className="space-y-6">
      {/* Banner Edukasi */}
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-blue-50/90 to-indigo-50/90 p-4 sm:p-5 shadow-xs">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-lg text-white shadow-xs">
            🚚
          </span>
          <div>
            <b className="text-sm font-bold text-slate-900">
              Surat Jalan & Pengiriman Klien (Pesanan Reguler)
            </b>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Kirim tas pesanan langsung ke pemesan / ekspedisi tanpa birokrasi Embarkasi. Saldo tas di
              <b className="text-slate-800"> Gudang PUSAT otomatis terpotong</b>, dan Anda bisa langsung
              mencetak <b className="text-blue-700">Surat Jalan Resmi</b> untuk supir/kurir.
            </p>
          </div>
        </div>
      </div>

      {/* Form Pembuatan Surat Jalan */}
      {canWrite ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
          <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
            <span>Terbitkan Surat Jalan Baru</span>
            <span className="text-[11px] font-semibold text-slate-500">Stok PUSAT Terpotong Otomatis</span>
          </h3>

          <form action={createClientShipmentAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Tanggal Kirim */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Pengiriman</label>
              <input
                type="date"
                name="shipment_date"
                defaultValue={todayStr}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Nomor Surat Jalan */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nomor Surat Jalan</label>
              <input
                type="text"
                name="document_no"
                defaultValue={defaultDocNo}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-mono font-bold text-blue-700 outline-none focus:border-blue-600"
              />
            </div>

            {/* Pilih Barang Jadi */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pilih Barang Jadi di Gudang PUSAT
              </label>
              <select
                name="finished_good_id"
                value={selectedFgId}
                onChange={(e) => {
                  setSelectedFgId(Number(e.target.value));
                  setSendQty(1);
                }}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-blue-600"
              >
                {finishedGoods.length === 0 ? (
                  <option value={0}>Tidak ada stok tas di Gudang PUSAT</option>
                ) : (
                  finishedGoods.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} · Tersedia: {formatNumber(f.available_qty)} {f.unit}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Jumlah Kirim */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">Jumlah Kirim ({activeFg?.unit || "pcs"})</label>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.2 rounded border border-emerald-200">
                  Tersedia: {formatNumber(maxAvailable)} {activeFg?.unit || "pcs"}
                </span>
              </div>
              <input
                type="number"
                name="quantity"
                min="1"
                max={maxAvailable > 0 ? maxAvailable : 1}
                value={sendQty}
                onChange={(e) => setSendQty(Number(e.target.value) || 0)}
                required
                className="w-full rounded-xl border border-blue-300 bg-blue-50/30 px-3.5 py-2 text-sm font-mono font-black text-blue-900 outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            {/* Nama Klien / Tujuan */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nama Klien / Pemesan</label>
              <input
                type="text"
                name="customer_name"
                required
                placeholder="Contoh: PT Bank Mandiri / Toko Tas Makmur"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs outline-none focus:border-blue-600"
              />
            </div>

            {/* Alamat Pengiriman */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Alamat Tujuan Pengiriman</label>
              <input
                type="text"
                name="destination_address"
                placeholder="Contoh: Jl. Sudirman No. 45, Jakarta"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs outline-none focus:border-blue-600"
              />
            </div>

            {/* Supir / Ekspedisi */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nama Supir / Jasa Ekspedisi</label>
              <input
                type="text"
                name="driver_name"
                placeholder="Contoh: Pak Herman / Dakota Cargo"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs outline-none focus:border-blue-600"
              />
            </div>

            {/* Nomor Kendaraan / Resi */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nomor Kendaraan / No. Resi</label>
              <input
                type="text"
                name="vehicle_no"
                placeholder="Contoh: B 9812 SRA / RESI-12345"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs outline-none focus:border-blue-600"
              />
            </div>

            {/* Catatan */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Catatan Tambahan</label>
              <input
                type="text"
                name="notes"
                placeholder="Opsional"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs outline-none focus:border-blue-600"
              />
            </div>

            {/* Tombol Terbitkan */}
            <div className="sm:col-span-2 lg:col-span-3 flex justify-end pt-2">
              <button
                type="submit"
                disabled={maxAvailable <= 0}
                className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-xs font-extrabold text-white shadow-md shadow-blue-500/25 hover:from-blue-700 hover:to-indigo-700 transition active:scale-95 disabled:opacity-50"
              >
                🚚 Kirim Barang & Terbitkan Surat Jalan
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Tabel Riwayat Pengiriman */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3 mb-4">
          Riwayat Pengiriman & Surat Jalan Terbit
        </h3>

        {recentShipments.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">Belum ada pengiriman klien yang tercatat.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">No. Dokumen</th>
                  <th className="px-4 py-3">Tujuan / Klien</th>
                  <th className="px-4 py-3">Barang Dikirim</th>
                  <th className="px-4 py-3 text-right">Jumlah</th>
                  <th className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {recentShipments.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-500">
                      {s.transfer_date}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono font-bold text-blue-700">
                      {s.transfer_code}
                    </td>
                    <td className="px-4 py-3">
                      <b className="text-slate-900">{s.customer_name}</b>
                    </td>
                    <td className="px-4 py-3">
                      <span>{s.finished_good_name}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        {formatNumber(s.quantity)} pcs
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setPrintShipment(s)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:border-slate-300 shadow-2xs transition"
                      >
                        🖨️ Cetak Surat Jalan
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Cetak Surat Jalan Resmi */}
      {printShipment ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 sm:p-8 shadow-2xl">
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">KREASI DINAMIKA</h2>
                <p className="text-xs text-slate-500">Surat Jalan Pengiriman Barang Jadi</p>
              </div>
              <div className="text-right font-mono">
                <span className="block text-xs font-extrabold text-blue-700">{printShipment.transfer_code}</span>
                <span className="text-[11px] text-slate-400">Tgl: {printShipment.transfer_date}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 py-4 border-b border-slate-100 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Pengirim:</span>
                <b className="text-slate-900 block font-bold">PT Kreasi Dinamika Mandiri</b>
                <span className="text-slate-500">Gudang Logistik Pusat</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Penerima / Tujuan:</span>
                <b className="text-slate-900 block font-bold">{printShipment.customer_name}</b>
              </div>
            </div>

            <div className="py-4">
              <table className="w-full text-left text-xs border border-slate-200 rounded-lg">
                <thead className="bg-slate-50 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">No</th>
                    <th className="p-2.5">Nama Barang</th>
                    <th className="p-2.5 text-right">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2.5">1</td>
                    <td className="p-2.5 font-bold text-slate-800">{printShipment.finished_good_name}</td>
                    <td className="p-2.5 text-right font-mono font-bold text-blue-700">{formatNumber(printShipment.quantity)} PCS</td>
                  </tr>
                </tbody>
              </table>

              <p className="mt-3 text-[11px] text-slate-500 italic">
                Catatan: {printShipment.notes || "Barang diterima dalam kondisi baik dan lengkap."}
              </p>
            </div>

            {/* Tanda Tangan */}
            <div className="grid grid-cols-3 gap-2 pt-6 text-center text-xs text-slate-600">
              <div>
                <p className="font-semibold text-slate-500">Pengirim (Gudang)</p>
                <div className="h-14" />
                <p className="border-t border-slate-300 font-bold pt-1">( Petugas Logistik )</p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">Supir / Pembawa</p>
                <div className="h-14" />
                <p className="border-t border-slate-300 font-bold pt-1">( Supir / Ekspedisi )</p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">Penerima Klien</p>
                <div className="h-14" />
                <p className="border-t border-slate-300 font-bold pt-1">( Tanda Tangan & Cap )</p>
              </div>
            </div>

            {/* Tombol Aksi Modal */}
            <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setPrintShipment(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition"
              >
                🖨️ Cetak Dokumen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
