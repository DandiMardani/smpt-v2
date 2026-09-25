"use client";

import { useState, useEffect } from "react";
import { Badge, Empty, Field, buttonClass, inputClass } from "@/components/final/final-ui";
import { CurrencyNumberInput } from "@/components/forms/currency-number-input";
import { money, n } from "@/lib/final/final-utils";
import { recordWarungDebtAction } from "@/lib/final/actions";

type WorkerItem = {
  id: number;
  worker_code: string;
  name: string;
  pay_system?: string | null;
  department?: string | null;
};

type WarungItem = {
  id: number;
  advance_code: string;
  worker_id: number;
  advance_date: string;
  amount: number | string;
  paid_amount: number | string;
  warung_name?: string | null;
  status: string;
  notes?: string | null;
};

export function WarungPortal({
  workers,
  transactions,
  canWrite,
}: {
  workers: WorkerItem[];
  transactions: WarungItem[];
  canWrite: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"REKAP" | "TRANSAKSI">("REKAP");
  const [search, setSearch] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [warungName, setWarungName] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("smpt_warung_name");
      if (saved) setWarungName(saved);
    }
  }, []);

  const workerMap = new Map(workers.map((w) => [w.id, w]));

  // Aggregate outstanding debt per worker
  const debtByWorker = new Map<number, { totalUnpaid: number; txCount: number; lastDate: string }>();

  for (const tx of transactions) {
    if (tx.status === "AKTIF") {
      const rem = n(tx.amount) - n(tx.paid_amount);
      if (rem > 0) {
        const cur = debtByWorker.get(tx.worker_id) || { totalUnpaid: 0, txCount: 0, lastDate: tx.advance_date };
        cur.totalUnpaid += rem;
        cur.txCount += 1;
        debtByWorker.set(tx.worker_id, cur);
      }
    }
  }

  // Convert to sorted array
  const workerRecapList = Array.from(debtByWorker.entries())
    .map(([workerId, data]) => {
      const w = workerMap.get(workerId);
      return {
        workerId,
        workerName: w?.name || `Pekerja #${workerId}`,
        workerCode: w?.worker_code || "-",
        department: w?.department || "-",
        paySystem: w?.pay_system || "HARIAN",
        totalUnpaid: data.totalUnpaid,
        txCount: data.txCount,
        lastDate: data.lastDate,
      };
    })
    .filter((row) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        row.workerName.toLowerCase().includes(q) ||
        row.workerCode.toLowerCase().includes(q) ||
        row.department.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => b.totalUnpaid - a.totalUnpaid);

  // Filter transactions
  const filteredTx = transactions.filter((tx) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const w = workerMap.get(tx.worker_id);
    return (
      (w?.name || "").toLowerCase().includes(q) ||
      (tx.advance_code || "").toLowerCase().includes(q) ||
      (tx.warung_name || "").toLowerCase().includes(q) ||
      (tx.notes || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Form Input Hutang Harian untuk Pemilik Warung */}
      {canWrite && (
        <section className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-5 shadow-xs sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🍜</span>
            <h2 className="text-base font-extrabold text-amber-950">
              Catat Hutang Makan / Belanja Pekerja Hari Ini
            </h2>
          </div>

          <form action={recordWarungDebtAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Pilih Pekerja yang Berhutang">
                <select name="worker_id" required className={`${inputClass} !bg-white`}>
                  <option value="">{workers.length === 0 ? "-- Belum ada pekerja (eksekusi SQL migrasi) --" : "-- Pilih Nama Pekerja --"}</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.department || "Produksi"} · {w.pay_system || "HARIAN"})
                    </option>
                  ))}
                </select>
                {workers.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-700 font-medium">
                    ⚠️ Daftar nama pekerja masih kosong karena Supabase RLS membatasi akses role Warung. Jalankan skrip SQL migrasi terbaru di Supabase SQL Editor untuk membuka akses.
                  </p>
                ) : null}
              </Field>

              <Field label="Tanggal Transaksi">
                <input
                  name="advance_date"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className={`${inputClass} !bg-white`}
                />
              </Field>

              <Field label="Nama Warung Anda">
                <input
                  name="warung_name"
                  required
                  value={warungName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setWarungName(v);
                    if (typeof window !== "undefined") {
                      localStorage.setItem("smpt_warung_name", v);
                    }
                  }}
                  placeholder="Ketik nama warung Anda"
                  className={`${inputClass} !bg-white`}
                />
                <span className="mt-1 block text-[11px] text-amber-800 font-medium">
                  Cukup isi 1 kali, otomatis tersimpan untuk seterusnya.
                </span>
              </Field>

              <Field label="Nominal Hutang (Rp)">
                <CurrencyNumberInput
                  name="amount"
                  value={amount}
                  onChange={(val) => setAmount(val ? String(val) : "")}
                  placeholder="Contoh: 25000"
                  required
                  className={`${inputClass} !bg-white font-bold text-gray-900`}
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 items-end">
              <div className="sm:col-span-2">
                <Field label="Catatan Menu / Barang yang Dibeli">
                  <input
                    name="notes"
                    placeholder="Contoh: Nasi rames, telur dadar, es teh, rokok 1 bungkus"
                    className={`${inputClass} !bg-white`}
                  />
                </Field>
              </div>

              <div>
                <button
                  type="submit"
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-xs transition hover:bg-amber-700 active:bg-amber-800"
                >
                  ✓ Simpan Catatan Hutang
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {/* Tabs & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("REKAP")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "REKAP"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            👥 Rekap Saldo Total per Orang ({workerRecapList.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("TRANSAKSI")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "TRANSAKSI"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            📋 Riwayat Transaksi Harian ({transactions.length})
          </button>
        </div>

        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="Cari nama pekerja / menu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} !py-1.5 !text-xs`}
          />
        </div>
      </div>

      {/* TAB 1: REKAP SALDO PER ORANG */}
      {activeTab === "REKAP" && (
        <div className="space-y-3">
          {workerRecapList.length === 0 ? (
            <Empty>Tidak ada data pekerja yang memiliki hutang warung aktif saat ini.</Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {workerRecapList.map((item) => (
                <div
                  key={item.workerId}
                  className="rounded-2xl border border-amber-200/90 bg-white p-4 shadow-2xs transition hover:shadow-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">{item.workerName}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {item.workerCode} · {item.department} ({item.paySystem})
                      </p>
                    </div>
                    <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                      {item.txCount} Nota
                    </span>
                  </div>

                  <div className="mt-4 border-t border-gray-100 pt-3 flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-gray-500">Total Tagihan:</span>
                    <span className="text-lg font-extrabold text-rose-600">
                      {money(item.totalUnpaid)}
                    </span>
                  </div>

                  <div className="mt-2 text-[11px] text-amber-700 font-medium bg-amber-50/80 px-2.5 py-1 rounded-lg">
                    Otomatis masuk potongan slip gaji pada payroll berikutnya.
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RIWAYAT TRANSAKSI */}
      {activeTab === "TRANSAKSI" && (
        <div className="space-y-2">
          {filteredTx.length === 0 ? (
            <Empty>Belum ada histori transaksi hutang warung.</Empty>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50/80 border-b border-gray-200 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 font-bold">Tanggal</th>
                    <th className="px-4 py-3 font-bold">Kode</th>
                    <th className="px-4 py-3 font-bold">Nama Pekerja</th>
                    <th className="px-4 py-3 font-bold">Warung</th>
                    <th className="px-4 py-3 font-bold">Menu / Keterangan</th>
                    <th className="px-4 py-3 font-bold text-right">Nominal</th>
                    <th className="px-4 py-3 font-bold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredTx.map((tx) => {
                    const w = workerMap.get(tx.worker_id);
                    const isPaid = tx.status === "LUNAS";
                    return (
                      <tr key={tx.id} className="hover:bg-amber-50/20 transition">
                        <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                          {tx.advance_date}
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {tx.advance_code}
                        </td>
                        <td className="px-4 py-3 font-bold text-gray-900">
                          {w?.name || `Pekerja #${tx.worker_id}`}
                        </td>
                        <td className="px-4 py-3 text-amber-800 font-medium">
                          {tx.warung_name || "Warung Luar"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                          {tx.notes || "-"}
                        </td>
                        <td className="px-4 py-3 font-extrabold text-right text-gray-900 whitespace-nowrap">
                          {money(tx.amount)}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                              isPaid
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {isPaid ? "LUNAS (DIPOTONG GAJI)" : "BELUM LUNAS"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
