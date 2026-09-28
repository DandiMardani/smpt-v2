"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
  createWarungTransactionAction, 
  updateWarungTransactionAction, 
  deleteWarungTransactionAction 
} from "./actions";

// Ikon Native SVG
const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const EditIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const DEFAULT_CATALOG = [
  { id: "1", name: "Kopi", price: 5000 },
  { id: "2", name: "Rokok Magnum", price: 20000 },
  { id: "3", name: "Gorengan", price: 1500 },
  { id: "4", name: "Nasi Bungkus", price: 12000 },
];

export interface WarungTransaction {
  id: string;
  worker_id: string;
  worker_name: string;
  worker_code: string;
  worker_role?: string;
  amount: number;
  notes: string;
  created_at: string;
  status: string;
  installments_paid: number;
  warung_name: string;
}

interface Worker {
  id: string;
  name: string;
  worker_code: string;
  role?: string;
}

interface WarungPortalProps {
  initialWorkers: Worker[];
  initialTransactions: WarungTransaction[];
  currentWarung: { id: string; name: string };
}

export function WarungPortal({
  initialWorkers,
  initialTransactions,
  currentWarung,
}: WarungPortalProps) {
  const [activeTab, setActiveTab] = useState<"rekap" | "transaksi">("rekap");
  const [searchQuery, setSearchQuery] = useState("");
  
  // State Katalog Produk Dinamis (Tersimpan di Browser HP)
  const [catalog, setCatalog] = useState(DEFAULT_CATALOG);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState<number | "">("");

  // Load Katalog dari LocalStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`smpt_catalog_${currentWarung.id}`);
      if (saved) {
        setCatalog(JSON.parse(saved));
      }
    } catch (e) {}
  }, [currentWarung.id]);

  // Simpan Katalog ke LocalStorage
  const saveCatalog = (updatedCatalog: typeof DEFAULT_CATALOG) => {
    setCatalog(updatedCatalog);
    try {
      localStorage.setItem(`smpt_catalog_${currentWarung.id}`, JSON.stringify(updatedCatalog));
    } catch (e) {}
  };

  // State Modal Input Nota / Edit
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<WarungTransaction | null>(null);
  const [formWorkerId, setFormWorkerId] = useState("");
  const [formAmount, setFormAmount] = useState<number | "">("");
  const [formNotes, setFormNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State Modal Riwayat Khusus Pekerja (Klik kartu pekerja)
  const [selectedWorkerForDetail, setSelectedWorkerForDetail] = useState<{ id: string; name: string; worker_code: string; role?: string } | null>(null);

  // Rekap Saldo Langsung dari Transaksi Aktif
  const workerBalances = useMemo(() => {
    const map = new Map<string, { worker: { id: string; name: string; worker_code: string; role?: string }; totalDebt: number; transactionCount: number }>();

    initialTransactions.forEach((tx) => {
      const key = String(tx.worker_id);
      let entry = map.get(key);
      if (!entry) {
        entry = {
          worker: {
            id: tx.worker_id,
            name: tx.worker_name,
            worker_code: tx.worker_code,
            role: tx.worker_role || "PRODUKSI (BULANAN)",
          },
          totalDebt: 0,
          transactionCount: 0,
        };
        map.set(key, entry);
      }
      entry.totalDebt += Number(tx.amount) || 0;
      entry.transactionCount += 1;
    });

    return Array.from(map.values()).filter((item) =>
      item.worker.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.worker.worker_code.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [initialTransactions, searchQuery]);

  const filteredTransactions = useMemo(() => {
    return initialTransactions.filter((tx) =>
      tx.worker_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.worker_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.notes.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [initialTransactions, searchQuery]);

  const handleOpenCreate = (workerIdPrefill?: string) => {
    setEditingTx(null);
    setFormWorkerId(workerIdPrefill || (initialWorkers[0]?.id ? String(initialWorkers[0].id) : ""));
    setFormAmount("");
    setFormNotes("");
    setIsFormOpen(true);
  };

  const handleOpenEdit = (tx: WarungTransaction) => {
    setEditingTx(tx);
    setFormWorkerId(String(tx.worker_id));
    setFormAmount(tx.amount);
    setFormNotes(tx.notes);
    setSelectedWorkerForDetail(null);
    setIsFormOpen(true);
  };

  // Klik Preset Cepat: Menambahkan nominal dan keterangan otomatis
  const handleAddPreset = (item: { name: string; price: number }) => {
    setFormAmount((prev) => (Number(prev) || 0) + item.price);
    setFormNotes((prev) => {
      if (!prev) return item.name;
      return `${prev}, ${item.name}`;
    });
  };

  // Tambah Produk Baru ke Katalog
  const handleAddNewProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName || !newProductPrice || Number(newProductPrice) <= 0) {
      alert("Masukkan nama produk dan harga yang valid.");
      return;
    }
    const updated = [
      ...catalog,
      { id: Date.now().toString(), name: newProductName, price: Number(newProductPrice) },
    ];
    saveCatalog(updated);
    setNewProductName("");
    setNewProductPrice("");
  };

  // Hapus Produk dari Katalog
  const handleDeleteProduct = (productId: string) => {
    if (!confirm("Hapus produk ini dari preset kasir?")) return;
    saveCatalog(catalog.filter((c) => c.id !== productId));
  };

  // Ubah Harga Produk di Katalog
  const handleUpdateProductPrice = (productId: string, newPrice: number) => {
    saveCatalog(
      catalog.map((c) => (c.id === productId ? { ...c, price: newPrice } : c))
    );
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formWorkerId || !formAmount || Number(formAmount) <= 0) {
      alert("Pilih pekerja dan isi nominal transaksi yang valid.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingTx) {
        const res = await updateWarungTransactionAction(editingTx.id, {
          worker_id: formWorkerId,
          notes: formNotes || "Kasbon",
          is_direct_nominal: true,
          direct_amount: Number(formAmount),
          items: [],
        });
        if (!res.success) throw new Error(res.error);
      } else {
        const res = await createWarungTransactionAction({
          worker_id: formWorkerId,
          notes: formNotes || "Kasbon",
          is_direct_nominal: true,
          direct_amount: Number(formAmount),
          items: [],
        });
        if (!res.success) throw new Error(res.error);
      }
      setIsFormOpen(false);
    } catch (err: any) {
      alert(err.message || "Gagal menyimpan transaksi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (txId: string) => {
    if (!confirm("Apakah Anda yakin ingin membatalkan nota ini?")) return;
    try {
      const res = await deleteWarungTransactionAction(txId);
      if (!res.success) alert(res.error);
      else setSelectedWorkerForDetail(null);
    } catch (err: any) {
      alert(err.message || "Gagal membatalkan nota.");
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-24 text-slate-800">
      <div className="max-w-xl mx-auto px-4 pt-3">
        
        {/* Tombol Catat Nota Baru */}
        <div className="flex justify-end mb-3">
          <button
            onClick={() => handleOpenCreate()}
            className="flex items-center gap-1.5 bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold px-4 py-2 rounded-full text-xs shadow-sm active:scale-95 transition"
          >
            <PlusIcon />
            <span>Catat Nota Baru</span>
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={() => setActiveTab("rekap")}
            className={`py-2.5 px-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 text-center shadow-xs ${
              activeTab === "rekap"
                ? "bg-[#ea580c] text-white"
                : "bg-white text-slate-700 border border-slate-200"
            }`}
          >
            <span>👥 Rekap Saldo Total per Orang ({workerBalances.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("transaksi")}
            className={`py-2.5 px-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 text-center shadow-xs ${
              activeTab === "transaksi"
                ? "bg-[#ea580c] text-white"
                : "bg-white text-slate-700 border border-slate-200"
            }`}
          >
            <span>📋 Riwayat Transaksi Harian ({initialTransactions.length})</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-3">
          <input
            type="text"
            placeholder="Cari nama pekerja / menu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 pl-3.5 pr-4 py-2.5 rounded-xl text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#ea580c] shadow-xs"
          />
        </div>

        {/* TAB 1: KARTU REKAP SALDO PER ORANG (BISA DIKLIK) */}
        {activeTab === "rekap" && (
          <div className="space-y-3">
            {workerBalances.map(({ worker, totalDebt, transactionCount }) => (
              <div
                key={worker.id}
                onClick={() => setSelectedWorkerForDetail(worker)}
                className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs hover:border-[#ea580c] active:scale-[0.99] transition cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 text-sm tracking-tight">{worker.name}</h3>
                  <span className="bg-[#fef3c7] text-[#92400e] text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
                    {transactionCount} Nota
                  </span>
                </div>

                <div className="text-[11px] text-slate-500 font-medium mt-1">
                  {worker.worker_code} · {worker.role}
                </div>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-50">
                  <span className="text-xs text-slate-600 font-normal">Total Tagihan:</span>
                  <span className="text-base font-bold text-[#e11d48]">
                    Rp {totalDebt.toLocaleString("id-ID")}
                  </span>
                </div>

                <div className="bg-[#fefce8] border border-[#fef08a]/80 text-[#854d0e] text-[11px] py-1.5 px-3 rounded-lg mt-2.5">
                  Otomatis masuk potongan slip gaji pada payroll berikutnya.
                </div>
              </div>
            ))}

            {workerBalances.length === 0 && (
              <div className="text-center py-12 text-slate-400 text-xs bg-white rounded-2xl border border-dashed border-slate-200">
                Tidak ada pekerja yang memiliki saldo bon aktif saat ini.
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TABEL RIWAYAT TRANSAKSI */}
        {activeTab === "transaksi" && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600 font-bold bg-slate-50/50">
                    <th className="py-3 px-3">Warung</th>
                    <th className="py-3 px-2">Menu / Keterangan</th>
                    <th className="py-3 px-2">Nominal</th>
                    <th className="py-3 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-orange-50/30 transition">
                      <td className="py-3 px-3 font-semibold text-[#b45309] whitespace-nowrap">
                        {tx.warung_name}
                      </td>
                      <td className="py-3 px-2 text-slate-700">
                        <div className="font-medium text-slate-800">{tx.notes}</div>
                        <div className="text-[10px] text-slate-400">{tx.worker_name}</div>
                      </td>
                      <td className="py-3 px-2 font-bold text-slate-900 whitespace-nowrap">
                        Rp {tx.amount.toLocaleString("id-ID")}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleOpenEdit(tx)}
                          className="text-[#ea580c] font-bold text-xs bg-orange-50 px-2.5 py-1 rounded-lg hover:bg-orange-100"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredTransactions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400 text-xs">
                        Belum ada riwayat transaksi untuk warung ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* DRAWER / MODAL: RINCIAN RIWAYAT PEKERJA (SAAT KARTU DIKLIK) */}
      {selectedWorkerForDetail && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-center items-end sm:items-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-sm text-slate-900">{selectedWorkerForDetail.name}</h2>
                  <span className="text-[10px] bg-amber-100 text-amber-800 font-mono font-bold px-1.5 py-0.5 rounded">
                    {selectedWorkerForDetail.worker_code}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Rincian Riwayat Nota di {currentWarung.name}</p>
              </div>
              <button
                onClick={() => setSelectedWorkerForDetail(null)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-200 transition"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {(() => {
                const workerTx = initialTransactions.filter((t) => String(t.worker_id) === String(selectedWorkerForDetail.id));
                if (workerTx.length === 0) {
                  return (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      Belum ada nota untuk pekerja ini di warung Anda.
                    </div>
                  );
                }

                return workerTx.map((tx) => {
                  const dt = new Date(tx.created_at);
                  const fDate = dt.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
                  const fTime = dt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

                  return (
                    <div key={tx.id} className="border border-slate-200 rounded-xl p-3 bg-white shadow-xs space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-xs font-semibold text-slate-700 block">
                            {fDate} • {fTime} WIB
                          </span>
                          <span className="text-[11px] text-slate-500">Keterangan: {tx.notes}</span>
                        </div>
                        <span className="text-sm font-bold text-[#e11d48]">
                          Rp {tx.amount.toLocaleString("id-ID")}
                        </span>
                      </div>

                      <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
                        <button
                          onClick={() => handleOpenEdit(tx)}
                          className="flex items-center gap-1 text-[11px] text-slate-700 hover:text-orange-600 font-semibold px-2.5 py-1 rounded bg-slate-100 hover:bg-orange-50 transition"
                        >
                          <EditIcon />
                          <span>Edit Nota</span>
                        </button>
                        <button
                          onClick={() => handleDelete(tx.id)}
                          className="flex items-center gap-1 text-[11px] text-red-600 font-semibold px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 transition"
                        >
                          <TrashIcon />
                          <span>Hapus</span>
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="p-4 border-t border-slate-100 bg-white">
              <button
                onClick={() => {
                  const wId = selectedWorkerForDetail.id;
                  setSelectedWorkerForDetail(null);
                  handleOpenCreate(wId);
                }}
                className="w-full bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold py-2.5 rounded-xl transition text-xs shadow-md"
              >
                + Catat Nota Baru untuk {selectedWorkerForDetail.name.split(" ")[0]}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL INPUT / EDIT NOTA */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-center items-end sm:items-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between bg-[#ea580c] text-white rounded-t-2xl">
              <h2 className="font-bold text-sm">
                {editingTx ? "Koreksi / Edit Nota Warung" : "Catat Nota Kasbon Baru"}
              </h2>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1 rounded-full text-orange-100 hover:bg-orange-600 transition"
              >
                <CloseIcon />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="overflow-y-auto p-4 space-y-3.5 flex-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Pilih Pekerja
                </label>
                <select
                  value={formWorkerId}
                  onChange={(e) => setFormWorkerId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-medium focus:ring-1 focus:ring-[#ea580c]"
                  required
                >
                  <option value="">-- Pilih Nama Pekerja --</option>
                  {initialWorkers.map((w) => (
                    <option key={w.id} value={String(w.id)}>
                      {w.name} ({w.worker_code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Preset Cepat dengan Tombol Kelola / Ubah Harga */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[11px] font-bold text-slate-700 uppercase">
                    Preset Cepat (+1 Klik)
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsCatalogModalOpen(true)}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200 transition"
                  >
                    ⚙️ Atur Menu / Ganti Harga
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {catalog.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAddPreset(item)}
                      className="flex items-center justify-between bg-orange-50 border border-orange-200 p-2 rounded-xl text-left hover:bg-orange-100 active:scale-95 transition"
                    >
                      <div className="truncate mr-1">
                        <span className="text-xs font-bold text-slate-800 block truncate">{item.name}</span>
                        <span className="text-[11px] text-[#ea580c] font-semibold">
                          Rp {item.price.toLocaleString("id-ID")}
                        </span>
                      </div>
                      <span className="text-[#ea580c] font-bold text-sm shrink-0">+</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Total Nominal (Rp)
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="Contoh: 35000"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-base font-extrabold text-[#ea580c] focus:ring-1 focus:ring-[#ea580c]"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Menu / Keterangan
                </label>
                <input
                  type="text"
                  placeholder="Misal: Kuota, Token, Kasbon, dll."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs focus:ring-1 focus:ring-[#ea580c]"
                />
              </div>

              <div className="bg-slate-900 text-white p-3 rounded-xl flex items-center justify-between mt-2">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-medium">Grand Total</span>
                  <span className="text-lg font-bold text-orange-400">
                    Rp {(Number(formAmount) || 0).toLocaleString("id-ID")}
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting || Number(formAmount) <= 0}
                  className="bg-[#ea580c] hover:bg-[#c2410c] disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-md transition active:scale-95"
                >
                  {isSubmitting ? "Menyimpan..." : "Simpan Nota"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KELOLA PRODUK & GANTI HARGA KATALOG */}
      {isCatalogModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-4 shadow-2xl space-y-3.5 animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
              <div>
                <h3 className="font-bold text-sm text-slate-900">⚙️ Atur Produk & Harga</h3>
                <p className="text-[11px] text-slate-500">Preset kasir khusus warung Anda</p>
              </div>
              <button
                onClick={() => setIsCatalogModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Form Tambah Produk Baru */}
            <form onSubmit={handleAddNewProduct} className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl space-y-2">
              <span className="text-[11px] font-bold text-slate-700 block uppercase">+ Tambah Produk Baru</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nama barang..."
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="flex-1 bg-white border border-slate-200 px-2 py-1.5 rounded-lg text-xs"
                />
                <input
                  type="number"
                  placeholder="Harga"
                  value={newProductPrice}
                  onChange={(e) => setNewProductPrice(e.target.value === "" ? "" : Number(e.target.value))}
                  className="w-20 bg-white border border-slate-200 px-2 py-1.5 rounded-lg text-xs"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 rounded-lg text-xs transition"
              >
                Simpan Produk Baru
              </button>
            </form>

            {/* Daftar Produk & Edit Harga */}
            <div>
              <span className="text-[11px] font-bold text-slate-700 block uppercase mb-1.5">
                Daftar Produk & Ubah Harga ({catalog.length})
              </span>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {catalog.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 bg-white border border-slate-200 p-2 rounded-xl">
                    <span className="flex-1 text-xs font-semibold text-slate-800 truncate">{item.name}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] text-slate-400">Rp</span>
                      <input
                        type="number"
                        value={item.price}
                        onChange={(e) => handleUpdateProductPrice(item.id, Number(e.target.value) || 0)}
                        className="w-16 bg-slate-50 border border-slate-200 px-1 py-1 rounded text-xs font-bold text-[#ea580c] text-right"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteProduct(item.id)}
                      className="p-1 text-slate-400 hover:text-red-500 rounded"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setIsCatalogModalOpen(false)}
              className="w-full bg-slate-900 hover:bg-black text-white font-bold py-2 rounded-xl text-xs transition"
            >
              Selesai & Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
