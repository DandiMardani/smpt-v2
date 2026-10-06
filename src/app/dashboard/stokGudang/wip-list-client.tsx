"use client";

import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/master/page-utils";
import { moveWip } from "./actions";

export type WipItem = {
  id: number;
  cutting_component_id: number | null;
  location_id: number;
  project_id: number | null;
  product_id: number | null;
  quantity: number | string;
  component_code?: string;
  component_name?: string;
  component_color?: string;
  component_unit?: string;
  location_code?: string;
  location_name?: string;
  project_name?: string;
  product_name?: string;
};

export type WipLedgerItem = {
  id: number;
  event_id: number;
  cutting_component_id: number | null;
  location_id: number;
  movement_kind: string;
  quantity_delta: number;
  unit_snapshot: string;
  notes?: string | null;
  created_at: string;
  location_code?: string;
  location_name?: string;
};

export function WipListClient({
  items,
  ledgerEntries,
  canWrite,
}: {
  items: WipItem[];
  ledgerEntries: WipLedgerItem[];
  canWrite: boolean;
}) {
  const [openActionId, setOpenActionId] = useState<number | null>(null);
  const [openHistoryId, setOpenHistoryId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState("ALL");

  // Group ledger history by cutting_component_id
  const historyByComp = useMemo(() => {
    const map = new Map<number, WipLedgerItem[]>();
    for (const entry of ledgerEntries) {
      if (!entry.cutting_component_id) continue;
      const list = map.get(entry.cutting_component_id) || [];
      list.push(entry);
      map.set(entry.cutting_component_id, list);
    }
    return map;
  }, [ledgerEntries]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const code = (item.component_code || "").toLowerCase();
        const name = (item.component_name || "").toLowerCase();
        const prod = (item.product_name || "").toLowerCase();
        const proj = (item.project_name || "").toLowerCase();
        const color = (item.component_color || "").toLowerCase();
        if (!code.includes(q) && !name.includes(q) && !prod.includes(q) && !proj.includes(q) && !color.includes(q)) {
          return false;
        }
      }

      if (locationFilter !== "ALL" && item.location_code !== locationFilter) {
        return false;
      }

      return true;
    });
  }, [items, searchTerm, locationFilter]);

  const toggleAction = (id: number) => {
    setOpenActionId((prev) => (prev === id ? null : id));
  };

  const toggleHistory = (id: number) => {
    setOpenHistoryId((prev) => (prev === id ? null : id));
  };

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3 text-xs shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="🔍 Cari komponen WIP, nama pola, model tas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-72 rounded-xl border border-slate-300 bg-slate-50/60 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
          />
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-slate-50/60 px-3 py-2 text-xs text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
          >
            <option value="ALL">Semua Tahap Gudang Hasil</option>
            <option value="GUDANG_HASIL_BELUM">Belum Ditentukan (Baru Potong)</option>
            <option value="GUDANG_HASIL_SABLON">Antrian untuk Sablon</option>
            <option value="GUDANG_HASIL_SELESAI_SABLON">Selesai Sablon</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Menampilkan <b>{filteredItems.length}</b> dari {items.length} item WIP</span>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Tidak ada data potongan WIP yang sesuai filter pencarian.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((b) => {
            const compId = b.cutting_component_id || 0;
            const historyList = historyByComp.get(compId) || [];
            const isActionOpen = openActionId === b.id;
            const isHistoryOpen = openHistoryId === b.id;
            const qtyNum = Number(b.quantity || 0);

            // Badge Color based on location
            let badgeClass = "bg-slate-100 text-slate-700 border-slate-200";
            if (b.location_code === "GUDANG_HASIL_BELUM") {
              badgeClass = "bg-sky-50 text-sky-800 border-sky-200";
            } else if (b.location_code === "GUDANG_HASIL_SABLON") {
              badgeClass = "bg-purple-50 text-purple-800 border-purple-200";
            } else if (b.location_code === "GUDANG_HASIL_SELESAI_SABLON") {
              badgeClass = "bg-emerald-50 text-emerald-800 border-emerald-200";
            }

            return (
              <div
                key={b.id}
                className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs transition hover:border-slate-300"
              >
                {/* BARIS UTAMA RINGKAS */}
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-700">
                          {b.component_code}
                        </span>
                        <span className="text-slate-300">·</span>
                        <h4 className="text-sm font-bold text-slate-900">
                          {b.component_name}
                          {b.component_color ? (
                            <span className="ml-1.5 text-xs font-normal text-slate-500">
                              / {b.component_color}
                            </span>
                          ) : null}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-500">
                        {b.project_name || "Proyek"} · <b className="text-slate-700">{b.product_name || "Produk"}</b>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass}`}>
                        📍 {b.location_name || b.location_code}
                      </span>
                      <span className="inline-flex items-center rounded-xl bg-slate-100 px-3.5 py-1 text-sm font-black text-slate-900 font-mono shadow-2xs">
                        {formatNumber(b.quantity)} {b.component_unit || "PCS"}
                      </span>
                    </div>
                  </div>

                  {/* TOMBOL PENGENDALI AKSI & RIWAYAT (BUKA-TUTUP) */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-2">
                      {canWrite && qtyNum > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleAction(b.id)}
                          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition shadow-2xs ${
                            isActionOpen
                              ? "bg-blue-600 text-white shadow-xs"
                              : "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                          }`}
                        >
                          <span>⚡</span>
                          <span>{isActionOpen ? "Tutup Form Mutasi" : "Aksi Mutasi"}</span>
                          <span className={`transition-transform duration-200 ${isActionOpen ? "rotate-180" : ""}`}>
                            ▾
                          </span>
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => toggleHistory(b.id)}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition shadow-2xs ${
                          isHistoryOpen
                            ? "bg-slate-800 text-white"
                            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <span>📋</span>
                        <span>Riwayat Mutasi</span>
                        <span className="rounded-full bg-slate-200/80 px-1.5 py-0.2 text-[10px] font-bold text-slate-700">
                          {historyList.length}
                        </span>
                        <span className={`transition-transform duration-200 ${isHistoryOpen ? "rotate-180" : ""}`}>
                          ▾
                        </span>
                      </button>
                    </div>

                    <span className="text-[11px] text-slate-400">
                      Saldo siap proses: <b className="text-slate-600 font-mono">{formatNumber(b.quantity)} {b.component_unit || "PCS"}</b>
                    </span>
                  </div>
                </div>

                {/* DRAWER 1: FORM AKSI MUTASI (BUKA-TUTUP) */}
                {isActionOpen && canWrite && qtyNum > 0 ? (
                  <div className="border-t border-blue-100 bg-gradient-to-r from-blue-50/70 to-indigo-50/40 p-4 sm:p-5 transition-all">
                    <div className="mb-3 flex items-center justify-between">
                      <b className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                        <span>⚡</span>
                        <span>Pindahkan Potongan: {b.component_name}</span>
                      </b>
                      <button
                        type="button"
                        onClick={() => setOpenActionId(null)}
                        className="text-xs text-slate-500 hover:text-slate-800 underline"
                      >
                        ✕ Sembunyikan
                      </button>
                    </div>

                    <WipTransferForm
                      wipItem={b}
                      maxQty={qtyNum}
                      todayDate={todayStr}
                      onSuccess={() => setOpenActionId(null)}
                    />
                  </div>
                ) : null}

                {/* DRAWER 2: RIWAYAT MUTASI LOG (BUKA-TUTUP) */}
                {isHistoryOpen ? (
                  <div className="border-t border-slate-200 bg-slate-50/80 p-4 sm:p-5 transition-all">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <b className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <span>📋</span>
                          <span>Riwayat Pergerakan Log: {b.component_name} ({b.component_code})</span>
                        </b>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Daftar log transfer dan perubahan status barang potongan dari cutting ke proses berikutnya.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpenHistoryId(null)}
                        className="text-xs text-slate-500 hover:text-slate-800 underline"
                      >
                        ✕ Tutup Riwayat
                      </button>
                    </div>

                    {historyList.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
                        Belum ada riwayat pergerakan stok untuk komponen ini.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                              <th className="p-2.5">Waktu / Tanggal</th>
                              <th className="p-2.5">Jenis Mutasi</th>
                              <th className="p-2.5 text-right">Perubahan Qty</th>
                              <th className="p-2.5">Keterangan</th>
                              {canWrite ? <th className="p-2.5 text-center w-28">Aksi</th> : null}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {historyList.map((entry) => {
                              const isPositive = Number(entry.quantity_delta) > 0;
                              const canRevert =
                                canWrite &&
                                entry.movement_kind === "TANDAI UNTUK SABLON" &&
                                isPositive &&
                                b.location_code === "GUDANG_HASIL_SABLON";

                              return (
                                <tr key={entry.id} className="hover:bg-slate-50/70 transition">
                                  <td className="p-2.5 font-medium text-slate-800 whitespace-nowrap">
                                    {new Date(entry.created_at).toLocaleDateString("id-ID", {
                                      year: "numeric",
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </td>
                                  <td className="p-2.5">
                                    <span className="font-semibold text-slate-800">
                                      {entry.movement_kind}
                                    </span>
                                  </td>
                                  <td className="p-2.5 text-right font-mono font-bold whitespace-nowrap">
                                    <span className={isPositive ? "text-emerald-700" : "text-rose-700"}>
                                      {isPositive ? "+" : ""}
                                      {formatNumber(entry.quantity_delta)} {entry.unit_snapshot}
                                    </span>
                                  </td>
                                  <td className="p-2.5 text-slate-500 text-[11px] max-w-xs truncate">
                                    {entry.notes || "-"}
                                  </td>
                                  {canWrite ? (
                                    <td className="p-2.5 text-center">
                                      {canRevert ? (
                                        <form
                                          action={moveWip}
                                          onSubmit={(e) => {
                                            if (
                                              !confirm(
                                                `Kembalikan ${formatNumber(
                                                  entry.quantity_delta
                                                )} ${entry.unit_snapshot} dari antrian sablon ke status belum ditentukan?`
                                              )
                                            ) {
                                              e.preventDefault();
                                            }
                                          }}
                                        >
                                          <input type="hidden" name="component_id" value={b.cutting_component_id ?? ""} />
                                          <input type="hidden" name="product_id" value={b.product_id ?? ""} />
                                          <input type="hidden" name="action" value="BATAL_TANDA_SABLON" />
                                          <input type="hidden" name="transaction_date" value={todayStr} />
                                          <input type="hidden" name="quantity" value={entry.quantity_delta} />
                                          <input
                                            type="hidden"
                                            name="notes"
                                            value={`Batal tanda sablon (Reversal dari log #${entry.id})`}
                                          />
                                          <button
                                            type="submit"
                                            className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 hover:bg-amber-100 transition shadow-2xs"
                                            title="Batalkan mutasi ini dan kembalikan stok"
                                          >
                                            ↩️ Batalkan
                                          </button>
                                        </form>
                                      ) : (
                                        <span className="text-[10px] text-slate-400 italic">-</span>
                                      )}
                                    </td>
                                  ) : null}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WipTransferForm({
  wipItem,
  maxQty,
  todayDate,
  onSuccess,
}: {
  wipItem: WipItem;
  maxQty: number;
  todayDate: string;
  onSuccess: () => void;
}) {
  const locCode = wipItem.location_code;
  const [selectedAction, setSelectedAction] = useState<string>(() => {
    if (locCode === "GUDANG_HASIL_BELUM") return "TANDAI_SABLON";
    if (locCode === "GUDANG_HASIL_SABLON") return "KIRIM_SABLON";
    return "SABLON_KE_SIAP_PRODUKSI";
  });
  const [qty, setQty] = useState<string>(String(maxQty));

  return (
    <form
      action={async (formData) => {
        await moveWip(formData);
        onSuccess();
      }}
      className="space-y-3"
    >
      <input type="hidden" name="component_id" value={wipItem.cutting_component_id ?? ""} />
      <input type="hidden" name="product_id" value={wipItem.product_id ?? ""} />

      {/* Pilihan Aksi Perpindahan */}
      <div>
        <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
          1. Pilih Tujuan / Aksi Mutasi:
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          {locCode === "GUDANG_HASIL_BELUM" ? (
            <>
              <label
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 transition text-xs ${
                  selectedAction === "TANDAI_SABLON"
                    ? "border-blue-500 bg-white font-bold text-blue-900 shadow-xs"
                    : "border-slate-200 bg-white/70 text-slate-700 hover:bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="action"
                  value="TANDAI_SABLON"
                  checked={selectedAction === "TANDAI_SABLON"}
                  onChange={() => setSelectedAction("TANDAI_SABLON")}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="block font-semibold">🎨 Tandai untuk Sablon</span>
                  <span className="block text-[10px] font-normal text-slate-500">
                    Masukkan ke antrian Gudang Sablon
                  </span>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 transition text-xs ${
                  selectedAction === "CUTTING_KE_SIAP_PRODUKSI"
                    ? "border-emerald-500 bg-white font-bold text-emerald-900 shadow-xs"
                    : "border-slate-200 bg-white/70 text-slate-700 hover:bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="action"
                  value="CUTTING_KE_SIAP_PRODUKSI"
                  checked={selectedAction === "CUTTING_KE_SIAP_PRODUKSI"}
                  onChange={() => setSelectedAction("CUTTING_KE_SIAP_PRODUKSI")}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="block font-semibold">⚡ Kirim ke Siap Produksi</span>
                  <span className="block text-[10px] font-normal text-slate-500">
                    Komponen polos langsung ke perakitan jahit
                  </span>
                </div>
              </label>
            </>
          ) : null}

          {locCode === "GUDANG_HASIL_SABLON" ? (
            <>
              <label
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 transition text-xs ${
                  selectedAction === "KIRIM_SABLON"
                    ? "border-purple-500 bg-white font-bold text-purple-900 shadow-xs"
                    : "border-slate-200 bg-white/70 text-slate-700 hover:bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="action"
                  value="KIRIM_SABLON"
                  checked={selectedAction === "KIRIM_SABLON"}
                  onChange={() => setSelectedAction("KIRIM_SABLON")}
                  className="text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <span className="block font-semibold">🚚 Kirim ke Sablon</span>
                  <span className="block text-[10px] font-normal text-slate-500">
                    Serahkan fisik kain ke area kerja Sablon
                  </span>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 transition text-xs ${
                  selectedAction === "BATAL_TANDA_SABLON"
                    ? "border-rose-500 bg-white font-bold text-rose-900 shadow-xs"
                    : "border-slate-200 bg-white/70 text-slate-700 hover:bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="action"
                  value="BATAL_TANDA_SABLON"
                  checked={selectedAction === "BATAL_TANDA_SABLON"}
                  onChange={() => setSelectedAction("BATAL_TANDA_SABLON")}
                  className="text-rose-600 focus:ring-rose-500"
                />
                <div>
                  <span className="block font-semibold">↩️ Batalkan Tanda Sablon</span>
                  <span className="block text-[10px] font-normal text-slate-500">
                    Kembalikan status ke Belum Ditentukan
                  </span>
                </div>
              </label>
            </>
          ) : null}

          {locCode === "GUDANG_HASIL_SELESAI_SABLON" ? (
            <label
              className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-emerald-500 bg-white p-2.5 text-xs font-bold text-emerald-900 shadow-xs sm:col-span-2"
            >
              <input
                type="radio"
                name="action"
                value="SABLON_KE_SIAP_PRODUKSI"
                checked={true}
                readOnly
                className="text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <span className="block font-semibold">⚡ Kirim ke Siap Produksi</span>
                <span className="block text-[10px] font-normal text-slate-500">
                  Potongan selesai sablon siap dialirkan ke penjahitan
                </span>
              </div>
            </label>
          ) : null}
        </div>
      </div>

      {/* Field Input Form */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
            2. Tanggal Transaksi
          </label>
          <input
            type="date"
            name="transaction_date"
            required
            defaultValue={todayDate}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-[11px] font-semibold text-slate-700">
              3. Qty Mutasi ({wipItem.component_unit || "PCS"})
            </label>
            <button
              type="button"
              onClick={() => setQty(String(maxQty))}
              className="text-[10px] text-blue-600 font-bold hover:underline"
            >
              Semua ({formatNumber(maxQty)})
            </button>
          </div>
          <input
            type="number"
            name="quantity"
            min="0.0001"
            max={maxQty}
            step="0.0001"
            required
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
            4. Keterangan / Catatan
          </label>
          <input
            type="text"
            name="notes"
            placeholder="Catatan mutasi (opsional)"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-blue-200/60">
        <button
          type="button"
          onClick={onSuccess}
          className="rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition shadow-2xs"
        >
          Batal
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition shadow-xs"
        >
          <span>🚀</span>
          <span>Proses Mutasi WIP</span>
        </button>
      </div>
    </form>
  );
}
