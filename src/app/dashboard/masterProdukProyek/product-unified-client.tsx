"use client";

import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/master/page-utils";
import {
  addProductBomAction,
  deleteProductBomAction,
  addProductCuttingComponentAction,
  deleteProductCuttingComponentAction,
  addProductWorkItemAction,
  deleteProductWorkItemAction,
  updateProjectProduct,
  deleteProjectProduct,
} from "./actions";

type ProjectRef = {
  id: number;
  project_code: string;
  name: string;
  status: string;
};

type ProductRow = {
  id: number;
  product_code: string;
  project_id: number;
  name: string;
  target_production: number | string;
  unit: string;
  status: string;
  notes: string | null;
};

type MaterialOpt = {
  id: number;
  material_code: string;
  name: string;
  standard_unit: string;
};

type BomItem = {
  id: number;
  project_id: number;
  product_id: number | null;
  material_id: number;
  component_name: string;
  qty_per_unit?: number | string;
  quantity?: number | string;
  unit: string;
};

type CuttingComponentItem = {
  id: number;
  project_id: number;
  product_id: number | null;
  component_code: string;
  name: string;
  qty_per_product: number | string;
  unit: string;
  color: string;
};

type WorkItem = {
  id: number;
  project_id: number;
  product_id: number | null;
  item_code: string;
  name: string;
  operator_price: number;
  proposed_price: number;
  unit: string;
  qty_per_product: number;
};

export function ProductUnifiedClient({
  products,
  projects,
  materials,
  boms,
  cuttingComponents,
  workItems,
  canWrite,
}: {
  products: ProductRow[];
  projects: ProjectRef[];
  materials: MaterialOpt[];
  boms: BomItem[];
  cuttingComponents: CuttingComponentItem[];
  workItems: WorkItem[];
  canWrite: boolean;
}) {
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"BOM" | "CUTTING" | "SEWING" | "INFO">("BOM");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProjectId, setFilterProjectId] = useState<number>(0);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const materialMap = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (filterProjectId && p.project_id !== filterProjectId) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchCode = p.product_code?.toLowerCase().includes(q);
        const matchName = p.name?.toLowerCase().includes(q);
        const projName = projectMap.get(p.project_id)?.name?.toLowerCase() || "";
        if (!matchCode && !matchName && !projName.includes(q)) return false;
      }
      return true;
    });
  }, [products, filterProjectId, searchTerm, projectMap]);

  return (
    <div className="space-y-4">
      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          <input
            type="text"
            placeholder="Cari kode tas, nama produk, atau proyek..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-80 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(Number(e.target.value) || 0)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium outline-none focus:border-blue-600"
          >
            <option value={0}>-- Semua Proyek ({projects.length}) --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_code} · {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="text-xs font-bold text-slate-500">
          Menampilkan <span className="text-blue-700 font-extrabold">{filteredProducts.length}</span> Produk
        </div>
      </div>

      {/* Product List Cards */}
      <div className="space-y-3">
        {filteredProducts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center text-xs text-slate-500">
            Tidak ada produk yang cocok dengan pencarian / filter.
          </div>
        ) : null}

        {filteredProducts.map((product) => {
          const isExpanded = expandedProductId === product.id;
          const productBoms = boms.filter((b) => b.product_id === product.id);
          const productCut = cuttingComponents.filter((c) => c.product_id === product.id);
          const productSew = workItems.filter((w) => w.product_id === product.id);
          const proj = projectMap.get(product.project_id);

          return (
            <div
              key={product.id}
              className={`rounded-2xl border transition-all ${
                isExpanded
                  ? "border-blue-400 bg-white shadow-md ring-2 ring-blue-100"
                  : "border-slate-200/90 bg-white hover:border-slate-300 shadow-xs"
              }`}
            >
              {/* Product Header Row */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xl font-bold text-blue-700">
                    🎒
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-sm font-bold text-slate-900">{product.name}</b>
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-600">
                        {product.product_code}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          product.status === "AKTIF"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {product.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Proyek: <b className="text-slate-700">{proj?.name || "-"}</b> ({proj?.project_code}) · Target Produksi:{" "}
                      <b className="text-blue-700 font-mono">{formatNumber(product.target_production)} {product.unit}</b>
                    </p>
                  </div>
                </div>

                {/* Right: Badge Spec Counts and Toggle Button */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 mr-2">
                    <span className="rounded-lg bg-blue-50 px-2 py-1 text-blue-800 border border-blue-200">
                      🧵 {productBoms.length} BOM
                    </span>
                    <span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-800 border border-amber-200">
                      ✂️ {productCut.length} Potong
                    </span>
                    <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-800 border border-emerald-200">
                      🪡 {productSew.length} Jahit
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setExpandedProductId(isExpanded ? null : product.id);
                    }}
                    className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition shadow-xs ${
                      isExpanded
                        ? "bg-blue-600 text-white shadow-blue-500/20"
                        : "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    }`}
                  >
                    <span>⚡</span>
                    <span>{isExpanded ? "Tutup Spesifikasi" : "Atur BOM, Cutting & Ongkos Jahit"}</span>
                  </button>
                </div>
              </div>

              {/* Expandable Unified Specification Drawer */}
              {isExpanded ? (
                <div className="border-t border-slate-200/90 bg-slate-50/70 p-4 sm:p-6 rounded-b-2xl">
                  {/* Tab Selector */}
                  <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
                    <button
                      type="button"
                      onClick={() => setActiveTab("BOM")}
                      className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                        activeTab === "BOM"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>🧵</span>
                      <span>1. Kebutuhan Bahan (BOM)</span>
                      <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] ml-1">
                        {productBoms.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("CUTTING")}
                      className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                        activeTab === "CUTTING"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>✂️</span>
                      <span>2. Komponen Hasil Potong</span>
                      <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] ml-1">
                        {productCut.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("SEWING")}
                      className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                        activeTab === "SEWING"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>🪡</span>
                      <span>3. Ongkos Jahit & Borongan</span>
                      <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] ml-1">
                        {productSew.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("INFO")}
                      className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                        activeTab === "INFO"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>⚙️</span>
                      <span>4. Edit Info Produk</span>
                    </button>
                  </div>

                  {/* TAB 1: Kebutuhan Bahan (BOM) */}
                  {activeTab === "BOM" ? (
                    <div className="space-y-4">
                      {/* Daftar Bahan BOM */}
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                          <b className="text-xs font-bold text-slate-800">
                            Daftar Kebutuhan Bahan Baku ({productBoms.length} item)
                          </b>
                          <span className="text-[11px] text-slate-500">
                            Dipakai untuk auto-potong stok kain saat cutting
                          </span>
                        </div>

                        {productBoms.length === 0 ? (
                          <p className="text-xs text-slate-400 py-3 text-center">
                            Belum ada bahan baku yang diatur untuk produk ini. Tambahkan di bawah.
                          </p>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {productBoms.map((b) => {
                              const mat = materialMap.get(b.material_id);
                              return (
                                <div key={b.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                                  <div>
                                    <b className="text-slate-900">{b.component_name}</b>
                                    <p className="text-[11px] text-slate-500">
                                      Material: {mat?.name || "-"} ({mat?.material_code})
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                                      {formatNumber(b.qty_per_unit ?? b.quantity ?? 0)} {b.unit} / {product.unit}
                                    </span>
                                    {canWrite ? (
                                      <form action={deleteProductBomAction}>
                                        <input type="hidden" name="id" value={b.id} />
                                        <button
                                          type="submit"
                                          className="text-red-500 hover:text-red-700 font-bold text-[11px] px-2 py-1 rounded hover:bg-red-50"
                                        >
                                          Hapus
                                        </button>
                                      </form>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Form Tambah Bahan BOM */}
                      {canWrite ? (
                        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 shadow-2xs">
                          <b className="block text-xs font-bold text-blue-900 mb-2">
                            + Tambah Kebutuhan Bahan Baku (BOM)
                          </b>
                          <form action={addProductBomAction} className="grid gap-2 sm:grid-cols-4 items-end">
                            <input type="hidden" name="project_id" value={product.project_id} />
                            <input type="hidden" name="product_id" value={product.id} />

                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Pilih Material dari Master Bahan
                              </label>
                              <select
                                name="material_id"
                                required
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600"
                              >
                                <option value="">-- Pilih Material --</option>
                                {materials.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.material_code} · {m.name} ({m.standard_unit})
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Qty per 1 {product.unit}
                              </label>
                              <input
                                name="quantity"
                                type="number"
                                min="0.0001"
                                step="0.0001"
                                required
                                placeholder="Contoh: 0.35"
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold outline-none focus:border-blue-600"
                              />
                            </div>

                            <div>
                              <button
                                type="submit"
                                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition shadow-xs"
                              >
                                Simpan Bahan BOM
                              </button>
                            </div>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* TAB 2: Komponen Cutting */}
                  {activeTab === "CUTTING" ? (
                    <div className="space-y-4">
                      {/* Daftar Komponen Potong */}
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                          <b className="text-xs font-bold text-slate-800">
                            Komponen Hasil Potong ({productCut.length} komponen)
                          </b>
                          <span className="text-[11px] text-slate-500">
                            Komponen yang diinput oleh operator cutting per hari
                          </span>
                        </div>

                        {productCut.length === 0 ? (
                          <p className="text-xs text-slate-400 py-3 text-center">
                            Belum ada komponen potong untuk produk ini. Tambahkan di bawah.
                          </p>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {productCut.map((c) => (
                              <div key={c.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                                <div>
                                  <b className="text-slate-900">{c.name}</b>
                                  <span className="ml-2 font-mono text-[11px] text-slate-500">({c.component_code})</span>
                                  {c.color ? <span className="ml-1 text-slate-500">· {c.color}</span> : null}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-mono font-bold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                                    {formatNumber(c.qty_per_product)} {c.unit} / {product.unit}
                                  </span>
                                  {canWrite ? (
                                    <form action={deleteProductCuttingComponentAction}>
                                      <input type="hidden" name="id" value={c.id} />
                                      <button
                                        type="submit"
                                        className="text-red-500 hover:text-red-700 font-bold text-[11px] px-2 py-1 rounded hover:bg-red-50"
                                      >
                                        Hapus
                                      </button>
                                    </form>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Form Tambah Komponen Potong */}
                      {canWrite ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-2xs">
                          <b className="block text-xs font-bold text-amber-950 mb-2">
                            + Tambah Komponen Potong (Cutting)
                          </b>
                          <form action={addProductCuttingComponentAction} className="grid gap-2 sm:grid-cols-4 items-end">
                            <input type="hidden" name="project_id" value={product.project_id} />
                            <input type="hidden" name="product_id" value={product.id} />

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Nama Bagian Potong
                              </label>
                              <input
                                name="name"
                                required
                                placeholder="Contoh: Badan Depan"
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-amber-600"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Qty per 1 {product.unit}
                              </label>
                              <input
                                name="qty_per_product"
                                type="number"
                                min="0.0001"
                                step="0.0001"
                                required
                                defaultValue={1}
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold outline-none focus:border-amber-600"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Satuan & Warna
                              </label>
                              <div className="flex gap-1.5">
                                <input
                                  name="unit"
                                  defaultValue="Pcs"
                                  required
                                  className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs outline-none focus:border-amber-600"
                                />
                                <input
                                  name="color"
                                  placeholder="Warna"
                                  className="flex-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs outline-none focus:border-amber-600"
                                />
                              </div>
                            </div>

                            <div>
                              <button
                                type="submit"
                                className="w-full rounded-lg bg-amber-700 px-4 py-2 text-xs font-bold text-white hover:bg-amber-800 transition shadow-xs"
                              >
                                Simpan Komponen
                              </button>
                            </div>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* TAB 3: Ongkos Jahit & Borongan */}
                  {activeTab === "SEWING" ? (
                    <div className="space-y-4">
                      {/* Daftar Item Pekerjaan Jahit */}
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
                          <b className="text-xs font-bold text-slate-800">
                            Daftar Ongkos Jahit & Borongan ({productSew.length} operasi)
                          </b>
                          <span className="text-[11px] text-slate-500">
                            Tarif upah operator borongan yang masuk ke SPV / Checker
                          </span>
                        </div>

                        {productSew.length === 0 ? (
                          <p className="text-xs text-slate-400 py-3 text-center">
                            Belum ada ongkos jahit untuk produk ini. Tambahkan di bawah.
                          </p>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {productSew.map((w) => (
                              <div key={w.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                                <div>
                                  <b className="text-slate-900">{w.name}</b>
                                  <span className="ml-2 font-mono text-[11px] text-slate-500">({w.item_code})</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                                    Upah: Rp {w.operator_price.toLocaleString("id-ID")}
                                  </span>
                                  {w.proposed_price > 0 && w.proposed_price !== w.operator_price ? (
                                    <span className="font-mono text-slate-500 text-[11px]">
                                      (Pengajuan: Rp {w.proposed_price.toLocaleString("id-ID")})
                                    </span>
                                  ) : null}
                                  {canWrite ? (
                                    <form action={deleteProductWorkItemAction}>
                                      <input type="hidden" name="id" value={w.id} />
                                      <button
                                        type="submit"
                                        className="text-red-500 hover:text-red-700 font-bold text-[11px] px-2 py-1 rounded hover:bg-red-50"
                                      >
                                        Hapus
                                      </button>
                                    </form>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Form Tambah Ongkos Jahit */}
                      {canWrite ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-2xs">
                          <b className="block text-xs font-bold text-emerald-950 mb-2">
                            + Tambah Item Pekerjaan & Ongkos Jahit
                          </b>
                          <form action={addProductWorkItemAction} className="grid gap-2 sm:grid-cols-4 items-end">
                            <input type="hidden" name="project_id" value={product.project_id} />
                            <input type="hidden" name="product_id" value={product.id} />

                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Nama Pekerjaan Jahit / Operasi
                              </label>
                              <input
                                name="name"
                                required
                                placeholder="Contoh: Jahit Badan / Pasang Ritsleting"
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-600"
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                                Ongkos Operator (Rp / pcs)
                              </label>
                              <input
                                name="operator_price"
                                type="number"
                                min="0"
                                required
                                placeholder="Contoh: 2500"
                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold outline-none focus:border-emerald-600"
                              />
                            </div>

                            <div>
                              <button
                                type="submit"
                                className="w-full rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition shadow-xs"
                              >
                                Simpan Ongkos Jahit
                              </button>
                            </div>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* TAB 4: Edit Info Produk */}
                  {activeTab === "INFO" ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                      <b className="block text-xs font-bold text-slate-800 mb-3 border-b border-slate-100 pb-2">
                        Edit Data Produk #{product.product_code}
                      </b>
                      {canWrite ? (
                        <form action={updateProjectProduct} className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 items-end">
                          <input type="hidden" name="id" value={product.id} />
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Proyek
                            </label>
                            <select
                              name="project_id"
                              defaultValue={product.project_id}
                              required
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600"
                            >
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.project_code} · {p.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Nama Produk
                            </label>
                            <input
                              name="name"
                              defaultValue={product.name}
                              required
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Target Produksi
                            </label>
                            <input
                              name="target_production"
                              type="number"
                              min="0.0001"
                              step="0.0001"
                              defaultValue={String(product.target_production)}
                              required
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold outline-none focus:border-blue-600"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Satuan
                            </label>
                            <input
                              name="unit"
                              defaultValue={product.unit}
                              required
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Status
                            </label>
                            <select
                              name="status"
                              defaultValue={product.status}
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600"
                            >
                              <option value="AKTIF">AKTIF</option>
                              <option value="NONAKTIF">NONAKTIF</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Keterangan
                            </label>
                            <input
                              name="notes"
                              defaultValue={product.notes ?? ""}
                              placeholder="Opsional"
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600"
                            />
                          </div>

                          <div className="sm:col-span-2 md:col-span-3 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                            <button
                              type="submit"
                              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition shadow-xs"
                            >
                              Simpan Perubahan Info Produk
                            </button>
                            <button
                              type="submit"
                              formAction={deleteProjectProduct}
                              formNoValidate
                              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition"
                            >
                              🗑️ Hapus Produk
                            </button>
                          </div>
                        </form>
                      ) : (
                        <p className="text-xs text-slate-500">
                          Mode hanya lihat: Anda tidak memiliki akses untuk mengubah data produk.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
