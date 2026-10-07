"use client";

import { useState, useMemo } from "react";
import { processBundlingIsianAction } from "@/lib/final/actions";

type ComponentItem = {
  id: number;
  code: string;
  name: string;
  stock: number;
  qtyPerBundle: number;
};

type Props = {
  bundleGoods: Array<{ id: number; code: string; name: string }>;
  availableComponents: Array<{ id: number; code: string; name: string; stock: number }>;
  defaultBundleId?: number;
};

export function BundlingIsianForm({
  bundleGoods,
  availableComponents,
  defaultBundleId,
}: Props) {
  const [bundleFgId, setBundleFgId] = useState<number>(defaultBundleId || bundleGoods[0]?.id || 0);
  const [bundleQty, setBundleQty] = useState<number>(100);
  const [notes, setNotes] = useState<string>("");
  const [bundlingDate, setBundlingDate] = useState<string>(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
  );

  // Komponen yang terpilih masuk bundle
  const [components, setComponents] = useState<ComponentItem[]>(() => {
    return availableComponents.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      stock: c.stock,
      qtyPerBundle: 1,
    }));
  });

  // State untuk dropdown tambah barang baru ke bundle
  const [selectedToAdd, setSelectedToAdd] = useState<number | "">("");

  // Daftar barang yang belum dimasukkan ke bundle
  const unselectedComponents = useMemo(() => {
    return availableComponents.filter((ac) => !components.some((c) => c.id === ac.id));
  }, [availableComponents, components]);

  // Handler keluarkan barang dari bundle
  const handleRemoveComponent = (id: number) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  };

  // Handler tambah barang ke bundle
  const handleAddComponent = () => {
    if (!selectedToAdd) return;
    const target = availableComponents.find((c) => c.id === Number(selectedToAdd));
    if (!target) return;

    setComponents((prev) => [
      ...prev,
      {
        id: target.id,
        code: target.code,
        name: target.name,
        stock: target.stock,
        qtyPerBundle: 1,
      },
    ]);
    setSelectedToAdd("");
  };

  // Validasi stok
  const stockCheck = useMemo(() => {
    let allSufficient = true;
    const items = components.map((c) => {
      const needed = c.qtyPerBundle * bundleQty;
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
  }, [components, bundleQty]);

  const componentsJson = useMemo(() => {
    return JSON.stringify(
      components.map((c) => ({
        finished_good_id: c.id,
        qty_per_bundle: c.qtyPerBundle,
      }))
    );
  }, [components]);

  const handleQtyPerChange = (id: number, val: number) => {
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, qtyPerBundle: Math.max(0.01, val) } : c))
    );
  };

  return (
    <form action={processBundlingIsianAction} className="space-y-5">
      <input type="hidden" name="return_path" value="/dashboard/bundlingIsian" />
      <input type="hidden" name="bundle_finished_good_id" value={bundleFgId} />
      <input type="hidden" name="components_json" value={componentsJson} />
      <input type="hidden" name="location_id" value="1" /> {/* Pabrik Pusat SMPT */}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
            Tanggal Bundling
          </label>
          <input
            name="bundling_date"
            type="date"
            required
            value={bundlingDate}
            onChange={(e) => setBundlingDate(e.target.value)}
            className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 shadow-2xs focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
            Paket Isian Koper yang Dihasilkan
          </label>
          <select
            value={bundleFgId}
            onChange={(e) => setBundleFgId(Number(e.target.value))}
            className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 shadow-2xs focus:border-blue-500 focus:outline-none"
          >
            {bundleGoods.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
            Jumlah Bundle yang Dipacking
          </label>
          <div className="relative">
            <input
              name="bundle_qty"
              type="number"
              min="1"
              step="1"
              required
              value={bundleQty || ""}
              onChange={(e) => setBundleQty(Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm font-black text-blue-700 shadow-2xs focus:border-blue-500 focus:outline-none"
            />
            <span className="absolute right-3.5 top-2 text-xs font-bold text-gray-400">
              Bundle / Kantong
            </span>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
          Catatan Bundling (Opsional)
        </label>
        <input
          name="notes"
          type="text"
          placeholder="Misal: Batch 1 Isian Koper Kloter JKS untuk ditransfer ke Dadap"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-800 shadow-2xs focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Rincian Komponen & Validasi Stok Real-Time */}
      <div className="rounded-2xl border border-blue-200/80 bg-blue-50/40 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-blue-950">
              Komponen yang Dimasukkan ke dalam 1 Bundle Isian ({components.length} Item):
            </h4>
            <p className="text-[11px] text-blue-800">
              Setiap 1 Bundle otomatis memotong komponen di bawah ini. Anda bisa mengeluarkan atau menambahkan barang secara bebas.
            </p>
          </div>
          {components.length > 0 && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                stockCheck.allSufficient
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : "bg-rose-100 text-rose-800 border border-rose-300"
              }`}
            >
              {stockCheck.allSufficient ? "✅ Stok Komponen Lengkap" : "⚠️ Ada Komponen Kurang"}
            </span>
          )}
        </div>

        {/* Daftar Komponen Terpilih */}
        {components.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
            Semua barang telah dikeluarkan. Gunakan menu di bawah untuk memilih barang yang akan dimasukkan ke dalam paket.
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
                    onClick={() => handleRemoveComponent(c.id)}
                    title="Keluarkan barang ini dari paket"
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
                      Stok saat ini di Gudang Pusat:{" "}
                      <b className={c.stock > 0 ? "text-emerald-700" : "text-rose-600"}>
                        {c.stock.toLocaleString("id-ID")} Pcs
                      </b>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 justify-end">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">Isi / Bundle:</span>
                    <input
                      type="number"
                      min="0.1"
                      step="any"
                      value={c.qtyPerBundle}
                      onChange={(e) => handleQtyPerChange(c.id, Number(e.target.value) || 1)}
                      className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-center font-bold text-slate-900 text-xs focus:outline-blue-500"
                    />
                    <span className="text-slate-400">Pcs</span>
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
                    {!c.isOk && (
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

        {/* Input Tambah Barang Baru ke Bundle */}
        {unselectedComponents.length > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-blue-200/60">
            <select
              value={selectedToAdd}
              onChange={(e) => setSelectedToAdd(e.target.value ? Number(e.target.value) : "")}
              className="grow rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
            >
              <option value="">-- Pilih Barang Lain yang Ingin Dimasukkan ke Paket --</option>
              {unselectedComponents.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.code}) · Stok: {item.stock.toLocaleString("id-ID")} Pcs
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddComponent}
              disabled={!selectedToAdd}
              className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              + Tambahkan ke Paket
            </button>
          </div>
        )}

        {components.length > 0 && !stockCheck.allSufficient && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
            ⚠️ <b>Perhatian:</b> Ada komponen satuan yang stoknya kurang di Gudang Pusat. Anda tetap bisa memprosesnya jika ingin mencatat stok riil atau pastikan stok barang jadi di Gudang Pusat sudah terinput dari checker/QC.
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={components.length === 0}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-extrabold text-white shadow-xs transition hover:bg-blue-700 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>📦</span>
          <span>Proses Bundling {bundleQty.toLocaleString("id-ID")} Paket Isian</span>
        </button>
      </div>
    </form>
  );
}
