"use client";

import React, { useState, useMemo } from "react";
import { 
  createWarungTransactionAction, 
  updateWarungTransactionAction, 
  deleteWarungTransactionAction,
  TransactionItemInput 
} from "./actions";

// Ikon Native SVG
const SearchIcon = () => (
  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const EditIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

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
  worker_role?: string;
  amount: number;
  notes: string;
  created_at: string;
  status: string;
  installments_paid: number;
  warung_name: string;
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

  // Rekap saldo per pekerja
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

  const filteredTransactions = useMemo(() => {
    return initialTransactions.filter((tx) =>
      tx.worker_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.worker_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.notes.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.warung_name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [initialTransactions, searchQuery]);

  const activeWorkersWithDebtCount = useMemo(() => {
    return workerBalances.filter((b) => b.transactionCount > 0).length;
  }, [workerBalances]);

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
    setSelectedWorkerForDetail(null);
    setIsFormOpen(true);
  };

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

  const handleAddManualItem = () => {
    setCartItems((prev) => [
      ...prev,
      { item_name: "", qty: 1, unit_price: 0, subtotal: 0 },
    ]);
  };

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

  const handleRemoveItem = (index: number) => {
    setCartItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const computedFormTotal = useMemo(() => {
    if (isDirectNominal) {
      return Number(directAmount) || 0;
    }
    return cartItems.reduce((acc, it) => acc + (it.subtotal || 0), 0);
  }, [isDirectNominal, directAmount, cartItems]);

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
        const res = await updateWarungTransactionAction(String(editingTransaction.id), {
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

  const handleDeleteTransaction = async (txId: string) => {
    if (!confirm("Apakah Anda yakin ingin membatalkan nota ini?")) return;
    try {
      const res = await deleteWarungTransactionAction(String(txId));
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
    <div className="min-h-screen bg-[#f8fafc] pb-24 text-slate-800">
      <div className="max-w-xl mx-auto px-4 pt-3">
        
        {/* Tombol Buat Nota Cepat */}
        <div className="flex justify-end mb-3">
          <button
            onClick={() => handleOpenCreateForm()}
            className="flex items-center gap-1.5 bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold px-3.5 py-1.5 rounded-full text-xs shadow-sm active:scale-95 transition"
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
            <span>👥 Rekap Saldo Total per Orang ({activeWorkersWithDebtCount})</span>
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

        {/* TAB 1: KARTU PEKERJA (BISA DIKLIK) */}
        {activeTab === "rekap" && (
          <div className="space-y-3">
            {workerBalances.map(({ worker, totalDebt, transactionCount }) => {
              if (transactionCount === 0 && searchQuery === "") return null;

              return (
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
                    {worker.worker_code} · {worker.role || "PRODUKSI (BULANAN)"}
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
              );
            })}

            {activeWorkersWithDebtCount === 0 && (
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
                    <th className="py-3 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.map((tx) => (
                    <tr 
                      key={tx.id} 
                      onClick={() => handleOpenEditForm(tx)}
                      className="hover:bg-orange-50/40 cursor-pointer transition"
                    >
                      <td className="py-3 px-3 font-semibold text-[#b45309] whitespace-nowrap">
                        {tx.warung_name || currentWarung.name}
                      </td>
                      <td className="py-3 px-2 text-slate-700">
                        <div className="font-medium text-slate-800">{tx.notes || "Kasbon"}</div>
                        <div className="text-[10px] text-slate-400">{tx.worker_name}</div>
                      </td>
                      <td className="py-3 px-2 font-bold text-slate-900 whitespace-nowrap">
                        Rp {tx.amount.toLocaleString("id-ID")}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <span className="bg-[#fef3c7] text-[#92400e] text-[10px] font-bold px-2 py-0.5 rounded-full inline-block">
                          {tx.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredTransactions.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400 text-xs">
                        Belum ada riwayat transaksi yang tercatat.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* DRAWER / MODAL: RINCIAN RIWAYAT PEKERJA */}
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
                <p className="text-[11px] text-slate-500 mt-0.5">Rincian Nota di {currentWarung.name}</p>
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
                const workerTx = initialTransactions.filter((t) => t.worker_id === selectedWorkerForDetail.id);
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
                          <span className="text-[11px] text-slate-400">Keterangan: {tx.notes}</span>
                        </div>
                        <span className="text-sm font-bold text-[#e11d48]">
                          Rp {tx.amount.toLocaleString("id-ID")}
                        </span>
                      </div>

                      {tx.items.length > 0 && (
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
                      )}

                      <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
                        <button
                          onClick={() => handleOpenEditForm(tx)}
                          disabled={tx.installments_paid > 0}
                          className="flex items-center gap-1 text-[11px] text-slate-700 hover:text-orange-600 font-semibold px-2.5 py-1 rounded bg-slate-100 hover:bg-orange-50 disabled:opacity-40 transition"
                        >
                          <EditIcon />
                          <span>Edit Nota</span>
                        </button>
                        <button
                          onClick={() => handleDeleteTransaction(String(tx.id))}
                          disabled={tx.installments_paid > 0}
                          className="flex items-center gap-1 text-[11px] text-red-600 font-semibold px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 disabled:opacity-40 transition"
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
                  handleOpenCreateForm(wId);
                }}
                className="w-full bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 text-xs shadow-md"
              >
                <PlusIcon />
                <span>Catat Nota Baru untuk {selectedWorkerForDetail.name.split(" ")[0]}</span>
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
              <div className="flex items-center gap-2">
                <span className="text-base">📋</span>
                <h2 className="font-bold text-sm">
                  {editingTransaction ? "Koreksi / Edit Nota Warung" : "Catat Nota Kasbon Baru"}
                </h2>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1 rounded-full text-orange-100 hover:bg-orange-600 transition"
              >
                <CloseIcon />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="overflow-y-auto p-4 space-y-3.5 flex-1">
              {errorMessage && (
                <div className="bg-red-50 text-red-700 text-xs p-2.5 rounded-xl border border-red-200">
                  ⚠️ {errorMessage}
                </div>
              )}

              {/* 1. Pilih Pekerja */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Pilih Pekerja
                </label>
                <select
                  value={selectedWorkerId}
                  onChange={(e) => setSelectedWorkerId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-medium focus:ring-1 focus:ring-[#ea580c]"
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

              {/* 2. Checkbox Input Langsung Nominal */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-amber-900 block">Input Langsung Nominal Saja?</span>
                  <span className="text-[10px] text-amber-700">Untuk transaksi seperti Kuota, Token Listrik, atau Bon Tunai.</span>
                </div>
                <input
                  type="checkbox"
                  checked={isDirectNominal}
                  onChange={(e) => setIsDirectNominal(e.target.checked)}
                  className="w-5 h-5 text-orange-600 rounded focus:ring-orange-500 cursor-pointer"
                />
              </div>

              {isDirectNominal ? (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Total Nominal Transaksi (Rp)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Contoh: 30000"
                    value={directAmount}
                    onChange={(e) => setDirectAmount(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-base font-extrabold text-[#ea580c] focus:ring-1 focus:ring-[#ea580c]"
                    required
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Katalog Preset Cepat */}
                  <div>
                    <span className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                      Katalog Preset (+1 Klik)
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {PRESET_CATALOG.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleAddPresetItem(preset)}
                          className="flex items-center justify-between bg-orange-50/70 border border-orange-200 p-2 rounded-xl hover:bg-orange-100 active:scale-95 transition text-left"
                        >
                          <div>
                            <span className="text-xs font-bold text-slate-800 block">{preset.name}</span>
                            <span className="text-[11px] text-[#ea580c] font-semibold">
                              Rp {preset.price.toLocaleString("id-ID")}
                            </span>
                          </div>
                          <span className="text-[#ea580c] font-bold">+</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Keranjang Rincian Barang */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[11px] font-bold text-slate-700 uppercase">
                        Rincian Barang ({cartItems.length})
                      </span>
                      <button
                        type="button"
                        onClick={handleAddManualItem}
                        className="text-xs text-[#ea580c] font-bold hover:underline flex items-center gap-1"
                      >
                        + Item Manual
                      </button>
                    </div>

                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {cartItems.map((item, idx) => (
                        <div key={idx} className="bg-slate-50 border border-slate-200 p-2 rounded-xl flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="Nama Item"
                            value={item.item_name}
                            onChange={(e) => handleUpdateItem(idx, "item_name", e.target.value)}
                            className="flex-1 bg-white border border-slate-200 px-2 py-1.5 rounded-lg text-xs font-medium focus:ring-1 focus:ring-[#ea580c]"
                            required
                          />
                          <input
                            type="number"
                            min="1"
                            placeholder="Qty"
                            value={item.qty}
                            onChange={(e) => handleUpdateItem(idx, "qty", Number(e.target.value))}
                            className="w-14 bg-white border border-slate-200 px-1 py-1.5 rounded-lg text-xs font-medium text-center focus:ring-1 focus:ring-[#ea580c]"
                            required
                          />
                          <input
                            type="number"
                            min="0"
                            placeholder="Harga"
                            value={item.unit_price || ""}
                            onChange={(e) => handleUpdateItem(idx, "unit_price", Number(e.target.value))}
                            className="w-20 bg-white border border-slate-200 px-1.5 py-1.5 rounded-lg text-xs font-medium text-right focus:ring-1 focus:ring-[#ea580c]"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-slate-400 hover:text-red-500 rounded transition"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      ))}

                      {cartItems.length === 0 && (
                        <div className="text-center py-4 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                          Belum ada item dipilih.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Catatan / Keterangan */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Menu / Keterangan
                </label>
                <input
                  type="text"
                  placeholder="Misal: Kuota, Token, Kasbon, dll."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs focus:ring-1 focus:ring-[#ea580c]"
                />
              </div>

              {/* Footer Grand Total */}
              <div className="bg-slate-900 text-white p-3 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-medium">Grand Total</span>
                  <span className="text-lg font-bold text-orange-400">
                    Rp {computedFormTotal.toLocaleString("id-ID")}
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting || computedFormTotal <= 0}
                  className="bg-[#ea580c] hover:bg-[#c2410c] disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition"
                >
                  <CheckIcon />
                  <span>{isSubmitting ? "Menyimpan..." : "Simpan Nota"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
