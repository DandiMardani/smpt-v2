"use client";

import { useMemo, useState } from "react";
import { recordDirectSewingResultAction } from "./actions";

type Project = {
  id: number;
  project_code: string;
  name: string;
};

type Product = {
  id: number;
  project_id: number;
  product_code: string;
  name: string;
  unit: string;
};

type Worker = {
  id: number;
  name: string;
  worker_code: string;
  pay_system: string;
};

type WorkItem = {
  id: number;
  project_id: number;
  product_id: number | null;
  name: string;
  operator_price: number;
  proposed_price?: number;
  unit: string;
};

export function ProduksiRegulerClient({
  projects,
  products,
  workers,
  workItems,
  canWrite,
}: {
  projects: Project[];
  products: Product[];
  workers: Worker[];
  workItems: WorkItem[];
  canWrite: boolean;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<number>(projects[0]?.id || 0);
  const [selectedProductId, setSelectedProductId] = useState<number>(0);
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | "">("");
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<number>(0);
  const [qty, setQty] = useState<number>(100);

  // Products filtered by selected project
  const filteredProducts = useMemo(() => {
    return products.filter((p) => p.project_id === selectedProjectId);
  }, [products, selectedProjectId]);

  // Set default product when project changes
  const activeProductId = selectedProductId || filteredProducts[0]?.id || 0;

  // Work items filtered by selected project and product
  const filteredWorkItems = useMemo(() => {
    return workItems.filter(
      (w) => w.project_id === selectedProjectId && (!w.product_id || w.product_id === activeProductId)
    );
  }, [workItems, selectedProjectId, activeProductId]);

  const activeWorkItemId = selectedWorkItemId || filteredWorkItems[0]?.id || 0;
  const currentWorkItem = useMemo(() => {
    return workItems.find((w) => w.id === activeWorkItemId);
  }, [workItems, activeWorkItemId]);

  const currentWorker = useMemo(() => {
    return workers.find((w) => w.id === Number(selectedWorkerId));
  }, [workers, selectedWorkerId]);

  const isHarian = currentWorker?.pay_system?.toUpperCase() === "HARIAN";
  const operatorPrice = currentWorkItem?.operator_price || 0;
  const proposedPrice = currentWorkItem?.proposed_price || operatorPrice;

  // Upah riil operator: jika HARIAN maka Rp 0 di borongan (karena digaji harian). Nilai pengajuan borongan tetap tercatat penuh!
  const totalWage = isHarian ? 0 : (qty || 0) * operatorPrice;
  const totalProposed = (qty || 0) * proposedPrice;

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6">
      {/* Banner Edukasi Jalur Cepat Reguler */}
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/90 to-blue-50/90 p-4 sm:p-5 shadow-xs">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-lg text-white shadow-xs">
            ⚡
          </span>
          <div>
            <b className="text-sm font-bold text-indigo-950">
              Jalur Cepat Produksi Reguler (Tanpa SPV & Tanpa Checker)
            </b>
            <p className="mt-1 text-xs text-indigo-800 leading-relaxed">
              Khusus untuk pesanan biasa, tas seminar, sekolah, dan maklon umum. Sekali klik simpan:
              <b className="text-indigo-950"> Upah penjahit langsung tercatat di Payroll</b> dan
              <b className="text-indigo-950"> stok Barang Jadi langsung bertambah di Gudang PUSAT</b> siap kirim.
            </p>
          </div>
        </div>
      </div>

      {/* Formulir Setoran Jahit Cepat */}
      {canWrite ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
          <h3 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
            <span>Form Setoran Jahit Langsung</span>
            <span className="text-[11px] font-semibold text-slate-500">1 Langkah Langsung Cair & Masuk Gudang</span>
          </h3>

          <form action={recordDirectSewingResultAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Tanggal */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Pengerjaan</label>
              <input
                type="date"
                name="result_date"
                defaultValue={todayStr}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {/* Pilih Proyek */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Proyek</label>
              <select
                name="project_id"
                value={selectedProjectId}
                onChange={(e) => {
                  const pId = Number(e.target.value);
                  setSelectedProjectId(pId);
                  setSelectedProductId(0);
                  setSelectedWorkItemId(0);
                }}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-600"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_code} · {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Pilih Produk / Tas */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Produk / Tas</label>
              <select
                name="product_id"
                value={activeProductId}
                onChange={(e) => {
                  setSelectedProductId(Number(e.target.value));
                  setSelectedWorkItemId(0);
                }}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-600"
              >
                {filteredProducts.length === 0 ? (
                  <option value={0}>Belum ada produk di proyek ini</option>
                ) : (
                  filteredProducts.map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.name} ({prod.product_code})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Pilih Penjahit / Operator */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Penjahit / Operator</label>
              <select
                name="worker_id"
                required
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value ? Number(e.target.value) : "")}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-600"
              >
                <option value="" disabled>-- Pilih Penjahit --</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} · {w.worker_code} ({w.pay_system || "BORONGAN"})
                  </option>
                ))}
              </select>
            </div>

            {/* Pekerjaan Jahit / Operasi (2 Versi Ongkos) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Bagian Pekerjaan Jahit</label>
              <select
                name="work_item_id"
                value={activeWorkItemId}
                onChange={(e) => setSelectedWorkItemId(Number(e.target.value))}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 outline-none focus:border-indigo-600"
              >
                {filteredWorkItems.length === 0 ? (
                  <option value={0}>Belum ada tarif jahit untuk produk ini</option>
                ) : (
                  filteredWorkItems.map((w) => {
                    const op = Number(w.operator_price || 0);
                    const prop = Number(w.proposed_price || op);
                    return (
                      <option key={w.id} value={w.id}>
                        {w.name} — Modal: Rp {op.toLocaleString("id-ID")} · Pengajuan: Rp {prop.toLocaleString("id-ID")}/{w.unit || "pcs"}
                      </option>
                    );
                  })
                )}
              </select>
            </div>

            {/* Jumlah Selesai & Bagus (Repakan) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Jumlah Selesai Bagus / Repakan (Pcs)
              </label>
              <input
                type="number"
                name="good_qty"
                min="1"
                value={qty}
                onChange={(e) => setQty(Number(e.target.value) || 0)}
                required
                className="w-full rounded-xl border border-indigo-300 bg-indigo-50/30 px-3.5 py-2 text-sm font-mono font-black text-indigo-900 outline-none focus:border-indigo-600 focus:bg-white"
              />
            </div>

            {/* Jumlah Cacat / Reject */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Jumlah Cacat / Reject (Pcs) <span className="text-slate-400 font-normal">(opsional)</span>
              </label>
              <input
                type="number"
                name="reject_qty"
                min="0"
                defaultValue={0}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-mono font-bold text-slate-800 outline-none focus:border-indigo-600"
              />
            </div>

            {/* Catatan */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Catatan / Keterangan Tambahan <span className="text-slate-400 font-normal">(opsional)</span>
              </label>
              <input
                type="text"
                name="notes"
                placeholder="Contoh: Jahitan rapi, borongan shift 1"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs outline-none focus:border-indigo-600"
              />
            </div>

            {/* Alert Khusus Jika Pekerja Harian Mengerjakan Borongan */}
            {isHarian ? (
              <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-amber-300 bg-amber-50/90 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                <span className="text-base">💡</span>
                <div>
                  <b className="font-bold">Perlakuan Pekerja Harian Mengerjakan Borongan:</b>
                  <p className="mt-0.5 text-amber-800 leading-relaxed">
                    <b>{currentWorker?.name}</b> terdaftar dengan sistem upah <b>HARIAN</b>. Jumlah hasil repakan <b>({qty} pcs)</b> dan Nilai Pengajuan Borongan <b>(Rp {totalProposed.toLocaleString("id-ID")})</b> tetap tercatat penuh ke pembukuan produksi & pengajuan, namun upah borongan riil di slip gaji = <b>Rp 0</b> karena pekerja dibayarkan melalui gaji harian.
                  </p>
                </div>
              </div>
            ) : null}

            {/* Panel Ringkasan Nilai & Upah 2 Versi */}
            <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="grid gap-3 sm:grid-cols-3 mb-4">
                {/* Kotak 1: Upah Riil Operator */}
                <div className={`rounded-xl p-3 border ${
                  isHarian ? "bg-amber-50/60 border-amber-200" : "bg-emerald-50/60 border-emerald-200"
                }`}>
                  <span className="text-[11px] font-bold text-slate-600 block">Upah Riil Operator (Slip Gaji):</span>
                  <p className={`text-base font-black font-mono mt-0.5 ${
                    isHarian ? "text-amber-800" : "text-emerald-700"
                  }`}>
                    {isHarian ? "Rp 0 (Gaji Harian)" : `Rp ${totalWage.toLocaleString("id-ID")}`}
                  </p>
                  <span className="text-[10px] text-slate-500">
                    {isHarian ? "Masuk absensi harian" : `${qty} pcs × Rp ${operatorPrice.toLocaleString("id-ID")}`}
                  </span>
                </div>

                {/* Kotak 2: Nilai Pengajuan Borongan */}
                <div className="rounded-xl p-3 border bg-blue-50/60 border-blue-200">
                  <span className="text-[11px] font-bold text-slate-600 block">Nilai Pengajuan Borongan:</span>
                  <p className="text-base font-black text-blue-700 font-mono mt-0.5">
                    Rp {totalProposed.toLocaleString("id-ID")}
                  </p>
                  <span className="text-[10px] text-slate-500">
                    {qty} pcs × Rp {proposedPrice.toLocaleString("id-ID")} (acuan)
                  </span>
                </div>

                {/* Kotak 3: Stok Barang Jadi */}
                <div className="rounded-xl p-3 border bg-indigo-50/60 border-indigo-200">
                  <span className="text-[11px] font-bold text-slate-600 block">Stok Gudang PUSAT:</span>
                  <p className="text-base font-black text-indigo-700 font-mono mt-0.5">
                    +{qty} pcs Lolos
                  </p>
                  <span className="text-[10px] text-slate-500">
                    Langsung siap di Surat Jalan Klien
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  className="rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-3 text-xs font-extrabold text-white shadow-md shadow-indigo-500/25 hover:from-indigo-700 hover:to-blue-700 transition active:scale-95"
                >
                  ⚡ Simpan Setoran & Tambah Stok Gudang
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
          Mode hanya lihat: Anda tidak memiliki izin input hasil produksi.
        </div>
      )}
    </div>
  );
}
