import {
  Card,
  Field,
  Metric,
  Notice,
  PageShell,
  ReadOnly,
  buttonClass,
  inputClass,
} from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { money, n, param, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { addPettyCashAction } from "@/lib/final/actions";
import { NotaUploadInput } from "./nota-upload-input";
import { ExportKasKecilBar, type PettyCashItem } from "./export-kas-kecil";
import { KasKecilTable } from "./kas-kecil-table";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("kas_kecil.view");
  const can = a.permissionCodes.includes("kas_kecil.write");
  const q = await searchParams;
  const s = await createClient();

  const r = await s
    .from("petty_cash_transactions")
    .select("*")
    .eq("status", "AKTIF")
    .order("transaction_date", { ascending: false })
    .limit(500);

  if (r.error) throw new Error(r.error.message);

  const transactions = (r.data ?? []) as PettyCashItem[];

  const masuk = transactions
    .filter((x) => x.status === "AKTIF" && x.direction === "MASUK")
    .reduce((acc, x) => acc + n(x.amount), 0);

  const keluar = transactions
    .filter((x) => x.status === "AKTIF" && x.direction === "KELUAR")
    .reduce((acc, x) => acc + n(x.amount), 0);

  return (
    <PageShell
      eyebrow="Keuangan"
      title="Kas Kecil"
      description="Pencatatan kas kecil terpisah dari transaksi Keuangan umum."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!can ? <ReadOnly /> : null}

      <div className="grid gap-3 sm:grid-cols-3 mb-4 print:hidden">
        <Metric label="Masuk" value={money(masuk)} />
        <Metric label="Keluar" value={money(keluar)} />
        <Metric label="Saldo" value={money(masuk - keluar)} />
      </div>

      {can ? (
        <Card title="Tambah Transaksi">
          <form action={addPettyCashAction} className="grid gap-3 md:grid-cols-4">
            <Field label="Tanggal">
              <input name="transaction_date" type="date" required className={inputClass} />
            </Field>

            <Field label="Arah">
              <select name="direction" className={inputClass}>
                <option>MASUK</option>
                <option>KELUAR</option>
              </select>
            </Field>

            <Field label="Kategori">
              <input name="category" required className={inputClass} placeholder="Cth: ATK, Konsumsi, Transport" />
            </Field>

            <Field label="Nominal">
              <input name="amount" type="number" min="1" required className={inputClass} />
            </Field>

            <Field label="Deskripsi">
              <input name="description" required className={inputClass} placeholder="Keterangan pengeluaran" />
            </Field>

            <Field label="Dokumen / No. Nota">
              <input name="document_no" className={inputClass} placeholder="Opsional" />
            </Field>

            <div className="md:col-span-2">
              <Field label="Foto Nota / Bukti (Opsional)">
                <NotaUploadInput />
              </Field>
            </div>

            <div className="md:col-span-4 pt-1">
              <button className={buttonClass}>Simpan Transaksi</button>
            </div>
          </form>
        </Card>
      ) : null}

      {/* Komponen Filter Tanggal, Export Excel CSV, & Cetak PDF */}
      <ExportKasKecilBar data={transactions} />

      <Card title="Riwayat">
        <KasKecilTable initialTransactions={transactions} can={can} />
      </Card>
    </PageShell>
  );
}
