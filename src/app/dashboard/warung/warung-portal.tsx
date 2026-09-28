"use client";

import React, { useState, useMemo } from "react";
import { 
  createWarungTransactionAction, 
  updateWarungTransactionAction, 
  deleteWarungTransactionAction,
  TransactionItemInput 
} from "./actions";
import { 
  Store, 
  Search, 
  Plus, 
  Receipt, 
  Users, 
  Calendar, 
  Clock, 
  Trash2, 
  Edit3, 
  X, 
  Check, 
  ChevronRight, 
  AlertCircle,
  FileText
} from "lucide-react";

// PRESET KATALOG BARANG CEPAT
const PRESET_CATALOG = [
  { name: "Kopi", price: 5000 },
  { name: "Rokok Magnum", price: 20000 },
  { name: "Gorengan", price: 1500 },
  { name: "Nasi Bungkus", price: 12000 },
];

export interface ItemDetail {
  id?: string;
  item_name: string;
  qty: number;
  unit_price: number;
  subtotal: number;
}

export interface WarungTransaction {
  id: string;
  worker_id: string;
  worker_name: string;
  worker_code: string;
  amount: number;
  notes: string;
  created_at: string;
  status: string;
  installments_paid: number;
  items: ItemDetail[];
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
  
  // State Modal Input/Edit Nota
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<WarungTransaction | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [notes, setNotes] = useState("");
  const [isDirectNominal, setIsDirectNominal] = useState(false);
  const [directAmount, setDirectAmount] = useState<number | "">("");
  const [cartItems, setCartItems] = useState<TransactionItemInput[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // State Modal Detail Riwayat Pekerja
  const [selectedWorkerForDetail, setSelectedWorkerForDetail] = useState<Worker | null>(null);

  // Perhitungan Rekap Saldo Per Pekerja
  const workerBalances = useMemo(() => {
    const map = new Map<string, { worker: Worker; totalDebt: number; transactionCount: number }>();

    initialWorkers.forEach((w) => {
      map.set(w.id, { worker: w, totalDebt: 0, transactionCount: 0 });
    });

    initialTransactions.forEach((tx) => {
      const current = map.get(tx.worker_id);
      if (current) {
        current.totalDebt += tx.amount;
        current.transactionCount += 1;
      }
    });

    return Array.from(map.values()).filter((item) =>
      item.worker.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.worker.worker_code.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [initialWorkers, initialTransactions, searchQuery]);

  // Total Keseluruhan Tagihan Warung
  const totalWarungReceivables = useMemo(() => {
    return initialTransactions.reduce((acc, t) => acc + t.amount, 0);
  }, [initialTransactions]);

  // Transaksi yang difilter untuk tab Riwayat Transaksi
  const filteredTransactions = useMemo(() => {
    return initialTransactions.filter((tx) =>
      tx.worker_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.worker_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.notes.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [initialTransactions, searchQuery]);

  // Handle Buka Form Tambah Baru
  const handleOpenCreateForm = (prefillWorkerId?: string) => {
    setEditingTransaction(null);
    setSelectedWorkerId(prefillWorkerId || initialWorkers[0]?.id || "");
    setNotes("");
    setIsDirectNominal(false);
    setDirectAmount("");
    setCartItems([]);
    setErrorMessage("");
    setIsFormOpen(true);
  };

  // Handle Buka Form Edit Nota
  const handleOpenEditForm = (tx: WarungTransaction) => {
    setEditingTransaction(tx);
    setSelectedWorkerId(tx.worker_id);
    setNotes(tx.notes);
    if (tx.items.length === 0) {
      setIsDirectNominal(true);
      setDirectAmount(tx.amount);
      setCartItems([]);
    } else {
      setIsDirectNominal(false);
      setDirectAmount("");
      setCartItems(tx.items.map((i) => ({ ...i })));
    }
    setErrorMessage("");
    setSelectedWorkerForDetail(null); // Tutup drawer detail
    setIsFormOpen(true);
  };

  // Tambah item dari preset
  const handleAddPresetItem = (preset: { name: string; price: number }) => {
    setCartItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.item_name === preset.name);
      if (existingIndex > -1) {
        const next = [...prev];
        next[existingIndex].qty += 1;
        next[existingIndex].subtotal = next[existingIndex].qty * next[existingIndex].unit_price;
        return next;
      }
      return [...prev, { item_name: preset.name, qty: 1, unit_price: preset.price, subtotal: preset.price }];
    });
  };

  // Tambah item manual baru
  const handleAddManualItem = () => {
    setCartItems((prev) => [
      ...prev,
      { item_name: "", qty: 1, unit_price: 0, subtotal: 0 },
    ]);
  };

  // Update item di keranjang
  const handleUpdateItem = (index: number, field: keyof TransactionItemInput, val: any) => {
    setCartItems((prev) => {
      const next = [...prev];
      const target = { ...next[index], [field]: val };
      if (field === "qty" || field === "unit_price") {
        target.subtotal = (Number(target.qty) || 0) * (Number(target.unit_price) || 0);
      }
      next[index] = target;
      return next;
    });
  };

  // Hapus item dari keranjang
  const handleRemoveItem = (index: number) => {
    setCartItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Hitung total di form
  const computedFormTotal = useMemo(() => {
    if (isDirectNominal) {
      return Number(directAmount) || 0;
    }
    return cartItems.reduce((acc, it) => acc + (it.subtotal || 0), 0);
  }, [isDirectNominal, directAmount, cartItems]);

  // Submit Simpan / Update
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkerId) {
      setErrorMessage("Silakan pilih pekerja.");
      return;
    }
    if (computedFormTotal <= 0) {
      setErrorMessage("Total belanja harus lebih dari Rp 0.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      if (editingTransaction) {
        const res = await updateWarungTransactionAction(editingTransaction.id, {
          worker_id: selectedWorkerId,
          notes,
          is_direct_nominal: isDirectNominal,
          direct_amount: Number(directAmount) || 0,
          items: cartItems,
        });
        if (!res.success) throw new Error(res.error);
      } else {
        const res = await createWarungTransactionAction({
          worker_id: selectedWorkerId,
          notes,
          is_direct_nominal: isDirectNominal,
          direct_amount: Number(directAmount) || 0,
          items: cartItems,
        });
        if (!res.success) throw new Error(res.error);
      }
      setIsFormOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal menyimpan transaksi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Hapus Transaksi
  const handleDeleteTransaction = async (txId: string) => {
    if (!confirm("Apakah Anda yakin ingin membatalkan dan menghapus nota ini?")) return;
    try {
      const res = await deleteWarungTransactionAction(txId);
      if (!res.success) {
        alert(res.error);
      } else {
        setSelectedWorkerForDetail(null);
      }
    } catch (err: any) {
      alert(err.message || "Gagal menghapus nota.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-28 text-slate-800">
      {/* Header Sticky Mobile */}
      <div className="bg-orange-500 text-white px-4 pt-6 pb-4 shadow-md sticky top-0 z-20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Store className="w-6 h-6" />
            <div>
              <h1 className="text-lg font-bold leading-tight">Portal Warung</h1>
              <p className="text-xs text-orange-100 font-medium">{currentWarung.name}</p>
            </div>
          </div>
          <button
            onClick={() => handleOpenCreateForm()}
            className="flex items-center gap-1.5 bg-white text-orange-600 font-semibold px-3 py-1.5 rounded-full text-xs shadow-sm hover:bg-orange-50 active:scale-95 transition"
          >
            <Plus className="w-4 h-4" />
            Catat Nota
          </button>
        </div>

        {/* Ringkasan Total Tagihan */}
        <div className="bg-orange-600/60 rounded-xl p-3 backdrop-blur-sm border border-orange-400/30 flex justify-between items-center">
          <div>
            <span className="text-[11px] text-orange-100 uppercase tracking-wider block">Total Piutang Berjalan</span>
            <span className="text-xl font-extrabold tracking-tight">
              Rp {totalWarungReceivables.toLocaleString("id-ID")}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-orange-100 block">Total Nota</span>
            <span className="text-base font-bold">{initialTransactions.length} Nota</span>
          </div>
        </div>

        {/* Tab Switcher Oranye */}
        <div className="grid grid-cols-2 gap-2 mt-4 bg-orange-600/40 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("rekap")}
            className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === "rekap"
                ? "bg-white text-orange-600 shadow-sm"
                : "text-orange-100 hover:text-white"
            }`}
          >
            <Users className="w-4 h-4" />
            Rekap Saldo per Orang
          </button>
          <button
            onClick={() => setActiveTab("transaksi")}
            className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === "transaksi"
                ? "bg-white text-orange-600 shadow-sm"
                : "text-orange-100 hover:text-white"
            }`}
          >
            <Receipt className="w-4 h-4" />
            Riwayat Transaksi
          </button>
        </div>
      </div>

      {/* Konten Halaman */}
      <div className="max-w-xl mx-auto px-4 mt-4">
        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={activeTab === "rekap" ? "Cari nama pekerja atau ID..." : "Cari nota, barang, atau nama..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 pl-10 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-sm"
          />
        </div>

        {/* TAB 1: REKAP SALDO PER PEKERJA */}
        {activeTab === "rekap" && (
          <div className="space-y-2.5">
            {workerBalances.map(({ worker, totalDebt, transactionCount }) => (
              <div
                key={worker.id}
                onClick={() => setSelectedWorkerForDetail(worker)}
                className="bg-white border border-slate-100 rounded-xl p-3.5 shadow-sm hover:border-orange-300 active:scale-[0.99] transition cursor-pointer flex items-center justify-between"
              >
                <div className="flex-1 min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-sm truncate">{worker.name}</h3>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-medium">
                      {worker.worker_code}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-500">{transactionCount} transaksi</span>
                    {transactionCount > 0 && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-medium">
                        Ada Bon Aktif
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right flex items-center gap-2">
                  <div>
                    <span className="text-xs text-slate-400 block font-normal">Total Bon</span>
                    <span className={`text-sm font-extrabold ${totalDebt > 0 ? "text-orange-600" : "text-slate-400"}`}>
                      Rp {totalDebt.toLocaleString("id-ID")}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </div>
            ))}

            {workerBalances.length === 0 && (
              <div className="text-center py-12 text-slate-400 text-xs">
                Tidak ada data pekerja yang cocok dengan pencarian.
              </div>
            )}
          </div>
        )}

        {/* TAB 2: RIWAYAT SEMUA TRANSAKSI NOTA */}
        {activeTab === "transaksi" && (
          <div className="space-y-3">
            {filteredTransactions.map((tx) => {
              const dt = new Date(tx.created_at);
              const formattedDate = dt.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
              const formattedTime = dt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

              return (
                <div key={tx.id} className="bg-white border border-slate-100 rounded-xl p-3.5 shadow-sm space-y-2.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-sm">{tx.worker_name}</span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                          {tx.worker_code}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {formattedDate}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {formattedTime} WIB
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-extrabold text-orange-600">
                        Rp {tx.amount.toLocaleString("id-ID")}
                      </span>
                      <span className="block text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold mt-0.5">
                        {tx.items.length > 0 ? `${tx.items.length} Item` : "Nominal Langsung"}
                      </span>
                    </div>
                  </div>

                  {/* Rincian item jika ada */}
                  {tx.items.length > 0 && (
                    <div className="bg-slate-50 rounded-lg p-2 text-xs space-y-1">
                      {tx.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between text-slate-600">
                          <span>
                            {it.item_name} <span className="text-slate-400">x{it.qty}</span>
                          </span>
                          <span className="font-medium text-slate-700">
                            Rp {it.subtotal.toLocaleString("id-ID")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {tx.notes && tx.notes !== "Rincian Item" && (
                    <p className="text-xs text-slate-500 italic bg-amber-50/50 p-1.5 rounded border border-amber-100">
                      Catatan: {tx.notes}
                    </p>
                  )}

                  {/* Tombol Aksi */}
                  <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
                    <button
                      onClick={() => handleOpenEditForm(tx)}
                      disabled={tx.installments_paid > 0}
                      className="flex items-center gap-1 text-xs text-slate-600 hover:text-orange-600 font-medium px-2.5 py-1 rounded bg-slate-50 hover:bg-orange-50 disabled:opacity-40 transition"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit Nota
                    </button>
                    <button
                      onClick={() => handleDeleteTransaction(tx.id)}
                      disabled={tx.installments_paid > 0}
                      className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 disabled:opacity-40 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Batalkan
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredTransactions.length === 0 && (
              <div className="text-center py-12 text-slate-400 text-xs">
                Belum ada nota yang tercatat untuk warung ini.
              </div>
            )}
          </div>
        )}
      </div>

      {/* DRAWER / MODAL: RINCIAN RIWAYAT PEKERJA KHUSUS WARUNG INI */}
      {selectedWorkerForDetail && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs flex justify-center items-end sm:items-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
            {/* Header Drawer */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-base text-slate-900">{selectedWorkerForDetail.name}</h2>
                  <span className="text-xs bg-orange-100 text-orange-800 font-mono font-bold px-1.5 py-0.5 rounded">
                    {selectedWorkerForDetail.worker_code}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Riwayat Bon & Ambilan di {currentWarung.name}</p>
              </div>
              <button
                onClick={() => setSelectedWorkerForDetail(null)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List Riwayat Nota Pekerja */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {(() => {
                const workerTx = initialTransactions.filter((t) => t.worker_id === selectedWorkerForDetail.id);
                if (workerTx.length === 0) {
                  return (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      Pekerja ini belum memiliki riwayat bon di warung Anda.
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
                          <span className="text-[11px] text-slate-400">ID Nota: {tx.id.substring(0, 8)}</span>
                        </div>
                        <span className="text-sm font-extrabold text-orange-600">
                          Rp {tx.amount.toLocaleString("id-ID")}
                        </span>
                      </div>

                      {/* Detail Items */}
                      {tx.items.length > 0 ? (
                        <div className="bg-slate-50 rounded-lg p-2 text-xs divide-y divide-slate-100">
                          {tx.items.map((item, idx) => (
                            <div key={idx} className="py-1 flex justify-between text-slate-600">
                              <span>
                                {item.item_name}{" "}
                                <span className="text-slate-400">({item.qty} x Rp {item.unit_price.toLocaleString("id-ID")})</span>
                              </span>
                              <span className="font-semibold text-slate-800">
                                Rp {item.subtotal.toLocaleString("id-ID")}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 bg-amber-50 p-2 rounded border border-amber-100">
                          <span className="font-medium text-amber-800">Input Nominal Langsung</span>: {tx.notes || "-"}
                        </div>
                      )}

                      {/* Tombol Aksi per Nota */}
                      <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
                        <button
                          onClick={() => handleOpenEditForm(tx)}
                          disabled={tx.installments_paid > 0}
                          className="flex items-center gap-1 text-xs text-slate-700 hover:text-orange-600 font-semibold px-2 py-1 rounded bg-slate-100 hover:bg-orange-50 disabled:opacity-40 transition"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit Nota
                        </button>
                        <button
                          onClick={() => handleDeleteTransaction(tx.id)}
                          disabled={tx.installments_paid > 0}
                          className="flex items-center gap-1 text-xs text-red-600 font-semibold px-2 py-1 rounded bg-red-50 hover:bg-red-100 disabled:opacity-40 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Hapus
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Footer Tambah Nota Baru Langsung untuk Pekerja Ini */}
            <div className="p-4 border-t border-slate-100 bg-white">
              <button
                onClick={() => {
                  const wId = selectedWorkerForDetail.id;
                  setSelectedWorkerForDetail(null);
                  handleOpenCreateForm(wId);
                }}
                className="w-full bg-orange-500 text-white font-bold py-2.5 rounded-xl hover:bg-orange-600 transition flex items-center justify-center gap-1.5 text-sm shadow-md"
              >
                <Plus className="w-4 h-4" />
                Catat Nota Baru untuk {selectedWorkerForDetail.name.split(" ")[0]}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL INPUT / EDIT NOTA */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-center items-end sm:items-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-orange-500 text-white rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5" />
                <h2 className="font-bold text-base">
                  {editingTransaction ? "Koreksi / Edit Nota Warung" : "Catat Nota Kasbon Baru"}
                </h2>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1 rounded-full text-orange-100 hover:bg-orange-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="overflow-y-auto p-4 space-y-4 flex-1">
              {errorMessage && (
                <div className="bg-red-50 text-red-700 text-xs p-3 rounded-xl border border-red-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* 1. Pilih Pekerja */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Pilih Pekerja
                </label>
                <select
                  value={selectedWorkerId}
                  onChange={(e) => setSelectedWorkerId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm font-medium focus:ring-2 focus:ring-orange-500"
                  required
                >
                  <option value="">-- Pilih Nama Pekerja --</option>
                  {initialWorkers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.worker_code})
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Toggle Input Langsung Nominal vs Rincian Barang */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-amber-900 block">Input Langsung Nominal Saja?</span>
                  <span className="text-[11px] text-amber-700">Gunakan jika kasir tidak ingin merinci item barang.</span>
                </div>
                <input
                  type="checkbox"
                  checked={isDirectNominal}
                  onChange={(e) => setIsDirectNominal(e.target.checked)}
                  className="w-5 h-5 text-orange-600 rounded focus:ring-orange-500 cursor-pointer"
                />
              </div>

              {/* JIKA INPUT LANGSUNG NOMINAL */}
              {isDirectNominal ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Total Nominal Transaksi (Rp)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Contoh: 35000"
                    value={directAmount}
                    onChange={(e) => setDirectAmount(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl text-lg font-extrabold text-orange-600 focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
              ) : (
                /* JIKA MENGGUNAKAN RINCIAN ITEM & PRESET */
                <div className="space-y-3">
                  {/* Preset Cepat */}
                  <div>
                    <span className="text-xs font-bold text-slate-700 uppercase block mb-1.5">
                      Katalog Preset Cepat (+1 Klik)
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {PRESET_CATALOG.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleAddPresetItem(preset)}
                          className="flex items-center justify-between bg-orange-50/70 border border-orange-200/80 p-2 rounded-xl hover:bg-orange-100 active:scale-95 transition text-left"
                        >
                          <div>
                            <span className="text-xs font-bold text-slate-800 block">{preset.name}</span>
                            <span className="text-[11px] text-orange-600 font-semibold">
                              Rp {preset.price.toLocaleString("id-ID")}
                            </span>
                          </div>
                          <Plus className="w-4 h-4 text-orange-500" />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Daftar Keranjang Barang Nota */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-bold text-slate-700 uppercase">
                        Rincian Barang Belanja ({cartItems.length})
                      </span>
                      <button
                        type="button"
                        onClick={handleAddManualItem}
                        className="text-xs text-orange-600 font-bold hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Item Manual
                      </button>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {cartItems.map((item, idx) => (
                        <div key={idx} className="bg-slate-50 border border-slate-200 p-2 rounded-xl flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Nama Barang"
                            value={item.item_name}
                            onChange={(e) => handleUpdateItem(idx, "item_name", e.target.value)}
                            className="flex-1 bg-white border border-slate-200 px-2 py-1.5 rounded-lg text-xs font-medium focus:ring-1 focus:ring-orange-500"
                            required
                          />
                          <div className="w-16">
                            <input
                              type="number"
                              min="1"
                              placeholder="Qty"
                              value={item.qty}
                              onChange={(e) => handleUpdateItem(idx, "qty", Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 px-2 py-1.5 rounded-lg text-xs font-medium text-center focus:ring-1 focus:ring-orange-500"
                              required
                            />
                          </div>
                          <div className="w-24">
                            <input
                              type="number"
                              min="0"
                              placeholder="Harga"
                              value={item.unit_price || ""}
                              onChange={(e) => handleUpdateItem(idx, "unit_price", Number(e.target.value))}
                              className="w-full bg-white border border-slate-200 px-2 py-1.5 rounded-lg text-xs font-medium text-right focus:ring-1 focus:ring-orange-500"
                              required
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1.5 text-slate-400 hover:text-red-500 rounded transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}

                      {cartItems.length === 0 && (
                        <div className="text-center py-5 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                          Belum ada barang dipilih. Klik preset di atas atau tambah item manual.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Catatan Opsional */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Misal: Titip teman, rokok belum lunas, dll."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs focus:ring-2 focus:ring-orange-500"
                />
              </div>

              {/* Total Kalkulasi Otomatis */}
              <div className="bg-slate-900 text-white p-3.5 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 block uppercase font-medium">Grand Total Nota</span>
                  <span className="text-xl font-extrabold text-orange-400">
                    Rp {computedFormTotal.toLocaleString("id-ID")}
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting || computedFormTotal <= 0}
                  className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition"
                >
                  <Check className="w-4 h-4" />
                  {isSubmitting ? "Menyimpan..." : editingTransaction ? "Simpan Perubahan" : "Simpan Nota"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
