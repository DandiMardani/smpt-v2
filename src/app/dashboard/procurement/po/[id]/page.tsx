import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/access/current-user";
import { formatNumber } from "@/lib/master/page-utils";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "./print-button";

type Props = { params: Promise<{ id: string }> };
type Po = {
  id: number; po_number: string; supplier_id: number; supplier_name: string; order_date: string; expected_date: string | null;
  currency: string; status: string; notes: string | null; total_amount: number | string;
};
type Line = {
  id: number; material_id: number; ordered_quantity: number | string; purchase_unit: string; unit_price: number | string;
  ordered_stock_quantity: number | string; stock_unit: string;
};
type Material = { id: number; material_code: string; name: string };
type Vendor = { id: number; name: string; pic_name: string | null; phone: string | null; whatsapp: string | null; email: string | null; address: string | null; city: string | null; province: string | null; payment_terms: string | null; tax_no: string | null };

function formatMoney(value: number | string, currency: string): string {
  const amount = Number(value);
  try {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `${currency} ${formatNumber(amount)}`;
  }
}

export default async function Page({ params }: Props) {
  await requirePermission("procurement.view");
  const { id } = await params;
  const poId = Number(id);
  if (!Number.isSafeInteger(poId) || poId <= 0) notFound();
  const supabase = await createClient();

  const [poRes, linesRes] = await Promise.all([
    supabase.from("v_purchase_orders").select("id,po_number,supplier_id,supplier_name,order_date,expected_date,currency,status,notes,total_amount").eq("id", poId).maybeSingle(),
    supabase.from("purchase_order_lines").select("id,material_id,ordered_quantity,purchase_unit,unit_price,ordered_stock_quantity,stock_unit").eq("purchase_order_id", poId).neq("status", "CANCELLED").order("id"),
  ]);
  if (poRes.error || linesRes.error) throw new Error(poRes.error?.message || linesRes.error?.message);
  if (!poRes.data) notFound();

  const po = poRes.data as Po;
  const lines = (linesRes.data ?? []) as Line[];
  const materialIds = Array.from(new Set(lines.map((x) => x.material_id)));
  const [materialsRes, vendorRes] = await Promise.all([
    materialIds.length ? supabase.from("materials").select("id,material_code,name").in("id", materialIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("vendors").select("id,name,pic_name,phone,whatsapp,email,address,city,province,payment_terms,tax_no").eq("id", po.supplier_id).maybeSingle(),
  ]);
  if (materialsRes.error || vendorRes.error) throw new Error(materialsRes.error?.message || vendorRes.error?.message);
  const materialMap = new Map(((materialsRes.data ?? []) as Material[]).map((x) => [x.id, x]));
  const vendor = vendorRes.data as Vendor | null;

  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-white p-6 text-slate-900 sm:p-10 print:max-w-none print:p-0">
      <div className="mb-8 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/procurement?po=${po.id}`} className="text-sm font-semibold text-sky-700">← Kembali Procurement</Link>
        <PrintButton />
      </div>

      <header className="border-b-2 border-slate-900 pb-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Kreasi Dinamika Maju Bersama</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">PURCHASE ORDER</h1>
            <p className="mt-1 text-sm text-slate-500">Dokumen pembelian material SMPT</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-xs uppercase text-slate-500">No. PO</p>
            <p className="text-xl font-black">{po.po_number}</p>
            <p className="mt-2">Tanggal: <b>{po.order_date}</b></p>
            <p>Expected: <b>{po.expected_date || "-"}</b></p>
            <p>Status: <b>{po.status}</b></p>
          </div>
        </div>
      </header>

      <section className="grid gap-6 border-b border-slate-300 py-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Supplier</p>
          <p className="mt-2 text-lg font-bold">{po.supplier_name}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{vendor?.address || "-"}{vendor?.city ? `, ${vendor.city}` : ""}{vendor?.province ? `, ${vendor.province}` : ""}</p>
          <p className="text-sm text-slate-600">PIC: {vendor?.pic_name || "-"} · {vendor?.whatsapp || vendor?.phone || vendor?.email || "-"}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Terms</p>
          <p className="mt-2 text-sm">Payment: <b>{vendor?.payment_terms || "-"}</b></p>
          <p className="text-sm">Currency: <b>{po.currency}</b></p>
          {vendor?.tax_no ? <p className="text-sm">Tax No: <b>{vendor.tax_no}</b></p> : null}
        </div>
      </section>

      <section className="py-6">
        <div className="overflow-hidden rounded-xl border border-slate-300 print:rounded-none">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-100">
              <tr><th className="px-3 py-3 text-left">#</th><th className="px-3 py-3 text-left">Material</th><th className="px-3 py-3 text-right">Qty</th><th className="px-3 py-3 text-right">Harga</th><th className="px-3 py-3 text-right">Subtotal</th></tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const material = materialMap.get(line.material_id);
                const subtotal = Number(line.ordered_quantity) * Number(line.unit_price);
                return <tr key={line.id} className="border-t border-slate-200"><td className="px-3 py-3">{index + 1}</td><td className="px-3 py-3"><b>{material?.material_code || `#${line.material_id}`}</b><br/><span className="text-slate-600">{material?.name || "Material"}</span><br/><span className="text-xs text-slate-500">Normalized {formatNumber(line.ordered_stock_quantity)} {line.stock_unit}</span></td><td className="px-3 py-3 text-right">{formatNumber(line.ordered_quantity)} {line.purchase_unit}</td><td className="px-3 py-3 text-right">{formatMoney(line.unit_price, po.currency)}</td><td className="px-3 py-3 text-right font-semibold">{formatMoney(subtotal, po.currency)}</td></tr>;
              })}
            </tbody>
            <tfoot><tr className="border-t-2 border-slate-900"><td colSpan={4} className="px-3 py-4 text-right font-bold">TOTAL</td><td className="px-3 py-4 text-right text-lg font-black">{formatMoney(po.total_amount, po.currency)}</td></tr></tfoot>
          </table>
        </div>
      </section>

      {po.notes ? <section className="rounded-xl border border-slate-300 p-4 text-sm"><p className="text-xs font-bold uppercase text-slate-500">Catatan</p><p className="mt-2 whitespace-pre-wrap">{po.notes}</p></section> : null}

      <footer className="mt-12 grid grid-cols-2 gap-12 text-center text-sm">
        <div><p>Dibuat / Procurement</p><div className="h-20"/><div className="border-t border-slate-500 pt-2">Nama & Tanda Tangan</div></div>
        <div><p>Disetujui</p><div className="h-20"/><div className="border-t border-slate-500 pt-2">Nama & Tanda Tangan</div></div>
      </footer>
    </main>
  );
}
