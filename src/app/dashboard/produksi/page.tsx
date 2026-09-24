import {
  Field,
  inputClass,
  MasterPageShell,
  Notice,
  primaryButtonClass,
  ReadOnlyBanner,
  SectionCard,
  dangerButtonClass,
} from "@/components/master/master-ui";
import { Badge, FlowNote, Metric } from "@/components/operations/ops-ui";
import { requirePermission } from "@/lib/access/current-user";
import { formatNumber, param, type SearchParams } from "@/lib/master/page-utils";
import { createClient } from "@/lib/supabase/server";
import { cancelReadyLotUsage, recordReadyLotUsage, recordReadyUsage } from "./actions";

type Props = { searchParams: Promise<SearchParams> };
type Location = { id: number; code: string };
type Balance = { id:number; item_kind:string; material_id:number|null; cutting_component_id:number|null; location_id:number; project_id:number|null; product_id:number|null; bom_requirement_id:number|null; quantity:number|string };
type Material = { id:number; material_code:string; name:string; standard_unit:string; lot_tracking_mode:string };
type Component = { id:number; component_code:string; name:string; color:string; unit:string };
type Bom = { id:number; component_name:string; unit:string };
type Project = { id:number; name:string };
type Product = { id:number; name:string };
type WorkItem = { id:number; project_id:number; product_id:number|null; name:string; unit:string; qty_per_product:number|string };
type Ledger = { id:number; event_id:number; item_kind:string; material_id:number|null; cutting_component_id:number|null; project_id:number|null; product_id:number|null; bom_requirement_id:number|null; movement_kind:string; quantity_delta:number|string; unit_snapshot:string; notes:string|null; created_at:string };
type StockEvent = { id:number; event_code:string; event_date:string; reference_type:string|null; reference_code:string|null };
type Issue = { stock_event_id:number; issue_code:string; recipient_name:string; source:string };
type Usage = { id:number; usage_code:string; usage_date:string; project_id:number; product_id:number|null; item_kind:string; bom_requirement_id:number|null; material_id:number|null; cutting_component_id:number|null; material_lot_id:number|null; work_item_id:number|null; quantity:number|string; unit_snapshot:string; input_quantity:number|string|null; input_unit:string|null; officer:string; notes:string|null; status:string; created_at:string };
type Lot = { id:number; lot_code:string; roll_number:string; material_id:number; material_name:string; normalized_unit:string; remaining_normalized_quantity:number|string; original_unit:string; current_project_id:number|null; current_product_id:number|null; current_bom_requirement_id:number|null; project_name:string|null; product_name:string|null; location_code:string; status:string };

const units = ["METER","YARD","CM","MM","FT","INCH","KG","GRAM","MG","TON","LITER","ML","PCS","LUSIN"];

function dateLabel(value:string|null|undefined){const raw=String(value??"").slice(0,10);const [y,m,d]=raw.split("-");return y&&m&&d?`${d}/${m}/${y}`:raw||"-";}
function itemLabel(row:{item_kind:string;material_id?:number|null;cutting_component_id?:number|null;bom_requirement_id?:number|null},materials:Map<number,Material>,components:Map<number,Component>,boms:Map<number,Bom>){if(row.item_kind==="MATERIAL"){const material=row.material_id?materials.get(row.material_id):undefined;const bom=row.bom_requirement_id?boms.get(row.bom_requirement_id):undefined;return{code:material?.material_code??"-",name:bom?.component_name||material?.name||"Bahan",extra:"Bahan Mentah/Aksesori"};}const component=row.cutting_component_id?components.get(row.cutting_component_id):undefined;return{code:component?.component_code??"-",name:component?.name??"Komponen Cutting",extra:`Bahan Siap Produksi${component?.color?` · ${component.color}`:""}`};}

export default async function Page({searchParams}:Props){
  const access=await requirePermission("produksi.view");
  const canWrite=access.permissionCodes.includes("produksi.write");
  const query=await searchParams;
  const supabase=await createClient();
  const locationResult=await supabase.from("stock_locations").select("id,code").eq("code","SIAP_PRODUKSI").maybeSingle();
  if(locationResult.error)throw new Error(locationResult.error.message);
  const readyLocation=locationResult.data as Location|null;
  if(!readyLocation)throw new Error("Lokasi stok SIAP_PRODUKSI tidak ditemukan.");

  const [balanceResult,materialResult,componentResult,bomResult,projectResult,productResult,ledgerResult,usageResult,lotResult,workResult]=await Promise.all([
    supabase.from("stock_balances").select("id,item_kind,material_id,cutting_component_id,location_id,project_id,product_id,bom_requirement_id,quantity").eq("location_id",readyLocation.id).gt("quantity",0),
    supabase.from("materials").select("id,material_code,name,standard_unit,lot_tracking_mode"),
    supabase.from("cutting_components").select("id,component_code,name,color,unit"),
    supabase.from("bom_requirements").select("id,component_name,unit"),
    supabase.from("projects").select("id,name"),
    supabase.from("project_products").select("id,name"),
    supabase.from("stock_ledger_entries").select("id,event_id,item_kind,material_id,cutting_component_id,project_id,product_id,bom_requirement_id,movement_kind,quantity_delta,unit_snapshot,notes,created_at").eq("location_id",readyLocation.id).gt("quantity_delta",0).order("created_at",{ascending:false}).limit(250),
    supabase.from("ready_production_usages").select("id,usage_code,usage_date,project_id,product_id,item_kind,bom_requirement_id,material_id,cutting_component_id,material_lot_id,work_item_id,quantity,unit_snapshot,input_quantity,input_unit,officer,notes,status,created_at").order("usage_date",{ascending:false}).order("id",{ascending:false}).limit(250),
    supabase.from("v_material_lot_status").select("id,lot_code,roll_number,material_id,material_name,normalized_unit,remaining_normalized_quantity,original_unit,current_project_id,current_product_id,current_bom_requirement_id,project_name,product_name,location_code,status").eq("location_code","SIAP_PRODUKSI").order("updated_at",{ascending:false}).limit(1000),
    supabase.from("work_items").select("id,project_id,product_id,name,unit,qty_per_product").eq("status","AKTIF").order("display_order").limit(1500),
  ]);
  const firstError=[balanceResult.error,materialResult.error,componentResult.error,bomResult.error,projectResult.error,productResult.error,ledgerResult.error,usageResult.error,lotResult.error,workResult.error].find(Boolean);
  if(firstError)throw new Error(firstError.message);

  const balances=(balanceResult.data??[]) as Balance[];
  const materialRows=(materialResult.data??[]) as Material[];
  const materials=new Map(materialRows.map(x=>[x.id,x]));
  const components=new Map(((componentResult.data??[]) as Component[]).map(x=>[x.id,x]));
  const boms=new Map(((bomResult.data??[]) as Bom[]).map(x=>[x.id,x]));
  const projects=new Map(((projectResult.data??[]) as Project[]).map(x=>[x.id,x]));
  const products=new Map(((productResult.data??[]) as Product[]).map(x=>[x.id,x]));
  const incoming=(ledgerResult.data??[]) as Ledger[];
  const usages=(usageResult.data??[]) as Usage[];
  const lots=(lotResult.data??[]) as Lot[];
  const activeLots=lots.filter(x=>["AVAILABLE","PARTIAL"].includes(x.status)&&Number(x.remaining_normalized_quantity)>0);
  const workItems=(workResult.data??[]) as WorkItem[];
  const lotMap=new Map(lots.map(x=>[x.id,x]));

  const eventIds=[...new Set(incoming.map(x=>x.event_id))];
  let events=new Map<number,StockEvent>();let issues=new Map<number,Issue>();
  if(eventIds.length>0){const [eventResult,issueResult]=await Promise.all([supabase.from("stock_events").select("id,event_code,event_date,reference_type,reference_code").in("id",eventIds),supabase.from("warehouse_issues").select("stock_event_id,issue_code,recipient_name,source").in("stock_event_id",eventIds)]);if(eventResult.error)throw new Error(eventResult.error.message);if(issueResult.error)throw new Error(issueResult.error.message);events=new Map(((eventResult.data??[]) as StockEvent[]).map(x=>[x.id,x]));issues=new Map(((issueResult.data??[]) as Issue[]).map(x=>[x.stock_event_id,x]));}

  const raw=balances.filter(x=>x.item_kind==="MATERIAL"),wip=balances.filter(x=>x.item_kind==="CUTTING_COMPONENT");
  const trackedKeys=new Set(activeLots.map(x=>`${x.current_project_id??0}:${x.current_product_id??0}:${x.material_id}:${x.current_bom_requirement_id??0}`));

  return <MasterPageShell eyebrow="Produksi" title="Siap Produksi" description="Monitoring custody bahan/WIP yang sudah diserahkan Gudang, termasuk actual consumption per Roll/Lot.">
    <Notice success={param(query,"success")} error={param(query,"error")}/>{!canWrite?<ReadOnlyBanner/>:null}
    <FlowNote>Barang Keluar Gudang ≠ actual consumption. Roll/Lot keluar dari Gudang dalam keadaan utuh; pemakaian sebagian dicatat di sini dan sisa fisiknya tetap terlihat.</FlowNote>
    <div className="grid gap-3 sm:grid-cols-5"><Metric label="Bahan Mentah/Aksesori" value={raw.length}/><Metric label="Bahan Siap Produksi/WIP" value={wip.length}/><Metric label="Roll/Lot Aktif" value={activeLots.length}/><Metric label="Riwayat Diterima" value={incoming.length} hint="250 terbaru"/><Metric label="Riwayat Pemakaian" value={usages.length} hint="250 terbaru"/></div>

    <SectionCard title="Stok Fisik Siap Produksi"><div className="space-y-3">{balances.length===0?<p className="text-sm text-slate-500">Belum ada stok di Siap Produksi.</p>:null}{balances.map(row=>{const label=itemLabel(row,materials,components,boms),material=row.material_id?materials.get(row.material_id):undefined,component=row.cutting_component_id?components.get(row.cutting_component_id):undefined,bom=row.bom_requirement_id?boms.get(row.bom_requirement_id):undefined,unit=row.item_kind==="MATERIAL"?bom?.unit||material?.standard_unit:component?.unit,referenceId=row.item_kind==="MATERIAL"?row.bom_requirement_id:row.cutting_component_id,key=`${row.project_id??0}:${row.product_id??0}:${row.material_id??0}:${row.bom_requirement_id??0}`,hasTracked=row.item_kind==="MATERIAL"&&trackedKeys.has(key);return <div key={row.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs"><div className="flex justify-between gap-3"><div><b className="font-bold text-slate-900">{label.code} · {label.name}</b><p className="text-xs text-slate-500 mt-0.5">{row.project_id?projects.get(row.project_id)?.name:"-"} · {row.product_id?products.get(row.product_id)?.name:"-"} · {label.extra}</p></div><Badge>{formatNumber(row.quantity)} {unit}</Badge></div>{hasTracked?<p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-2 text-xs font-medium text-sky-800">Material ini mempunyai Roll/Lot aktif. Pemakaian wajib dicatat per roll di bagian Roll/Lot agar remaining fisik tetap sinkron.</p>:canWrite&&row.project_id&&referenceId?<form action={recordReadyUsage} className="mt-4 grid gap-3 md:grid-cols-5"><input type="hidden" name="item_kind" value={row.item_kind}/><input type="hidden" name="reference_id" value={referenceId}/><input type="hidden" name="project_id" value={row.project_id}/><input type="hidden" name="product_id" value={row.product_id??""}/><Field label="Tanggal"><input name="usage_date" type="date" required className={inputClass}/></Field><Field label="Qty Dipakai"><input name="quantity" type="number" min="0.0001" max={Number(row.quantity)} step="0.0001" required className={inputClass}/></Field><Field label="Petugas"><input name="officer" required className={inputClass}/></Field><Field label="Keterangan"><input name="notes" className={inputClass}/></Field><div className="flex items-end"><button className={primaryButtonClass}>Catat Pemakaian</button></div></form>:null}</div>})}</div></SectionCard>

    <SectionCard title="Pemakaian Roll/Lot — Actual Consumption"><div className="space-y-3">{activeLots.length===0?<p className="text-sm text-slate-500">Tidak ada Roll/Lot aktif di area Siap Produksi.</p>:activeLots.map(lot=>{const items=workItems.filter(w=>w.project_id===lot.current_project_id&&w.product_id===lot.current_product_id);return <div key={lot.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs"><div className="flex flex-wrap justify-between gap-3"><div><b className="font-bold text-slate-900">{lot.roll_number} · {lot.material_name}</b><p className="text-xs text-slate-500 mt-0.5">{lot.project_name||"-"} · {lot.product_name||"-"} · {lot.lot_code}</p></div><Badge>Sisa {formatNumber(lot.remaining_normalized_quantity)} {lot.normalized_unit}</Badge></div>{canWrite?<form action={recordReadyLotUsage} className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6"><input type="hidden" name="material_lot_id" value={lot.id}/><Field label="Tanggal"><input name="usage_date" type="date" required className={inputClass}/></Field><Field label="Qty Dipakai"><input name="quantity" type="number" min="0.0001" step="0.0001" required className={inputClass}/></Field><Field label="Satuan"><select name="unit" defaultValue={lot.normalized_unit} className={inputClass}>{[lot.normalized_unit,...units.filter(u=>u!==lot.normalized_unit)].map(u=><option key={u}>{u}</option>)}</select></Field><Field label="Item Pekerjaan"><select name="work_item_id" className={inputClass}><option value="">Tanpa item spesifik</option>{items.map(w=><option key={w.id} value={w.id}>{w.name} · {formatNumber(w.qty_per_product)} {w.unit}/produk</option>)}</select></Field><Field label="Petugas"><input name="officer" required className={inputClass}/></Field><Field label="Keterangan"><input name="notes" className={inputClass}/></Field><div className="flex items-end"><button className={primaryButtonClass}>Catat Pemakaian Roll</button></div></form>:null}</div>})}</div></SectionCard>

    <SectionCard title="Riwayat Barang Diterima dari Gudang"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs uppercase tracking-wide text-slate-600 bg-slate-50"><tr className="border-b border-slate-200"><th className="px-3 py-3 font-semibold">Tanggal</th><th className="px-3 py-3 font-semibold">Referensi</th><th className="px-3 py-3 font-semibold">Proyek / Produk</th><th className="px-3 py-3 font-semibold">Barang</th><th className="px-3 py-3 font-semibold">Qty Diterima</th><th className="px-3 py-3 font-semibold">Pengambil</th><th className="px-3 py-3 font-semibold">Keterangan</th></tr></thead><tbody>{incoming.length===0?<tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Belum ada riwayat barang masuk ke Siap Produksi.</td></tr>:incoming.map(row=>{const event=events.get(row.event_id),issue=issues.get(row.event_id),label=itemLabel(row,materials,components,boms);return <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50 align-top"><td className="px-3 py-3 whitespace-nowrap text-slate-700">{dateLabel(event?.event_date||row.created_at)}</td><td className="px-3 py-3"><b className="font-semibold text-slate-900">{issue?.issue_code||event?.reference_code||event?.event_code||`STX-${row.event_id}`}</b><div className="text-xs text-slate-500">{row.movement_kind}</div></td><td className="px-3 py-3 text-slate-700">{row.project_id?projects.get(row.project_id)?.name:"-"}<div className="text-xs text-slate-500">{row.product_id?products.get(row.product_id)?.name:"-"}</div></td><td className="px-3 py-3"><b className="font-semibold text-slate-900">{label.code} · {label.name}</b><div className="text-xs text-slate-500">{label.extra}</div></td><td className="px-3 py-3 whitespace-nowrap font-semibold text-emerald-700">+{formatNumber(row.quantity_delta)} {row.unit_snapshot}</td><td className="px-3 py-3 text-slate-700">{issue?.recipient_name||"-"}</td><td className="px-3 py-3 text-slate-500">{row.notes||"-"}</td></tr>})}</tbody></table></div></SectionCard>

    <SectionCard title="Riwayat Pemakaian Siap Produksi"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs uppercase tracking-wide text-slate-600 bg-slate-50"><tr className="border-b border-slate-200"><th className="px-3 py-3 font-semibold">Tanggal</th><th className="px-3 py-3 font-semibold">No. Pemakaian</th><th className="px-3 py-3 font-semibold">Proyek / Produk</th><th className="px-3 py-3 font-semibold">Barang</th><th className="px-3 py-3 font-semibold">Qty Dipakai</th><th className="px-3 py-3 font-semibold">Roll / Item</th><th className="px-3 py-3 font-semibold">Petugas</th><th className="px-3 py-3 font-semibold">Status</th><th className="px-3 py-3 font-semibold">Aksi</th></tr></thead><tbody>{usages.length===0?<tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">Belum ada pemakaian internal Siap Produksi.</td></tr>:usages.map(row=>{const label=itemLabel(row,materials,components,boms),lot=row.material_lot_id?lotMap.get(row.material_lot_id):undefined,wi=row.work_item_id?workItems.find(w=>w.id===row.work_item_id):undefined;return <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50 align-top"><td className="px-3 py-3 whitespace-nowrap text-slate-700">{dateLabel(row.usage_date)}</td><td className="px-3 py-3 font-semibold text-slate-900">{row.usage_code}</td><td className="px-3 py-3 text-slate-700">{projects.get(row.project_id)?.name||"-"}<div className="text-xs text-slate-500">{row.product_id?products.get(row.product_id)?.name:"-"}</div></td><td className="px-3 py-3"><b className="font-semibold text-slate-900">{label.code} · {label.name}</b></td><td className="px-3 py-3 whitespace-nowrap font-semibold text-amber-700">-{row.input_quantity?`${formatNumber(row.input_quantity)} ${row.input_unit||""} → `:""}{formatNumber(row.quantity)} {row.unit_snapshot}</td><td className="px-3 py-3 text-slate-700">{lot?lot.roll_number:"-"}<div className="text-xs text-slate-500">{wi?.name||"-"}</div></td><td className="px-3 py-3 text-slate-700">{row.officer}</td><td className="px-3 py-3"><Badge>{row.status}</Badge></td><td className="px-3 py-3">{canWrite&&row.status==="AKTIF"&&row.material_lot_id?<form action={cancelReadyLotUsage}><input type="hidden" name="usage_id" value={row.id}/><button className={dangerButtonClass}>Batalkan</button></form>:"-"}</td></tr>})}</tbody></table></div></SectionCard>
  </MasterPageShell>;
}
