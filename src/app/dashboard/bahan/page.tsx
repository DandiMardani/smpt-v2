import { MasterPageShell, ReadOnlyBanner } from "@/components/master/master-ui";
import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  MrpDashboardClient,
  type ProjectMrpGroup,
  type MaterialMrpItem,
  type ProductBreakdown,
  type RawLedgerEntry,
} from "./mrp-dashboard-client";

type ProjectRow = {
  id: number;
  name: string;
  project_code?: string | null;
  status?: string | null;
};

type ProductRow = {
  id: number;
  project_id: number;
  name: string;
  product_code?: string | null;
  target_production: number | string | null;
  unit?: string | null;
  status?: string | null;
};

type MaterialRow = {
  id: number;
  material_code: string;
  name: string;
  standard_unit: string;
  calculation_type?: string | null;
  status?: string | null;
};

type BomRow = {
  id: number;
  project_id: number;
  product_id: number;
  material_id: number | null;
  component_type: string;
  component_name: string;
  unit: string;
  qty_per_unit: number | string | null;
  allowance_percent: number | string | null;
  net_usage_per_product: number | string | null;
  final_requirement: number | string | null;
  status: string;
};

type LedgerRow = {
  id: number;
  material_id: number | null;
  location_id: number;
  project_id: number | null;
  product_id: number | null;
  movement_kind: string;
  quantity_delta: number | string;
  unit_snapshot: string;
  notes: string | null;
  created_at: string;
};

type LocationRow = {
  id: number;
  code?: string | null;
  name: string;
  physical_group?: string | null;
};

type StockBalanceRow = {
  id: number;
  item_kind: string;
  material_id: number | null;
  location_id: number;
  project_id: number | null;
  quantity: number | string;
};

type WarehouseIssueRow = {
  id: number;
  project_id: number;
  product_id?: number | null;
  material_id: number | null;
  quantity: number | string;
};

export default async function Page() {
  await requirePermission("log_bahan.view");
  const s = await createClient();

  const [
    projectsRes,
    productsRes,
    materialsRes,
    bomsRes,
    ledgerRes,
    locationsRes,
    balancesRes,
    issuesRes,
  ] = await Promise.all([
    s.from("projects").select("id, name, project_code, status").order("name"),
    s.from("project_products").select("id, project_id, name, product_code, target_production, unit, status").order("name"),
    s.from("materials").select("id, material_code, name, standard_unit, calculation_type, status").order("name"),
    s
      .from("bom_requirements")
      .select("id, project_id, product_id, material_id, component_type, component_name, unit, qty_per_unit, allowance_percent, net_usage_per_product, final_requirement, status")
      .eq("component_type", "BAHAN")
      .neq("status", "NONAKTIF"),
    s
      .from("stock_ledger_entries")
      .select("id, material_id, location_id, project_id, product_id, movement_kind, quantity_delta, unit_snapshot, notes, created_at")
      .eq("item_kind", "MATERIAL")
      .order("created_at", { ascending: false })
      .limit(500),
    s.from("stock_locations").select("id, code, name, physical_group"),
    s
      .from("stock_balances")
      .select("id, item_kind, material_id, location_id, project_id, quantity")
      .eq("item_kind", "MATERIAL")
      .gt("quantity", 0),
    s
      .from("warehouse_issues")
      .select("id, project_id, product_id, material_id, quantity")
      .not("material_id", "is", null)
      .limit(10000),
  ]);

  const error = [
    projectsRes.error,
    productsRes.error,
    materialsRes.error,
    bomsRes.error,
    ledgerRes.error,
    locationsRes.error,
    balancesRes.error,
    issuesRes.error,
  ].find(Boolean);
  if (error) {
    throw new Error(error.message);
  }

  const projects = (projectsRes.data ?? []) as ProjectRow[];
  const products = (productsRes.data ?? []) as ProductRow[];
  const materials = (materialsRes.data ?? []) as MaterialRow[];
  const boms = (bomsRes.data ?? []) as BomRow[];
  const ledgerEntries = (ledgerRes.data ?? []) as LedgerRow[];
  const locations = (locationsRes.data ?? []) as LocationRow[];
  const stockBalances = (balancesRes.data ?? []) as StockBalanceRow[];
  const warehouseIssues = (issuesRes.data ?? []) as WarehouseIssueRow[];

  const materialsMap = new Map<number, MaterialRow>(materials.map((m) => [m.id, m]));
  const productsMap = new Map<number, ProductRow>(products.map((p) => [p.id, p]));
  const projectsMap = new Map<number, ProjectRow>(projects.map((pr) => [pr.id, pr]));
  const locationsMap = new Map<number, LocationRow>(locations.map((l) => [l.id, l]));

  // 1. Stok Gudang Global (stok fisik bahan baku saat ini di gudang, tanpa filter proyek)
  const gudangBahanLoc = locations.find((l) => l.code === "GUDANG_BAHAN");
  const globalStockMap = new Map<number, number>();
  for (const bal of stockBalances) {
    if (!bal.material_id) continue;
    // Prioritaskan lokasi Gudang Bahan
    if (gudangBahanLoc && bal.location_id !== gudangBahanLoc.id) {
      continue;
    }
    const qty = Number(bal.quantity || 0);
    if (qty > 0) {
      globalStockMap.set(bal.material_id, (globalStockMap.get(bal.material_id) || 0) + qty);
    }
  }

  // Fallback jika tidak ada data spesifik kode GUDANG_BAHAN
  if (globalStockMap.size === 0 && stockBalances.length > 0) {
    for (const bal of stockBalances) {
      if (!bal.material_id) continue;
      const qty = Number(bal.quantity || 0);
      if (qty > 0) {
        globalStockMap.set(bal.material_id, (globalStockMap.get(bal.material_id) || 0) + qty);
      }
    }
  }

  // 2. Agregasi Barang Keluar dari warehouse_issues (pengeluaran gudang yang di-tag ke project_id)
  const warehouseIssueMap = new Map<string, number>();
  for (const iss of warehouseIssues) {
    if (iss.project_id && iss.material_id) {
      const qty = Number(iss.quantity || 0);
      if (qty > 0) {
        const key = `${iss.project_id}_${iss.material_id}`;
        warehouseIssueMap.set(key, (warehouseIssueMap.get(key) || 0) + qty);
      }
    }
  }

  // 3. Agregasi Mutasi Keluar dari stock_ledger_entries yang di-tag ke project_id
  const ledgerOutboundMap = new Map<string, number>();
  for (const ent of ledgerEntries) {
    if (!ent.project_id || !ent.material_id) continue;
    const delta = Number(ent.quantity_delta || 0);
    const mKind = (ent.movement_kind || "").toUpperCase();

    if (delta < 0) {
      const key = `${ent.project_id}_${ent.material_id}`;
      ledgerOutboundMap.set(key, (ledgerOutboundMap.get(key) || 0) + Math.abs(delta));
    } else if (
      mKind.includes("KELUAR") ||
      mKind.includes("PENGELUARAN") ||
      mKind.includes("PEMAKAIAN") ||
      mKind === "TERIMA DARI GUDANG"
    ) {
      const key = `${ent.project_id}_${ent.material_id}`;
      ledgerOutboundMap.set(key, (ledgerOutboundMap.get(key) || 0) + delta);
    }
  }

  // Agregasi Kebutuhan Bahan (MRP) per Proyek
  const projectGroups: ProjectMrpGroup[] = projects.map((proj) => {
    // Cari semua BOM item untuk proyek ini
    const projectBoms = boms.filter((b) => {
      if (b.project_id === proj.id) return true;
      const prod = productsMap.get(b.product_id);
      return prod?.project_id === proj.id;
    });

    // Kelompokkan per material_id
    const materialMap = new Map<number, BomRow[]>();
    for (const b of projectBoms) {
      if (!b.material_id) continue;
      const list = materialMap.get(b.material_id) || [];
      list.push(b);
      materialMap.set(b.material_id, list);
    }

    const materialItems: MaterialMrpItem[] = [];

    for (const [matId, bomList] of materialMap.entries()) {
      const mat = materialsMap.get(matId);
      const matCode = mat?.material_code || `MAT-${matId}`;
      const matName = mat?.name || bomList[0]?.component_name || "Material";
      const standardUnit = mat?.standard_unit || bomList[0]?.unit || "Unit";

      let totalNeed = 0;
      const breakdownMap = new Map<number, ProductBreakdown>();

      for (const b of bomList) {
        const prod = productsMap.get(b.product_id);
        const targetProduction = Number(prod?.target_production || 0);
        const qtyPerUnit = Number(b.qty_per_unit || b.net_usage_per_product || 0);
        const allowancePercent = Number(b.allowance_percent || 0);

        // Rumus: ((Qty BOM + Overage) * Target Qty Produk)
        const qtyWithOverage = Number((qtyPerUnit * (1 + allowancePercent / 100)).toFixed(6));
        const subtotalNeed = Number((qtyWithOverage * targetProduction).toFixed(4));

        totalNeed += subtotalNeed;

        const existingBreakdown = breakdownMap.get(b.product_id);
        if (existingBreakdown) {
          existingBreakdown.totalNeed = Number((existingBreakdown.totalNeed + subtotalNeed).toFixed(4));
          existingBreakdown.qtyPerUnit += qtyPerUnit;
        } else {
          breakdownMap.set(b.product_id, {
            productId: b.product_id,
            productCode: prod?.product_code || `PRD-${b.product_id}`,
            productName: prod?.name || "Produk",
            targetProduction,
            unit: b.unit || standardUnit,
            qtyPerUnit,
            allowancePercent,
            qtyWithOverage,
            totalNeed: subtotalNeed,
          });
        }
      }

      totalNeed = Number(totalNeed.toFixed(4));

      // Hitung Teralokasi / Keluar: gabungan barang keluar gudang dan mutasi keluar ledger
      const key = `${proj.id}_${matId}`;
      const whIssue = warehouseIssueMap.get(key) || 0;
      const ledOut = ledgerOutboundMap.get(key) || 0;
      const allocatedQty = Number((whIssue > 0 && ledOut > 0 ? Math.max(whIssue, ledOut) : (whIssue + ledOut)).toFixed(4));

      // Stok Gudang Global (stok fisik bahan baku saat ini di gudang, tanpa filter proyek)
      const globalStockQty = Number((globalStockMap.get(matId) || 0).toFixed(4));

      // Kekurangan = Total Kebutuhan - Teralokasi
      const shortageQty = Number(Math.max(0, totalNeed - allocatedQty).toFixed(4));

      // Status Persentase Pemenuhan
      const fulfillmentPercent = totalNeed > 0
        ? Math.min(100, Math.round((allocatedQty / totalNeed) * 100))
        : 100;

      materialItems.push({
        materialId: matId,
        materialCode: matCode,
        materialName: matName,
        unit: standardUnit,
        totalNeed,
        allocatedQty,
        globalStockQty,
        shortageQty,
        fulfillmentPercent,
        breakdown: Array.from(breakdownMap.values()),
        receivedQty: allocatedQty,
      });
    }

    // Urutkan material: yang masih defisit (shortage > 0) ditaruh di atas
    materialItems.sort((a, b) => {
      if (a.shortageQty > 0 && b.shortageQty <= 0) return -1;
      if (a.shortageQty <= 0 && b.shortageQty > 0) return 1;
      return b.shortageQty - a.shortageQty || a.materialName.localeCompare(b.materialName);
    });

    const shortageCount = materialItems.filter((m) => m.shortageQty > 0).length;
    const fulfilledCount = materialItems.filter((m) => m.shortageQty <= 0).length;
    const avgFulfillment = materialItems.length > 0
      ? Math.round(materialItems.reduce((acc, m) => acc + m.fulfillmentPercent, 0) / materialItems.length)
      : 100;

    return {
      projectId: proj.id,
      projectCode: proj.project_code || `PRJ-${proj.id}`,
      projectName: proj.name,
      projectStatus: proj.status || "AKTIF",
      totalMaterials: materialItems.length,
      shortageMaterialsCount: shortageCount,
      fulfilledMaterialsCount: fulfilledCount,
      averageFulfillment: avgFulfillment,
      materials: materialItems,
    };
  });

  // Tampilkan proyek yang memiliki kebutuhan BOM di atas, lalu urutkan berdasarkan defisit
  projectGroups.sort((a, b) => {
    if (a.totalMaterials > 0 && b.totalMaterials === 0) return -1;
    if (a.totalMaterials === 0 && b.totalMaterials > 0) return 1;
    return b.shortageMaterialsCount - a.shortageMaterialsCount || a.projectName.localeCompare(b.projectName);
  });

  // Siapkan raw ledger entries untuk Tab 2 (Log Mutasi)
  const rawLedgerEntries: RawLedgerEntry[] = ledgerEntries.slice(0, 200).map((r) => {
    const mat = r.material_id ? materialsMap.get(r.material_id) : undefined;
    const loc = locationsMap.get(r.location_id);
    const prj = r.project_id ? projectsMap.get(r.project_id) : undefined;

    return {
      id: r.id,
      material_id: r.material_id,
      location_id: r.location_id,
      project_id: r.project_id,
      movement_kind: r.movement_kind,
      quantity_delta: r.quantity_delta,
      unit_snapshot: r.unit_snapshot,
      notes: r.notes,
      created_at: r.created_at,
      materialName: mat?.name,
      materialCode: mat?.material_code,
      locationName: loc?.name,
      projectName: prj?.name,
    };
  });

  return (
    <MasterPageShell
      eyebrow="Gudang & Material"
      title="Dashboard Monitoring Kebutuhan Bahan (MRP)"
      description="Monitoring alokasi dan pemenuhan kebutuhan bahan baku per proyek terhadap target produksi."
    >
      <ReadOnlyBanner />
      <MrpDashboardClient
        projectGroups={projectGroups}
        rawLedgerEntries={rawLedgerEntries}
      />
    </MasterPageShell>
  );
}
