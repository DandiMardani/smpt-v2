import {
  Badge,
  Card,
  Empty,
  Field,
  Flow,
  Metric,
  Notice,
  PageShell,
  ReadOnly,
  TableWrap,
  Td,
  Th,
  buttonClass,
  inputClass,
  secondaryClass,
} from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { money, n, param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { addPettyCashAction } from "@/lib/final/actions";
import { NotaUploadInput } from "./nota-upload-input";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("kas_kecil.view");
  const can = a.permissionCodes.includes("kas_kecil.write");
  const q = await searchParams,
    s = await createClient();

  const r = await s
    .from("petty_cash_transactions")
    .select("*")
    .order("transaction_date", { ascending: false })
    .limit(500);

  if (r.error) throw new Error(r.error.message);

  const masuk = (r.data ?? [])
    .filter((x: any) => x.status === "AKTIF" && x.direction === "MASUK")
    .reduce((a: any, x: any) => a + n(x.amount), 0);

  const keluar = (r.data ?? [])
    .filter((x: any) => x.status === "AKTIF" && x.direction === "KELUAR")
    .reduce((a: any, x: any) => a + n(x.amount), 0);

  return (
    <PageShell
      eyebrow="Keuangan"
      title="Kas Kecil"
      description="Pencatatan kas kecil terpisah dari transaksi Keuangan umum."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!can ? <ReadOnly /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
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

      <Card title="Riwayat">
        <TableWrap>
          <thead>
            <tr>
              <Th>Kode</Th>
              <Th>Tanggal</Th>
              <Th>Arah</Th>
              <Th>Kategori</Th>
              <Th>Nominal</Th>
              <Th>Bukti Nota</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {(r.data ?? []).map((x: any) => (
              <tr key={x.id}>
                <Td>{x.transaction_code}</Td>
                <Td>{x.transaction_date}</Td>
                <Td>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      x.direction === "MASUK"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-rose-50 text-rose-700 border border-rose-200"
                    }`}
                  >
                    {x.direction}
                  </span>
                </Td>
                <Td>{x.category}</Td>
                <Td>{money(x.amount)}</Td>
                <Td>
                  {x.receipt_url ? (
                    <a
                      href={x.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 hover:bg-blue-100 transition"
                    >
                      🧾 Lihat
                    </a>
                  ) : (
                    <span className="text-slate-400 text-xs">-</span>
                  )}
                </Td>
                <Td>{x.status}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </PageShell>
  );
}
