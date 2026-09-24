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
} from "@/components/final/final-ui";
import { ProjectProductBomFields } from "@/components/forms/project-product-fields";
import { requirePermission } from "@/lib/access/current-user";
import { param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { createLotAction, fulfillRequestWithLotAction, issueWholeLotAction, setLotModeAction } from "./actions";

type Props = { searchParams: Promise<SearchParams> };

const units = ["METER", "YARD", "CM", "MM", "FT", "INCH", "KG", "GRAM", "MG", "TON", "LITER", "ML", "PCS", "LUSIN"];

export default async function Page({ searchParams }: Props) {
  const access = await requirePermission("stok_gudang.view");
  const q = await searchParams;
  const codes = access.permissionCodes;
  const canMaster = codes.includes("master_bahan.write");
  const canReceive = codes.includes("barang_masuk_gudang.write");
  const canIssue = codes.includes("barang_keluar_gudang.write");
  const s = await createClient();

  const [mr, rr, lr, pr, ppr, br, wr, reqr, reqir] = await Promise.all([
    s.from("materials").select("id,material_code,name,standard_unit,lot_tracking_mode,status").eq("status", "AKTIF").order("name").limit(1000),
    s.from("warehouse_receipts").select("id,receipt_code,receipt_date,material_id,quantity,unit_snapshot,input_quantity,input_unit,status").eq("status", "AKTIF").order("receipt_date", { ascending: false }).limit(500),
    s.from("v_material_lot_status").select("*").order("updated_at", { ascending: false }).limit(1000),
    s.from("projects").select("id,name,status").order("name").limit(300),
    s.from("project_products").select("id,project_id,name,status").eq("status", "AKTIF").order("name").limit(1000),
    s.from("bom_requirements").select("id,project_id,product_id,material_id,component_name,unit,status").eq("component_type", "BAHAN").eq("status", "AKTIF").order("id").limit(2000),
    s.from("workers").select("id,worker_code,name,status").eq("status", "AKTIF").order("name").limit(1000),
    s.from("material_requests").select("id,request_code,project_id,product_id,purpose,status").in("status",["MENUNGGU GUDANG","SEBAGIAN"]).order("request_date",{ascending:false}).limit(500),
    s.from("material_request_items").select("id,request_id,material_id,bom_requirement_id,item_name_snapshot,unit_snapshot,requested_qty,fulfilled_qty,status,source_type").eq("source_type","BAHAN BAKU").neq("status","DIBATALKAN").limit(1500),
  ]);
  const e = [mr.error, rr.error, lr.error, pr.error, ppr.error, br.error, wr.error, reqr.error, reqir.error].find(Boolean);
  if (e) throw new Error(e.message);

  const materials = mr.data ?? [];
  const receipts = rr.data ?? [];
  const lots = lr.data ?? [];
  const projects = pr.data ?? [];
  const products = ppr.data ?? [];
  const boms = br.data ?? [];
  const workers = wr.data ?? [];
  const requests = reqr.data ?? [];
  const requestItems = (reqir.data ?? []).filter((x:any)=>Number(x.fulfilled_qty)<Number(x.requested_qty));
  const requestMap = new Map(requests.map((x:any)=>[x.id,x]));
  const materialMap = new Map(materials.map((x: any) => [x.id, x]));
  const projectMap = new Map(projects.map((x: any) => [x.id, x]));
  const availableWarehouseLots = lots.filter((x: any) => x.location_code === "GUDANG_BAHAN" && ["AVAILABLE", "PARTIAL"].includes(x.status) && Number(x.remaining_normalized_quantity) > 0);

  return (
    <PageShell eyebrow="Gudang & Material" title="Stock Roll / Lot" description="Roll adalah physical lot/container. Panjang setiap roll disimpan sendiri; inventory tetap memakai normalized quantity pada ledger utama.">
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canReceive && !canIssue && !canMaster ? <ReadOnly /> : null}
      <Flow>Barang Masuk → pecah receipt menjadi Roll/Lot → Barang Keluar memindahkan roll utuh → Cutting/Produksi memakai sebagian → remaining roll turun. Tidak ada conversion factor tetap untuk satuan ROLL.</Flow>

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label="Total Roll/Lot" value={lots.length} />
        <Metric label="Di Gudang" value={availableWarehouseLots.length} />
        <Metric label="Partial" value={lots.filter((x: any) => x.status === "PARTIAL").length} />
        <Metric label="Habis" value={lots.filter((x: any) => x.status === "DEPLETED").length} />
      </div>

      {canMaster ? <Card title="Mode Tracking Material"><form action={setLotModeAction} className="grid gap-3 md:grid-cols-3"><Field label="Material"><select name="material_id" required className={inputClass}><option value="">Pilih material</option>{materials.map((x: any) => <option key={x.id} value={x.id}>{x.material_code} · {x.name} · {x.standard_unit} · sekarang {x.lot_tracking_mode}</option>)}</select></Field><Field label="Mode"><select name="mode" className={inputClass}><option>ROLL</option><option>LOT</option><option>NONE</option></select></Field><div><button className={buttonClass}>Simpan Mode</button></div></form></Card> : null}

      {canReceive ? <Card title="Buat Roll/Lot dari Barang Masuk"><form action={createLotAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Barang Masuk"><select name="receipt_id" required className={inputClass}><option value="">Pilih receipt</option>{receipts.map((x: any) => {const m = materialMap.get(x.material_id) as any; return <option key={x.id} value={x.id}>{x.receipt_code} · {m?.name || "Bahan"} · {qty(x.input_quantity ?? x.quantity)} {x.input_unit ?? x.unit_snapshot}</option>;})}</select></Field><Field label="No Roll/Lot"><input name="roll_number" required className={inputClass} placeholder="R001" /></Field><Field label="Qty Asli Roll"><input name="original_quantity" type="number" min="0.0001" step="0.0001" required className={inputClass} /></Field><Field label="Satuan Asli"><select name="original_unit" required className={inputClass}><option value="">Pilih</option>{units.map((u) => <option key={u}>{u}</option>)}</select></Field><Field label="Supplier Lot No"><input name="supplier_lot_no" className={inputClass} /></Field><Field label="Catatan"><input name="notes" className={inputClass} /></Field><div><button className={buttonClass}>Buat Roll/Lot</button></div></form></Card> : null}

      {canIssue ? <Card title="Penuhi Permintaan Barang — Roll Utuh"><form action={fulfillRequestWithLotAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Tanggal"><input name="issue_date" type="date" required className={inputClass} /></Field><Field label="Detail Permintaan"><select name="request_item_id" required className={inputClass}><option value="">Pilih permintaan</option>{requestItems.map((x:any)=>{const r=requestMap.get(x.request_id) as any;return <option key={x.id} value={x.id}>{r?.request_code||`REQ #${x.request_id}`} · {r?.purpose||"-"} · {x.item_name_snapshot} · sisa {qty(Number(x.requested_qty)-Number(x.fulfilled_qty))} {x.unit_snapshot}</option>;})}</select></Field><Field label="Roll/Lot"><select name="material_lot_id" required className={inputClass}><option value="">Pilih roll</option>{availableWarehouseLots.map((x:any)=><option key={x.id} value={x.id}>{x.roll_number} · {x.material_name} · {qty(x.remaining_normalized_quantity)} {x.normalized_unit}</option>)}</select></Field><Field label="Pengambil"><select name="recipient_worker_id" className={inputClass}><option value="">Isi manual</option>{workers.map((x:any)=><option key={x.id} value={x.id}>{x.name} · {x.worker_code}</option>)}</select></Field><Field label="Nama Pengambil Manual"><input name="recipient_name" className={inputClass} /></Field><Field label="Keterangan"><input name="notes" className={inputClass} /></Field><div><button className={buttonClass}>Penuhi dengan Roll</button></div></form><p className="mt-2 text-xs text-slate-500">Qty yang memenuhi permintaan dihitung dari panjang normalized roll dikonversi ke satuan permintaan. Roll yang lebih besar dari sisa permintaan akan ditolak.</p></Card> : null}

      {canIssue ? <Card title="Barang Keluar Langsung — Roll Utuh"><form action={issueWholeLotAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="Tanggal"><input name="issue_date" type="date" required className={inputClass} /></Field><Field label="Roll/Lot"><select name="material_lot_id" required className={inputClass}><option value="">Pilih roll</option>{availableWarehouseLots.map((x: any) => <option key={x.id} value={x.id}>{x.roll_number} · {x.material_name} · sisa {qty(x.remaining_normalized_quantity)} {x.normalized_unit}</option>)}</select></Field><ProjectProductBomFields projects={projects.map((x:any)=>({id:x.id,name:x.name}))} products={products.map((x:any)=>({id:x.id,project_id:x.project_id,name:x.name}))} boms={boms.map((x:any)=>({id:x.id,project_id:x.project_id,product_id:x.product_id,label:`${x.component_name} · ${x.unit}`}))} className={inputClass} productRequired /><Field label="Tujuan"><select name="purpose" className={inputClass}><option>CUTTING</option><option>PRODUKSI</option></select></Field><Field label="Pengambil"><select name="recipient_worker_id" className={inputClass}><option value="">Isi manual</option>{workers.map((x: any) => <option key={x.id} value={x.id}>{x.name} · {x.worker_code}</option>)}</select></Field><Field label="Nama Pengambil Manual"><input name="recipient_name" className={inputClass} /></Field><Field label="Keterangan"><input name="notes" className={inputClass} /></Field><div><button className={buttonClass}>Keluarkan Roll Utuh</button></div></form></Card> : null}

      <Card title="Riwayat / Posisi Roll-Lot">
        {lots.length === 0 ? <Empty>Belum ada Roll/Lot.</Empty> : <TableWrap><thead><tr><Th>Roll</Th><Th>Material</Th><Th>Qty Asli</Th><Th>Normalized Awal</Th><Th>Sisa</Th><Th>Lokasi</Th><Th>Project / Produk</Th><Th>Status</Th></tr></thead><tbody>{lots.map((x: any) => <tr key={x.id}><Td><b>{x.roll_number}</b><div className="text-xs text-slate-500">{x.lot_code}</div></Td><Td>{x.material_name}</Td><Td>{qty(x.original_quantity)} {x.original_unit}</Td><Td>{qty(x.normalized_quantity)} {x.normalized_unit}</Td><Td>{qty(x.remaining_normalized_quantity)} {x.normalized_unit}</Td><Td>{x.location_name}</Td><Td>{x.project_name || "-"} · {x.product_name || "-"}</Td><Td><Badge>{x.status}</Badge></Td></tr>)}</tbody></TableWrap>}
      </Card>
    </PageShell>
  );
}
