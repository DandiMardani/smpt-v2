import { Badge, Card, Empty, Field, Metric, Notice, PageShell, ReadOnly, TableWrap, Td, Th, buttonClass, inputClass } from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { createTargetAction } from "@/lib/final/actions";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("target_embarkasi.view");
  const can = a.permissionCodes.includes("target_embarkasi.write");
  const q = await searchParams;
  const s = await createClient();

  const [er, fr, sr, tr] = await Promise.all([
    s.from("embarkations").select("id, embarkation_code, short_code, name, status").eq("status", "AKTIF").order("name"),
    s.from("finished_goods").select("id, finished_good_code, name, status").eq("status", "AKTIF").order("name"),
    s.from("product_sets").select("id, set_code, name, status").eq("status", "AKTIF").order("name"),
    s.from("embarkation_targets").select("*").order("created_at", { ascending: false }).limit(500),
  ]);

  const e = [er.error, fr.error, sr.error, tr.error].find(Boolean);
  if (e) throw new Error(e.message);

  const embMap = new Map((er.data ?? []).map((x: any) => [x.id, x]));
  const fgMap = new Map((fr.data ?? []).map((x: any) => [x.id, x]));
  const setMap = new Map((sr.data ?? []).map((x: any) => [x.id, x]));
  const targets = tr.data ?? [];

  const totalQuota = targets.reduce((sum: number, x: any) => sum + (Number(x.target_qty) || 0), 0);

  return (
    <PageShell
      eyebrow="Distribusi"
      title="Target Embarkasi"
      description="Penetapan kuota distribusi dan target alokasi Barang Jadi / SET per Asrama Haji / Embarkasi."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Total Target Kuota" value={`${qty(totalQuota)} Unit / SET`} />
        <Metric label="Jumlah Target Aktif" value={`${targets.length} Kuota Alokasi`} />
      </div>

      {!can ? <ReadOnly /> : null}

      {can ? (
        <Card title="Tambah Target Embarkasi">
          <form action={createTargetAction} className="grid gap-3 md:grid-cols-4">
            <Field label="Tujuan Embarkasi">
              <select name="embarkation_id" required className={inputClass}>
                <option value="">-- Pilih Embarkasi --</option>
                {(er.data ?? []).map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.short_code ? `[${x.short_code}] ` : ""}{x.name} ({x.embarkation_code})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Item Alokasi (Barang / SET)">
              <select name="item_ref" required className={inputClass}>
                <option value="">-- Pilih Barang / SET --</option>
                <optgroup label="📦 Master SET Koper">
                  {(sr.data ?? []).map((x: any) => (
                    <option key={`s${x.id}`} value={`SET:${x.id}`}>
                      {x.set_code} · {x.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="🏷️ Barang Jadi Satuan / Aksesoris">
                  {(fr.data ?? []).map((x: any) => (
                    <option key={`f${x.id}`} value={`FINISHED_GOOD:${x.id}`}>
                      {x.finished_good_code} · {x.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </Field>

            <Field label="Target Kuota (Qty)">
              <input name="target_qty" type="number" min="1" step="any" required className={inputClass} placeholder="0" />
            </Field>

            <Field label="Catatan / Keterangan">
              <input name="notes" className={inputClass} placeholder="Contoh: Kuota Haji Reguler..." />
            </Field>

            <div className="md:col-span-4 flex justify-end">
              <button className={buttonClass}>💾 Simpan Target Embarkasi</button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title={`Daftar Target Embarkasi (${targets.length} Target)`}>
        {targets.length === 0 ? (
          <Empty>Belum ada target embarkasi yang dibuat.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Kode Target</Th>
                <Th>Tujuan Embarkasi</Th>
                <Th>Jenis</Th>
                <Th>Nama Barang / SET</Th>
                <Th>Target Kuota</Th>
                <Th>Catatan</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {targets.map((x: any) => {
                const emb = embMap.get(x.embarkation_id);
                const item = x.item_kind === "SET" ? setMap.get(x.set_id) : fgMap.get(x.finished_good_id);
                const itemCode = x.item_kind === "SET" ? item?.set_code : item?.finished_good_code;

                return (
                  <tr key={x.id}>
                    <Td>
                      <span className="font-mono font-semibold text-xs text-sky-600">{x.target_code}</span>
                    </Td>
                    <Td>
                      <div className="font-medium text-gray-900">{emb?.name || `Embarkasi #${x.embarkation_id}`}</div>
                      <div className="text-xs text-gray-500 font-mono">
                        {emb?.short_code ? `[${emb.short_code}] ` : ""}{emb?.embarkation_code || "-"}
                      </div>
                    </Td>
                    <Td>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${x.item_kind === "SET" ? "bg-purple-50 text-purple-700 border border-purple-200" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>
                        {x.item_kind === "SET" ? "📦 SET" : "🏷️ SATUAN"}
                      </span>
                    </Td>
                    <Td>
                      <div className="font-medium text-gray-900">{item?.name || `Item #${x.finished_good_id || x.set_id}`}</div>
                      <div className="text-xs text-gray-500 font-mono">{itemCode || "-"}</div>
                    </Td>
                    <Td>
                      <span className="font-bold text-gray-900 text-sm">{qty(x.target_qty)}</span>
                    </Td>
                    <Td>
                      <span className="text-xs text-gray-600">{x.notes || "-"}</span>
                    </Td>
                    <Td>
                      <Badge>{x.status}</Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </PageShell>
  );
}
