import { Card, Field, Notice, PageShell, ReadOnly, TableWrap, Td, Th, buttonClass, inputClass } from "@/components/final/final-ui";
import { MasterFinishedGoodFields } from "@/components/forms/master-finished-good-fields";
import { requirePermission } from "@/lib/access/current-user";
import { param, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { saveFinishedGoodAction } from "@/lib/final/actions";

type Props={searchParams:Promise<SearchParams>};
export default async function Page({searchParams}:Props){
  const access=await requirePermission("master_barang_jadi.view");
  const canWrite=access.permissionCodes.includes("master_barang_jadi.write");
  const q=await searchParams;const s=await createClient();
  const [fr,pr,ppr,ir]=await Promise.all([
    s.from("finished_goods").select("*").order("name").limit(500),
    s.from("projects").select("id,name").order("name").limit(300),
    s.from("project_products").select("id,project_id,name,status").eq("status","AKTIF").order("name").limit(800),
    s.from("work_items").select("id,project_id,product_id,name,output_final,status").eq("status","AKTIF").eq("output_final",true).order("name").limit(1200),
  ]);
  const e=[fr.error,pr.error,ppr.error,ir.error].find(Boolean);if(e)throw new Error(e.message);
  const projects=pr.data??[],products=ppr.data??[],workItems=ir.data??[];
  return <PageShell eyebrow="Master Data" title="Master Barang Jadi" description="Hubungkan Barang Jadi internal ke Proyek, Produk, dan item pekerjaan Output Final yang sama.">
    <Notice success={param(q,"success")} error={param(q,"error")}/>{!canWrite?<ReadOnly/>:null}
    {canWrite?<Card title="Tambah Barang Jadi"><form action={saveFinishedGoodAction} className="grid gap-3 md:grid-cols-3">
      <MasterFinishedGoodFields projects={projects as any[]} products={products as any[]} workItems={workItems as any[]} className={inputClass}/>
      <Field label="Nama"><input name="name" required className={inputClass}/></Field>
      <Field label="Kategori"><input name="category" required className={inputClass}/></Field>
      <Field label="Satuan"><input name="unit" defaultValue="PCS" required className={inputClass}/></Field>
      <Field label="Sumber"><select name="source" className={inputClass}><option>INTERNAL</option><option>LUAR</option><option>INTERNAL + LUAR</option></select></Field>
      <Field label="Catatan"><input name="notes" className={inputClass}/></Field>
      <div><button className={buttonClass}>Simpan</button></div>
    </form></Card>:null}
    <Card title="Daftar"><TableWrap><thead><tr><Th>Kode</Th><Th>Nama</Th><Th>Kategori</Th><Th>Sumber</Th><Th>Output Final</Th><Th>Status</Th></tr></thead><tbody>{(fr.data??[]).map((x:any)=><tr key={x.id}><Td>{x.finished_good_code}</Td><Td>{x.name}</Td><Td>{x.category}</Td><Td>{x.source}</Td><Td>{x.final_work_item_id||"-"}</Td><Td>{x.status}</Td></tr>)}</tbody></TableWrap></Card>
  </PageShell>;
}
