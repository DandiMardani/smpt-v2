"use client";

import { useState, useMemo, useEffect } from "react";
import {
  processBundlePackagePackingAction,
  savePackageRecipeAction,
  createBundlePackageAction,
  updateBundlePackageAction,
  deleteBundlePackageAction,
} from "@/lib/final/actions";

type ComponentItem = {
  id: number;
  code: string;
  name: string;
  stock: number;
};

type PackageItem = {
  id: number;
  code: string;
  name: string;
  description?: string;
};

type RecipeItem = {
  package_id: number;
  finished_good_id: number;
  qty_per_bundle: number;
};

type Props = {
  packages: PackageItem[];
  allRecipes: RecipeItem[];
  availableComponents: ComponentItem[];
};

export function BundlingIsianForm({
  packages,
  allRecipes,
  availableComponents,
}: Props) {
  const [activeTab, setActiveTab] = useState<"HARIAN" | "RESEP">("HARIAN");

  // ================= STATE TAB 1: INPUT HARIAN =================
  const [selectedPkgId, setSelectedPkgId] = useState<number>(packages[0]?.id || 0);
  const [dailyQty, setDailyQty] = useState<number | "">("");
  const [notes, setNotes] = useState<string>("");
  const [packingDate, setPackingDate] = useState<string>(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
  );

  const [activePackingItems, setActivePackingItems] = useState<
    Array<{ id: number; code: string; name: string; stock: number; qtyPerBundle: number }>
  >([]);

  useEffect(() => {
    const pkgRecipes = allRecipes.filter((r) => r.package_id === selectedPkgId);
    const mapped = pkgRecipes
      .map((r) => {
        const comp = availableComponents.find((c) => c.id === r.finished_good_id);
        if (!comp) return null;
        return {
          id: comp.id,
          code: comp.code,
          name: comp.name,
          stock: comp.stock,
          qtyPerBundle: Number(r.qty_per_bundle) || 1,
        };
      })
      .filter(Boolean) as Array<{ id: number; code: string; name: string; stock: number; qtyPerBundle: number }>;

    setActivePackingItems(mapped);
  }, [selectedPkgId, allRecipes, availableComponents]);

  const [addExtraId, setAddExtraId] = useState<number | "">("");

  const unselectedDailyComponents = useMemo(() => {
    return availableComponents.filter((ac) => !activePackingItems.some((c) => c.id === ac.id));
  }, [availableComponents, activePackingItems]);

  const handleRemoveDailyItem = (id: number) => {
    setActivePackingItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleAddExtraDailyItem = () => {
    if (!addExtraId) return;
    const target = availableComponents.find((c) => c.id === Number(addExtraId));
    if (!target) return;
    setActivePackingItems((prev) => [
      ...prev,
      {
        id: target.id,
        code: target.code,
        name: target.name,
        stock: target.stock,
        qtyPerBundle: 1,
      },
    ]);
    setAddExtraId("");
  };

  const numericDailyQty = Number(dailyQty) || 0;

  const stockCheck = useMemo(() => {
    let allSufficient = true;
    const items = activePackingItems.map((c) => {
      const needed = c.qtyPerBundle * numericDailyQty;
      const isOk = c.stock >= needed;
      if (!isOk) allSufficient = false;
      return {
        ...c,
        needed,
        isOk,
        shortage: Math.max(0, needed - c.stock),
      };
    });
    return { allSufficient, items };
  }, [activePackingItems, numericDailyQty]);

  const dailyComponentsJson = useMemo(() => {
    return JSON.stringify(
      activePackingItems.map((c) => ({
        finished_good_id: c.id,
        qty_per_bundle: c.qtyPerBundle,
      }))
    );
  }, [activePackingItems]);

  // ================= STATE TAB 2: ATUR RESEP & EDIT NAMA PAKET =================
  const [recipePkgId, setRecipePkgId] = useState<number>(packages[0]?.id || 0);
  const [showEditPackageModal, setShowEditPackageModal] = useState<boolean>(false);

  // Cari paket yang sedang dipilih
  const currentPackage = useMemo(() => {
    return packages.find((p) => p.id === recipePkgId) || packages[0];
  }, [packages, recipePkgId]);

  const [editCode, setEditCode] = useState<string>("");
  const [editName, setEditName] = useState<string>("");
  const [editDesc, setEditDesc] = useState<string>("");

  useEffect(() => {
    if (currentPackage) {
      setEditCode(currentPackage.code || "");
      setEditName(currentPackage.name || "");
      setEditDesc(currentPackage.description || "");
    }
  }, [currentPackage]);

  const [editingRecipeList, setEditingRecipeList] = useState<
    Array<{ id: number; code: string; name: string; qtyPerBundle: number }>
  >([]);

  useEffect(() => {
    const current = allRecipes.filter((r) => r.package_id === recipePkgId);
    const mapped = current
      .map((r) => {
        const comp = availableComponents.find((c) => c.id === r.finished_good_id);
        if (!comp) return null;
        return {
          id: comp.id,
          code: comp.code,
          name: comp.name,
          qtyPerBundle: Number(r.qty_per_bundle) || 1,
        };
      })
      .filter(Boolean) as Array<{ id: number; code: string; name: string; qtyPerBundle: number }>;

    setEditingRecipeList(mapped);
  }, [recipePkgId, allRecipes, availableComponents]);

  const [addRecipeCompId, setAddRecipeCompId] = useState<number | "">("");

  const unselectedRecipeComponents = useMemo(() => {
    return availableComponents.filter((ac) => !editingRecipeList.some((c) => c.id === ac.id));
  }, [availableComponents, editingRecipeList]);

  const handleAddRecipeItem = () => {
    if (!addRecipeCompId) return;
    const target = availableComponents.find((c) => c.id === Number(addRecipeCompId));
    if (!target) return;
    setEditingRecipeList((prev) => [
      ...prev,
      {
        id: target.id,
        code: target.code,
        name: target.name,
        qtyPerBundle: 1,
      },
    ]);
    setAddRecipeCompId("");
  };

  const handleRemoveRecipeItem = (id: number) => {
    setEditingRecipeList((prev) => prev.filter((r) => r.id !== id));
  };

  const recipeJson = useMemo(() => {
    return JSON.stringify(
      editingRecipeList.map((r) => ({
        finished_good_id: r.id,
        qty_per_bundle: r.qtyPerBundle,
      }))
    );
  }, [editingRecipeList]);

  return (
    <div className="space-y-5">
      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("HARIAN")}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black transition border-b-2 cursor-pointer ${
            activeTab === "HARIAN"
              ? "border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>📦</span>
          <span>1. Input Hasil Packing Harian</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("RESEP")}
          className={`flex items-center gap-2 px-5 py-2.5 text-xs font-black transition border-b-2 cursor-pointer ${
            activeTab === "RESEP"
              ? "border-blue-600 text-blue-700 bg-blue-50/50 rounded-t-xl"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <span>⚙️</span>
          <span>2. Atur Resep Paket (JKS / JKG)</span>
        </button>
      </div>

      {/* ================= TAB 1: INPUT HARIAN ================= */}
      {activeTab === "HARIAN" && (
        <form action={processBundlePackagePackingAction} className="space-y-5">
          <input type="hidden" name="return_path" value="/dashboard/bundlingIsian" />
          <input type="hidden" name="package_id" value={selectedPkgId} />
          <input type="hidden" name="components_json" value={dailyComponentsJson} />
          <input type="hidden" name="location_id" value="1" />

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Tanggal Packing
              </label>
              <input
                name="packing_date"
                type="date"
                required
                value={packingDate}
                onChange={(e) => setPackingDate(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 shadow-2xs focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Pilih Jenis Paket Isian
              </label>
              <select
                value={selectedPkgId}
                onChange={(e) => setSelectedPkgId(Number(e.target.value))}
                className="w-full rounded-xl border border-blue-300 bg-blue-50/20 px-3.5 py-2 text-sm font-bold text-blue-900 shadow-2xs focus:border-blue-500 focus:outline-none"
              >
                {packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.name} ({pkg.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Jumlah Selesai Dipacking Hari Ini
              </label>
              <div className="relative">
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="Contoh: 50"
                  value={dailyQty}
                  onChange={(e) => setDailyQty(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-black text-blue-700 shadow-2xs focus:border-blue-500 focus:outline-none"
                />
                <span className="absolute right-3.5 top-2 text-xs font-bold text-gray-400">
                  Pcs / Paket
                </span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Catatan Packing (Opsional)
            </label>
            <input
              name="notes"
              type="text"
              placeholder="Misal: Batch 1 packing karung kloter JKS / transfer Dadap"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-800 shadow-2xs focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Kotak Rincian Komponen Resep */}
          <div className="rounded-2xl border border-blue-200/80 bg-blue-50/40 p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-blue-950">
                  Komponen Isi Paket ({activePackingItems.length} Item Sesuai Resep):
                </h4>
                <p className="text-[11px] text-blue-800">
                  Otomatis terpotong dari Gudang Pusat saat disimpan. Anda bisa mengeluarkan item jika belum lengkap.
                </p>
              </div>
              {activePackingItems.length > 0 && numericDailyQty > 0 && (
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    stockCheck.allSufficient
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : "bg-rose-100 text-rose-800 border border-rose-300"
                  }`}
                >
                  {stockCheck.allSufficient ? "✅ Stok Lengkap" : "⚠️ Ada Stok Kurang"}
                </span>
              )}
            </div>

            {activePackingItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-center text-xs text-amber-800 space-y-2">
                <p className="font-bold">⚠️ Paket ini belum memiliki resep komponen yang terdaftar.</p>
                <button
                  type="button"
                  onClick={() => {
                    setRecipePkgId(selectedPkgId);
                    setActiveTab("RESEP");
                  }}
                  className="rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-black text-white shadow-2xs hover:bg-amber-700 transition cursor-pointer"
                >
                  👉 Klik di sini untuk atur isi resep paket ini sekarang
                </button>
              </div>
            ) : (
              <div className="divide-y divide-blue-100/80 rounded-xl border border-blue-200/60 bg-white overflow-hidden shadow-2xs">
                {stockCheck.items.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between text-xs hover:bg-slate-50/50 transition"
                  >
                    <div className="min-w-0 pr-2 flex items-start gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleRemoveDailyItem(c.id)}
                        title="Keluarkan dari packing hari ini"
                        className="mt-0.5 shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer shadow-2xs"
                      >
                        ✕ Keluarkan
                      </button>
                      <div>
                        <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mr-1.5">
                          {c.code}
                        </span>
                        <span className="font-bold text-slate-900">{c.name}</span>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          Stok Gudang Pusat:{" "}
                          <b className={c.stock > 0 ? "text-emerald-700" : "text-rose-600"}>
                            {c.stock.toLocaleString("id-ID")} Pcs
                          </b>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 justify-end">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500">Isi:</span>
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-800 text-xs">
                          {c.qtyPerBundle} Pcs
                        </span>
                      </div>

                      <div className="text-right min-w-[120px]">
                        <span className="block text-[10px] text-slate-400 uppercase font-semibold">Total Terpotong:</span>
                        <span
                          className={`font-black text-sm ${
                            c.isOk ? "text-slate-900" : "text-rose-600 font-extrabold"
                          }`}
                        >
                          {c.needed.toLocaleString("id-ID")} Pcs
                        </span>
                        {numericDailyQty > 0 && !c.isOk && (
                          <span className="block text-[10px] font-bold text-rose-600">
                            (Kurang {c.shortage.toLocaleString("id-ID")} Pcs)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tambah Barang Ekstra di Luar Resep */}
            {unselectedDailyComponents.length > 0 && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-blue-200/60">
                <select
                  value={addExtraId}
                  onChange={(e) => setAddExtraId(e.target.value ? Number(e.target.value) : "")}
                  className="grow rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- Sisipkan Barang Tambahan di Luar Resep Standar --</option>
                  {unselectedDailyComponents.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.code}) · Stok: {item.stock.toLocaleString("id-ID")} Pcs
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddExtraDailyItem}
                  disabled={!addExtraId}
                  className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  + Tambahkan
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={!dailyQty || numericDailyQty <= 0 || activePackingItems.length === 0}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-extrabold text-white shadow-xs transition hover:bg-blue-700 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>📦</span>
              <span>
                {numericDailyQty > 0
                  ? `Simpan Hasil Packing ${numericDailyQty.toLocaleString("id-ID")} Pcs Paket`
                  : "Masukkan Jumlah Pcs yang Dipacking"}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* ================= TAB 2: ATUR RESEP & EDIT/HAPUS PAKET ================= */}
      {activeTab === "RESEP" && (
        <div className="space-y-6">
          {/* Header Pilihan Paket + Tombol Edit/Hapus */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 grow">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Pilih Paket yang Mau Diatur Susunannya:
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={recipePkgId}
                    onChange={(e) => {
                      setRecipePkgId(Number(e.target.value));
                      setShowEditPackageModal(false);
                    }}
                    className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none"
                  >
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name} ({pkg.code})
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => setShowEditPackageModal((prev) => !prev)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-2xs cursor-pointer"
                  >
                    {showEditPackageModal ? "✕ Tutup Pengaturan Nama" : "✏️ Ubah Nama / Hapus Paket"}
                  </button>
                </div>
              </div>
            </div>

            {/* Panel Pengeditan Nama & Tombol Hapus Paket */}
            {showEditPackageModal && currentPackage && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-4 pt-3">
                <div className="flex items-center justify-between border-b border-amber-200/80 pb-2">
                  <h5 className="text-xs font-black text-amber-900 uppercase">
                    ✏️ Ubah Informasi / Hapus Paket: {currentPackage.name}
                  </h5>
                </div>

                <form action={updateBundlePackageAction} className="grid gap-3 sm:grid-cols-3 items-end">
                  <input type="hidden" name="return_path" value="/dashboard/bundlingIsian" />
                  <input type="hidden" name="package_id" value={currentPackage.id} />

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Kode Paket</label>
                    <input
                      name="package_code"
                      type="text"
                      required
                      value={editCode}
                      onChange={(e) => setEditCode(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold uppercase text-slate-800 focus:outline-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Nama Paket</label>
                    <input
                      name="name"
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-blue-500"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="grow rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-amber-700 transition cursor-pointer"
                    >
                      💾 Simpan Perubahan Nama
                    </button>
                  </div>
                </form>

                {/* Tombol Hapus Paket */}
                <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between">
                  <p className="text-[11px] text-rose-700">
                    * Paket hanya bisa dihapus jika belum pernah digunakan dalam transaksi packing harian.
                  </p>
                  <form
                    action={deleteBundlePackageAction}
                    onSubmit={(e) => {
                      if (!confirm(`Yakin ingin menghapus paket "${currentPackage.name}" beserta susunan resepnya?`)) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="return_path" value="/dashboard/bundlingIsian" />
                    <input type="hidden" name="package_id" value={currentPackage.id} />
                    <button
                      type="submit"
                      className="rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer shadow-2xs"
                    >
                      🗑️ Hapus Paket Ini
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>

          {/* Form Penyimpanan Resep */}
          <form action={savePackageRecipeAction} className="space-y-4">
            <input type="hidden" name="return_path" value="/dashboard/bundlingIsian" />
            <input type="hidden" name="package_id" value={recipePkgId} />
            <input type="hidden" name="recipe_items_json" value={recipeJson} />

            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Daftar Barang Jadi Satuan yang Menjadi Isi Paket ({editingRecipeList.length} Item):
              </h4>

              <button
                type="submit"
                disabled={editingRecipeList.length === 0}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-black text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <span>💾</span>
                <span>Simpan Resep Paket Ini</span>
              </button>
            </div>

            {editingRecipeList.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
                Belum ada barang di dalam resep paket ini. Gunakan dropdown di bawah untuk menambahkan.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                {editingRecipeList.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 text-xs hover:bg-slate-50/60 transition"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipeItem(item.id)}
                        className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 hover:bg-rose-100 transition cursor-pointer"
                      >
                        ✕ Hapus
                      </button>
                      <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {item.code}
                      </span>
                      <span className="font-bold text-slate-900">{item.name}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 text-[11px]">Jumlah per 1 Paket:</span>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        value={item.qtyPerBundle}
                        onChange={(e) => {
                          const val = Math.max(0.1, Number(e.target.value) || 1);
                          setEditingRecipeList((prev) =>
                            prev.map((x) => (x.id === item.id ? { ...x, qtyPerBundle: val } : x))
                          );
                        }}
                        className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-center font-bold text-slate-900 text-xs focus:outline-blue-500"
                      />
                      <span className="text-slate-400">Pcs</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Dropdown Tambah Komponen ke Resep */}
            {unselectedRecipeComponents.length > 0 && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                <select
                  value={addRecipeCompId}
                  onChange={(e) => setAddRecipeCompId(e.target.value ? Number(e.target.value) : "")}
                  className="grow rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- Pilih Barang dari Master Barang Jadi untuk Dimasukkan --</option>
                  {unselectedRecipeComponents.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} ({it.code})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddRecipeItem}
                  disabled={!addRecipeCompId}
                  className="shrink-0 rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-slate-900 transition disabled:opacity-50 cursor-pointer"
                >
                  + Masukkan ke Resep
                </button>
              </div>
            )}
          </form>

          {/* Form Tambah Jenis Paket Baru */}
          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">
              ➕ Buat Jenis Paket Baru (Misal: SOC Solo, SUB Surabaya, dll)
            </h4>
            <form action={createBundlePackageAction} className="grid gap-3 sm:grid-cols-3 items-end">
              <input type="hidden" name="return_path" value="/dashboard/bundlingIsian" />
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Kode Paket</label>
                <input
                  name="package_code"
                  type="text"
                  required
                  placeholder="Contoh: PKT-SOC"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase text-slate-800 focus:outline-blue-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Nama Paket</label>
                <input
                  name="name"
                  type="text"
                  required
                  placeholder="Contoh: Paket Isian Koper Haji SOC"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-blue-500"
                />
              </div>
              <button
                type="submit"
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition cursor-pointer"
              >
                + Simpan Jenis Paket
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
