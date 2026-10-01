"use client";

import { useState } from "react";
import {
  updateBulananItemAction,
  verifyBulananPaymentAction,
  revertBulananPaymentAction,
} from "@/app/dashboard/payroll/actions";

export type BulananItem = {
  id: number;
  payroll_run_id: number;
  worker_id: number;
  worker_name: string;
  worker_code: string;
  base_amount: number;
  overtime_amount: number;
  gross_amount: number;
  kasbon_perusahaan_amount: number;
  kasbon_warung_amount: number;
  deduction_amount: number;
  net_amount: number;
  payment_status?: string;
};

type Props = {
  runCode: string;
  runId: number;
  periodStart: string;
  periodEnd: string;
  items: BulananItem[];
  canWrite: boolean;
};

function formatRupiah(num: number) {
  return "Rp " + Math.round(num).toLocaleString("id-ID");
}

export default function BulananTableEditor({
  runCode,
  runId,
  periodStart,
  periodEnd,
  items,
  canWrite,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingItem, setEditingItem] = useState<BulananItem | null>(null);
  const [loading, setLoading] = useState(false);

  // Perhitungan total murni kolom footer
  const totalBase = items.reduce((acc, i) => acc + i.base_amount, 0);
  const totalOvertime = items.reduce((acc, i) => acc + i.overtime_amount, 0);
  const totalGross = items.reduce((acc, i) => acc + i.gross_amount, 0);
  const totalKasbonP = items.reduce((acc, i) => acc + i.kasbon_perusahaan_amount, 0);
  const totalKasbonW = items.reduce((acc, i) => acc + i.kasbon_warung_amount, 0);
  const totalDeduction = items.reduce((acc, i) => acc + i.deduction_amount, 0);
  const totalNet = items.reduce((acc, i) => acc + i.net_amount, 0);

  const allSelected = items.length > 0 && selectedIds.length === items.length;

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((i) => i.id));
    }
  }

  function toggleSelectRow(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleVerify(idsToVerify: number[]) {
    if (!confirm(`Verifikasi ${idsToVerify.length} pekerja ini sebagai SUDAH DIBAYAR / LUNAS? Kasbon warung dan angsuran pinjaman akan otomatis diperbarui.`)) {
      return;
    }
    setLoading(true);
    try {
      await verifyBulananPaymentAction(idsToVerify, runId);
      setSelectedIds((prev) => prev.filter((id) => !idsToVerify.includes(id)));
    } catch (err: any) {
      alert(err.message || "Gagal verifikasi pembayaran.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevert(id: number) {
    if (!confirm("Batalkan status lunas pekerja ini? Data akan kembali bisa diedit.")) return;
    setLoading(true);
    try {
      await revertBulananPaymentAction(id, runId);
    } catch (err: any) {
      alert(err.message || "Gagal mengubah status.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingItem) return;
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    try {
      await updateBulananItemAction(formData);
      setEditingItem(null);
    } catch (err: any) {
      alert(err.message || "Gagal menyimpan perubahan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm space-y-3.5">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-blue-600 px-2 py-0.5 text-xs font-black text-white">
              {runCode}
            </span>
            <h2 className="text-base font-extrabold text-slate-900">
              Rekapitulasi Gaji Karyawan Bulanan
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Periode: <b>{periodStart} s/d {periodEnd}</b> — Rincian murni: Gaji Pokok + Lembur dikurangi Kasbon Kantor & Kasbon Warung.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {canWrite && selectedIds.length > 0 && (
            <button
              type="button"
              disabled={loading}
              onClick={() => handleVerify(selectedIds)}
              className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 active:scale-95 transition disabled:opacity-60"
            >
              ✅ Tandai {selectedIds.length} Terpilih Lunas
            </button>
          )}

          <div className="text-right">
            <div className="text-[10px] uppercase font-bold text-slate-400">Total Cair Bersih</div>
            <div className="text-lg font-black text-emerald-600">{formatRupiah(totalNet)}</div>
          </div>
        </div>
      </div>

      {/* Tabel */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-600 border-b border-slate-200">
            <tr>
              {canWrite && (
                <th className="px-2.5 py-2.5 text-center w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
              )}
              <th className="px-3 py-2.5">Pekerja</th>
              <th className="px-3 py-2.5 text-right">Gaji Pokok</th>
              <th className="px-3 py-2.5 text-right">Lembur</th>
              <th className="px-3 py-2.5 text-right bg-blue-50/50">Total Bruto</th>
              <th className="px-3 py-2.5 text-right text-rose-600">Kasbon Kantor</th>
              <th className="px-3 py-2.5 text-right text-amber-600">Kasbon Warung</th>
              <th className="px-3 py-2.5 text-right text-rose-700 bg-rose-50/50">Tot. Potongan</th>
              <th className="px-3 py-2.5 text-right bg-emerald-50 text-emerald-700 font-black">Gaji Bersih (THP)</th>
              <th className="px-3 py-2.5 text-center">Status</th>
              {canWrite && <th className="px-3 py-2.5 text-center">Aksi</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const isPaid = item.payment_status === "PAID";
              const isChecked = selectedIds.includes(item.id);

              return (
                <tr key={item.id} className={`transition ${isPaid ? "bg-emerald-50/20" : "hover:bg-slate-50/80"}`}>
                  {canWrite && (
                    <td className="px-2.5 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelectRow(item.id)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                  )}
                  <td className="px-3 py-2.5 font-bold text-slate-900">
                    <div>{item.worker_name}</div>
                    <div className="text-[10px] font-normal text-slate-400">{item.worker_code}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium">{formatRupiah(item.base_amount)}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-600">{formatRupiah(item.overtime_amount)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-slate-900 bg-blue-50/30">{formatRupiah(item.gross_amount)}</td>
                  <td className="px-3 py-2.5 text-right text-rose-600 font-medium">{formatRupiah(item.kasbon_perusahaan_amount)}</td>
                  <td className="px-3 py-2.5 text-right text-amber-600 font-medium">{formatRupiah(item.kasbon_warung_amount)}</td>
                  <td className="px-3 py-2.5 text-right text-rose-700 font-bold bg-rose-50/30">{formatRupiah(item.deduction_amount)}</td>
                  <td className="px-3 py-2.5 text-right font-black text-emerald-700 bg-emerald-50/60 text-sm">
                    {formatRupiah(item.net_amount)}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {isPaid ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-800">
                        LUNAS
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        BELUM DIBAYAR
                      </span>
                    )}
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2.5 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        {!isPaid ? (
                          <>
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => setEditingItem(item)}
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 shadow-2xs hover:bg-slate-100 active:scale-95"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => handleVerify([item.id])}
                              className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white shadow-2xs hover:bg-emerald-700 active:scale-95"
                            >
                              Bayar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => handleRevert(item.id)}
                            className="rounded-lg border border-rose-300 bg-white px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50 active:scale-95"
                          >
                            Batal Lunas
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>

          {/* TOTAL FOOTER DI SEMUA KOLOM */}
          <tfoot className="bg-slate-100/90 font-black text-slate-900 border-t-2 border-slate-300">
            <tr>
              {canWrite && <td></td>}
              <td className="px-3 py-3 uppercase text-[11px] tracking-wider text-slate-600">
                TOTAL ({items.length} Pekerja)
              </td>
              <td className="px-3 py-3 text-right">{formatRupiah(totalBase)}</td>
              <td className="px-3 py-3 text-right text-slate-700">{formatRupiah(totalOvertime)}</td>
              <td className="px-3 py-3 text-right bg-blue-100/60 text-blue-900">{formatRupiah(totalGross)}</td>
              <td className="px-3 py-3 text-right text-rose-700">{formatRupiah(totalKasbonP)}</td>
              <td className="px-3 py-3 text-right text-amber-700">{formatRupiah(totalKasbonW)}</td>
              <td className="px-3 py-3 text-right text-rose-800 bg-rose-100/60">{formatRupiah(totalDeduction)}</td>
              <td className="px-3 py-3 text-right bg-emerald-100 text-emerald-800 text-sm">
                {formatRupiah(totalNet)}
              </td>
              <td></td>
              {canWrite && <td></td>}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Modal Edit Koreksi */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="mb-4 border-b border-slate-100 pb-3">
              <span className="text-xs font-bold uppercase text-blue-600">Koreksi Payroll Bulanan</span>
              <h3 className="text-lg font-black text-slate-900">{editingItem.worker_name}</h3>
              <p className="text-xs text-slate-400">Kode: {editingItem.worker_code}</p>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <input type="hidden" name="item_id" value={editingItem.id} />
              <input type="hidden" name="run_id" value={runId} />

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Gaji Pokok</label>
                <input
                  name="base_amount"
                  type="number"
                  defaultValue={editingItem.base_amount}
                  required
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nominal Lembur</label>
                <input
                  name="overtime_amount"
                  type="number"
                  defaultValue={editingItem.overtime_amount}
                  required
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-rose-700 mb-1">Kasbon Kantor</label>
                  <input
                    name="kasbon_perusahaan_amount"
                    type="number"
                    defaultValue={editingItem.kasbon_perusahaan_amount}
                    required
                    className="w-full rounded-xl border border-rose-200 bg-rose-50/30 px-3 py-2 text-sm text-slate-900 focus:border-rose-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-700 mb-1">Kasbon Warung</label>
                  <input
                    name="kasbon_warung_amount"
                    type="number"
                    defaultValue={editingItem.kasbon_warung_amount}
                    required
                    className="w-full rounded-xl border border-amber-200 bg-amber-50/30 px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  disabled={loading}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition disabled:opacity-60"
                >
                  {loading ? "Menyimpan..." : "Simpan Koreksi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
