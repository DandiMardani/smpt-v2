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
import { param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { createEmbarkationIssueAction, resolveEmbarkationIssueAction } from "@/lib/final/actions";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("reject_embarkasi.view");
  const can = a.permissionCodes.includes("reject_embarkasi.write");
  const q = await searchParams;
  const s = await createClient();

  const [sr, ir] = await Promise.all([
    s.from("embarkation_shipments").select("id,shipment_code,status,shipment_date").order("shipment_date", { ascending: false }).limit(500),
    s.from("embarkation_issues").select("*").order("created_at", { ascending: false }).limit(500),
  ]);
  const e = [sr.error, ir.error].find(Boolean);
  if (e) throw new Error(e.message);

  return (
    <PageShell
      eyebrow="Distribusi"
      title="Reject & Kekurangan"
      description="Catatan reject, rusak, kurang, atau masalah lain pada pengiriman Embarkasi."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!can ? <ReadOnly /> : null}

      {can ? (
        <Card title="Catat Masalah">
          <form action={createEmbarkationIssueAction} className="grid gap-3 md:grid-cols-4">
            <Field label="Pengiriman">
              <select name="shipment_id" required className={inputClass}>
                <option value="">Pilih</option>
                {(sr.data ?? []).map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.shipment_code} · {x.status}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Jenis">
              <select name="issue_type" className={inputClass}>
                <option>REJECT</option>
                <option>RUSAK</option>
                <option>KURANG</option>
                <option>LAINNYA</option>
              </select>
            </Field>
            <Field label="Qty">
              <input name="quantity" type="number" min="0" step="0.0001" required className={inputClass} />
            </Field>
            <Field label="Keterangan">
              <input name="description" required className={inputClass} />
            </Field>
            <div className="flex items-end">
              <button className={buttonClass}>Simpan</button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title="Daftar Masalah">
        <div className="space-y-3">
          {(ir.data ?? []).map((x: any) => (
            <div key={x.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div>
                  <b className="font-bold text-slate-900 text-sm">{x.issue_code}</b>
                  <span className="ml-2 text-xs font-semibold text-slate-600">
                    · <span className="text-amber-700">{x.issue_type}</span> · {qty(x.quantity)} · {x.description}
                  </span>
                </div>
                <Badge>{x.status}</Badge>
              </div>

              {can && x.status === "OPEN" ? (
                <form action={resolveEmbarkationIssueAction} className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                  <input type="hidden" name="issue_id" value={x.id} />
                  <input name="resolution" required placeholder="Penyelesaian" className={inputClass} />
                  <button className={secondaryClass}>Selesaikan</button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </PageShell>
  );
}
