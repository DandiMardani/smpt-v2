"use client";

import { useMemo, useState } from "react";
import { addManufacturingAction } from "@/lib/final/actions";

type Project = { id: number; name: string; status?: string };
type Material = { id: number; material_code: string; name: string; standard_unit: string };
type FinishedGood = { id: number; finished_good_code: string; name: string; unit: string; project_id: number | null };
type Vendor = { id: number; vendor_code: string; name: string };
type ManufacturingTransaction = {
  id: number;
  manufacturing_code: string;
  transaction_date: string;
  flow_type: string;
  project_id: number | null;
  product_id: number | null;
  material_id: number | null;
  finished_good_id: number | null;
  vendor_id: number | null;
  quantity: number;
  unit: string | null;
  document_no: string | null;
  description: string | null;
  status: string;
  project_name?: string | null;
  material_code?: string | null;
  material_name?: string | null;
  fg_code?: string | null;
  fg_name?: string | null;
  vendor_name?: string | null;
};

type Props = {
  transactions: ManufacturingTransaction[];
  projects: Project[];
  materials: Material[];
  finishedGoods: FinishedGood[];
  vendors: Vendor[];
  canTitipan: boolean;
  canBarangLuar: boolean;
  canPengiriman: boolean;
};

export function ManufakturManager({
  transactions,
  projects,
  materials,
  finishedGoods,
  vendors,
  canTitipan,
  canBarangLuar,
  canPengiriman,
}: Props) {
  const canWrite = canTitipan || canBarangLuar || canPengiriman;

  // Form State
  const defaultFlow = canTitipan ? "TITIPAN" : canBarangLuar ? "BARANG_LUAR" : canPengiriman ? "PENGIRIMAN" : "TITIPAN";
  const [flowType, setFlowType] = useState<string>(defaultFlow);
  const [itemKind, setItemKind] = useState<"BAHAN" | "BARANG_JADI">("BAHAN");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("");
  const [selectedFinishedGoodId, setSelectedFinishedGoodId] = useState<string>("");
  const [unit, setUnit] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [showAllFinishedGoods, setShowAllFinishedGoods] = useState<boolean>(false);

  // Table Filter & Search State
  const [search, setSearch] = useState<string>("");
  const [filterFlow, setFilterFlow] = useState<string>("ALL");
  const [filterKind, setFilterKind] = useState<string>("ALL");
  const [filterProject, setFilterProject] = useState<string>("ALL");

  // Material map and Finished Good map
  const materialMap = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const fgMap = useMemo(() => new Map(finishedGoods.map((f) => [f.id, f])), [finishedGoods]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);

  // Scoped finished goods based on selected project
  const availableFinishedGoods = useMemo(() => {
    if (!selectedProjectId || showAllFinishedGoods) {
      return finishedGoods;
    }
    const pid = Number(selectedProjectId);
    const filtered = finishedGoods.filter((fg) => fg.project_id === pid);
    // If no finished goods specifically linked to this project, show all so user is never stuck
    return filtered.length > 0 ? filtered : finishedGoods;
  }, [finishedGoods, selectedProjectId, showAllFinishedGoods]);

  // Auto-set unit when material selected
  const handleMaterialChange = (matId: string) => {
    setSelectedMaterialId(matId);
    if (matId) {
      const mat = materialMap.get(Number(matId));
      if (mat?.standard_unit) setUnit(mat.standard_unit);
    }
  };

  // Auto-set unit when finished good selected
  const handleFinishedGoodChange = (fgId: string) => {
    setSelectedFinishedGoodId(fgId);
    if (fgId) {
      const fg = fgMap.get(Number(fgId));
      if (fg?.unit) setUnit(fg.unit);
    }
  };

  // KPI stats
  const stats = useMemo(() => {
    const total = transactions.length;
    const titipan = transactions.filter((t) => t.flow_type === "TITIPAN").length;
    const barangLuar = transactions.filter((t) => t.flow_type === "BARANG_LUAR").length;
    const pengiriman = transactions.filter((t) => t.flow_type === "PENGIRIMAN").length;
    return { total, titipan, barangLuar, pengiriman };
  }, [transactions]);

  // Filtered transactions for the table
  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((item) => {
      // Flow filter
      if (filterFlow !== "ALL" && item.flow_type !== filterFlow) return false;

      // Item Kind filter
      const isMaterial = item.material_id !== null;
      const isFg = item.finished_good_id !== null;
      if (filterKind === "BAHAN" && !isMaterial) return false;
      if (filterKind === "BARANG_JADI" && !isFg) return false;

      // Project filter
      if (filterProject === "NON_PROJECT" && item.project_id !== null) return false;
      if (filterProject !== "ALL" && filterProject !== "NON_PROJECT" && item.project_id !== Number(filterProject)) return false;

      // Text search
      if (!q) return true;
      const code = (item.manufacturing_code || "").toLowerCase();
      const doc = (item.document_no || "").toLowerCase();
      const desc = (item.description || "").toLowerCase();
      const pName = (item.project_name || projectMap.get(item.project_id || 0)?.name || "").toLowerCase();
      const matName = (item.material_name || materialMap.get(item.material_id || 0)?.name || "").toLowerCase();
      const fgName = (item.fg_name || fgMap.get(item.finished_good_id || 0)?.name || "").toLowerCase();
      const vName = (item.vendor_name || vendorMap.get(item.vendor_id || 0)?.name || "").toLowerCase();

      return (
        code.includes(q) ||
        doc.includes(q) ||
        desc.includes(q) ||
        pName.includes(q) ||
        matName.includes(q) ||
        fgName.includes(q) ||
        vName.includes(q)
      );
    });
  }, [transactions, search, filterFlow, filterKind, filterProject, projectMap, materialMap, fgMap, vendorMap]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Transaksi</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{stats.total}</div>
          <div className="mt-1 text-xs text-slate-500">Semua riwayat manufaktur</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">Barang Titipan</div>
          <div className="mt-1 text-2xl font-bold text-amber-900">{stats.titipan}</div>
          <div className="mt-1 text-xs text-amber-600">Non-Aset (Bahan & Barang Jadi)</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Barang Luar</div>
          <div className="mt-1 text-2xl font-bold text-emerald-900">{stats.barangLuar}</div>
          <div className="mt-1 text-xs text-emerald-600">Penerimaan masuk gudang</div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">Pengiriman</div>
          <div className="mt-1 text-2xl font-bold text-blue-900">{stats.pengiriman}</div>
          <div className="mt-1 text-xs text-blue-600">Ekspedisi / Pengeluaran</div>
        </div>
      </div>

      {/* Info notice matching V1 */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-900 shadow-xs">
        <div className="font-semibold text-blue-950">💡 Panduan Fleksibilitas Manufaktur & Titipan (Paritas V1)</div>
        <div className="mt-1 text-blue-800 leading-relaxed">
          • <strong>TITIPAN:</strong> Dapat berupa <strong>Bahan Baku</strong> maupun <strong>Barang Jadi</strong> dari pelanggan / pihak ketiga. Tercatat terpisah sebagai non-aset (tidak membebani neraca modal perusahaan). Dapat terikat proyek spesifik atau bebas proyek (Umum).
          <br />
          • <strong>BARANG LUAR:</strong> Penerimaan barang jadi dari supplier/vendor atau hasil produksi rekanan luar. Jika dipilih Barang Jadi, sistem otomatis menambah saldo inventaris Gudang Pusat.
          <br />
          • <strong>FLEKSIBILITAS PROYEK:</strong> Transaksi dapat diisi tanpa proyek (Stok Bebas / Titipan Umum) atau ditautkan langsung ke proyek aktif.
        </div>
      </div>

      {/* Form Input Transaksi */}
      {canWrite && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Catat Transaksi Manufaktur & Titipan</h3>
              <p className="text-xs text-slate-500">Mendukung Bahan Baku maupun Barang Jadi, fleksibel dengan atau tanpa proyek.</p>
            </div>
            {/* Quick Flow Picker */}
            <div className="flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
              {canTitipan && (
                <button
                  type="button"
                  onClick={() => setFlowType("TITIPAN")}
                  className={`rounded-md px-3 py-1.5 transition ${
                    flowType === "TITIPAN" ? "bg-amber-500 font-bold text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  TITIPAN
                </button>
              )}
              {canBarangLuar && (
                <button
                  type="button"
                  onClick={() => {
                    setFlowType("BARANG_LUAR");
                    setItemKind("BARANG_JADI");
                  }}
                  className={`rounded-md px-3 py-1.5 transition ${
                    flowType === "BARANG_LUAR" ? "bg-emerald-600 font-bold text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  BARANG LUAR
                </button>
              )}
              {canPengiriman && (
                <button
                  type="button"
                  onClick={() => setFlowType("PENGIRIMAN")}
                  className={`rounded-md px-3 py-1.5 transition ${
                    flowType === "PENGIRIMAN" ? "bg-blue-600 font-bold text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  PENGIRIMAN
                </button>
              )}
            </div>
          </div>

          <form action={addManufacturingAction} className="mt-4 space-y-4">
            {/* Hidden Flow Field */}
            <input type="hidden" name="flow_type" value={flowType} />

            <div className="grid gap-4 md:grid-cols-3">
              {/* Tanggal */}
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Tanggal Transaksi <span className="text-rose-500">*</span>
                </label>
                <input
                  name="transaction_date"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Jenis Item (Bahan vs Barang Jadi) */}
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Jenis Item <span className="text-rose-500">*</span>
                </label>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setItemKind("BAHAN");
                      setSelectedFinishedGoodId("");
                    }}
                    className={`flex-1 rounded-lg border py-2 text-xs font-bold transition ${
                      itemKind === "BAHAN"
                        ? "border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-400/40"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    📦 Bahan Baku
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setItemKind("BARANG_JADI");
                      setSelectedMaterialId("");
                    }}
                    className={`flex-1 rounded-lg border py-2 text-xs font-bold transition ${
                      itemKind === "BARANG_JADI"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-400/40"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    🎒 Barang Jadi
                  </button>
                </div>
              </div>

              {/* Proyek (Fleksibel: Opsional) */}
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Proyek <span className="font-normal text-slate-500">(Opsional / Standalone)</span>
                </label>
                <select
                  name="project_id"
                  value={selectedProjectId}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Umum / Tanpa Proyek (Stok Bebas)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Pilihan Item Dinamis */}
            <div className="grid gap-4 md:grid-cols-2">
              {itemKind === "BAHAN" ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    Pilih Bahan Baku <span className="text-rose-500">*</span>
                  </label>
                  <select
                    name="material_id"
                    value={selectedMaterialId}
                    onChange={(e) => handleMaterialChange(e.target.value)}
                    required={itemKind === "BAHAN"}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">-- Pilih Master Bahan --</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.material_code} · {m.name} ({m.standard_unit})
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-slate-500">Bahan baku titipan atau bahan proses eksternal.</span>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700">
                      Pilih Barang Jadi <span className="text-rose-500">*</span>
                    </label>
                    {selectedProjectId && (
                      <button
                        type="button"
                        onClick={() => setShowAllFinishedGoods((prev) => !prev)}
                        className="text-xs text-blue-600 underline hover:text-blue-800"
                      >
                        {showAllFinishedGoods ? "Filter per Proyek" : "Tampilkan Semua Barang Jadi"}
                      </button>
                    )}
                  </div>
                  <select
                    name="finished_good_id"
                    value={selectedFinishedGoodId}
                    onChange={(e) => handleFinishedGoodChange(e.target.value)}
                    required={itemKind === "BARANG_JADI"}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">-- Pilih Master Barang Jadi --</option>
                    {availableFinishedGoods.map((fg) => {
                      const projName = fg.project_id ? projectMap.get(fg.project_id)?.name : "Umum";
                      return (
                        <option key={fg.id} value={fg.id}>
                          {fg.finished_good_code} · {fg.name} ({fg.unit}) — [{projName}]
                        </option>
                      );
                    })}
                  </select>
                  <span className="mt-1 block text-xs text-slate-500">
                    Barang jadi yang dititipkan atau diterima dari pihak luar.
                  </span>
                </div>
              )}

              {/* Vendor / Rekanan / Pihak Penitip */}
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Vendor / Pihak Penitip / Supplier <span className="font-normal text-slate-500">(Opsional)</span>
                </label>
                <select
                  name="vendor_id"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- Pilih Vendor / Rekanan (Atau tulis di keterangan) --</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.vendor_code} · {v.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-slate-500">Pihak penitip barang atau supplier pengirim.</span>
              </div>
            </div>

            {/* Qty, Satuan, Dokumen, Keterangan */}
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Qty <span className="text-rose-500">*</span>
                </label>
                <input
                  name="quantity"
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0.00"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">Satuan</label>
                <input
                  name="unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="PCS / MTR / ROLL"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">No. Dokumen / Surat Jalan</label>
                <input
                  name="document_no"
                  placeholder="Contoh: SJ-2026/09/01"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Keterangan / Catatan <span className="text-rose-500">*</span>
                </label>
                <input
                  name="description"
                  required
                  placeholder="Deskripsi transaksi / pihak penitip"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-slate-800"
              >
                Simpan Transaksi {flowType}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Riwayat Transaksi Manufaktur */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Riwayat Transaksi Manufaktur & Titipan</h3>
            <p className="text-xs text-slate-500">Daftar mutasi produksi internal, bahan/barang jadi titipan, dan penerimaan luar.</p>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Cari kode, item, no dok..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
            />

            <select
              value={filterFlow}
              onChange={(e) => setFilterFlow(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">Semua Alur</option>
              <option value="TITIPAN">Titipan</option>
              <option value="BARANG_LUAR">Barang Luar</option>
              <option value="PENGIRIMAN">Pengiriman</option>
            </select>

            <select
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">Semua Item</option>
              <option value="BAHAN">Bahan Baku</option>
              <option value="BARANG_JADI">Barang Jadi</option>
            </select>

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
          </div>
        </div>

        {/* Table */}
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[900px] border-collapse text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-3 py-3">Kode</th>
                <th className="px-3 py-3">Tanggal</th>
                <th className="px-3 py-3">Flow</th>
                <th className="px-3 py-3">Jenis Item</th>
                <th className="px-3 py-3">Nama Item</th>
                <th className="px-3 py-3">Proyek</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3">Pihak / Vendor</th>
                <th className="px-3 py-3">Dokumen</th>
                <th className="px-3 py-3">Keterangan</th>
                <th className="px-3 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-400">
                    Belum ada data transaksi yang cocok dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const mat = tx.material_id ? materialMap.get(tx.material_id) : null;
                  const fg = tx.finished_good_id ? fgMap.get(tx.finished_good_id) : null;
                  const proj = tx.project_id ? projectMap.get(tx.project_id) : null;
                  const vend = tx.vendor_id ? vendorMap.get(tx.vendor_id) : null;

                  const isMaterial = Boolean(tx.material_id);
                  const isFg = Boolean(tx.finished_good_id);

                  const itemName = isMaterial
                    ? `${mat?.material_code || ""} · ${mat?.name || tx.material_name || "Bahan Baku"}`
                    : isFg
                    ? `${fg?.finished_good_code || ""} · ${fg?.name || tx.fg_name || "Barang Jadi"}`
                    : tx.description || "-";

                  const flowColor =
                    tx.flow_type === "TITIPAN"
                      ? "bg-amber-100 text-amber-800 border-amber-300"
                      : tx.flow_type === "BARANG_LUAR"
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                      : "bg-blue-100 text-blue-800 border-blue-300";

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-3 py-2.5 font-mono font-bold text-slate-900">{tx.manufacturing_code}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{tx.transaction_date}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold ${flowColor}`}>
                          {tx.flow_type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {isMaterial ? (
                          <span className="inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                            Bahan Baku
                          </span>
                        ) : isFg ? (
                          <span className="inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                            Barang Jadi
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-900">{itemName}</td>
                      <td className="px-3 py-2.5">
                        {proj ? (
                          <span className="font-semibold text-slate-800">{proj.name}</span>
                        ) : (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            Umum / Non-Proyek
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        {Number(tx.quantity).toLocaleString("id-ID", { maximumFractionDigits: 4 })} {tx.unit || ""}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{vend ? vend.name : "-"}</td>
                      <td className="px-3 py-2.5 text-slate-600 font-mono text-[11px]">{tx.document_no || "-"}</td>
                      <td className="px-3 py-2.5 text-slate-600 max-w-xs truncate" title={tx.description || ""}>
                        {tx.description || "-"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            tx.status === "AKTIF" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
