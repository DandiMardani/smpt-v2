"use client";

import { useMemo, useState } from "react";
import {
  addManufacturingAction,
  cancelManufacturingAction,
  editManufacturingAction,
} from "@/lib/final/actions";

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

  // View Mode: Tab Sisa Stok vs Riwayat Transaksi
  const [activeTab, setActiveTab] = useState<"stok" | "riwayat">("stok");

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
  const [editingTx, setEditingTx] = useState<ManufacturingTransaction | null>(null);

  // Maps untuk lookup cepat
  const materialMap = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const fgMap = useMemo(() => new Map(finishedGoods.map((f) => [f.id, f])), [finishedGoods]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);

  const availableFinishedGoods = useMemo(() => {
    if (!selectedProjectId || showAllFinishedGoods) return finishedGoods;
    const pid = Number(selectedProjectId);
    const filtered = finishedGoods.filter((fg) => fg.project_id === pid);
    return filtered.length > 0 ? filtered : finishedGoods;
  }, [finishedGoods, selectedProjectId, showAllFinishedGoods]);

  const handleMaterialChange = (matId: string) => {
    setSelectedMaterialId(matId);
    if (matId) {
      const mat = materialMap.get(Number(matId));
      if (mat?.standard_unit) setUnit(mat.standard_unit);
    }
  };

  const handleFinishedGoodChange = (fgId: string) => {
    setSelectedFinishedGoodId(fgId);
    if (fgId) {
      const fg = fgMap.get(Number(fgId));
      if (fg?.unit) setUnit(fg.unit);
    }
  };

  // KPI Stats
  const stats = useMemo(() => {
    const total = transactions.length;
    const titipan = transactions.filter((t) => t.flow_type === "TITIPAN").length;
    const barangLuar = transactions.filter((t) => t.flow_type === "BARANG_LUAR").length;
    const pengiriman = transactions.filter((t) => t.flow_type === "PENGIRIMAN").length;
    return { total, titipan, barangLuar, pengiriman };
  }, [transactions]);

  // ==========================================
  // KALKULASI SISA STOK REAL-TIME DARI MUTASI
  // ==========================================
  const stockBalances = useMemo(() => {
    type StockItem = {
      key: string;
      itemKind: "BAHAN" | "BARANG_JADI";
      code: string;
      name: string;
      unit: string;
      projectId: number | null;
      projectName: string;
      vendorId: number | null;
      vendorName: string;
      totalIn: number;
      totalOut: number;
      remainingStock: number;
      txCount: number;
    };

    const map = new Map<string, StockItem>();

    transactions.forEach((tx) => {
      // Abaikan transaksi yang berstatus BATAL / NONAKTIF
      if (tx.status !== "AKTIF") return;

      const isMaterial = Boolean(tx.material_id);
      const isFg = Boolean(tx.finished_good_id);
      if (!isMaterial && !isFg) return;

      const kind: "BAHAN" | "BARANG_JADI" = isMaterial ? "BAHAN" : "BARANG_JADI";
      const itemId = isMaterial ? tx.material_id : tx.finished_good_id;
      const projId = tx.project_id || null;
      const vendId = tx.vendor_id || null;

      // Kunci unik: Jenis + Item ID + Proyek ID + Vendor ID
      const groupKey = `${kind}_${itemId}_proj:${projId || "none"}_vend:${vendId || "none"}`;

      let record = map.get(groupKey);
      if (!record) {
        let code = "-";
        let name = "-";
        let defaultUnit = tx.unit || "PCS";

        if (isMaterial) {
          const m = materialMap.get(tx.material_id!);
          code = m?.material_code || tx.material_code || "-";
          name = m?.name || tx.material_name || "Bahan Baku";
          if (m?.standard_unit) defaultUnit = m.standard_unit;
        } else {
          const f = fgMap.get(tx.finished_good_id!);
          code = f?.finished_good_code || tx.fg_code || "-";
          name = f?.name || tx.fg_name || "Barang Jadi";
          if (f?.unit) defaultUnit = f.unit;
        }

        const pName = projId ? projectMap.get(projId)?.name || "Proyek" : "Umum / Non-Proyek";
        const vName = vendId ? vendorMap.get(vendId)?.name || "Vendor" : "-";

        record = {
          key: groupKey,
          itemKind: kind,
          code,
          name,
          unit: defaultUnit,
          projectId: projId,
          projectName: pName,
          vendorId: vendId,
          vendorName: vName,
          totalIn: 0,
          totalOut: 0,
          remainingStock: 0,
          txCount: 0,
        };
        map.set(groupKey, record);
      }

      const qty = Number(tx.quantity) || 0;
      if (tx.flow_type === "TITIPAN" || tx.flow_type === "BARANG_LUAR") {
        record.totalIn += qty;
        record.remainingStock += qty;
      } else if (tx.flow_type === "PENGIRIMAN") {
        record.totalOut += qty;
        record.remainingStock -= qty;
      }
      record.txCount += 1;
    });

    // Saring sesuai filter pencarian
    const q = search.trim().toLowerCase();
    return Array.from(map.values()).filter((item) => {
      if (filterKind === "BAHAN" && item.itemKind !== "BAHAN") return false;
      if (filterKind === "BARANG_JADI" && item.itemKind !== "BARANG_JADI") return false;
      if (filterProject === "NON_PROJECT" && item.projectId !== null) return false;
      if (filterProject !== "ALL" && filterProject !== "NON_PROJECT" && item.projectId !== Number(filterProject)) return false;

      if (!q) return true;
      return (
        item.code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.vendorName.toLowerCase().includes(q) ||
        item.projectName.toLowerCase().includes(q)
      );
    });
  }, [transactions, search, filterKind, filterProject, materialMap, fgMap, projectMap, vendorMap]);

  // Transaksi untuk Tabel Riwayat
  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((item) => {
      if (filterFlow !== "ALL" && item.flow_type !== filterFlow) return false;

      const isMaterial = item.material_id !== null;
      const isFg = item.finished_good_id !== null;
      if (filterKind === "BAHAN" && !isMaterial) return false;
      if (filterKind === "BARANG_JADI" && !isFg) return false;

      if (filterProject === "NON_PROJECT" && item.project_id !== null) return false;
      if (filterProject !== "ALL" && filterProject !== "NON_PROJECT" && item.project_id !== Number(filterProject)) return false;

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
          <div className="mt-1 text-xs text-slate-500">Semua riwayat mutasi</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">Barang Titipan</div>
          <div className="mt-1 text-2xl font-bold text-amber-900">{stats.titipan}</div>
          <div className="mt-1 text-xs text-amber-600">Non-Aset (Masuk)</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Barang Luar</div>
          <div className="mt-1 text-2xl font-bold text-emerald-900">{stats.barangLuar}</div>
          <div className="mt-1 text-xs text-emerald-600">Penerimaan Rekanan</div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">Pengiriman</div>
          <div className="mt-1 text-2xl font-bold text-blue-900">{stats.pengiriman}</div>
          <div className="mt-1 text-xs text-blue-600">Total Keluar Gudang</div>
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
            <input type="hidden" name="flow_type" value={flowType} />

            <div className="grid gap-4 md:grid-cols-3">
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

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Proyek <span className="font-normal text-slate-500">(Opsional / Standalone)</span>
                </label>
                <select
                  name="project_id"
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
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
                        {showAllFinishedGoods ? "Filter per Proyek" : "Tampilkan Semua"}
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
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Vendor / Pihak Penitip / Supplier <span className="font-normal text-slate-500">(Opsional)</span>
                </label>
                <select
                  name="vendor_id"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- Pilih Vendor / Rekanan --</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.vendor_code} · {v.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

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

      {/* KONTROL TAB & FILTER GLOBAL */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Tab Switcher Fleksibel */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl max-w-md w-full">
            <button
              type="button"
              onClick={() => setActiveTab("stok")}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
                activeTab === "stok"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>📦 Rekap Sisa Stok ({stockBalances.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("riwayat")}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
                activeTab === "riwayat"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>📋 Riwayat Mutasi ({filteredTransactions.length})</span>
            </button>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Cari kode, item, vendor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-44 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
            />

            {activeTab === "riwayat" && (
              <select
                value={filterFlow}
                onChange={(e) => setFilterFlow(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="ALL">Semua Alur</option>
                <option value="TITIPAN">Titipan</option>
                <option value="BARANG_LUAR">Barang Luar</option>
                <option value="PENGIRIMAN">Pengiriman</option>
              </select>
            )}

            <select
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">Semua Jenis Item</option>
              <option value="BAHAN">Bahan Baku</option>
              <option value="BARANG_JADI">Barang Jadi</option>
            </select>

            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">Semua Proyek</option>
              <option value="NON_PROJECT">Umum / Bebas Proyek</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* TAB 1: KARTU & TABEL REKAP SISA STOK */}
        {activeTab === "stok" && (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[850px] border-collapse text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-3 py-3">Jenis</th>
                  <th className="px-3 py-3">Kode & Nama Item</th>
                  <th className="px-3 py-3">Proyek Terkait</th>
                  <th className="px-3 py-3">Pihak / Vendor Penitip</th>
                  <th className="px-3 py-3 text-right">Total Masuk</th>
                  <th className="px-3 py-3 text-right">Terkirim / Keluar</th>
                  <th className="px-3 py-3 text-right bg-emerald-50/50 text-emerald-950">Sisa Stok Fisik</th>
                  <th className="px-3 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {stockBalances.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Belum ada data barang titipan yang aktif.
                    </td>
                  </tr>
                ) : (
                  stockBalances.map((item) => {
                    const isAvailable = item.remainingStock > 0;
                    const isNegative = item.remainingStock < 0;

                    return (
                      <tr key={item.key} className="hover:bg-slate-50/80 transition">
                        <td className="px-3 py-3">
                          {item.itemKind === "BAHAN" ? (
                            <span className="inline-block rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                              Bahan Baku
                            </span>
                          ) : (
                            <span className="inline-block rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                              Barang Jadi
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-mono font-bold text-slate-900">{item.code}</div>
                          <div className="text-slate-600 font-medium">{item.name}</div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                            {item.projectName}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-700">{item.vendorName}</td>
                        <td className="px-3 py-3 text-right font-mono font-semibold text-slate-700">
                          {item.totalIn.toLocaleString("id-ID", { maximumFractionDigits: 4 })} {item.unit}
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-semibold text-blue-700">
                          {item.totalOut.toLocaleString("id-ID", { maximumFractionDigits: 4 })} {item.unit}
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-extrabold text-sm bg-emerald-50/30">
                          <span
                            className={
                              isNegative
                                ? "text-rose-600"
                                : isAvailable
                                ? "text-emerald-700"
                                : "text-slate-400"
                            }
                          >
                            {item.remainingStock.toLocaleString("id-ID", { maximumFractionDigits: 4 })} {item.unit}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {isNegative ? (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                              Minus (Cek SJ)
                            </span>
                          ) : isAvailable ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                              Tersedia
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              Habis
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: TABEL RIWAYAT TRANSAKSI LENGKAP */}
        {activeTab === "riwayat" && (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
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
                  <th className="px-3 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-8 text-center text-slate-400">
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

                    const isOut = tx.flow_type === "PENGIRIMAN";

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
                        <td className="px-3 py-2.5 text-right font-mono font-bold whitespace-nowrap">
                          <span className={isOut ? "text-blue-700" : "text-emerald-700"}>
                            {isOut ? "- " : "+ "}
                            {Number(tx.quantity).toLocaleString("id-ID", { maximumFractionDigits: 4 })} {tx.unit || ""}
                          </span>
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
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          {tx.status === "AKTIF" && canWrite ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditingTx(tx)}
                                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition"
                              >
                                ✏️ Edit
                              </button>
                              <form
                                action={cancelManufacturingAction}
                                onSubmit={(e) => {
                                  const reason = prompt(`Yakin ingin membatalkan transaksi "${tx.manufacturing_code}"?\n\nMasukkan alasan pembatalan:`);
                                  if (reason === null) {
                                    e.preventDefault();
                                    return;
                                  }
                                  const input = e.currentTarget.querySelector("input[name='reason']") as HTMLInputElement;
                                  if (input) input.value = reason;
                                }}
                              >
                                <input type="hidden" name="transaction_id" value={tx.id} />
                                <input type="hidden" name="reason" value="" />
                                <button
                                  type="submit"
                                  className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition"
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
        )}
      </div>

      {/* Modal Edit Transaksi Manufaktur */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h4 className="text-base font-bold text-slate-900">Edit Transaksi {editingTx.manufacturing_code}</h4>
            <p className="mt-1 text-xs text-slate-500">Ubah No. Dokumen / Surat Jalan atau Keterangan.</p>
            <form action={editManufacturingAction} onSubmit={() => setEditingTx(null)} className="mt-4 space-y-3">
              <input type="hidden" name="transaction_id" value={editingTx.id} />
              <div>
                <label className="block text-xs font-bold text-slate-700">No. Surat Jalan / Dokumen</label>
                <input
                  name="document_no"
                  defaultValue={editingTx.document_no || ""}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700">Keterangan Transaksi</label>
                <textarea
                  name="description"
                  defaultValue={editingTx.description || ""}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
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
