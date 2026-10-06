import {
  Notice,
  PageShell,
  ReadOnly,
} from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { param, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import RejectEmbarkasiClient, {
  type ParsedIssueRow,
  type ShipmentOption,
} from "./reject-embarkasi-client";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const a = await requirePermission("reject_embarkasi.view");
  const can = a.permissionCodes.includes("reject_embarkasi.write");
  const q = await searchParams;
  const s = await createClient();

  const [sr, ir] = await Promise.all([
    s
      .from("embarkation_shipments")
      .select("id, shipment_code, status, shipment_date, document_no")
      .order("shipment_date", { ascending: false })
      .limit(500),
    s.from("embarkation_issues").select("*").order("id", { ascending: false }).limit(500),
  ]);

  const e = [sr.error, ir.error].find(Boolean);
  if (e) throw new Error(e.message);

  const rawIssues = ir.data ?? [];

  // Parse structured data from description (jika JSON) atau format manual
  const parsedRows: ParsedIssueRow[] = rawIssues.map((x: any, idx: number) => {
    try {
      if (x.description && x.description.startsWith("{")) {
        const d = JSON.parse(x.description);
        return {
          id: x.id,
          code: x.issue_code,
          no: d.no || rawIssues.length - idx,
          daerah: d.daerah || "Asrama Haji",
          embarkasi: d.embarkasi || "JKS",
          tambahan_set: d.tambahan_set || 0,
          koper_bagasi: d.koper_bagasi || 0,
          koper_kabin: d.koper_kabin || 0,
          kardus: d.kardus || 0,
          paket_isian: d.paket_isian || 0,
          cover_bagasi: d.cover_bagasi || 0,
          cover_kabin: d.cover_kabin || 0,
          tas_pasport: d.tas_pasport || 0,
          tas_ransel: d.tas_ransel || 0,
          hangtag: d.hangtag || 0,
          logo_kemenag: d.logo_kemenag || 0,
          logo_aybe: d.logo_aybe || 0,
          logo_saudi: d.logo_saudi || 0,
          sticker: d.sticker || 0,
          tgl_kirim: d.tgl_kirim || "-",
          no_dokumen: d.no_dokumen || "-",
          keterangan: d.keterangan || "Kekurangan / Reject",
          status: x.status || "PROSES",
          resolution: x.resolution,
        };
      }
    } catch {
      // Fallback
    }

    return {
      id: x.id,
      code: x.issue_code,
      no: rawIssues.length - idx,
      daerah: "-",
      embarkasi: "JKS",
      tambahan_set: 0,
      koper_bagasi: x.issue_type === "REJECT" ? Number(x.quantity || 0) : 0,
      koper_kabin: 0,
      kardus: 0,
      paket_isian: 0,
      cover_bagasi: 0,
      cover_kabin: 0,
      tas_pasport: 0,
      tas_ransel: 0,
      hangtag: 0,
      logo_kemenag: 0,
      logo_aybe: 0,
      logo_saudi: 0,
      sticker: 0,
      tgl_kirim: "-",
      no_dokumen: "-",
      keterangan: x.description || "-",
      status: x.status || "PROSES",
      resolution: x.resolution,
    };
  });

  const shipmentOptions: ShipmentOption[] = (sr.data ?? []).map((x: any) => ({
    id: x.id,
    shipment_code: x.shipment_code,
    status: x.status,
    shipment_date: x.shipment_date,
    document_no: x.document_no,
  }));

  return (
    <PageShell
      eyebrow="Distribusi & Layanan Embarkasi"
      title="Barang Reject & Pengiriman Return Pengganti (Haji 2026)"
      description="Pencatatan barang cacat/rusak/kekurangan fisik asrama haji (koper haji & perlengkapan barang jadi) serta monitoring pengiriman return penggantinya."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />

      {!can ? <ReadOnly /> : null}

      <RejectEmbarkasiClient
        initialRows={parsedRows}
        shipments={shipmentOptions}
        canWrite={can}
      />
    </PageShell>
  );
}
