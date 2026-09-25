import { Card, Empty, Field, Notice, PageShell, ReadOnly, TableWrap, Td, Th, buttonClass, inputClass } from "@/components/final/final-ui";
import { requireAnyPermission } from "@/lib/access/current-user";
import { param, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { deleteMaterialSupplierAction, deleteSupplierAction, saveMaterialSupplierAction, saveSupplierAction } from "./actions";

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
    <PageShell eyebrow="Master Data" title="Master Supplier / Vendor" description="Satu master untuk supplier pembelian dan vendor operasional. Dilengkapi fitur edit data supplier, rekening, dan relasi material.">
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

      <Card title={`Daftar Supplier / Vendor (${vendors.length})`}>
        {vendors.length === 0 ? <Empty>Belum ada Supplier/Vendor.</Empty> : (
          <div className="space-y-3">
            {vendors.map((x) => (
              <details key={x.id} className="group rounded-xl border border-gray-200 bg-white p-4 shadow-2xs hover:border-gray-300 transition">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">{x.vendor_code}</span>
                        <b className="text-gray-900 text-sm">{x.name}</b>
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-700">{x.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        PIC: <b className="text-gray-700">{x.pic_name || "-"}</b> · Kontak: {x.whatsapp || x.phone || x.email || "-"} · Terms: {x.payment_terms || "-"}
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
                  <form action={saveSupplierAction} className="mt-4 grid gap-3 border-t border-gray-100 pt-4 md:grid-cols-3">
                    <input type="hidden" name="id" value={x.id} />
                    <Field label="Nama"><input name="name" required defaultValue={x.name} className={inputClass} /></Field>
                    <Field label="PIC"><input name="pic_name" defaultValue={x.pic_name || ""} className={inputClass} /></Field>
                    <Field label="Telepon"><input name="phone" defaultValue={x.phone || ""} className={inputClass} /></Field>
                    <Field label="WhatsApp"><input name="whatsapp" defaultValue={x.whatsapp || ""} className={inputClass} /></Field>
                    <Field label="Email"><input name="email" type="email" defaultValue={x.email || ""} className={inputClass} /></Field>
                    <Field label="Kota"><input name="city" defaultValue={x.city || ""} className={inputClass} /></Field>
                    <Field label="Provinsi"><input name="province" defaultValue={x.province || ""} className={inputClass} /></Field>
                    <Field label="Alamat"><input name="address" defaultValue={x.address || ""} className={inputClass} /></Field>
                    <Field label="NPWP / Tax ID"><input name="tax_no" defaultValue={x.tax_no || ""} className={inputClass} /></Field>
                    <Field label="Payment Terms"><input name="payment_terms" defaultValue={x.payment_terms || ""} className={inputClass} /></Field>
                    <Field label="Currency Default"><input name="default_currency" defaultValue={x.default_currency || "IDR"} className={inputClass} /></Field>
                    <Field label="Lead Time (hari)"><input name="lead_time_days" type="number" min="0" defaultValue={x.lead_time_days ?? ""} className={inputClass} /></Field>
                    <Field label="Rating Internal"><input name="rating" type="number" min="0" step="0.1" defaultValue={x.rating ?? ""} className={inputClass} /></Field>
                    <Field label="Bank"><input name="bank_name" defaultValue={x.bank_name || ""} className={inputClass} /></Field>
                    <Field label="No Rekening"><input name="bank_account_no" defaultValue={x.bank_account_no || ""} className={inputClass} /></Field>
                    <Field label="Nama Rekening"><input name="bank_account_name" defaultValue={x.bank_account_name || ""} className={inputClass} /></Field>
                    <Field label="Catatan"><input name="notes" defaultValue={x.notes || ""} className={inputClass} /></Field>
                    <Field label="Catatan Internal"><input name="internal_notes" defaultValue={x.internal_notes || ""} className={inputClass} /></Field>
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
                        formAction={deleteSupplierAction}
                        formNoValidate
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition"
                      >
                        🗑️ Hapus Supplier
                      </button>
                    </div>
                  </form>
                ) : null}
              </details>
            ))}
          </div>
        )}
      </Card>

      <Card title={`Material ↔ Supplier · ${links.length} relasi`}>
        {links.length === 0 ? <Empty>Belum ada relasi material dengan supplier.</Empty> : <TableWrap><thead><tr><Th>Material</Th><Th>Supplier</Th><Th>Unit Supplier</Th><Th>MOQ</Th><Th>Harga Terakhir</Th><Th>Lead Time</Th><Th>Preferred</Th><Th>Aksi</Th></tr></thead><tbody>{links.map((x) => <tr key={x.id}><Td>{materialMap.get(x.material_id)?.name || `#${x.material_id}`}</Td><Td>{vendorMap.get(x.supplier_id)?.name || `#${x.supplier_id}`}</Td><Td>{x.supplier_unit || "-"}</Td><Td>{x.moq ?? "-"}</Td><Td>{x.last_price ?? "-"}</Td><Td>{x.estimated_lead_time_days == null ? "-" : `${x.estimated_lead_time_days} hari`}</Td><Td>{x.preferred ? "YA" : "-"}</Td><Td>{canWrite ? <form action={deleteMaterialSupplierAction}><input type="hidden" name="id" value={x.id}/><button type="submit" className="text-xs font-bold text-red-600 hover:underline">Hapus</button></form> : "-"}</Td></tr>)}</tbody></TableWrap>}
      </Card>
    </PageShell>
  );
}
