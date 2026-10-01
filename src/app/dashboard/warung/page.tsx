"use client";

import React, { useState, useTransition } from "react";
import { money } from "@/lib/final/final-utils";

type WarungNote = {
  id: number;
  worker_id: number;
  amount: number;
  paid_amount: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  warung_name: string | null;
  category: string;
};

type WorkerData = {
  id: number;
  worker_code: string;
  name: string;
  pay_system: string;
  department: string | null;
  position: string | null;
};

export default function WarungPage() {
  // State interaktif
  const [workers, setWorkers] = useState<WorkerData[]>([]);
  const [notes, setNotes] = useState<WarungNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterPay, setFilterPay] = useState<"ALL" | "BULANAN" | "HARIAN" | "BORONGAN">("ALL");

  // Modal State
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  const [selectedWorkerForDetail, setSelectedWorkerForDetail] = useState<WorkerData | null>(null);
  const [editingNote, setEditingNote] = useState<WarungNote | null>(null);

  // Form State Tambah / Input
  const [formWorkerId, setFormWorkerId] = useState<number | "">("");
  const [formAmount, setFormAmount] = useState<number | "">("");
  const [formNotes, setFormNotes] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 16));
  const [isPending, startTransition] = useTransition();

  // Load Data awal
  const loadData = async () => {
    try {
      const res = await fetch("/api/warung/data");
      if (res.ok) {
        const json = await res.json();
        setWorkers(json.workers || []);
        setNotes(json.notes || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadData();
  }, []);

  // Perhitungan Data Rekap
  const notesByWorker = new Map<number, WarungNote[]>();
  const activeDebtByWorker = new Map<number, number>();

  for (const n of notes) {
    const list = notesByWorker.get(n.worker_id) || [];
    list.push(n);
    notesByWorker.set(n.worker_id, list);

    if (n.status === "AKTIF") {
      const sisa = Math.max(0, Number(n.amount || 0) - Number(n.paid_amount || 0));
      activeDebtByWorker.set(n.worker_id, (activeDebtByWorker.get(n.worker_id) || 0) + sisa);
    }
  }

  // Filter Pekerja
  const filteredWorkers = workers.filter((w) => {
    const matchSearch =
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.worker_code.toLowerCase().includes(search.toLowerCase());
    const matchPay = filterPay === "ALL" || w.pay_system === filterPay;
    return matchSearch && matchPay;
  });

  const totalTagihanAktif = Array.from(activeDebtByWorker.values()).reduce((a, b) => a + b, 0);
  const activeNotesCount = notes.filter((n) => n.status === "AKTIF").length;
  const lunasNotesCount = notes.filter((n) => n.status === "LUNAS").length;

  // Handler Submit Nota Baru
  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formWorkerId || !formAmount) return;

    startTransition(async () => {
      const res = await fetch("/api/warung/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worker_id: Number(formWorkerId),
          amount: Number(formAmount),
          notes: formNotes,
          created_at: formDate,
          warung_name: "Dandi Store",
        }),
      });

      if (res.ok) {
        setIsInputModalOpen(false);
        setFormAmount("");
        setFormNotes("");
        loadData();
      }
    });
  };

  // Handler Hapus Nota (Hanya jika belum lunas)
  const handleDeleteNote = async (id: number) => {
    if (!confirm("Hapus catatan nota ini?")) return;
    const res = await fetch(`/api/warung/delete?id=${id}`, { method: "DELETE" });
    if (res.ok) loadData();
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-28">
      {/* Header Bar */}
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-blue-600">
              Kasbon & Pinjaman
            </div>
            <h1 className="text-xl font-extrabold text-slate-900">Pusat Kasbon Warung</h1>
            <p className="text-xs text-slate-500">
              Pencatatan nota belanja harian pekerja di Dandi Store.
            </p>
          </div>

          {/* Tombol Input Utama */}
          <button
            onClick={() => {
              setFormWorkerId("");
              setIsInputModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-orange-700 active:scale-95 transition"
          >
            <span>➕</span> Catat Nota Warung Baru
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">Total Transaksi</span>
            <div className="text-xl sm:text-2xl font-black text-slate-800">{notes.length}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">Nota Aktif (Hutang)</span>
            <div className="text-xl sm:text-2xl font-black text-rose-600">{activeNotesCount}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">Nota Lunas Terkunci</span>
            <div className="text-xl sm:text-2xl font-black text-emerald-600">{lunasNotesCount}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs">
            <span className="text-[10px] font-bold uppercase text-slate-400">Total Tagihan Berjalan</span>
            <div className="text-xl sm:text-2xl font-black text-amber-600">
              {money(totalTagihanAktif)}
            </div>
          </div>
        </div>

        {/* Filter & Cari */}
        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between bg-white p-3 rounded-2xl border border-slate-200">
          <input
            type="text"
            placeholder="Cari nama atau kode pekerja..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-blue-500 w-full sm:w-72"
          />

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {(["ALL", "BULANAN", "HARIAN", "BORONGAN"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterPay(mode)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition shrink-0 ${
                  filterPay === mode
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {mode === "ALL" ? "Semua" : mode}
              </button>
            ))}
          </div>
        </div>

        {/* Tabel Rekapitulasi */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-extrabold text-sm text-slate-900">Rekapitulasi Kasbon Warung Pekerja</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Pekerja</th>
                  <th className="px-4 py-3">Sistem Upah</th>
                  <th className="px-4 py-3 text-right">Nota Aktif</th>
                  <th className="px-4 py-3 text-right text-rose-600">Sisa Tagihan (Aktif)</th>
                  <th className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWorkers.map((w) => {
                  const sisaHutang = activeDebtByWorker.get(w.id) || 0;
                  const wNotes = notesByWorker.get(w.id) || [];
                  const activeCount = wNotes.filter((n) => n.status === "AKTIF").length;

                  return (
                    <tr key={w.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{w.name}</div>
                        <div className="text-[10px] text-slate-400">
                          {w.worker_code} • {w.position || "Staff"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                          {w.pay_system}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {activeCount > 0 ? (
                          <span className="font-bold text-rose-600">{activeCount} nota</span>
                        ) : (
                          <span className="text-slate-400">0 nota</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-rose-600">
                        {money(sisaHutang)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setSelectedWorkerForDetail(w)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50"
                        >
                          👁️ Rincian Nota
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL 1: INPUT NOTA WARUNG BARU */}
      {isInputModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-extrabold text-sm text-slate-900">Catat Nota Warung Baru</h3>
              <button onClick={() => setIsInputModalOpen(false)} className="text-slate-400">✕</button>
            </div>

            <form onSubmit={handleCreateNote} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Pilih Pekerja</label>
                <select
                  value={formWorkerId}
                  onChange={(e) => setFormWorkerId(Number(e.target.value))}
                  required
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                >
                  <option value="">-- Pilih Pekerja --</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.worker_code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Nominal Nota (Rp)</label>
                <input
                  type="number"
                  required
                  placeholder="Contoh: 50000"
                  value={formAmount}
                  onChange={(e) => setFormAmount(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Tanggal Transaksi</label>
                <input
                  type="datetime-local"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Keterangan Barang</label>
                <input
                  type="text"
                  placeholder="Kopi, makan siang, rokok..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsInputModalOpen(false)}
                  className="w-1/2 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-600"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-1/2 rounded-xl bg-orange-600 py-2.5 text-xs font-bold text-white hover:bg-orange-700"
                >
                  Simpan Nota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: RINCIAN RIWAYAT NOTA PEKERJA (LUNAS DIKUNCI & SISA RP 0) */}
      {selectedWorkerForDetail && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
          <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">{selectedWorkerForDetail.name}</h3>
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                    {selectedWorkerForDetail.worker_code}
                  </span>
                </div>
                <p className="text-xs text-slate-500">Rincian Riwayat Nota di Dandi Store</p>
              </div>
              <button
                onClick={() => setSelectedWorkerForDetail(null)}
                className="text-slate-400 p-1 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {(notesByWorker.get(selectedWorkerForDetail.id) || []).map((item) => {
                const isLunas = item.status === "LUNAS";
                const sisa = Math.max(0, Number(item.amount || 0) - Number(item.paid_amount || 0));

                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-3 ${
                      isLunas ? "border-emerald-100 bg-slate-50/70" : "border-slate-200 bg-white shadow-2xs"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs font-semibold text-slate-800">
                          {new Date(item.created_at).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Keterangan: {item.notes || "Kasbon Warung"}
                        </div>
                        <div className="mt-1">
                          {isLunas ? (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black text-emerald-800">
                              LUNAS
                            </span>
                          ) : (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                              BELUM LUNAS
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-slate-400">Total: {money(item.amount)}</div>
                        {isLunas ? (
                          <div className="text-xs font-bold text-emerald-600">Sisa: Rp 0 (Lunas)</div>
                        ) : (
                          <div className="text-xs font-bold text-rose-600">Sisa: {money(sisa)}</div>
                        )}
                      </div>
                    </div>

                    {/* Tombol aksi: hanya tampil jika BELUM lunas */}
                    <div className="mt-3 flex items-center justify-end border-t border-slate-100 pt-2">
                      {!isLunas ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDeleteNote(item.id)}
                            className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50"
                          >
                            🗑️ Hapus
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] italic text-slate-400">
                          🔒 Terkunci (Arsip Pembukuan)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-slate-100">
              <button
                onClick={() => {
                  setFormWorkerId(selectedWorkerForDetail.id);
                  setSelectedWorkerForDetail(null);
                  setIsInputModalOpen(true);
                }}
                className="w-full rounded-xl bg-orange-600 py-2.5 text-xs font-bold text-white hover:bg-orange-700"
              >
                + Catat Nota Baru untuk {selectedWorkerForDetail.name}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
