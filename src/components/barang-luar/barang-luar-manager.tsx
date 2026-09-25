"use client";

import { useMemo, useState } from "react";
import { receiveExternalAction, cancelExternalReceiptAction, editExternalReceiptAction } from "@/lib/final/actions";

type Project = { id: number; name: string };
type FinishedGood = {
  id: number;
  finished_good_code: string;
  name: string;
  unit: string;
  project_id: number | null;
};
type Vendor = { id: number; vendor_code: string; name: string };
type Location = { id: number; name: string };
type ExternalReceipt = {
  id: number;
  receipt_code: string;
  receipt_date: string;
  finished_good_id: number;
  vendor_id: number | null;
  location_id: number;
  quantity: number;
  document_no: string | null;
  notes: string | null;
  status: string;
  fg_code?: string;
  fg_name?: string;
  fg_unit?: string;
  project_name?: string | null;
  vendor_name?: string | null;
  location_name?: string | null;
};

type Props = {
  receipts: ExternalReceipt[];
  projects: Project[];
  finishedGoods: FinishedGood[];
  vendors: Vendor[];
  locations: Location[];
  canReceive: boolean;
};

export function BarangLuarManager({
  receipts,
  projects,
  finishedGoods,
  vendors,
  locations,
  canReceive,
}: Props) {
  // Form State
  const [receiveMode, setReceiveMode] = useState<"VENDOR" | "LANGSUNG">("VENDOR");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedFgId, setSelectedFgId] = useState<string>("");
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    locations.find((l) => l.name.toUpperCase() === "PUSAT")?.id?.toString() || locations[0]?.id?.toString() || "",
  );
  const [quantity, setQuantity] = useState<string>("");
  const [showAllFinishedGoods, setShowAllFinishedGoods] = useState<boolean>(false);

  // Table Filter & Search
  const [search, setSearch] = useState<string>("");
  const [filterProject, setFilterProject] = useState<string>("ALL");
  const [filterLocation, setFilterLocation] = useState<string>("ALL");
  const [editingReceipt, setEditingReceipt] = useState<ExternalReceipt | null>(null);

  // Maps
  const fgMap = useMemo(() => new Map(finishedGoods.map((f) => [f.id, f])), [finishedGoods]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
  const locationMap = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  // Scoped finished goods
  const availableFinishedGoods = useMemo(() => {
    if (!selectedProjectId || showAllFinishedGoods) {
      return finishedGoods;
    }
    const pid = Number(selectedProjectId);
    const filtered = finishedGoods.filter((fg) => fg.project_id === pid);
    return filtered.length > 0 ? filtered : finishedGoods;
  }, [finishedGoods, selectedProjectId, showAllFinishedGoods]);

  // Selected FG info
  const currentFg = useMemo(() => {
    if (!selectedFgId) return null;
    return fgMap.get(Number(selectedFgId));
  }, [selectedFgId, fgMap]);

  // KPI Stats
  const stats = useMemo(() => {
    const totalTransactions = receipts.length;
    const totalQty = receipts.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
    const activeVendors = new Set(receipts.filter((r) => r.vendor_id).map((r) => r.vendor_id)).size;
    const locationsUsed = new Set(receipts.map((r) => r.location_id)).size;
    return { totalTransactions, totalQty, activeVendors, locationsUsed };
  }, [receipts]);

  // Filtered receipts
  const filteredReceipts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter((item) => {
      const fg = fgMap.get(item.finished_good_id);

      // Project filter
      if (filterProject === "NON_PROJECT" && fg?.project_id !== null) return false;
      if (filterProject !== "ALL" && filterProject !== "NON_PROJECT" && fg?.project_id !== Number(filterProject)) return false;

      // Location filter
      if (filterLocation !== "ALL" && item.location_id !== Number(filterLocation)) return false;

      // Text search
      if (!q) return true;
      const code = (item.receipt_code || "").toLowerCase();
      const doc = (item.document_no || "").toLowerCase();
      const notes = (item.notes || "").toLowerCase();
      const fgName = (fg?.name || item.fg_name || "").toLowerCase();
      const fgCode = (fg?.finished_good_code || item.fg_code || "").toLowerCase();
      const vName = (vendorMap.get(item.vendor_id || 0)?.name || item.vendor_name || "").toLowerCase();
      const locName = (locationMap.get(item.location_id)?.name || item.location_name || "").toLowerCase();

      return (
        code.includes(q) ||
        doc.includes(q) ||
        notes.includes(q) ||
        fgName.includes(q) ||
        fgCode.includes(q) ||
        vName.includes(q) ||
        locName.includes(q)
      );
    });
  }, [receipts, search, filterProject, filterLocation, fgMap, vendorMap, locationMap]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Penerimaan Barang</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{stats.totalTransactions}</div>
          <div className="mt-1 text-xs text-slate-500">Total batch masuk</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Total Qty Diterima</div>
          <div className="mt-1 text-2xl font-bold text-emerald-900">
            {stats.totalQty.toLocaleString("id-ID", { maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-xs text-emerald-600">Unit barang jadi bertambah</div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">Supplier / Rekanan</div>
          <div className="mt-1 text-2xl font-bold text-blue-900">{stats.activeVendors}</div>
          <div className="mt-1 text-xs text-blue-600">Vendor pemasok aktif</div>
        </div>
        <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-violet-700">Gudang Penyimpanan</div>
          <div className="mt-1 text-2xl font-bold text-violet-900">{stats.locationsUsed}</div>
          <div className="mt-1 text-xs text-violet-600">Titik lokasi penerimaan</div>
        </div>
      </div>

      {/* Info notice matching V1 */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-900 shadow-xs">
        <div className="font-semibold text-emerald-950">📦 Logistik Barang Luar — Otomatis Menambah Stok Gudang</div>
        <div className="mt-1 text-emerald-800 leading-relaxed">
          Penerimaan barang luar langsung mencatatkan event logistik ke saldo inventaris Barang Jadi pada lokasi gudang yang dipilih.
          Mendukung penerimaan dari <strong>Supplier Resmi</strong> maupun <strong>Penerimaan Langsung (tanpa vendor)</strong>, serta dapat terikat pada proyek tertentu atau sebagai stok bebas umum perusahaan.
        </div>
      </div>

      {/* Form Input Penerimaan */}
      {canReceive && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Catat Penerimaan Barang Luar</h3>
              <p className="text-xs text-slate-500">
                Penerimaan barang jadi dari rekanan / supplier ke stok fisik gudang.
              </p>
            </div>
            {/* Mode Penerimaan */}
            <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => setReceiveMode("VENDOR")}
                className={`rounded-md px-3 py-1.5 transition ${
                  receiveMode === "VENDOR"
                    ? "bg-emerald-600 font-bold text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Dari Supplier / Vendor
              </button>
              <button
                type="button"
                onClick={() => setReceiveMode("LANGSUNG")}
                className={`rounded-md px-3 py-1.5 transition ${
                  receiveMode === "LANGSUNG"
                    ? "bg-slate-800 font-bold text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Penerimaan Langsung (Tanpa Vendor)
              </button>
            </div>
          </div>

          <form action={receiveExternalAction} className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {/* Tanggal */}
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Tanggal Terima <span className="text-rose-500">*</span>
                </label>
                <input
                  name="receipt_date"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Proyek Filter (Fleksibel) */}
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Lingkup Proyek <span className="font-normal text-slate-500">(Opsional)</span>
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Semua Proyek / Stok Bebas</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-slate-500">Membantu menyaring pilihan barang jadi.</span>
              </div>

              {/* Lokasi Gudang */}
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Gudang Tujuan <span className="text-rose-500">*</span>
                </label>
                <select
                  name="location_id"
                  value={selectedLocationId}
                  onChange={(e) => setSelectedLocationId(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Barang Jadi */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    Barang Jadi <span className="text-rose-500">*</span>
                  </label>
                  {selectedProjectId && (
                    <button
                      type="button"
                      onClick={() => setShowAllFinishedGoods((prev) => !prev)}
                      className="text-xs text-blue-600 underline hover:text-blue-800"
                    >
                      {showAllFinishedGoods ? "Saring sesuai Proyek" : "Tampilkan Semua Barang"}
                    </button>
                  )}
                </div>
                <select
                  name="finished_good_id"
                  value={selectedFgId}
                  onChange={(e) => setSelectedFgId(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- Pilih Barang Jadi --</option>
                  {availableFinishedGoods.map((fg) => {
                    const projName = fg.project_id ? projectMap.get(fg.project_id)?.name : "Umum";
                    return (
                      <option key={fg.id} value={fg.id}>
                        {fg.finished_good_code} · {fg.name} ({fg.unit}) — [{projName}]
                      </option>
                    );
                  })}
                </select>
                {currentFg && (
                  <span className="mt-1 block text-xs font-semibold text-emerald-700">
                    Satuan standar: {currentFg.unit} | Proyek: {currentFg.project_id ? projectMap.get(currentFg.project_id)?.name : "Umum"}
                  </span>
                )}
              </div>

              {/* Vendor / Rekanan (Opsional pada mode Langsung) */}
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Vendor / Supplier {receiveMode === "VENDOR" ? <span className="text-rose-500">*</span> : <span className="font-normal text-slate-500">(Opsional / Tanpa Vendor)</span>}
                </label>
                <select
                  name="vendor_id"
                  required={receiveMode === "VENDOR"}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">{receiveMode === "VENDOR" ? "-- Pilih Vendor / Supplier --" : "- Tanpa Vendor (Penerimaan Langsung) -"}</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.vendor_code} · {v.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-slate-500">
                  {receiveMode === "VENDOR" ? "Pemasok / pihak pembuat barang." : "Kosongkan jika penerimaan langsung / administrasi menyusul."}
                </span>
              </div>
            </div>

            {/* Qty, No Dokumen, Catatan */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Qty Diterima <span className="text-rose-500">*</span>
                </label>
                <div className="relative mt-1">
                  <input
                    name="quantity"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-14 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">
                    {currentFg?.unit || "UNIT"}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">No. Surat Jalan / Dokumen</label>
                <input
                  name="document_no"
                  placeholder="Contoh: SJ-EXT-2026/09/01"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Catatan Penerimaan</label>
                <input
                  name="notes"
                  placeholder="Contoh: Barang datang via ekspedisi, kondisi rapi"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-emerald-700"
              >
                ✓ Terima Barang Luar & Tambah Stok
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Riwayat Penerimaan */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Riwayat Penerimaan Barang Luar</h3>
            <p className="text-xs text-slate-500">Mutasi fisik barang masuk ke inventaris barang jadi.</p>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Cari kode, barang, vendor, SJ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
            />

            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">Semua Proyek</option>
              <option value="NON_PROJECT">Umum / Tanpa Proyek</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">Semua Gudang</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[850px] border-collapse text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-3 py-3">Kode Penerimaan</th>
                <th className="px-3 py-3">Tanggal</th>
                <th className="px-3 py-3">Barang Jadi</th>
                <th className="px-3 py-3">Proyek</th>
                <th className="px-3 py-3">Vendor / Sumber</th>
                <th className="px-3 py-3">Lokasi Gudang</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3">Surat Jalan</th>
                <th className="px-3 py-3">Catatan</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredReceipts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400">
                    Belum ada riwayat penerimaan barang luar yang sesuai filter.
                  </td>
                </tr>
              ) : (
                filteredReceipts.map((rc) => {
                  const fg = fgMap.get(rc.finished_good_id);
                  const proj = fg?.project_id ? projectMap.get(fg.project_id) : null;
                  const vend = rc.vendor_id ? vendorMap.get(rc.vendor_id) : null;
                  const loc = locationMap.get(rc.location_id);

                  return (
                    <tr key={rc.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-3 py-2.5 font-mono font-bold text-slate-900">{rc.receipt_code}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{rc.receipt_date}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-900">
                        {fg ? `${fg.finished_good_code} · ${fg.name}` : rc.fg_name || `#${rc.finished_good_id}`}
                      </td>
                      <td className="px-3 py-2.5">
                        {proj ? (
                          <span className="font-semibold text-slate-800">{proj.name}</span>
                        ) : (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            Umum / Bebas
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {vend ? (
                          <span className="text-slate-800 font-medium">{vend.name}</span>
                        ) : (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                            Langsung / Tanpa Vendor
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                          {loc?.name || rc.location_name || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-800 whitespace-nowrap">
                        +{Number(rc.quantity).toLocaleString("id-ID", { maximumFractionDigits: 4 })} {fg?.unit || rc.fg_unit || "PCS"}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600">{rc.document_no || "-"}</td>
                      <td className="px-3 py-2.5 text-slate-600 max-w-xs truncate" title={rc.notes || ""}>
                        {rc.notes || "-"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            rc.status === "AKTIF" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {rc.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        {rc.status === "AKTIF" && canReceive ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingReceipt(rc)}
                              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition"
                              title="Edit Catatan / No Dokumen"
                            >
                              ✏️ Edit
                            </button>
                            <form
                              action={cancelExternalReceiptAction}
                              onSubmit={(e) => {
                                const reason = prompt(`Yakin ingin membatalkan penerimaan "${rc.receipt_code}"?\nStok ${rc.quantity} akan dikembalikan (reversal).\n\nMasukkan alasan pembatalan:`);
                                if (reason === null) {
                                  e.preventDefault();
                                  return;
                                }
                                const input = e.currentTarget.querySelector("input[name='reason']") as HTMLInputElement;
                                if (input) input.value = reason;
                              }}
                            >
                              <input type="hidden" name="receipt_id" value={rc.id} />
                              <input type="hidden" name="reason" value="" />
                              <button
                                type="submit"
                                className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition"
                                title="Batalkan penerimaan & kembalikan stok"
                              >
                                ✕ Batal
                              </button>
                            </form>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-mono">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Edit Penerimaan */}
      {editingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h4 className="text-base font-bold text-slate-900">Edit Penerimaan {editingReceipt.receipt_code}</h4>
            <p className="mt-1 text-xs text-slate-500">Ubah No. Surat Jalan / Dokumen atau Catatan.</p>
            <form action={editExternalReceiptAction} onSubmit={() => setEditingReceipt(null)} className="mt-4 space-y-3">
              <input type="hidden" name="receipt_id" value={editingReceipt.id} />
              <div>
                <label className="block text-xs font-bold text-slate-700">No. Surat Jalan / Dokumen</label>
                <input
                  name="document_no"
                  defaultValue={editingReceipt.document_no || ""}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700">Catatan Penerimaan</label>
                <textarea
                  name="notes"
                  defaultValue={editingReceipt.notes || ""}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingReceipt(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

