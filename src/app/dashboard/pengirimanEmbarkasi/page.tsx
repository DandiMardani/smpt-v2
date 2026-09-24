import {
  Badge,
  Card,
  Field,
  Notice,
  PageShell,
  ReadOnly,
  buttonClass,
  dangerClass,
  inputClass,
} from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { cancelShipmentAction, createShipmentAction, receiveShipmentAction, sendShipmentAction } from "@/lib/final/actions";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("pengiriman_embarkasi.view");
  const can = a.permissionCodes.includes("pengiriman_embarkasi.operate");
  const q = await searchParams;
  const s = await createClient();

  const [tr, lr, sr] = await Promise.all([
    s.from("embarkation_targets").select("*").eq("status", "AKTIF").limit(500),
    s.from("locations").select("id,name,status").eq("status", "AKTIF"),
    s.from("embarkation_shipments").select("*").order("shipment_date", { ascending: false }).limit(500),
  ]);
  const e = [tr.error, lr.error, sr.error].find(Boolean);
  if (e) throw new Error(e.message);

  return (
    <PageShell
      eyebrow="Distribusi"
      title="Pengiriman & Tracking"
      description="Draft tidak mengurangi stok. Stok berkurang saat status DIKIRIM. Penerimaan mencatat diterima/reject/rusak/kurang."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!can ? <ReadOnly /> : null}

      {can ? (
        <Card title="Buat Pengiriman">
          <form action={createShipmentAction} className="grid gap-3 md:grid-cols-4">
            <Field label="Target">
              <select name="target_id" required className={inputClass}>
                <option value="">Pilih</option>
                {(tr.data ?? []).map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.target_code} · {x.item_kind} #{x.finished_good_id || x.set_id} · Target {qty(x.target_qty)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tanggal">
              <input name="shipment_date" type="date" required className={inputClass} />
            </Field>
            <Field label="Sumber">
              <select name="source_location_id" required className={inputClass}>
                <option value="">Pilih</option>
                {(lr.data ?? []).map((x: any) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Qty">
              <input name="quantity" type="number" min="0.0001" step="0.0001" required className={inputClass} />
            </Field>
            <Field label="No Dokumen">
              <input name="document_no" className={inputClass} />
            </Field>
            <Field label="Driver">
              <input name="driver_name" className={inputClass} />
            </Field>
            <Field label="Kendaraan">
              <input name="vehicle_no" className={inputClass} />
            </Field>
            <Field label="Catatan">
              <input name="notes" className={inputClass} />
            </Field>
            <div className="flex items-end">
              <button className={buttonClass}>Buat Draft</button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title="Pengiriman">
        <div className="space-y-3">
          {(sr.data ?? []).map((x: any) => (
            <div key={x.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
              <div className="flex flex-wrap justify-between items-center gap-3">
                <div>
                  <b className="font-bold text-slate-900 text-sm">{x.shipment_code}</b>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {x.shipment_date} · Qty {qty(x.quantity)} · Token: <span className="font-mono text-slate-700">{x.public_token}</span>
                  </p>
                </div>
                <Badge>{x.status}</Badge>
              </div>

              {can ? (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {x.status === "DISIAPKAN" ? (
                    <form action={sendShipmentAction}>
                      <input type="hidden" name="shipment_id" value={x.id} />
                      <button className={buttonClass}>Kirim</button>
                    </form>
                  ) : null}
                  {x.status === "DIKIRIM" ? (
                    <form action={receiveShipmentAction} className="flex flex-wrap gap-2">
                      <input type="hidden" name="shipment_id" value={x.id} />
                      <input name="received_qty" type="number" min="0" step="0.0001" required placeholder="Diterima" className={inputClass} />
                      <input name="reject_qty" type="number" min="0" step="0.0001" defaultValue="0" required placeholder="Reject" className={inputClass} />
                      <input name="damaged_qty" type="number" min="0" step="0.0001" defaultValue="0" required placeholder="Rusak" className={inputClass} />
                      <input name="missing_qty" type="number" min="0" step="0.0001" defaultValue="0" required placeholder="Kurang" className={inputClass} />
                      <input name="notes" className={inputClass} placeholder="Catatan" />
                      <button className={buttonClass}>Konfirmasi</button>
                    </form>
                  ) : null}
                  {["DISIAPKAN", "DIKIRIM"].includes(x.status) ? (
                    <form action={cancelShipmentAction}>
                      <input type="hidden" name="shipment_id" value={x.id} />
                      <button className={dangerClass}>Batalkan</button>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </PageShell>
  );
}
