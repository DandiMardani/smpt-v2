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

  const [fr, lr, tr] = await Promise.all([
    s.from("finished_goods").select("id, finished_good_code, name, status").eq("status", "AKTIF").order("name"),
    s.from("locations").select("id, name, status").eq("status", "AKTIF").order("name"),
    s.from("finished_goods_transfers").select("*").order("transfer_date", { ascending: false }).limit(300),
  ]);

  const e = [fr.error, lr.error, tr.error].find(Boolean);
  if (e) throw new Error(e.message);

  const fgMap = new Map((fr.data ?? []).map((x: any) => [x.id, x]));
  const locMap = new Map((lr.data ?? []).map((x: any) => [x.id, x.name]));
  const transfers = tr.data ?? [];

  const totalTransferQty = transfers.reduce((sum: number, x: any) => sum + (Number(x.quantity) || 0), 0);

  return (
    <PageShell
      eyebrow="QC & Logistik"
      title="Transfer Barang Jadi"
      description="Pencatatan transfer barang jadi antar lokasi gudang dan pabrik mitra dalam satu event mutasi stok atomik."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Total Riwayat Pengiriman" value={`${transfers.length} Transaksi`} />
        <Metric label="Total Fisik Terkirim" value={`${qty(totalTransferQty)} Unit / Pcs / Set`} />
      </div>

      {!can ? <ReadOnly /> : null}

      {can ? (
        <Card title="Formulir Transfer / Kirim Barang Jadi">
          <form action={transferFinishedGoodAction} className="grid gap-3 md:grid-cols-3">
            <Field label="Tanggal Transfer">
              <input name="transfer_date" type="date" required className={inputClass} defaultValue={new Date().toISOString().split("T")[0]} />
            </Field>
            <Field label="Barang Jadi / SET">
              <select name="finished_good_id" required className={inputClass}>
                <option value="">-- Pilih Barang Jadi / SET --</option>
                {(fr.data ?? []).map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.finished_good_code} · {x.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Lokasi Asal (Keluar)">
              <select name="source_location_id" required className={inputClass}>
                <option value="">-- Pilih Lokasi Asal --</option>
                {(lr.data ?? []).map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Lokasi Tujuan (Masuk)">
              <select name="destination_location_id" required className={inputClass}>
                <option value="">-- Pilih Lokasi Tujuan --</option>
                {(lr.data ?? []).map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Jumlah (Qty)">
              <input name="quantity" type="number" min="1" step="any" required className={inputClass} placeholder="0" />
            </Field>
            <Field label="No. Dokumen / Catatan">
              <input name="notes" className={inputClass} placeholder="Contoh: Surat Jalan Pengiriman ke Dadap..." />
            </Field>
            <div className="md:col-span-3 flex justify-end">
              <button className={buttonClass}>💾 Simpan Transfer Barang Jadi</button>
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
                <Th>Nama Barang / SET</Th>
                <Th>Rute Mutasi (Asal → Tujuan)</Th>
                <Th>Jumlah (Qty)</Th>
                <Th>Catatan / Surat Jalan</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((x: any) => {
                const fg = fgMap.get(x.finished_good_id);
                const srcName = locMap.get(x.source_location_id) || `Gudang #${x.source_location_id}`;
                const destName = locMap.get(x.destination_location_id) || `Gudang #${x.destination_location_id}`;

                return (
                  <tr key={x.id}>
                    <Td>
                      <span className="font-mono font-semibold text-xs text-sky-600">{x.transfer_code}</span>
                    </Td>
                    <Td>{x.transfer_date}</Td>
                    <Td>
                      <div className="font-medium text-gray-900">{fg?.name || `Barang #${x.finished_good_id}`}</div>
                      <div className="text-xs text-gray-500 font-mono">{fg?.finished_good_code || "-"}</div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">{srcName}</span>
                        <span className="text-gray-400">➔</span>
                        <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 font-medium">{destName}</span>
                      </div>
                    </Td>
                    <Td>
                      <span className="font-semibold text-gray-900">{qty(x.quantity)}</span>
                    </Td>
                    <Td>
                      <span className="text-xs text-gray-600">{x.notes || "-"}</span>
                    </Td>
                    <Td>
                      <Badge>{x.status}</Badge>
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
