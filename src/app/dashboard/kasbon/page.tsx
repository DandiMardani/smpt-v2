import {
  Badge,
  Card,
  Field,
  Notice,
  PageShell,
  ReadOnly,
  buttonClass,
  inputClass,
  secondaryClass,
} from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { money, n, param, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { addCashAdvanceAction, payCashAdvanceAction } from "@/lib/final/actions";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("kasbon.view");
  const can = a.permissionCodes.includes("kasbon.write");
  const q = await searchParams;
  const s = await createClient();

  const [wr, ar] = await Promise.all([
    s.from("workers").select("id,name,status").eq("status", "AKTIF").order("name"),
    s.from("cash_advances").select("*").order("advance_date", { ascending: false }).limit(500),
  ]);
  const e = [wr.error, ar.error].find(Boolean);
  if (e) throw new Error(e.message);

  const wm = new Map((wr.data ?? []).map((x: any) => [x.id, x]));

  return (
    <PageShell
      eyebrow="SDM & Payroll"
      title="Kasbon"
      description="Saldo Kasbon per pekerja dan histori pembayaran/potongan."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!can ? <ReadOnly /> : null}

      {can ? (
        <Card title="Tambah Kasbon">
          <form action={addCashAdvanceAction} className="grid gap-3 md:grid-cols-4">
            <Field label="Pekerja">
              <select name="worker_id" required className={inputClass}>
                <option value="">Pilih</option>
                {(wr.data ?? []).map((x: any) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Tanggal">
              <input name="advance_date" type="date" required className={inputClass} />
            </Field>
            <Field label="Nominal">
              <input name="amount" type="number" min="1" step="1" required className={inputClass} />
            </Field>
            <Field label="Catatan">
              <input name="notes" className={inputClass} />
            </Field>
            <div className="flex items-end">
              <button className={buttonClass}>Simpan Kasbon</button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title="Kasbon Aktif">
        <div className="space-y-3">
          {(ar.data ?? []).map((x: any) => {
            const rem = n(x.amount) - n(x.paid_amount);
            return (
              <div key={x.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <div>
                    <b className="font-bold text-slate-900 text-sm">
                      {x.advance_code} · {wm.get(x.worker_id)?.name || `#${x.worker_id}`}
                    </b>
                    <span className="ml-2 text-xs font-semibold text-slate-600">
                      <span className="text-rose-600 font-bold">{money(rem)}</span> tersisa dari {money(x.amount)}
                    </span>
                  </div>
                  <Badge>{x.status}</Badge>
                </div>

                {can && x.status === "AKTIF" && rem > 0 ? (
                  <form action={payCashAdvanceAction} className="mt-3 grid gap-2 md:grid-cols-5 border-t border-slate-100 pt-3">
                    <input type="hidden" name="advance_id" value={x.id} />
                    <input name="payment_date" type="date" required className={inputClass} />
                    <input name="amount" type="number" min="1" max={rem} required className={inputClass} placeholder="Nominal" />
                    <select name="source" className={inputClass}>
                      <option value="MANUAL">MANUAL</option>
                      <option value="PAYROLL_HARIAN">PAYROLL HARIAN</option>
                      <option value="PAYROLL_BULANAN">PAYROLL BULANAN</option>
                    </select>
                    <input name="reference" className={inputClass} placeholder="Referensi" />
                    <button className={secondaryClass}>Bayar</button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
    </PageShell>
  );
}
