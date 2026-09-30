"use client";

import { useState } from "react";
import { Badge, Empty, inputClass, secondaryClass } from "@/components/final/final-ui";
import { money, n } from "@/lib/final/final-utils";
import { payCashAdvanceAction } from "@/lib/final/actions";
import { createClient } from "@/lib/supabase/client";

export type CashAdvanceItem = {
  id: number;
  advance_code: string;
  worker_id: number;
  advance_date: string;
  amount: number | string;
  paid_amount: number | string;
  category?: string | null;
  warung_name?: string | null;
  installment_count?: number | null;
  installment_amount?: number | string | null;
  installments_paid?: number | null;
  status: string;
  notes?: string | null;
};

type WorkerMapItem = {
  id: number;
  name: string;
  pay_system?: string | null;
  department?: string | null;
};

export function KasbonList({
  advances,
  workerMap,
  canWrite,
}: {
  advances: CashAdvanceItem[];
  workerMap: Record<number, WorkerMapItem>;
  canWrite: boolean;
}) {
  const [filterCategory, setFilterCategory] = useState<"ALL" | "KASBON_PERUSAHAAN" | "KASBON_WARUNG">("ALL");
  const [filterStatus, setFilterStatus] = useState<"AKTIF" | "ALL">("AKTIF");
  const [search, setSearch] = useState<string>("");

  // State untuk modal edit skema angsuran
  const [editingAdvance, setEditingAdvance] = useState<CashAdvanceItem | null>(null);
  const [editCount, setEditCount] = useState<number>(1);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  const filtered = advances.filter((x) => {
    const cat = x.category || "KASBON_PERUSAHAAN";
    if (filterCategory !== "ALL" && cat !== filterCategory) return false;
    if (filterStatus === "AKTIF" && x.status !== "AKTIF") return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const wName = (workerMap[x.worker_id]?.name || "").toLowerCase();
      const code = (x.advance_code || "").toLowerCase();
      const warung = (x.warung_name || "").toLowerCase();
      const notes = (x.notes || "").toLowerCase();
      if (!wName.includes(q) && !code.includes(q) && !warung.includes(q) && !notes.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const handleOpenEdit = (adv: CashAdvanceItem) => {
    setEditingAdvance(adv);
    const count = Number(adv.installment_count) || 1;
    setEditCount(count);
    const rem = n(adv.amount) - n(adv.paid_amount);
    const amt = n(adv.installment_amount) || Math.round(rem / Math.max(1, count));
    setEditAmount(amt);
  };

  const handleSaveInstallment = async () => {
    if (!editingAdvance) return;
    setIsUpdating(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("cash_advances")
        .update({
          installment_count: editCount,
          installment_amount: editAmount,
        })
        .eq("id", editingAdvance.id);

      if (error) {
        alert("Gagal memperbarui skema angsuran: " + error.message);
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Modal Edit Skema Angsuran */}
      {editingAdvance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl border border-gray-200">
            <h3 className="text-base font-extrabold text-gray-900">
              Ubah Skema Angsuran Kasbon
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {editingAdvance.advance_code} · {workerMap[editingAdvance.worker_id]?.name}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Jumlah Bulan Angsuran
                </label>
                <select
                  value={editCount}
                  onChange={(e) => {
                    const c = Number(e.target.value);
                    setEditCount(c);
                    const rem = n(editingAdvance.amount) - n(editingAdvance.paid_amount);
                    setEditAmount(Math.round(rem / c));
                  }}
                  className={inputClass}
                >
                  <option value="1">1 Bulan (Sekali Lunas)</option>
                  <option value="2">2 Bulan (2 Kali Potong)</option>
                  <option value="3">3 Bulan (3 Kali Potong)</option>
                  <option value="4">4 Bulan (4 Kali Potong)</option>
                  <option value="5">5 Bulan (5 Kali Potong)</option>
                  <option value="6">6 Bulan (6 Kali Potong)</option>
                  <option value="10">10 Bulan (10 Kali Potong)</option>
                  <option value="12">12 Bulan (1 Tahun)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Nominal Potongan per Bulan (Rp)
                </label>
                <input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(Number(e.target.value))}
                  className={inputClass}
                />
                <span className="text-[10px] text-gray-500 mt-1 block">
                  Nilai ini yang akan otomatis dipotong saat Payroll Bulanan berjalan.
                </span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingAdvance(null)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isUpdating}
                onClick={handleSaveInstallment}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition"
              >
                {isUpdating ? "Menyimpan..." : "Simpan Skema"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50/70 p-3 rounded-2xl border border-gray-200/80">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterCategory("ALL")}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
              filterCategory === "ALL"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            Semua ({advances.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterCategory("KASBON_PERUSAHAAN")}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
              filterCategory === "KASBON_PERUSAHAAN"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            🏢 Kasbon Perusahaan
          </button>
          <button
            type="button"
            onClick={() => setFilterCategory("KASBON_WARUNG")}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
              filterCategory === "KASBON_WARUNG"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
            }`}
          >
            🍜 Kasbon Warung
          </button>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Cari pekerja, kode, warung..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} !py-1.5 !text-xs !w-full sm:!w-64`}
          />
          <button
            type="button"
            onClick={() => setFilterStatus(filterStatus === "AKTIF" ? "ALL" : "AKTIF")}
            className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
              filterStatus === "AKTIF"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-gray-200 bg-white text-gray-600"
            }`}
          >
            {filterStatus === "AKTIF" ? "✓ Hanya Aktif" : "Semua Status"}
          </button>
        </div>
      </div>

      {/* List Content */}
      {filtered.length === 0 ? (
        <Empty>Tidak ada data kasbon yang sesuai filter.</Empty>
      ) : (
        <div className="space-y-3">
          {filtered.map((x) => {
            const rem = n(x.amount) - n(x.paid_amount);
            const isWarung = x.category === "KASBON_WARUNG";
            const instCount = Number(x.installment_count) || 1;
            const instPaid = Number(x.installments_paid) || 0;
            const instAmt = n(x.installment_amount) || (instCount > 1 ? Math.round(n(x.amount) / instCount) : n(x.amount));
            const worker = workerMap[x.worker_id];

            return (
              <div
                key={x.id}
                className={`rounded-2xl border p-4 shadow-2xs transition hover:shadow-xs ${
                  isWarung
                    ? "border-amber-200/90 bg-amber-50/20"
                    : "border-gray-200/90 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <b className="font-extrabold text-gray-900 text-sm">
                        {worker?.name || `Pekerja #${x.worker_id}`}
                      </b>
                      <span className="text-xs text-gray-500">
                        ({worker?.pay_system || "HARIAN"}) · {x.advance_code}
                      </span>
                      {isWarung ? (
                        <span className="inline-flex items-center rounded-lg bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                          🍜 Warung: {x.warung_name || "Warung Luar"}
                        </span>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <span className="inline-flex items-center rounded-lg bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                            🏢 Perusahaan {instCount > 1 ? `· Angsuran ${instCount}x` : "· Sekali Lunas"}
                          </span>
                          {canWrite && x.status === "AKTIF" && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(x)}
                              className="text-[11px] text-blue-600 underline hover:text-blue-800 font-semibold"
                            >
                              ⚙ Atur Angsuran
                            </button>
                          )}
                        </div>
                      )}
                      <Badge>{x.status}</Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                      <span>
                        Tgl Pinjam: <b>{x.advance_date}</b>
                      </span>
                      <span>
                        Total Pinjaman: <b>{money(x.amount)}</b>
                      </span>
                      <span>
                        Sudah Terbayar: <b className="text-emerald-700">{money(x.paid_amount)}</b>
                      </span>
                      <span>
                        Sisa Hutang:{" "}
                        <b className={rem > 0 ? "text-rose-600 font-extrabold text-sm" : "text-emerald-700"}>
                          {money(rem)}
                        </b>
                      </span>
                      {!isWarung && instCount > 1 && rem > 0 && (
                        <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded font-semibold">
                          Potongan Gaji: <b>{money(instAmt)} / bln</b>
                        </span>
                      )}
                    </div>

                    {x.notes && (
                      <p className="mt-1.5 text-xs text-gray-500 italic bg-white/70 px-2.5 py-1 rounded-lg border border-gray-100">
                        Catatan: {x.notes}
                      </p>
                    )}
                  </div>

                  {/* Progress Indicator for Installments */}
                  {!isWarung && instCount > 1 && (
                    <div className="text-right min-w-36 bg-gray-50 p-2.5 rounded-xl border border-gray-100 text-xs">
                      <div className="text-[11px] font-semibold text-gray-700 mb-1">
                        Angsuran {instCount} Bulan
                      </div>
                      <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-600 h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, Math.round((n(x.paid_amount) / Math.max(1, n(x.amount))) * 100))}%`,
                          }}
                        />
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">
                        Terbayar {money(x.paid_amount)} dari {money(x.amount)}
                      </div>
                    </div>
                  )}
                </div>

                {/* Inline Payment Form */}
                {canWrite && x.status === "AKTIF" && rem > 0 && (
                  <form
                    action={payCashAdvanceAction}
                    className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-5 border-t border-gray-100 pt-3"
                  >
                    <input type="hidden" name="advance_id" value={x.id} />
                    <div>
                      <input
                        name="payment_date"
                        type="date"
                        required
                        defaultValue={new Date().toISOString().slice(0, 10)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <input
                        name="amount"
                        type="number"
                        min="1"
                        max={rem}
                        required
                        defaultValue={!isWarung && instCount > 1 ? Math.min(rem, instAmt) : rem}
                        className={inputClass}
                        placeholder="Nominal Bayar"
                      />
                    </div>
                    <div>
                      <select name="source" className={inputClass}>
                        <option value="MANUAL">MANUAL (KASIR)</option>
                        <option value="PAYROLL_BULANAN">POTONG PAYROLL BULANAN</option>
                        <option value="PAYROLL_HARIAN">POTONG PAYROLL HARIAN</option>
                      </select>
                    </div>
                    <div>
                      <input
                        name="reference"
                        className={inputClass}
                        placeholder="Ref (No. Slip / Bukti)"
                      />
                    </div>
                    <div>
                      <button className={`${secondaryClass} w-full !h-10`}>
                        Bayar / Potong
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
