import { Card, Empty, Field, Notice, PageShell, ReadOnly, buttonClass, inputClass } from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { param, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { deleteLocationAction, saveLocationAction } from "@/lib/final/actions";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("master_lokasi.view");
  const can = a.permissionCodes.includes("master_lokasi.write");
  const q = await searchParams;
  const s = await createClient();
  const r = await s.from("locations").select("*").order("name").limit(500);
  if (r.error) throw new Error(r.error.message);
  const locations = r.data ?? [];

  return (
    <PageShell eyebrow="Master Data" title="Master Lokasi" description="Lokasi fisik stok Barang Jadi/SET. Dilengkapi fitur edit nama lokasi, tipe gudang, PIC, telepon, dan alamat.">
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!can ? <ReadOnly /> : null}

      {can ? (
        <Card title="Tambah Lokasi">
          <form action={saveLocationAction} className="grid gap-3 md:grid-cols-3">
            <Field label="Nama Lokasi"><input name="name" required className={inputClass} /></Field>
            <Field label="Tipe Lokasi"><input name="location_type" defaultValue="GUDANG" className={inputClass} placeholder="GUDANG / OUTLET / TRANSIT" /></Field>
            <Field label="PIC"><input name="pic_name" className={inputClass} /></Field>
            <Field label="Telepon"><input name="phone" className={inputClass} /></Field>
            <Field label="Alamat"><input name="address" className={inputClass} /></Field>
            <Field label="Catatan"><input name="notes" className={inputClass} /></Field>
            <div className="md:col-span-3"><button className={buttonClass}>Simpan Lokasi</button></div>
          </form>
        </Card>
      ) : null}

      <Card title={`Daftar Lokasi (${locations.length})`}>
        {locations.length === 0 ? <Empty>Belum ada Lokasi.</Empty> : (
          <div className="space-y-3">
            {locations.map((x: any) => (
              <details key={x.id} className="group rounded-xl border border-gray-200 bg-white p-4 shadow-2xs hover:border-gray-300 transition">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">{x.location_code}</span>
                        <b className="text-gray-900 text-sm">{x.name}</b>
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-700">{x.location_type}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{x.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        PIC: <b className="text-gray-700">{x.pic_name || "-"}</b> · Telepon: {x.phone || "-"} · Alamat: {x.address || "-"}
                      </p>
                    </div>
                    <div>
                      <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-bold text-gray-700 group-open:bg-blue-50 group-open:text-blue-700 group-open:border-blue-200 transition">
                        ✏️ Edit ▾
                      </span>
                    </div>
                  </div>
                </summary>

                {can ? (
                  <form action={saveLocationAction} className="mt-4 grid gap-3 border-t border-gray-100 pt-4 md:grid-cols-3">
                    <input type="hidden" name="id" value={x.id} />
                    <Field label="Nama Lokasi"><input name="name" required defaultValue={x.name} className={inputClass} /></Field>
                    <Field label="Tipe Lokasi"><input name="location_type" required defaultValue={x.location_type} className={inputClass} /></Field>
                    <Field label="PIC"><input name="pic_name" defaultValue={x.pic_name || ""} className={inputClass} /></Field>
                    <Field label="Telepon"><input name="phone" defaultValue={x.phone || ""} className={inputClass} /></Field>
                    <Field label="Alamat"><input name="address" defaultValue={x.address || ""} className={inputClass} /></Field>
                    <Field label="Catatan"><input name="notes" defaultValue={x.notes || ""} className={inputClass} /></Field>
                    <Field label="Status">
                      <select name="status" defaultValue={x.status} className={inputClass}>
                        <option value="AKTIF">AKTIF</option>
                        <option value="NONAKTIF">NONAKTIF</option>
                      </select>
                    </Field>
                    <div className="md:col-span-3 flex flex-wrap items-center justify-between gap-3 pt-2">
                      <button type="submit" className={buttonClass}>Simpan Perubahan</button>
                      <button
                        type="submit"
                        formAction={deleteLocationAction}
                        formNoValidate
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition"
                      >
                        🗑️ Hapus Lokasi
                      </button>
                    </div>
                  </form>
                ) : null}
              </details>
            ))}
          </div>
        )}
      </Card>
    </PageShell>
  );
}
