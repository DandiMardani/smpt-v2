"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  createWarungTransactionAction, 
  updateWarungTransactionAction, 
  deleteWarungTransactionAction,
  recordWarungPaymentAction
} from "./actions";

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

const StoreIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18l-2 9H5L3 3zm0 9a3 3 0 106 0 3 3 0 106 0 3 3 0 106 0M5 21h14a2 2 0 002-2v-7H3v7a2 2 0 002 2z" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const DEFAULT_CATALOG = [
  { id: "1", name: "Kopi", price: 5000 },
  { id: "2", name: "Rokok", price: 25000 },
  { id: "3", name: "Gorengan", price: 2000 },
  { id: "4", name: "Nasi Bungkus", price: 15000 },
];

export interface WarungTransaction {
  id: string;
  worker_id: string;
  worker_name: string;
  worker_code: string;
  worker_role?: string;
  amount: number;
  paid_amount?: number;
  remaining_amount?: number;
  notes: string;
  created_at: string;
  status: string;
  installments_paid: number;
  warung_name: string;
  warung_id?: string | null;
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
  isAdmin?: boolean;
}

export function WarungPortal({
  initialWorkers,
  initialTransactions,
  currentWarung,
  isAdmin = false,
}: WarungPortalProps) {
  const router = useRouter();

  // Local state agar update data langsung terjadi tanpa reload halaman
  const [transactions, setTransactions] = useState<WarungTransaction[]>(initialTransactions);

  useEffect(() => {
    setTransactions(initialTransactions);
  }, [initialTransactions]);

  const [selectedWarungFilter, setSelectedWarungFilter] = useState<string>(isAdmin ? "ALL" : currentWarung.name);
  const [activeTab, setActiveTab] = useState<"rekap" | "transaksi">("rekap");
  const [searchQuery, setSearchQuery] = useState("");

  const availableWarungs = useMemo(() => {
    const map = new Map<string, { name: string; totalDebt: number; workerCount: Set<string>; txCount: number }>();

    map.set("Dandi Store", {
      name: "Dandi Store",
      totalDebt: 0,
      workerCount: new Set(),
      txCount: 0,
    });

    transactions.forEach((tx) => {
      const wName = tx.warung_name && tx.warung_name.trim() !== "" ? tx.warung_name : "Dandi Store";
      let entry = map.get(wName);
      if (!entry) {
        entry = {
          name: wName,
          totalDebt: 0,
          workerCount: new Set(),
          txCount: 0,
        };
        map.set(wName, entry);
      }
      const rem = Math.max(0, Number(tx.amount || 0) - Number(tx.paid_amount || 0));
      if (rem > 0) {
        entry.totalDebt += rem;
        entry.workerCount.add(String(tx.worker_id));
      }
      entry.txCount += 1;
    });

    return Array.from(map.values()).map((item) => ({
      name: item.name,
      totalDebt: item.totalDebt,
      uniqueWorkers: item.workerCount.size,
      txCount: item.txCount,
    }));
  }, [transactions]);

  const activeTransactions = useMemo(() => {
    if (!isAdmin) {
      return transactions.filter((tx) => 
        (tx.warung_name || "").toLowerCase() === currentWarung.name.toLowerCase()
      );
    }
    if (selectedWarungFilter === "ALL") {
      return transactions;
    }
    return transactions.filter((tx) => 
      (tx.warung_name || "Dandi Store").toLowerCase() === selectedWarungFilter.toLowerCase()
    );
  }, [transactions, selectedWarungFilter, isAdmin, currentWarung.name]);

  const warungSummary = useMemo(() => {
    let totalRemaining = 0;
    let totalPaid = 0;
    const workerSet = new Set<string>();

    activeTransactions.forEach((tx) => {
      const amt = Number(tx.amount || 0);
      const paid = Number(tx.paid_amount || 0);
      const rem = Math.max(0, amt - paid);

      totalRemaining += rem;
      totalPaid += paid;

      if (rem > 0) {
        workerSet.add(String(tx.worker_id));
      }
    });

    return {
      totalRemaining,
      totalPaid,
      totalWorkers: workerSet.size,
      totalTransactions: activeTransactions.length,
    };
  }, [activeTransactions]);

  const [catalog, setCatalog] = useState(DEFAULT_CATALOG);
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState<number | "">("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`smpt_catalog_${currentWarung.id}`);
      if (saved) {
        setCatalog(JSON.parse(saved));
      }
    } catch (e) {}
  }, [currentWarung.id]);

  const saveCatalog = (updatedCatalog: typeof DEFAULT_CATALOG) => {
    setCatalog(updatedCatalog);
    try {
      localStorage.setItem(`smpt_catalog_${currentWarung.id}`, JSON.stringify(updatedCatalog));
    } catch (e) {}
  };

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<WarungTransaction | null>(null);
  const [formWorkerId, setFormWorkerId] = useState("");
  const [formAmount, setFormAmount] = useState<number | "">("");
  const [formPaidAmount, setFormPaidAmount] = useState<number | "">("");
  const [formNotes, setFormNotes] = useState("");
  const [formWarungName, setFormWarungName] = useState(
    selectedWarungFilter !== "ALL" ? selectedWarungFilter : currentWarung.name
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedWorkerForDetail, setSelectedWorkerForDetail] = useState<{ id: string; name: string; worker_code: string; role?: string } | null>(null);

  const [paymentModalTx, setPaymentModalTx] = useState<WarungTransaction | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState<number | "">("");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const workerBalances = useMemo(() => {
    const map = new Map<string, { worker: { id: string; name: string; worker_code: string; role?: string }; totalDebt: number; transactionCount: number }>();

    activeTransactions.forEach((tx) => {
      const key = String(tx.worker_id);
      const rem = Math.max(0, Number(tx.amount || 0) - Number(tx.paid_amount || 0));
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
      entry.totalDebt += rem;
      if (rem > 0) {
        entry.transactionCount += 1;
      }
    });

    return Array.from(map.values())
      .filter((item) => item.totalDebt > 0)
      .filter((item) =>
        item.worker.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.worker.worker_code.toLowerCase().includes(searchQuery.toLowerCase())
      );
  }, [activeTransactions, searchQuery]);

  const filteredTransactions = useMemo(() => {
    return activeTransactions.filter((tx) =>
      tx.worker_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.worker_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.notes.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [activeTransactions, searchQuery]);

  const handleOpenCreate = (workerIdPrefill?: string) => {
    setEditingTx(null);
    setFormWorkerId(workerIdPrefill || (initialWorkers[0]?.id ? String(initialWorkers[0].id) : ""));
    setFormAmount("");
    setFormPaidAmount(0);
    setFormNotes("");
    setFormWarungName(selectedWarungFilter !== "ALL" ? selectedWarungFilter : currentWarung.name);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (tx: WarungTransaction) => {
    setEditingTx(tx);
    setFormWorkerId(String(tx.worker_id));
    setFormAmount(tx.amount);
    setFormPaidAmount(tx.paid_amount || 0);
    setFormNotes(tx.notes);
    setFormWarungName(tx.warung_name || "Dandi Store");
    setIsFormOpen(true);
  };

  const handleOpenPayment = (tx: WarungTransaction) => {
    setPaymentModalTx(tx);
    const rem = Math.max(0, Number(tx.amount || 0) - Number(tx.paid_amount || 0));
    setPaymentAmountInput(rem);
  };

  const handleAddPreset = (item: { name: string; price: number }) => {
    setFormAmount((prev) => (Number(prev) || 0) + item.price);
    setFormNotes((prev) => {
      if (!prev) return item.name;
      return `${prev}, ${item.name}`;
    });
  };

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

  const handleDeleteProduct = (productId: string) => {
    if (!confirm("Hapus produk ini dari preset kasir?")) return;
    saveCatalog(catalog.filter((c) => c.id !== productId));
  };

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
      const selectedWorker = initialWorkers.find((w) => String(w.id) === String(formWorkerId));

      if (editingTx) {
        const res = await updateWarungTransactionAction(editingTx.id, {
          worker_id: formWorkerId,
          notes: formNotes || "Kasbon Warung",
          is_direct_nominal: true,
          direct_amount: Number(formAmount),
          paid_amount: Number(formPaidAmount) || 0,
          items: [],
          warung_name: formWarungName,
        } as any);
        if (!res.success) throw new Error(res.error);

        // Update state lokal langsung tanpa reload
        setTransactions((prev) =>
          prev.map((t) =>
            t.id === editingTx.id
              ? {
                  ...t,
                  worker_id: formWorkerId,
                  worker_name: selectedWorker?.name || t.worker_name,
                  worker_code: selectedWorker?.worker_code || t.worker_code,
                  amount: Number(formAmount),
                  paid_amount: Number(formPaidAmount) || 0,
                  remaining_amount: Math.max(0, Number(formAmount) - (Number(formPaidAmount) || 0)),
                  notes: formNotes || "Kasbon Warung",
                  warung_name: formWarungName,
                }
              : t
          )
        );
      } else {
        const res = await createWarungTransactionAction({
          worker_id: formWorkerId,
          notes: formNotes || "Kasbon Warung",
          is_direct_nominal: true,
          direct_amount: Number(formAmount),
          items: [],
          warung_name: formWarungName,
        } as any);
        if (!res.success) throw new Error(res.error);

        // Tambah ke state lokal
        const newTx: WarungTransaction = {
          id: (res as any)?.data?.id ? String((res as any).data.id) : Date.now().toString(),
          worker_id: formWorkerId,
          worker_name: selectedWorker?.name || "Pekerja",
          worker_code: selectedWorker?.worker_code || "-",
          amount: Number(formAmount),
          paid_amount: 0,
          remaining_amount: Number(formAmount),
          notes: formNotes || "Kasbon Warung",
          created_at: new Date().toISOString(),
          status: "AKTIF",
          installments_paid: 0,
          warung_name: formWarungName,
        };
        setTransactions((prev) => [newTx, ...prev]);
      }

      setIsFormOpen(false);
      router.refresh();
    } catch (err: any) {
      alert(err.message || "Gagal menyimpan transaksi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitPayment = async (isFullPay = false) => {
    if (!paymentModalTx) return;
    const currentPaid = Number(paymentModalTx.paid_amount || 0);
    const amount = Number(paymentModalTx.amount || 0);
    const remaining = Math.max(0, amount - currentPaid);

    let targetTotalPaid = 0;
    if (isFullPay) {
      targetTotalPaid = amount;
    } else {
      const bayarNominal = Number(paymentAmountInput) || 0;
      if (bayarNominal <= 0) {
        alert("Masukkan nominal pembayaran yang valid.");
        return;
      }
      if (bayarNominal > remaining) {
        alert("Nominal pembayaran melebihi sisa tagihan.");
        return;
      }
      targetTotalPaid = currentPaid + bayarNominal;
    }

    setIsProcessingPayment(true);
    try {
      const res = await recordWarungPaymentAction(paymentModalTx.id, targetTotalPaid);
      if (!res.success) throw new Error(res.error);

      const isLunas = targetTotalPaid >= amount;
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === paymentModalTx.id
            ? {
                ...t,
                paid_amount: targetTotalPaid,
                remaining_amount: Math.max(0, amount - targetTotalPaid),
                status: isLunas ? "LUNAS" : t.status,
              }
            : t
        )
      );

      setPaymentModalTx(null);
      router.refresh();
    } catch (err: any) {
      alert(err.message || "Gagal memperbarui pembayaran.");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleDelete = async (txId: string) => {
    if (!confirm("Apakah Anda yakin ingin membatalkan/menghapus nota ini?")) return;
    try {
      const res = await deleteWarungTransactionAction(txId);
      if (!res.success) {
        alert(res.error);
        return;
      }

      // Hapus langsung dari state lokal
      setTransactions((prev) => prev.filter((t) => t.id !== txId));
      router.refresh();
    } catch (err: any) {
      alert(err.message || "Gagal membatalkan nota.");
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-24 text-slate-800">
      <div className="max-w-xl mx-auto px-4 pt-3 space-y-3">
        
        {/* HEADER & NAVIGASI ADMIN KARTU MULTI-WARUNG */}
        {isAdmin && selectedWarungFilter !== "ALL" && (
          <button
            onClick={() => setSelectedWarungFilter("ALL")}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-orange-600 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs transition cursor-pointer"
          >
            <ArrowLeftIcon />
            <span>Kembali ke Daftar Semua Warung</span>
          </button>
        )}

        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 block">
              {isAdmin ? "Admin Portal Warung" : "Kasir Warung Mitra"}
            </span>
            <h1 className="text-lg font-black text-slate-900">
              {isAdmin && selectedWarungFilter === "ALL" 
                ? "Daftar Warung Mitra" 
                : (selectedWarungFilter === "ALL" ? currentWarung.name : selectedWarungFilter)}
            </h1>
          </div>

          <button
            onClick={() => handleOpenCreate()}
            className="flex items-center gap-1.5 bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold px-4 py-2 rounded-full text-xs shadow-sm active:scale-95 transition cursor-pointer"
          >
            <PlusIcon />
            <span>Catat Nota Baru</span>
          </button>
        </div>

        {/* TAMPILAN UTAMA ADMIN: DAFTAR KARTU PER WARUNG */}
        {isAdmin && selectedWarungFilter === "ALL" ? (
          <div className="space-y-3 pt-1">
            <p className="text-xs text-slate-500 font-medium">
              Pilih kartu warung di bawah untuk melihat rincian saldo bon per pekerja dan riwayat transaksi:
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {availableWarungs.map((w) => (
                <div
                  key={w.name}
                  onClick={() => setSelectedWarungFilter(w.name)}
                  className="bg-white border-2 border-slate-200 hover:border-orange-500 rounded-2xl p-4 shadow-xs active:scale-[0.99] transition cursor-pointer space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-orange-100 text-orange-700">
                        <StoreIcon />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900 text-sm">{w.name}</h3>
                        <span className="text-[10px] font-semibold text-slate-400">
                          {w.name === "Dandi Store" ? "Warung Utama Admin" : "Mitra Warung Luar"}
                        </span>
                      </div>
                    </div>
                    <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {w.txCount} Nota
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Bon Aktif:</span>
                      <span className="text-base font-black text-[#e11d48]">
                        Rp {w.totalDebt.toLocaleString("id-ID")}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Pekerja:</span>
                      <span className="text-xs font-bold text-slate-700">
                        {w.uniqueWorkers} Orang
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] font-bold text-orange-600 text-right pt-1">
                    Buka Rincian Warung →
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* TAMPILAN RINCIAN WARUNG (DRILL-DOWN: REKAP & TRANSAKSI) */
          <div className="space-y-3">
            
            {/* CARD RINGKASAN TOTAL TAGIHAN & JUMLAH ORANG */}
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs">
              <div className="grid grid-cols-2 gap-3 divide-x divide-slate-100">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Total Sisa Tagihan
                  </span>
                  <div className="text-lg font-black text-[#e11d48] mt-0.5">
                    Rp {warungSummary.totalRemaining.toLocaleString("id-ID")}
                  </div>
                  {warungSummary.totalPaid > 0 && (
                    <span className="text-[10px] text-emerald-600 font-semibold block mt-0.5">
                      ✓ Terbayar: Rp {warungSummary.totalPaid.toLocaleString("id-ID")}
                    </span>
                  )}
                </div>

                <div className="pl-3 flex flex-col justify-center">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Total Pekerja
                  </span>
                  <div className="text-lg font-black text-slate-900 mt-0.5">
                    {warungSummary.totalWorkers} <span className="text-xs font-medium text-slate-500">Orang</span>
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    {warungSummary.totalTransactions} Total Nota Masuk
                  </span>
                </div>
              </div>
            </div>

            {/* Tab Switcher */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setActiveTab("rekap")}
                className={`py-2.5 px-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 text-center shadow-xs cursor-pointer ${
                  activeTab === "rekap"
                    ? "bg-[#ea580c] text-white"
                    : "bg-white text-slate-700 border border-slate-200"
                }`}
              >
                <span>👥 Rekap Saldo Total ({workerBalances.length})</span>
              </button>

              <button
                onClick={() => setActiveTab("transaksi")}
                className={`py-2.5 px-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 text-center shadow-xs cursor-pointer ${
                  activeTab === "transaksi"
                    ? "bg-[#ea580c] text-white"
                    : "bg-white text-slate-700 border border-slate-200"
                }`}
              >
                <span>📋 Riwayat Nota ({filteredTransactions.length})</span>
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
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
                        {transactionCount} Nota Aktif
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 font-medium mt-1">
                      {worker.worker_code} · {worker.role}
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-50">
                      <span className="text-xs text-slate-600 font-normal">Sisa Tagihan:</span>
                      <span className="text-base font-bold text-[#e11d48]">
                        Rp {totalDebt.toLocaleString("id-ID")}
                      </span>
                    </div>

                    <div className="bg-[#fefce8] border border-[#fef08a]/80 text-[#854d0e] text-[11px] py-1.5 px-3 rounded-lg mt-2.5">
                      Otomatis masuk potongan resmi slip gaji bulanan.
                    </div>
                  </div>
                ))}

                {workerBalances.length === 0 && (
                  <div className="text-center py-12 text-slate-400 text-xs bg-white rounded-2xl border border-dashed border-slate-200">
                    Tidak ada pekerja yang memiliki saldo bon aktif saat ini di warung ini.
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: TABEL RIWAYAT TRANSAKSI DENGAN STATUS & PEMBAYARAN */}
            {activeTab === "transaksi" && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-600 font-bold bg-slate-50/50">
                        <th className="py-3 px-3">Warung</th>
                        <th className="py-3 px-2">Menu / Pekerja</th>
                        <th className="py-3 px-2">Total & Status</th>
                        <th className="py-3 px-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTransactions.map((tx) => {
                        const amount = Number(tx.amount || 0);
                        const paid = Number(tx.paid_amount || 0);
                        const remaining = Math.max(0, amount - paid);
                        const isLunas = remaining === 0 || tx.status === "LUNAS";
                        const isPartial = paid > 0 && remaining > 0;

                        return (
                          <tr key={tx.id} className="hover:bg-orange-50/30 transition">
                            <td className="py-3 px-3 font-semibold text-[#b45309] whitespace-nowrap">
                              {tx.warung_name || "Dandi Store"}
                            </td>
                            <td className="py-3 px-2 text-slate-700">
                              <div className="font-medium text-slate-800">{tx.notes}</div>
                              <div className="text-[10px] text-slate-400">{tx.worker_name} ({tx.created_at?.slice(0, 10)})</div>
                            </td>
                            <td className="py-3 px-2 whitespace-nowrap">
                              <div className="font-bold text-slate-900">
                                Rp {amount.toLocaleString("id-ID")}
                              </div>
                              {isLunas ? (
                                <span className="inline-block bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                  LUNAS
                                </span>
                              ) : isPartial ? (
                                <div className="text-[10px]">
                                  <span className="bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded">
                                    SEBAGIAN
                                  </span>
                                  <div className="text-red-600 font-bold mt-0.5">
                                    Sisa: Rp {remaining.toLocaleString("id-ID")}
                                  </div>
                                </div>
                              ) : (
                                <span className="inline-block bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                  BELUM DIBAYAR
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1">
                                {!isLunas && (
                                  <button
                                    onClick={() => handleOpenPayment(tx)}
                                    className="text-emerald-700 font-bold text-xs bg-emerald-50 px-2 py-1 rounded-lg hover:bg-emerald-100 transition cursor-pointer"
                                  >
                                    Bayar
                                  </button>
                                )}
                                <button
                                  onClick={() => handleOpenEdit(tx)}
                                  className="text-[#ea580c] font-bold text-xs bg-orange-50 px-2 py-1 rounded-lg hover:bg-orange-100 transition cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(tx.id)}
                                  className="text-red-600 font-bold text-xs bg-red-50 px-2 py-1 rounded-lg hover:bg-red-100 transition cursor-pointer"
                                >
                                  Hapus
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
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
        )}
      </div>

      {/* MODAL BAYAR / CICIL NOTA */}
      {paymentModalTx && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-4 shadow-2xl space-y-3.5 animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Pembayaran Kasbon Warung</h3>
                <p className="text-[11px] text-slate-500">{paymentModalTx.worker_name} · {paymentModalTx.notes}</p>
              </div>
              <button
                onClick={() => setPaymentModalTx(null)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Total Nota Awal:</span>
                <span className="font-bold text-slate-800">Rp {Number(paymentModalTx.amount || 0).toLocaleString("id-ID")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sudah Dibayar:</span>
                <span className="font-bold text-emerald-600">Rp {Number(paymentModalTx.paid_amount || 0).toLocaleString("id-ID")}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1">
                <span className="font-bold text-slate-700">Sisa Tagihan:</span>
                <span className="font-black text-[#e11d48]">
                  Rp {Math.max(0, Number(paymentModalTx.amount || 0) - Number(paymentModalTx.paid_amount || 0)).toLocaleString("id-ID")}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Jumlah yang Dibayarkan Sekarang (Rp)
              </label>
              <input
                type="number"
                min="1"
                max={Math.max(0, Number(paymentModalTx.amount || 0) - Number(paymentModalTx.paid_amount || 0))}
                value={paymentAmountInput}
                onChange={(e) => setPaymentAmountInput(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-sm font-extrabold text-[#ea580c] focus:ring-1 focus:ring-[#ea580c]"
                placeholder="Masukkan nominal setoran..."
              />
              {Number(paymentAmountInput) > 0 && (
                <div className="text-[11px] text-slate-500 mt-1 flex justify-between">
                  <span>Estimasi Sisa Baru:</span>
                  <span className="font-bold text-slate-800">
                    Rp {Math.max(0, Number(paymentModalTx.amount || 0) - Number(paymentModalTx.paid_amount || 0) - Number(paymentAmountInput)).toLocaleString("id-ID")}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={isProcessingPayment || !paymentAmountInput || Number(paymentAmountInput) <= 0}
                onClick={() => handleSubmitPayment(false)}
                className="w-full bg-[#ea580c] hover:bg-[#c2410c] disabled:opacity-50 text-white font-bold py-2 rounded-xl text-xs transition shadow-sm cursor-pointer"
              >
                {isProcessingPayment ? "Memproses..." : "Simpan Pembayaran Sebagian"}
              </button>

              <button
                type="button"
                disabled={isProcessingPayment}
                onClick={() => handleSubmitPayment(true)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <CheckCircleIcon />
                <span>Bayar Lunas Langsung (Full)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWER / MODAL: RINCIAN RIWAYAT NOTA PEKERJA */}
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
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Rincian Riwayat Nota di {selectedWarungFilter === "ALL" ? currentWarung.name : selectedWarungFilter}
                </p>
              </div>
              <button
                onClick={() => setSelectedWorkerForDetail(null)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-200 transition cursor-pointer"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {(() => {
                const workerTx = activeTransactions.filter((t) => String(t.worker_id) === String(selectedWorkerForDetail.id));
                if (workerTx.length === 0) {
                  return (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      Belum ada nota untuk pekerja ini di warung ini.
                    </div>
                  );
                }

                return workerTx.map((tx) => {
                  const dt = new Date(tx.created_at);
                  const fDate = !isNaN(dt.getTime()) 
                    ? dt.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
                    : tx.created_at;
                  const fTime = !isNaN(dt.getTime())
                    ? dt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB"
                    : "";

                  const amount = Number(tx.amount || 0);
                  const paid = Number(tx.paid_amount || 0);
                  const remaining = Math.max(0, amount - paid);
                  const isLunas = remaining === 0 || tx.status === "LUNAS";

                  return (
                    <div key={tx.id} className="border border-slate-200 rounded-xl p-3 bg-white shadow-xs space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-xs font-semibold text-slate-700 block">
                            {fDate} {fTime ? `• ${fTime}` : ""}
                          </span>
                          <span className="text-[11px] text-slate-500">Keterangan: {tx.notes}</span>
                          <div className="mt-1 flex items-center gap-1.5">
                            {isLunas ? (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                LUNAS
                              </span>
                            ) : paid > 0 ? (
                              <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                Terbayar Sebagian: Rp {paid.toLocaleString("id-ID")}
                              </span>
                            ) : (
                              <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                Belum Dibayar
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-slate-400 block">Total: Rp {amount.toLocaleString("id-ID")}</span>
                          <span className="text-sm font-bold text-[#e11d48]">
                            Sisa: Rp {remaining.toLocaleString("id-ID")}
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-end items-center gap-2 pt-1 border-t border-slate-100">
                        {!isLunas && (
                          <button
                            onClick={() => handleOpenPayment(tx)}
                            className="flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 transition cursor-pointer"
                          >
                            <CheckCircleIcon />
                            <span>Bayar</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(tx)}
                          className="flex items-center gap-1 text-[11px] text-slate-700 hover:text-orange-600 font-semibold px-2.5 py-1 rounded bg-slate-100 hover:bg-orange-50 transition cursor-pointer"
                        >
                          <EditIcon />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(tx.id)}
                          className="flex items-center gap-1 text-[11px] text-red-600 font-semibold px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 transition cursor-pointer"
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
                  handleOpenCreate(wId);
                }}
                className="w-full bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold py-2.5 rounded-xl transition text-xs shadow-md cursor-pointer"
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
                className="p-1 rounded-full text-orange-100 hover:bg-orange-600 transition cursor-pointer"
              >
                <CloseIcon />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="overflow-y-auto p-4 space-y-3.5 flex-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Nama Warung
                </label>
                <input
                  type="text"
                  value={formWarungName}
                  onChange={(e) => setFormWarungName(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-slate-100 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-slate-800 focus:ring-1 focus:ring-[#ea580c]"
                  required
                />
              </div>

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
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200 transition cursor-pointer"
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
                      className="flex items-center justify-between bg-orange-50 border border-orange-200 p-2 rounded-xl text-left hover:bg-orange-100 active:scale-95 transition cursor-pointer"
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
                  Total Nominal Nota (Rp)
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

              {editingTx && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Sudah Dibayar (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={Number(formAmount) || 0}
                    value={formPaidAmount}
                    onChange={(e) => setFormPaidAmount(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl text-xs font-bold text-emerald-600 focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Sisa Tagihan: Rp {Math.max(0, (Number(formAmount) || 0) - (Number(formPaidAmount) || 0)).toLocaleString("id-ID")}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Menu / Keterangan
                </label>
                <input
                  type="text"
                  placeholder="Misal: Kuota, Token, Kasbon, Rokok, dll."
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
                  className="bg-[#ea580c] hover:bg-[#c2410c] disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-md transition active:scale-95 cursor-pointer"
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
                <p className="text-[11px] text-slate-500">Preset kasir khusus warung</p>
              </div>
              <button
                onClick={() => setIsCatalogModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100 cursor-pointer"
              >
                <CloseIcon />
              </button>
            </div>

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
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 rounded-lg text-xs transition cursor-pointer"
              >
                Simpan Produk Baru
              </button>
            </form>

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
                      className="p-1 text-slate-400 hover:text-red-500 rounded cursor-pointer"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setIsCatalogModalOpen(false)}
              className="w-full bg-slate-900 hover:bg-black text-white font-bold py-2 rounded-xl text-xs transition cursor-pointer"
            >
              Selesai & Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
