"use client";

import { useState } from "react";
import { Field, buttonClass, inputClass } from "@/components/final/final-ui";
import { CurrencyNumberInput } from "@/components/forms/currency-number-input";
import { money } from "@/lib/final/final-utils";
import { addCashAdvanceAction } from "@/lib/final/actions";

type WorkerItem = {
  id: number;
  name: string;
  pay_system?: string | null;
  department?: string | null;
};

export function KasbonForm({ workers }: { workers: WorkerItem[] }) {
  const [category, setCategory] = useState<"KASBON_PERUSAHAAN" | "KASBON_WARUNG">("KASBON_PERUSAHAAN");
  const [amount, setAmount] = useState<number>(0);
  const [installments, setInstallments] = useState<number>(1);
  const [warungName, setWarungName] = useState<string>("Warung Bu Siti");

  const monthlyInstallment = installments > 0 ? Math.round(amount / installments) : amount;

  return (
    <form action={addCashAdvanceAction} className="space-y-4">
      {/* Category selector */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2">Kategori Kasbon</label>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <button
            type="button"
            onClick={() => setCategory("KASBON_PERUSAHAAN")}
            className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition ${
              category === "KASBON_PERUSAHAAN"
                ? "border-blue-600 bg-blue-50 text-blue-700 shadow-xs"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            🏢 Kasbon Perusahaan
          </button>
          <button
            type="button"
            onClick={() => setCategory("KASBON_WARUNG")}
            className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition ${
              category === "KASBON_WARUNG"
                ? "border-amber-600 bg-amber-50 text-amber-800 shadow-xs"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            🍜 Kasbon Warung Luar
          </button>
        </div>
        <input type="hidden" name="category" value={category} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Pekerja">
          <select name="worker_id" required className={inputClass}>
            <option value="">-- Pilih Pekerja --</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.pay_system || "HARIAN"}{w.department ? ` · ${w.department}` : ""})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tanggal">
          <input
            name="advance_date"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </Field>

        <Field label="Nominal Total (Rp)">
          <CurrencyNumberInput
            name="amount"
            value={amount}
            onChange={(val) => setAmount(val)}
            min={1000}
            required
            placeholder="Contoh: 3000000"
            className={inputClass}
          />
        </Field>

        {category === "KASBON_PERUSAHAAN" ? (
          <Field label="Jumlah Angsuran (Bulan)">
            <select
              name="installment_count"
              value={installments}
              onChange={(e) => setInstallments(Number(e.target.value))}
              className={inputClass}
            >
              <option value="1">1 Bulan (Langsung Lunas)</option>
              <option value="2">2 Bulan (2 Kali Potong)</option>
              <option value="3">3 Bulan (3 Kali Potong)</option>
              <option value="4">4 Bulan (4 Kali Potong)</option>
              <option value="5">5 Bulan (5 Kali Potong)</option>
              <option value="6">6 Bulan (6 Kali Potong)</option>
              <option value="10">10 Bulan (10 Kali Potong)</option>
              <option value="12">12 Bulan (1 Tahun)</option>
            </select>
          </Field>
        ) : (
          <Field label="Nama Warung Mitra">
            <input
              name="warung_name"
              required
              value={warungName}
              onChange={(e) => setWarungName(e.target.value)}
              placeholder="Contoh: Warung Bu Siti"
              className={inputClass}
            />
          </Field>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3 items-end">
        <div className="sm:col-span-2">
          <Field label={category === "KASBON_PERUSAHAAN" ? "Catatan / Keperluan Pinjaman" : "Rincian Makanan / Belanja"}>
            <input
              name="notes"
              placeholder={
                category === "KASBON_PERUSAHAAN"
                  ? "Contoh: Pinjaman renovasi rumah / pendidikan"
                  : "Contoh: Nasi padang + es teh 3 porsi"
              }
              className={inputClass}
            />
          </Field>
        </div>

        <div className="flex items-center">
          <button type="submit" className={`${buttonClass} w-full sm:w-auto`}>
            Simpan {category === "KASBON_PERUSAHAAN" ? "Kasbon Perusahaan" : "Hutang Warung"}
          </button>
        </div>
      </div>

      {/* Dynamic Info Box */}
      {category === "KASBON_PERUSAHAAN" && amount > 0 && installments > 1 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-xs text-blue-900 flex items-center justify-between">
          <div>
            <b>Skema Angsuran:</b> Pinjaman {money(amount)} dicicil {installments} kali.
            <div className="text-blue-700 mt-0.5 font-medium">
              Dipotong otomatis setiap bulan gajian sebesar <span className="font-bold underline text-blue-900">{money(monthlyInstallment)} / bulan</span>.
            </div>
          </div>
          <div className="text-right font-bold text-sm text-blue-800">
            {money(monthlyInstallment)}/bln
          </div>
        </div>
      )}

      {category === "KASBON_WARUNG" && amount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900">
          <b>Pencatatan Warung Mitra:</b> Tagihan sebesar {money(amount)} di {warungName || "Warung Luar"} akan otomatis dipotong dari slip gaji pekerja pada payroll berikutnya tanpa perlu rekap manual lagi.
        </div>
      )}
    </form>
  );
}
