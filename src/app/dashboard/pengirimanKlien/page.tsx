import {
  MasterPageShell,
  Notice,
  ReadOnlyBanner,
} from "@/components/master/master-ui";
import { requirePermission } from "@/lib/access/current-user";
import { param, type SearchParams } from "@/lib/master/page-utils";
import { createClient } from "@/lib/supabase/server";
import { PengirimanKlienClient } from "./pengiriman-klien-client";

type Props = { searchParams: Promise<SearchParams> };

export default async function PengirimanKlienPage({ searchParams }: Props) {
  const access = await requirePermission("stok_barang_jadi.view");
  const canWrite = access.permissionCodes.includes("stok_barang_jadi.view");
  const q = await searchParams;
  const supabase = await createClient();

  // 1. Ambil ID Lokasi PUSAT
  const { data: pusatLoc } = await supabase
    .from("locations")
    .select("id")
    .eq("name", "PUSAT")
    .maybeSingle();

  const pusatLocationId = pusatLoc?.id ?? 1;

  // 2. Ambil Stok Barang Jadi di Gudang PUSAT yang tersedia (> 0)
  const [stockRes, fgRes, transfersRes, locsRes] = await Promise.all([
    supabase
      .from("logistics_stock_balances")
      .select("finished_good_id, quantity")
      .eq("item_kind", "FINISHED_GOOD")
      .eq("location_id", pusatLocationId)
      .gt("quantity", 0),
    supabase
      .from("finished_goods")
      .select("id, finished_good_code, name, unit")
      .eq("status", "AKTIF"),
    supabase
      .from("finished_goods_transfers")
      .select("id, transfer_code, transfer_date, finished_good_id, destination_location_id, quantity, notes, status")
      .eq("source_location_id", pusatLocationId)
      .order("id", { ascending: false })
      .limit(50),
    supabase.from("locations").select("id, name, location_type"),
  ]);

  const stockRows = stockRes.data ?? [];
  const fgRows = fgRes.data ?? [];
  const fgMap = new Map(fgRows.map((f) => [f.id, f]));
  const locMap = new Map((locsRes.data ?? []).map((l) => [l.id, l]));

  // Gabungkan stok tersedia
  const availableFinishedGoods = stockRows
    .map((s) => {
      const fg = fgMap.get(s.finished_good_id);
      if (!fg) return null;
      return {
        id: fg.id,
        finished_good_code: fg.finished_good_code,
        name: fg.name,
        unit: fg.unit || "PCS",
        available_qty: Number(s.quantity || 0),
      };
    })
    .filter(Boolean) as any[];

  // Ambil riwayat pengiriman
  const recentShipments = (transfersRes.data ?? []).map((t) => {
    const fg = fgMap.get(t.finished_good_id);
    const dest = locMap.get(t.destination_location_id);
    return {
      id: t.id,
      transfer_code: t.transfer_code,
      transfer_date: t.transfer_date,
      finished_good_name: fg?.name || "Tas Jadi",
      finished_good_code: fg?.finished_good_code || "-",
      customer_name: dest?.name || "Klien",
      quantity: Number(t.quantity || 0),
      notes: t.notes || "",
    };
  });

  return (
    <MasterPageShell
      eyebrow="Logistik Reguler"
      title="Surat Jalan & Pengiriman Klien"
      description="Penerbitan Surat Jalan dan pengiriman tas pesanan langsung ke klien, sekolah, atau ekspedisi. Stok di Gudang PUSAT otomatis terpotong resmi."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnlyBanner /> : null}

      <PengirimanKlienClient
        finishedGoods={availableFinishedGoods}
        recentShipments={recentShipments}
        canWrite={canWrite}
      />
    </MasterPageShell>
  );
}
