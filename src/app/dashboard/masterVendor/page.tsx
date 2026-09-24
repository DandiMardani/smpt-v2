import { Card, Empty, Field, Notice, PageShell, ReadOnly, TableWrap, Td, Th, buttonClass, inputClass } from "@/components/final/final-ui";
import { requireAnyPermission } from "@/lib/access/current-user";
import { param, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { saveMaterialSupplierAction, saveSupplierAction } from "./actions";

type Props = { searchParams: Promise<SearchParams> };

type Vendor = {
  id: number; vendor_code: string; name: string; pic_name: string | null; phone: string | null; whatsapp: string | null;
  email: string | null; address: string | null; city: string | null; province: string | null; tax_no: string | null;
  payment_terms: string | null; default_currency: string | null; lead_time_days: number | null; rating: number | null;
  bank_name: string | null; bank_account_no: string | null; bank_account_name: string | null; status: string; notes: string | null; internal_notes: string | null;
};
type Material = { id: number; material_code: string; name: string; standard_unit: string; status: string };
type LinkRow = { id: number; material_id: number; supplier_id: number; supplier_material_code: string | null; supplier_unit: string | null; last_price: number | string | null; preferred: boolean; moq: number | string | null; estimated_lead_time_days: number | null; status: string };

export default async function MasterVendorPage({ searchParams }: Props) {
  const access = await requireAnyPermission(["master_vendor.view", "supplier.view"]);
  const canWrite = access.permissionCodes.includes("master_vendor.write") || access.permissionCodes.includes("supplier.manage");
  const query = await searchParams;
  const supabase = await createClient();
  const [vendorResult, materialResult, linkResult] = await Promise.all([
    supabase.from("vendors").select("id,vendor_code,name,pic_name,phone,whatsapp,email,address,city,province,tax_no,payment_terms,default_currency,lead_time_days,rating,bank_name,bank_account_no,bank_account_name,status,notes,internal_notes").order("name").limit(500),
    supabase.from("materials").select("id,material_code,name,standard_unit,status").order("name").limit(1000),
    supabase.from("material_suppliers").select("id,material_id,supplier_id,supplier_material_code,supplier_unit,last_price,preferred,moq,estimated_lead_time_days,status").order("preferred", { ascending: false }).order("id").limit(1500),
  ]);
  if (vendorResult.error) throw new Error(vendorResult.error.message);
  if (materialResult.error) throw new Error(materialResult.error.message);
  if (linkResult.error) throw new Error(linkResult.error.message);

  const vendors = (vendorResult.data ?? []) as Vendor[];
  const materials = (materialResult.data ?? []) as Material[];
  const links = (linkResult.data ?? []) as LinkRow[];
  const vendorMap = new Map(vendors.map((row) => [row.id, row]));
  const materialMap = new Map(materials.map((row) => [row.id, row]));

  return (
    <PageShell eyebrow="Master Data" title="Master Supplier / Vendor" description="Satu master untuk supplier pembelian dan vendor operasional. Material tidak wajib punya supplier dan satu material boleh punya banyak supplier.">
      <Notice success={param(query, "success")} error={param(query, "error")} />
      {!canWrite ? <ReadOnly /> : null}

      {canWrite ? (
        <Card title="Tambah Supplier / Vendor">
          <form action={saveSupplierAction} className="grid gap-3 md:grid-cols-3">
            <Field label="Nama"><input name="name" required className={inputClass} /></Field>
            <Field label="PIC"><input name="pic_name" className={inputClass} /></Field>
            <Field label="Telepon"><input name="phone" className={inputClass} /></Field>
            <Field label="WhatsApp"><input name="whatsapp" className={inputClass} /></Field>
            <Field label="Email"><input name="email" type="email" className={inputClass} /></Field>
            <Field label="Kota"><input name="city" className={inputClass} /></Field>
            <Field label="Provinsi"><input name="province" className={inputClass} /></Field>
            <Field label="Alamat"><input name="address" className={inputClass} /></Field>
            <Field label="NPWP / Tax ID"><input name="tax_no" className={inputClass} /></Field>
            <Field label="Payment Terms"><input name="payment_terms" placeholder="Contoh: NET 30" className={inputClass} /></Field>
            <Field label="Currency Default"><input name="default_currency" defaultValue="IDR" className={inputClass} /></Field>
            <Field label="Lead Time (hari)"><input name="lead_time_days" type="number" min="0" className={inputClass} /></Field>
            <Field label="Rating Internal"><input name="rating" type="number" min="0" step="0.1" className={inputClass} /></Field>
            <Field label="Bank"><input name="bank_name" className={inputClass} /></Field>
            <Field label="No Rekening"><input name="bank_account_no" className={inputClass} /></Field>
            <Field label="Nama Rekening"><input name="bank_account_name" className={inputClass} /></Field>
            <Field label="Catatan"><input name="notes" className={inputClass} /></Field>
            <Field label="Catatan Internal"><input name="internal_notes" className={inputClass} /></Field>
            <Field label="Status"><select name="status" defaultValue="AKTIF" className={inputClass}><option value="AKTIF">AKTIF</option><option value="NONAKTIF">NONAKTIF</option></select></Field>
            <div className="md:col-span-3"><button className={buttonClass}>Simpan Supplier / Vendor</button></div>
          </form>
        </Card>
      ) : null}

      {canWrite ? (
        <Card title="Hubungkan Material ↔ Supplier">
          <form action={saveMaterialSupplierAction} className="grid gap-3 md:grid-cols-3">
            <Field label="Material"><select name="material_id" required defaultValue="" className={inputClass}><option value="" disabled>Pilih material</option>{materials.filter((x) => x.status === "AKTIF").map((x) => <option key={x.id} value={x.id}>{x.material_code} · {x.name} · {x.standard_unit}</option>)}</select></Field>
            <Field label="Supplier"><select name="supplier_id" required defaultValue="" className={inputClass}><option value="" disabled>Pilih supplier</option>{vendors.filter((x) => x.status === "AKTIF").map((x) => <option key={x.id} value={x.id}>{x.vendor_code} · {x.name}</option>)}</select></Field>
            <Field label="Kode Material Supplier"><input name="supplier_material_code" className={inputClass} /></Field>
            <Field label="Nama Material Supplier"><input name="supplier_material_name" className={inputClass} /></Field>
            <Field label="Unit Supplier"><input name="supplier_unit" placeholder="Yard / Meter / Roll" className={inputClass} /></Field>
            <Field label="Conversion Factor"><input name="conversion_factor" type="number" min="0.000000001" step="any" defaultValue="1" className={inputClass} /></Field>
            <Field label="Harga Terakhir"><input name="last_price" type="number" min="0" step="0.01" className={inputClass} /></Field>
            <Field label="MOQ"><input name="moq" type="number" min="0" step="any" className={inputClass} /></Field>
            <Field label="Lead Time (hari)"><input name="estimated_lead_time_days" type="number" min="0" className={inputClass} /></Field>
            <Field label="Default Purchase Unit"><input name="default_purchase_unit" className={inputClass} /></Field>
            <Field label="Preferred"><label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 font-medium cursor-pointer shadow-xs"><input name="preferred" type="checkbox" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" /> Supplier pilihan utama</label></Field>
            <Field label="Status"><select name="status" defaultValue="AKTIF" className={inputClass}><option value="AKTIF">AKTIF</option><option value="NONAKTIF">NONAKTIF</option></select></Field>
            <Field label="Catatan"><input name="notes" className={inputClass} /></Field>
            <div className="md:col-span-3"><button className={buttonClass}>Simpan Relasi Material ↔ Supplier</button></div>
          </form>
        </Card>
      ) : null}

      <Card title="Daftar Supplier / Vendor">
        {vendors.length === 0 ? <Empty>Belum ada Supplier/Vendor.</Empty> : <TableWrap><thead><tr><Th>Kode</Th><Th>Nama</Th><Th>PIC</Th><Th>Kontak</Th><Th>Terms</Th><Th>Status</Th></tr></thead><tbody>{vendors.map((x) => <tr key={x.id}><Td>{x.vendor_code}</Td><Td>{x.name}</Td><Td>{x.pic_name || "-"}</Td><Td>{x.whatsapp || x.phone || x.email || "-"}</Td><Td>{x.payment_terms || "-"}</Td><Td>{x.status}</Td></tr>)}</tbody></TableWrap>}
      </Card>

      <Card title={`Material ↔ Supplier · ${links.length} relasi`}>
        {links.length === 0 ? <Empty>Belum ada relasi material dengan supplier.</Empty> : <TableWrap><thead><tr><Th>Material</Th><Th>Supplier</Th><Th>Unit Supplier</Th><Th>MOQ</Th><Th>Harga Terakhir</Th><Th>Lead Time</Th><Th>Preferred</Th></tr></thead><tbody>{links.map((x) => <tr key={x.id}><Td>{materialMap.get(x.material_id)?.name || `#${x.material_id}`}</Td><Td>{vendorMap.get(x.supplier_id)?.name || `#${x.supplier_id}`}</Td><Td>{x.supplier_unit || "-"}</Td><Td>{x.moq ?? "-"}</Td><Td>{x.last_price ?? "-"}</Td><Td>{x.estimated_lead_time_days == null ? "-" : `${x.estimated_lead_time_days} hari`}</Td><Td>{x.preferred ? "YA" : "-"}</Td></tr>)}</tbody></TableWrap>}
      </Card>
    </PageShell>
  );
}
