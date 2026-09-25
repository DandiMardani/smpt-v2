import { Card, Empty, Field, Notice, PageShell, ReadOnly, TableWrap, Td, Th, buttonClass, inputClass } from "@/components/final/final-ui";
import { MasterFinishedGoodFields } from "@/components/forms/master-finished-good-fields";
import { requirePermission } from "@/lib/access/current-user";
import { param, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { deleteFinishedGoodAction, saveFinishedGoodAction } from "@/lib/final/actions";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const access = await requirePermission("master_barang_jadi.view");
  const canWrite = access.permissionCodes.includes("master_barang_jadi.write");
  const q = await searchParams;
  const s = await createClient();
  const [fr, pr, ppr, ir] = await Promise.all([
    s.from("finished_goods").select("*").order("name").limit(500),
    s.from("projects").select("id,name").order("name").limit(300),
    s.from("project_products").select("id,project_id,name,status").eq("status", "AKTIF").order("name").limit(800),
    s.from("work_items").select("id,project_id,product_id,name,output_final,status").eq("status", "AKTIF").eq("output_final", true).order("name").limit(1200),
  ]);
  const e = [fr.error, pr.error, ppr.error, ir.error].find(Boolean);
  if (e) throw new Error(e.message);
  const projects = pr.data ?? [], products = ppr.data ?? [], workItems = ir.data ?? [];
  const goods = fr.data ?? [];

  return (
    <PageShell eyebrow="Master Data" title="Master Barang Jadi" description="Kelola data Barang Jadi internal dan luar. Dilengkapi fitur edit nama, kategori, satuan, sumber, dan pemetaan output final.">
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnly /> : null}

      {canWrite ? (
        <Card title="Tambah Barang Jadi">
          <form action={saveFinishedGoodAction} className="grid gap-3 md:grid-cols-3">
            <MasterFinishedGoodFields projects={projects as any[]} products={products as any[]} workItems={workItems as any[]} className={inputClass} />
            <Field label="Nama"><input name="name" required className={inputClass} /></Field>
            <Field label="Kategori"><input name="category" required className={inputClass} /></Field>
            <Field label="Satuan"><input name="unit" defaultValue="PCS" required className={inputClass} /></Field>
            <Field label="Sumber">
              <select name="source" className={inputClass}>
                <option value="INTERNAL">INTERNAL</option>
                <option value="LUAR">LUAR</option>
                <option value="INTERNAL + LUAR">INTERNAL + LUAR</option>
              </select>
            </Field>
            <Field label="Catatan"><input name="notes" className={inputClass} /></Field>
            <div className="md:col-span-3"><button className={buttonClass}>Simpan Barang Jadi</button></div>
          </form>
        </Card>
      ) : null}

      <Card title={`Daftar Barang Jadi (${goods.length})`}>
        {goods.length === 0 ? <Empty>Belum ada Barang Jadi.</Empty> : (
          <div className="space-y-3">
            {goods.map((x: any) => (
              <details key={x.id} className="group rounded-xl border border-gray-200 bg-white p-4 shadow-2xs hover:border-gray-300 transition">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">{x.finished_good_code}</span>
                        <b className="text-gray-900 text-sm">{x.name}</b>
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-700">{x.category}</span>
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">{x.source}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{x.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Satuan: <b className="text-gray-700">{x.unit}</b> · Catatan: {x.notes || "-"}
                      </p>
                    </div>
                    <div>
                      <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-bold text-gray-700 group-open:bg-blue-50 group-open:text-blue-700 group-open:border-blue-200 transition">
                        ✏️ Edit ▾
                      </span>
                    </div>
                  </div>
                </summary>

                {canWrite ? (
                  <form action={saveFinishedGoodAction} className="mt-4 grid gap-3 border-t border-gray-100 pt-4 md:grid-cols-3">
                    <input type="hidden" name="id" value={x.id} />
                    <Field label="Nama"><input name="name" required defaultValue={x.name} className={inputClass} /></Field>
                    <Field label="Kategori"><input name="category" required defaultValue={x.category} className={inputClass} /></Field>
                    <Field label="Satuan"><input name="unit" required defaultValue={x.unit} className={inputClass} /></Field>
                    <Field label="Sumber">
                      <select name="source" defaultValue={x.source} className={inputClass}>
                        <option value="INTERNAL">INTERNAL</option>
                        <option value="LUAR">LUAR</option>
                        <option value="INTERNAL + LUAR">INTERNAL + LUAR</option>
                      </select>
                    </Field>
                    <Field label="Status">
                      <select name="status" defaultValue={x.status} className={inputClass}>
                        <option value="AKTIF">AKTIF</option>
                        <option value="NONAKTIF">NONAKTIF</option>
                      </select>
                    </Field>
                    <Field label="Catatan"><input name="notes" defaultValue={x.notes || ""} className={inputClass} /></Field>
                    <div className="md:col-span-3 flex flex-wrap items-center justify-between gap-3 pt-2">
                      <button type="submit" className={buttonClass}>Simpan Perubahan</button>
                      <button
                        type="submit"
                        formAction={deleteFinishedGoodAction}
                        formNoValidate
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition"
                      >
                        🗑️ Hapus Barang Jadi
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
