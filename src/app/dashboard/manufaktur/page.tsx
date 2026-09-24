import { Card, Field, Flow, Notice, PageShell, ReadOnly, TableWrap, Td, Th, buttonClass, inputClass } from "@/components/final/final-ui";
import { ManufacturingReferenceFields } from "@/components/forms/manufacturing-reference-fields";
import { requirePermission } from "@/lib/access/current-user";
import { param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { addManufacturingAction } from "@/lib/final/actions";

type Props={searchParams:Promise<SearchParams>};
export default async function Page({searchParams}:Props){
 const a=await requirePermission("manufaktur.view");const canTit=a.permissionCodes.includes("manufaktur.titipan.write"),canLuar=a.permissionCodes.includes("manufaktur.barang_luar.write"),canShip=a.permissionCodes.includes("manufaktur.pengiriman.write");const can=canTit||canLuar||canShip;const q=await searchParams,s=await createClient();
 const [pr,ppr,mr,fr,vr,tr]=await Promise.all([
  s.from("projects").select("id,name,status").order("name").limit(300),
  s.from("project_products").select("id,project_id,name,status").eq("status","AKTIF").order("name").limit(800),
  s.from("materials").select("id,material_code,name,standard_unit,status").eq("status","AKTIF").order("name").limit(1000),
  s.from("finished_goods").select("id,project_id,product_id,finished_good_code,name,unit,status").eq("status","AKTIF").order("name").limit(1000),
  s.from("vendors").select("id,vendor_code,name,status").eq("status","AKTIF").order("name").limit(500),
  s.from("manufacturing_transactions").select("*").order("transaction_date",{ascending:false}).limit(500),
 ]);const e=[pr.error,ppr.error,mr.error,fr.error,vr.error,tr.error].find(Boolean);if(e)throw new Error(e.message);
 return <PageShell eyebrow="Produksi" title="Produksi Internal & Eksternal" description="Monitoring produksi internal serta transaksi produksi eksternal, bahan titipan, barang luar, dan pengiriman.">
  <Notice success={param(q,"success")} error={param(q,"error")}/>{!can?<ReadOnly/>:null}<Flow>TITIPAN dicatat terpisah sebagai non-aset. BARANG_LUAR dapat menambah stok Barang Jadi PUSAT. Flow INTERNAL hanya monitoring, tidak menerima input manual.</Flow>
  {can?<Card title="Catat Transaksi Produksi Eksternal"><form action={addManufacturingAction} className="grid gap-3 md:grid-cols-4">
   <Field label="Flow"><select name="flow_type" required className={inputClass}>{canTit?<option value="TITIPAN">TITIPAN</option>:null}{canLuar?<option value="BARANG_LUAR">BARANG LUAR</option>:null}{canShip?<option value="PENGIRIMAN">PENGIRIMAN</option>:null}</select></Field>
   <Field label="Tanggal"><input name="transaction_date" type="date" required className={inputClass}/></Field>
   <ManufacturingReferenceFields projects={((pr.data??[]) as any[]).filter((x:any)=>!["SELESAI","NONAKTIF","BATAL","DIBATALKAN"].includes(String(x.status||"").toUpperCase()))} products={(ppr.data??[]) as any[]} finishedGoods={(fr.data??[]) as any[]} className={inputClass}/>
   <Field label="Bahan"><select name="material_id" className={inputClass}><option value="">-</option>{(mr.data??[]).map((x:any)=><option key={x.id} value={x.id}>{x.material_code} · {x.name}</option>)}</select></Field>
   <Field label="Vendor"><select name="vendor_id" className={inputClass}><option value="">-</option>{(vr.data??[]).map((x:any)=><option key={x.id} value={x.id}>{x.vendor_code} · {x.name}</option>)}</select></Field>
   <Field label="Qty"><input name="quantity" type="number" min="0.0001" step="0.0001" required className={inputClass}/></Field>
   <Field label="Satuan"><input name="unit" className={inputClass}/></Field><Field label="Dokumen"><input name="document_no" className={inputClass}/></Field><Field label="Keterangan"><input name="description" required className={inputClass}/></Field><div><button className={buttonClass}>Simpan</button></div>
  </form></Card>:null}
  <Card title="Riwayat"><TableWrap><thead><tr><Th>Kode</Th><Th>Tanggal</Th><Th>Flow</Th><Th>Qty</Th><Th>Dokumen</Th><Th>Status</Th></tr></thead><tbody>{(tr.data??[]).map((x:any)=><tr key={x.id}><Td>{x.manufacturing_code}</Td><Td>{x.transaction_date}</Td><Td>{x.flow_type}</Td><Td>{qty(x.quantity)} {x.unit||""}</Td><Td>{x.document_no||"-"}</Td><Td>{x.status}</Td></tr>)}</tbody></TableWrap></Card>
 </PageShell>;
}
