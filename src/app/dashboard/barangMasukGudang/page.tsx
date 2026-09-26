import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  dangerButtonClass,
  Field,
  inputClass,
  MasterPageShell,
  Notice,
  primaryButtonClass,
  ReadOnlyBanner,
  SectionCard,
} from "@/components/master/master-ui";
import { requirePermission } from "@/lib/access/current-user";
import { formatNumber, param, type SearchParams } from "@/lib/master/page-utils";
import { createClient } from "@/lib/supabase/server";
import { cancelPoReceipt, cancelReceipt, createReceipt, receivePoReceipt, updateReceipt } from "./actions";

type Props = { searchParams: Promise<SearchParams> };
type Material = {
  id: number;
  material_code: string;
  name: string;
  standard_unit: string;
};
type Receipt = {
  id: number;
  receipt_code: string;
  receipt_date: string;
  material_id: number;
  quantity: number | string;
  unit_snapshot: string;
  input_quantity: number | string | null;
  input_unit: string | null;
  conversion_factor: number | string | null;
  supplier: string | null;
  document_no: string | null;
  notes: string | null;
  status: string;
  receipt_source: string;
  purchase_order_id: number | null;
  purchase_order_line_id: number | null;
};
type OpenPoLine = {
  purchase_order_line_id: number; purchase_order_id: number; po_number: string; supplier_name: string; material_id: number; material_code: string; material_name: string;
  ordered_quantity: number | string; purchase_unit: string; conversion_factor: number | string; ordered_stock_quantity: number | string; stock_unit: string;
  received_stock_quantity: number | string; outstanding_stock_quantity: number | string; lot_tracking_mode: string;
};

const units = [
  "METER",
  "YARD",
  "CM",
  "MM",
  "FT",
  "INCH",
  "KG",
  "GRAM",
  "MG",
  "TON",
  "LITER",
  "ML",
  "PCS",
  "LUSIN",
  "ROLL",
];

export default async function Page({ searchParams }: Props) {
  const access = await requirePermission("barang_masuk_gudang.view");
  const canWrite = access.permissionCodes.includes("barang_masuk_gudang.write");
  const canReceivePo = canWrite && access.permissionCodes.includes("procurement.receive");
  const query = await searchParams;
  const supabase = await createClient();

  const [materialsResult, receiptsResult, openPoResult] = await Promise.all([
    supabase
      .from("materials")
      .select("id,material_code,name,standard_unit")
      .eq("status", "AKTIF")
      .order("name"),
    supabase
      .from("warehouse_receipts")
      .select(
        "id,receipt_code,receipt_date,material_id,quantity,unit_snapshot,input_quantity,input_unit,conversion_factor,supplier,document_no,notes,status,receipt_source,purchase_order_id,purchase_order_line_id",
      )
      .order("id", { ascending: false })
      .limit(100),
    canReceivePo
      ? supabase.from("v_purchase_order_open_lines").select("purchase_order_line_id,purchase_order_id,po_number,supplier_name,material_id,material_code,material_name,ordered_quantity,purchase_unit,conversion_factor,ordered_stock_quantity,stock_unit,received_stock_quantity,outstanding_stock_quantity,lot_tracking_mode").order("purchase_order_id").order("purchase_order_line_id").limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (materialsResult.error || receiptsResult.error || openPoResult.error) {
    throw new Error(materialsResult.error?.message || receiptsResult.error?.message || openPoResult.error?.message);
  }

  const materials = (materialsResult.data ?? []) as Material[];
  const rows = (receiptsResult.data ?? []) as Receipt[];
  const openPoLines = (openPoResult.data ?? []) as OpenPoLine[];
  const materialMap = new Map(materials.map((material) => [material.id, material]));

  return (
    <MasterPageShell
      eyebrow="Gudang & Material"
      title="Barang Masuk Gudang"
      description="Penerimaan Bahan Baku (Kain Roll / Aksesoris). Qty disimpan apa adanya, lalu stok otomatis dinormalisasi ke satuan standar Master Bahan."
    >
      <Notice success={param(query, "success")} error={param(query, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      {/* Alur Logistik Terpadu Pabrik */}
      <div className="mb-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/90 to-indigo-50/70 p-4 text-xs text-slate-700 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 font-bold text-blue-900 text-sm">
            <span>🔄</span>
            <span>Alur Terpadu Logistik & Pengeluaran Pabrik</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs">
              📥 1. Bahan Datang (Halaman Ini)
            </span>
            <Link
              href="/dashboard/cutting"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              ✂️ 2. Cutting (Input Potong)
            </Link>
            <Link
              href="/dashboard/barangKeluarGudang"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              🚪 3. Barang Keluar (1 Pintu)
            </Link>
            <Link
              href="/dashboard/stokGudang"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              📦 4. Pantau Stok
            </Link>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-5 text-center">
          <div className="rounded-xl border border-blue-300 bg-white p-2.5 shadow-2xs font-semibold text-blue-800">
            <span className="block font-bold">1. Penerimaan Bahan</span>
            <span className="text-[11px] text-slate-500">Roll Kain / Aksesoris Masuk</span>
          </div>
          <div className="flex items-center justify-center font-bold text-blue-400">➔</div>
          <div className="rounded-xl border border-slate-200 bg-white/80 p-2.5 shadow-2xs">
            <span className="block font-bold text-slate-700">2. Keluar ke Cutting</span>
            <span className="text-[11px] text-slate-500">Kain dipotong di Cutting</span>
          </div>
          <div className="flex items-center justify-center font-bold text-blue-400">➔</div>
          <div className="rounded-xl border border-slate-200 bg-white/80 p-2.5 shadow-2xs">
            <span className="block font-bold text-slate-700">3. Gudang Potong & Sablon</span>
            <span className="text-[11px] text-slate-500">Siap Jahit / Produksi (1 Pintu)</span>
          </div>
        </div>
      </div>

      {canReceivePo ? (
        <SectionCard
          title={`Receive From PO (${openPoLines.length})`}
          description="Partial receipt didukung. Untuk material ROLL, catat panjang aktual tiap roll (METER/YARD) dan nomor roll; jangan memakai panjang roll fixed."
        >
          <div className="space-y-3">
            {openPoLines.length === 0 ? <p className="text-sm text-slate-500">Tidak ada PO issued/partial yang masih outstanding.</p> : null}
            {openPoLines.map((line) => (
              <div key={line.purchase_order_line_id} className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs">
                <div className="mb-3 flex flex-wrap justify-between gap-3"><div><b className="text-slate-900 font-bold">{line.po_number} · {line.material_code} · {line.material_name}</b><p className="text-xs text-slate-500">Supplier {line.supplier_name} · order {formatNumber(line.ordered_quantity)} {line.purchase_unit} · tracking {line.lot_tracking_mode}</p></div><div className="text-right"><b className="text-blue-600 font-bold">Outstanding {formatNumber(line.outstanding_stock_quantity)} {line.stock_unit}</b><p className="text-xs text-slate-500">received {formatNumber(line.received_stock_quantity)} / {formatNumber(line.ordered_stock_quantity)}</p></div></div>
                <form action={receivePoReceipt} className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <input type="hidden" name="purchase_order_line_id" value={line.purchase_order_line_id} />
                  <input type="hidden" name="idempotency_key" value={randomUUID()} />
                  <Field label="Tanggal"><input name="receipt_date" type="date" required className={inputClass} /></Field>
                  <Field label="Qty Aktual"><input name="quantity" type="number" min="0.0001" step="0.0001" required className={inputClass} /></Field>
                  <Field label="Unit Aktual"><select name="input_unit" defaultValue={line.lot_tracking_mode === "ROLL" ? line.stock_unit : line.purchase_unit} className={inputClass}>{Array.from(new Set([...units, line.purchase_unit, line.stock_unit].filter(Boolean))).map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></Field>
                  <Field label="Factor → Stock"><input name="conversion_factor" type="number" min="0.00000001" step="0.00000001" placeholder={String(line.conversion_factor)} className={inputClass} /></Field>
                  <Field label="No Dokumen"><input name="document_no" className={inputClass} /></Field>
                  {line.lot_tracking_mode !== "NONE" ? <Field label="Nomor Roll/Lot"><input name="roll_number" required className={inputClass} /></Field> : null}
                  {line.lot_tracking_mode !== "NONE" ? <Field label="Supplier Lot"><input name="supplier_lot_no" className={inputClass} /></Field> : null}
                  <Field label="Keterangan"><input name="notes" className={inputClass} /></Field>
                  <div className="self-end"><button className={primaryButtonClass}>Terima PO</button></div>
                </form>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {canWrite ? (
        <SectionCard
          title="Catat Barang Masuk"
          description="Kosongkan Satuan Transaksi jika sama dengan satuan stok. METER↔YARD dan satuan panjang/berat umum dikonversi otomatis. Faktor manual hanya untuk konversi khusus, contoh 1 ROLL = 50 METER."
        >
          <form action={createReceipt} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Tanggal">
              <input name="receipt_date" type="date" required className={inputClass} />
            </Field>
            <Field label="Bahan">
              <select name="material_id" required className={inputClass}>
                <option value="">Pilih bahan</option>
                {materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.material_code} · {material.name} · stok {material.standard_unit}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Qty Diterima">
              <input
                name="quantity"
                type="number"
                min="0.0001"
                step="0.0001"
                required
                className={inputClass}
              />
            </Field>
            <Field label="Satuan Transaksi">
              <select name="input_unit" className={inputClass} defaultValue="">
                <option value="">Sama dengan satuan stok</option>
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Faktor → Satuan Stok">
              <input
                name="conversion_factor"
                type="number"
                min="0.00000001"
                step="0.00000001"
                className={inputClass}
                placeholder="Opsional; contoh 50 untuk 1 ROLL = 50 METER"
              />
            </Field>
            <Field label="Supplier">
              <input name="supplier" className={inputClass} />
            </Field>
            <Field label="No Dokumen">
              <input name="document_no" className={inputClass} />
            </Field>
            <Field label="Keterangan">
              <input name="notes" className={inputClass} />
            </Field>
            <div>
              <button className={primaryButtonClass}>Simpan</button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Riwayat Barang Masuk">
        <div className="space-y-3">
          {rows.map((row) => {
            const sourceQty = row.input_quantity ?? row.quantity;
            const sourceUnit = row.input_unit ?? row.unit_snapshot;
            const converted =
              String(sourceUnit).toUpperCase() !== String(row.unit_snapshot).toUpperCase() ||
              Number(row.conversion_factor ?? 1) !== 1;

            return (
              <details
                key={row.id}
                className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex justify-between gap-3">
                    <div>
                      <b className="text-slate-900 font-bold">
                        {row.receipt_code} · {materialMap.get(row.material_id)?.name || "Bahan"}
                      </b>
                      <p className="text-xs text-slate-500">
                        {row.receipt_date} · {row.supplier || "-"} · {row.receipt_source === "PO" ? "FROM PO" : "NON-PO"} · {row.status}
                      </p>
                    </div>
                    <div className="text-right">
                      <b className="text-blue-600 font-bold">
                        {formatNumber(sourceQty)} {sourceUnit}
                      </b>
                      {converted ? (
                        <p className="text-xs text-slate-500">
                          stok +{formatNumber(row.quantity)} {row.unit_snapshot}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </summary>

                {canWrite && row.status === "AKTIF" && row.receipt_source !== "PO" ? (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <form action={updateReceipt} className="grid gap-3 md:grid-cols-3">
                      <input type="hidden" name="id" value={row.id} />
                      <Field label="Tanggal">
                        <input
                          name="receipt_date"
                          type="date"
                          defaultValue={row.receipt_date}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Qty Transaksi">
                        <input
                          name="quantity"
                          type="number"
                          min="0.0001"
                          step="0.0001"
                          defaultValue={String(sourceQty)}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Satuan Transaksi">
                        <select
                          name="input_unit"
                          className={inputClass}
                          defaultValue={String(sourceUnit).toUpperCase()}
                        >
                          <option value={row.unit_snapshot}>{row.unit_snapshot}</option>
                          {units
                            .filter((unit) => unit !== String(row.unit_snapshot).toUpperCase())
                            .map((unit) => (
                              <option key={unit} value={unit}>
                                {unit}
                              </option>
                            ))}
                        </select>
                      </Field>
                      <Field label="Faktor → Satuan Stok">
                        <input
                          name="conversion_factor"
                          type="number"
                          min="0.00000001"
                          step="0.00000001"
                          defaultValue={
                            row.conversion_factor ? String(row.conversion_factor) : ""
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Supplier">
                        <input
                          name="supplier"
                          defaultValue={row.supplier ?? ""}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="No Dokumen">
                        <input
                          name="document_no"
                          defaultValue={row.document_no ?? ""}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Keterangan">
                        <input
                          name="notes"
                          defaultValue={row.notes ?? ""}
                          className={inputClass}
                        />
                      </Field>
                      <div>
                        <button className={primaryButtonClass}>Simpan Koreksi</button>
                      </div>
                    </form>
                    <form action={cancelReceipt} className="mt-3">
                      <input type="hidden" name="id" value={row.id} />
                      <button className={dangerButtonClass}>Batalkan + Reversal</button>
                    </form>
                  </div>
                ) : null}
                {canReceivePo && row.status === "AKTIF" && row.receipt_source === "PO" ? (
                  <form action={cancelPoReceipt} className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_auto]">
                    <input type="hidden" name="id" value={row.id} />
                    <input name="reason" placeholder="Alasan reversal PO receipt" className={inputClass} />
                    <button className={dangerButtonClass}>Reversal PO Receipt</button>
                  </form>
                ) : null}
              </details>
            );
          })}
        </div>
      </SectionCard>
    </MasterPageShell>
  );
}
