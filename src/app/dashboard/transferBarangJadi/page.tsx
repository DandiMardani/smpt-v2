import { Badge, Card, Empty, Field, Metric, Notice, PageShell, ReadOnly, TableWrap, Td, Th, buttonClass, inputClass } from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { param, qty, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { transferFinishedGoodAction } from "@/lib/final/actions";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("transfer_barang_jadi.view");
  const can = a.permissionCodes.includes("transfer_barang_jadi.write");
  const q = await searchParams;
  const s = await createClient();

  const PUSAT_LOCATION_ID = 1;

  // 1. Ambil Barang Satuan, Paket Isian, Saldo Stok, Lokasi, dan Riwayat Transfer
  const [fr, pkgRes, lr, tr, balFgRes, balPkgRes] = await Promise.all([
    s.from("finished_goods").select("id, finished_good_code, name, status").eq("status", "AKTIF").order("name"),
    s.from("bundle_packages").select("id, package_code, name, status").eq("status", "AKTIF").order("name"),
    s.from("locations").select("id, name, status").eq("status", "AKTIF").order("name"),
    s.from("finished_goods_transfers").select("*").order("transfer_date", { ascending: false }).limit(300),
    s.from("logistics_stock_balances").select("finished_good_id, quantity").eq("location_id", PUSAT_LOCATION_ID).eq("item_kind", "FINISHED_GOOD"),
    s.from("bundle_package_balances").select("package_id, quantity").eq("location_id", PUSAT_LOCATION_ID),
  ]);

  const e = [fr.error, pkgRes.error, lr.error, tr.error].find(Boolean);
  if (e) throw new Error(e.message);

  // Mapping Saldo Stok Ready di Gudang Pusat
  const fgStockMap = new Map<number, number>();
  (balFgRes.data ?? []).forEach((b: any) => {
    fgStockMap.set(Number(b.finished_good_id), Number(b.quantity || 0));
  });

  const pkgStockMap = new Map<number, number>();
  (balPkgRes.data ?? []).forEach((b: any) => {
    pkgStockMap.set(Number(b.package_id), Number(b.quantity || 0));
  });

  // Filter Barang Satuan (Keluarkan Mahjong & Dummy)
  const EXCLUDED_KEYWORDS = ["MAHJONG", "DUMMY"];
  const finishedGoods = (fr.data ?? []).filter((x: any) => {
    const nameUpper = String(x.name || "").toUpperCase();
    return !EXCLUDED_KEYWORDS.some((kw) => nameUpper.includes(kw));
  });

  const packages = pkgRes.data ?? [];
  const fgMap = new Map(finishedGoods.map((x: any) => [x.id, x]));
  const packageMap = new Map(packages.map((x: any) => [x.id, x]));
  const locMap = new Map((lr.data ?? []).map((x: any) => [x.id, x.name]));
  const transfers = tr.data ?? [];

  const totalTransferQty = transfers.reduce((sum: number, x: any) => sum + (Number(x.quantity) || 0), 0);
  const todayDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

  return (
    <PageShell
      eyebrow="QC & Logistik"
      title="Transfer Barang Jadi & Paket Isian"
      description="Pencatatan transfer paket isian hasil bundling dan barang jadi satuan antar gudang Pusat dan mitra MR WU dalam satu surat jalan resmi."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Total Riwayat Pengiriman" value={`${transfers.length} Transaksi`} />
        <Metric label="Total Fisik Terkirim" value={`${qty(totalTransferQty)} Unit / Pcs / Paket`} />
      </div>

      {!can ? <ReadOnly /> : null}

      {can ? (
        <Card title="Formulir Transfer / Kirim Barang ke Pabrik Mitra MR WU">
          <form action={transferFinishedGoodAction} className="grid gap-3 md:grid-cols-3">
            <Field label="Tanggal Transfer">
              <input
                name="transfer_date"
                type="date"
                required
                className={inputClass}
                defaultValue={todayDate}
              />
            </Field>

            <Field label="Pilih Barang yang Mau Ditransfer">
              <select name="item_ref" required className={inputClass}>
                <option value="">-- Pilih Paket Isian atau Barang Satuan --</option>

                {/* KELOMPOK 1: PAKET ISIAN */}
                <optgroup label="📦 PAKET ISIAN KOPER (Hasil Bundling)">
                  {packages.map((pkg: any) => {
                    const st = pkgStockMap.get(pkg.id) || 0;
                    return (
                      <option key={`pkg-${pkg.id}`} value={`PACKAGE:${pkg.id}`}>
                        {pkg.package_code} · {pkg.name} (Stok Ready Pusat: {qty(st)} Paket)
                      </option>
                    );
                  })}
                </optgroup>

                {/* KELOMPOK 2: BARANG SATUAN */}
                <optgroup label="🏷️ BARANG JADI SATUAN / NON-PAKET (Eceran / Lepasan)">
                  {finishedGoods.map((x: any) => {
                    const st = fgStockMap.get(x.id) || 0;
                    return (
                      <option key={`fg-${x.id}`} value={`FINISHED_GOOD:${x.id}`}>
                        {x.finished_good_code} · {x.name} (Stok Ready Pusat: {qty(st)} Pcs)
                      </option>
                    );
                  })}
                </optgroup>
              </select>
            </Field>

            <Field label="Jumlah (Qty)">
              <input
                name="quantity"
                type="number"
                min="1"
                step="any"
                required
                className={inputClass}
                placeholder="Contoh: 50"
              />
            </Field>

            <Field label="Lokasi Asal (Pengirim)">
              <select name="source_location_id" required className={inputClass} defaultValue={1}>
                {(lr.data ?? []).map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Lokasi Tujuan (Penerima)">
              <select name="destination_location_id" required className={inputClass} defaultValue={2}>
                <option value="">-- Pilih Lokasi Tujuan --</option>
                {(lr.data ?? []).map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="No. Surat Jalan / Keterangan Transfer">
              <input
                name="notes"
                className={inputClass}
                placeholder="Contoh: SJ-001/PST/DADAP - Truk Angkutan Batch 1"
              />
            </Field>

            <div className="md:col-span-3 flex justify-end">
              <button className={buttonClass}>🚚 Proses Surat Jalan Transfer</button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title={`Riwayat Mutasi & Pengiriman (${transfers.length} Data)`}>
        {transfers.length === 0 ? (
          <Empty>Belum ada riwayat transfer barang jadi.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Kode Bukti</Th>
                <Th>Tanggal</Th>
                <Th>Jenis & Nama Barang</Th>
                <Th>Rute Mutasi (Asal → Tujuan)</Th>
                <Th className="text-right">Jumlah (Qty)</Th>
                <Th>Catatan / Surat Jalan</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((x: any) => {
                const isPackage = x.item_kind === "PACKAGE" || (!x.finished_good_id && x.package_id);
                const pkg = isPackage ? packageMap.get(x.package_id) : null;
                const fg = !isPackage ? fgMap.get(x.finished_good_id) : null;

                const srcName = locMap.get(x.source_location_id) || `Gudang #${x.source_location_id}`;
                const destName = locMap.get(x.destination_location_id) || `Gudang #${x.destination_location_id}`;

                return (
                  <tr key={x.id} className="hover:bg-slate-50/70 transition">
                    <Td>
                      <span className="font-mono font-semibold text-xs text-sky-600">{x.transfer_code}</span>
                    </Td>
                    <Td>{x.transfer_date}</Td>
                    <Td>
                      {isPackage ? (
                        <div>
                          <span className="inline-block rounded-sm bg-blue-100 px-1.5 py-0.2 text-[10px] font-black text-blue-700 uppercase mb-0.5">
                            Paket Isian
                          </span>
                          <div className="font-extrabold text-blue-950">{pkg?.name || `Paket #${x.package_id}`}</div>
                          <div className="text-xs text-blue-600 font-mono">{pkg?.package_code || "-"}</div>
                        </div>
                      ) : (
                        <div>
                          <span className="inline-block rounded-sm bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                            Barang Satuan
                          </span>
                          <div className="font-semibold text-gray-900">{fg?.name || `Barang #${x.finished_good_id}`}</div>
                          <div className="text-xs text-gray-500 font-mono">{fg?.finished_good_code || "-"}</div>
                        </div>
                      )}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">{srcName}</span>
                        <span className="text-gray-400">➔</span>
                        <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 font-semibold">{destName}</span>
                      </div>
                    </Td>
                    <Td className="text-right font-black text-slate-900">
                      {qty(x.quantity)} {isPackage ? "Paket" : "Pcs"}
                    </Td>
                    <Td>
                      <span className="text-xs text-gray-600">{x.notes || "-"}</span>
                    </Td>
                    <Td>
                      <Badge>{x.delivery_status || x.status || "DIKIRIM"}</Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </PageShell>
  );
}
