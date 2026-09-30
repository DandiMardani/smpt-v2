"use client";

import { useState } from "react";
import { Field, buttonClass, inputClass } from "@/components/final/final-ui";
import { CurrencyNumberInput } from "@/components/forms/currency-number-input";
import { money } from "@/lib/final/final-utils";
import { addCashAdvanceAction } from "@/lib/final/actions";
import Link from "next/link";

type WorkerItem = {
  id: number;
  name: string;
  pay_system?: string | null;
  department?: string | null;
};

export function KasbonForm({ workers }: { workers: WorkerItem[] }) {
  const [amount, setAmount] = useState<number>(0);
  const [installments, setInstallments] = useState<number>(1);
  const [customInstallment, setCustomInstallment] = useState<number>(0);
  const [useCustomInstallment, setUseCustomInstallment] = useState<boolean>(false);

  const autoMonthly = installments > 0 ? Math.round(amount / installments) : amount;
  const effectiveMonthly = useCustomInstallment && customInstallment > 0 ? customInstallment : autoMonthly;

  return (
    <form action={addCashAdvanceAction} className="space-y-4">
      {/* Banner Khusus Kasbon Pinjaman Kantor */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="text-base">🏢</span>
          <div>
            <b>Form Khusus: Kasbon Pinjaman Internal Perusahaan</b>
            <p className="text-blue-700 mt-0.5">
              Mendukung skema Sekali Lunas maupun Cicilan / Angsuran potong payroll bulanan.
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
      {/* Field krusial: Kirim nominal angsuran per bulan ke server */}
      <input type="hidden" name="installment_amount" value={effectiveMonthly} />

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

        <Field label="Tanggal Pinjam">
          <input
            name="advance_date"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </Field>

        <Field label="Nominal Pinjaman Total (Rp)">
          <CurrencyNumberInput
            name="amount"
            value={amount}
            onChange={(val) => {
              setAmount(val);
              if (installments > 1 && !useCustomInstallment) {
                setCustomInstallment(Math.round(val / installments));
              }
            }}
            min={1000}
            required
            placeholder="Contoh: 1000000"
            className={inputClass}
          />
        </Field>

        <Field label="Skema Angsuran / Cicilan">
          <select
            name="installment_count"
            value={installments}
            onChange={(e) => {
              const val = Number(e.target.value);
              setInstallments(val);
              if (val === 1) {
                setUseCustomInstallment(false);
              }
            }}
            className={inputClass}
          >
            <option value="1">1 Bulan (Sekali Potong / Langsung Lunas)</option>
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

      {/* Opsi Custom Plafon Potongan Bulanan */}
      {installments > 1 && (
        <div className="grid gap-3 sm:grid-cols-2 bg-blue-50/40 p-3 rounded-xl border border-blue-100">
          <div>
            <label className="text-xs font-bold text-blue-900 block mb-1">
              Nominal Potongan Gaji Tiap Bulan
            </label>
            <div className="flex items-center gap-2">
              <CurrencyNumberInput
                value={effectiveMonthly}
                onChange={(val) => {
                  setCustomInstallment(val);
                  setUseCustomInstallment(true);
                }}
                min={1000}
                max={amount}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => {
                  setUseCustomInstallment(false);
                  setCustomInstallment(autoMonthly);
                }}
                className="text-[11px] whitespace-nowrap text-blue-600 underline hover:text-blue-800"
              >
                Reset Rata
              </button>
            </div>
            <span className="text-[10px] text-gray-500 mt-1 block">
              Nilai ini yang otomatis memotong slip gaji bulanan setiap akhir bulan.
            </span>
          </div>

          <div className="flex items-center justify-end text-xs text-blue-900">
            <div className="bg-white p-2.5 rounded-lg border border-blue-200 shadow-2xs w-full sm:w-auto">
              <div>Total Pinjaman: <b>{money(amount)}</b></div>
              <div>Rencana Angsuran: <b>{installments} kali</b></div>
              <div className="text-blue-700 font-bold mt-0.5">
                Potongan Rutin: {money(effectiveMonthly)} / bulan
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3 items-end">
        <div className="sm:col-span-2">
          <Field label="Catatan / Keperluan Pinjaman">
            <input
              name="notes"
              placeholder="Contoh: Pinjaman renovasi rumah / keperluan mendesak"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="flex items-center">
          <button type="submit" className={`${buttonClass} w-full`}>
            Simpan Kasbon Perusahaan
          </button>
        </div>
      </div>
    </form>
  );
}
