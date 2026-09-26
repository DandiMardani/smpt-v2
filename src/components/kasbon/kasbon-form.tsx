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

import Link from "next/link";

export function KasbonForm({ workers }: { workers: WorkerItem[] }) {
  const [amount, setAmount] = useState<number>(0);
  const [installments, setInstallments] = useState<number>(1);

  const monthlyInstallment = installments > 0 ? Math.round(amount / installments) : amount;

  return (
    <form action={addCashAdvanceAction} className="space-y-4">
      {/* Banner Pencegahan Double Input */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="text-base">🏢</span>
          <div>
            <b>Form Khusus: Kasbon Pinjaman Internal Perusahaan</b>
            <p className="text-blue-700 mt-0.5">
              Form ini khusus pinjaman dana kantor (dengan skema cicilan bulanan).
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/warung"
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 font-bold text-amber-900 hover:bg-amber-100 transition shadow-2xs text-[11px]"
        >
          🍜 Catat Bon Makan di Portal Warung ➔
        </Link>
      </div>

      <input type="hidden" name="category" value="KASBON_PERUSAHAAN" />

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

        <Field label="Jumlah Angsuran (Bulan)">
          <select
            name="installment_count"
            value={installments}
            onChange={(e) => setInstallments(Number(e.target.value))}
            className={inputClass}
          >
            <option value="1">1 Bulan (Langsung Lunas Bulan Ini)</option>
            <option value="2">2 Bulan (2 Kali Potong Gaji)</option>
            <option value="3">3 Bulan (3 Kali Potong Gaji)</option>
            <option value="4">4 Bulan (4 Kali Potong Gaji)</option>
            <option value="5">5 Bulan (5 Kali Potong Gaji)</option>
            <option value="6">6 Bulan (6 Kali Potong Gaji)</option>
            <option value="10">10 Bulan (10 Kali Potong Gaji)</option>
            <option value="12">12 Bulan (1 Tahun)</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 items-end">
        <div className="sm:col-span-2">
          <Field label="Catatan / Keperluan Pinjaman">
            <input
              name="notes"
              placeholder="Contoh: Pinjaman renovasi rumah / pendidikan / keperluan mendesak"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="flex items-center">
          <button type="submit" className={`${buttonClass} w-full sm:w-auto`}>
            Simpan Kasbon Perusahaan
          </button>
        </div>
      </div>

      {/* Dynamic Info Box */}
      {amount > 0 && installments > 1 && (
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
    </form>
  );
}
