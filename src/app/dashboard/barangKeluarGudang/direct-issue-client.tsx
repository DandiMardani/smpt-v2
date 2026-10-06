"use client";

import { useMemo, useState } from "react";
import { Field, inputClass, primaryButtonClass, SectionCard } from "@/components/master/master-ui";
import { formatNumber } from "@/lib/master/page-utils";
import { directIssue, issueWipDirectly } from "./actions";

export type ProjectOpt = { id: number; name: string };
export type ProductOpt = { id: number; project_id: number; name: string };
export type WorkerOpt = { id: number; worker_code: string; name: string };
export type BomOpt = { id: number; project_id: number; product_id: number | null; label: string };
export type WipStockItem = {
  id: number;
  location_code: string;
  location_name: string;
  component_id: number;
  component_code: string;
  component_name: string;
  color: string;
  unit: string;
  project_id: number | null;
  project_name: string;
  product_id: number | null;
  product_name: string;
  quantity: number;
};

export type PendingReqOpt = {
  request_id: number;
  request_code: string;
  project_id: number;
  product_id: number | null;
  bom_requirement_id: number | null;
  cutting_component_id: number | null;
  item_name_snapshot: string;
  requested_qty: number | string;
  fulfilled_qty: number | string;
  unit_snapshot: string;
};

export function DirectIssueUnifiedForm({
  projects,
  products,
  boms,
  workers,
  wipCuttingStocks,
  wipSablonStocks,
  pendingRequests = [],
}: {
  projects: ProjectOpt[];
  products: ProductOpt[];
  boms: BomOpt[];
  workers: WorkerOpt[];
  wipCuttingStocks: WipStockItem[];
  wipSablonStocks: WipStockItem[];
  pendingRequests?: PendingReqOpt[];
}) {
  const [itemType, setItemType] = useState<"BAHAN_ROLL" | "HASIL_CUTTING" | "HASIL_SABLON">("BAHAN_ROLL");

  // State untuk Bahan Baku/Roll
  const [selectedProjectId, setSelectedProjectId] = useState<number>(() => (projects.length === 1 ? projects[0].id : 0));
  const [selectedProductId, setSelectedProductId] = useState<number>(0);
  const [selectedBomId, setSelectedBomId] = useState<number>(0);
  const [rollDestination, setRollDestination] = useState<string>("CUTTING");

  // State untuk Hasil Cutting
  const [selectedCuttingComponentId, setSelectedCuttingComponentId] = useState<number>(0);
  const [cuttingDestination, setCuttingDestination] = useState<"SABLON" | "PRODUKSI" | "MR_WU" | "TEMPAT_LAIN">("SABLON");

  // State untuk Hasil Sablon
  const [selectedSablonComponentId, setSelectedSablonComponentId] = useState<number>(0);
  const [sablonDestination, setSablonDestination] = useState<"PRODUKSI" | "MR_WU" | "TEMPAT_LAIN">("PRODUKSI");

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const availableProducts = useMemo(() => {
    if (!selectedProjectId) return products;
    return products.filter((p) => p.project_id === selectedProjectId);
  }, [products, selectedProjectId]);

  const availableBoms = useMemo(() => {
    return boms.filter((b) => {
      if (selectedProjectId && b.project_id !== selectedProjectId) return false;
      if (selectedProductId && b.product_id && b.product_id !== selectedProductId) return false;
      return true;
    });
  }, [boms, selectedProjectId, selectedProductId]);

  const selectedCuttingItem = useMemo(() => {
    return wipCuttingStocks.find((x) => x.component_id === selectedCuttingComponentId);
  }, [wipCuttingStocks, selectedCuttingComponentId]);

  const selectedSablonItem = useMemo(() => {
    return wipSablonStocks.find((x) => x.component_id === selectedSablonComponentId);
  }, [wipSablonStocks, selectedSablonComponentId]);

  const matchingSpvRequests = useMemo(() => {
    if (!pendingRequests || pendingRequests.length === 0) return [];
    if (itemType === "BAHAN_ROLL") {
      return pendingRequests.filter((r) => {
        if (selectedProjectId && r.project_id !== selectedProjectId) return false;
        if (selectedProductId && r.product_id && r.product_id !== selectedProductId) return false;
        if (selectedBomId && r.bom_requirement_id && r.bom_requirement_id !== selectedBomId) return false;
        return true;
      });
    }
    if (itemType === "HASIL_CUTTING") {
      return pendingRequests.filter((r) => {
        if (selectedCuttingComponentId && r.cutting_component_id && r.cutting_component_id !== selectedCuttingComponentId) return false;
        return true;
      });
    }
    return [];
  }, [pendingRequests, itemType, selectedProjectId, selectedProductId, selectedBomId, selectedCuttingComponentId]);

  return (
    <SectionCard
      title="🚪 1 Pintu Pengeluaran Barang Gudang Langsung"
      description="Keluarkan Bahan Mentah Roll, Komponen Hasil Cutting, atau Hasil Sablon ke proses selanjutnya dalam satu pintu terpadu."
    >
      {/* Tab Pemilihan Kategori Barang Keluar */}
      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setItemType("BAHAN_ROLL")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-2xs ${
            itemType === "BAHAN_ROLL"
              ? "bg-blue-600 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <span>🧵</span>
          <span>1. Bahan Baku / Roll Kain</span>
        </button>

        <button
          type="button"
          onClick={() => setItemType("HASIL_CUTTING")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-2xs ${
            itemType === "HASIL_CUTTING"
              ? "bg-blue-600 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <span>✂️</span>
          <span>2. Komponen Hasil Cutting (Potong)</span>
          <span className="rounded-full bg-blue-100 px-1.5 py-0.2 text-[10px] font-bold text-blue-800">
            {wipCuttingStocks.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setItemType("HASIL_SABLON")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition shadow-2xs ${
            itemType === "HASIL_SABLON"
              ? "bg-blue-600 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <span>🎨</span>
          <span>3. Komponen Hasil Sablon</span>
          <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800">
            {wipSablonStocks.length}
          </span>
        </button>
      </div>

      {/* 1. Form Bahan Baku / Roll Kain */}
      {itemType === "BAHAN_ROLL" ? (
        <form action={directIssue} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Tanggal Keluar">
            <input name="issue_date" type="date" defaultValue={todayStr} required className={inputClass} />
          </Field>

          <Field label="Proyek">
            <select
              name="project_id"
              value={selectedProjectId || ""}
              onChange={(e) => {
                const val = Number(e.target.value) || 0;
                setSelectedProjectId(val);
                setSelectedProductId(0);
                setSelectedBomId(0);
              }}
              required
              className={inputClass}
            >
              <option value="">-- Pilih Proyek --</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Produk (Opsional)">
            <select
              name="product_id"
              value={selectedProductId || ""}
              onChange={(e) => {
                setSelectedProductId(Number(e.target.value) || 0);
                setSelectedBomId(0);
              }}
              className={inputClass}
            >
              <option value="">-- Umum / Semua Produk --</option>
              {availableProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Bahan / Komponen BOM">
            <select
              name="bom_requirement_id"
              value={selectedBomId || ""}
              onChange={(e) => setSelectedBomId(Number(e.target.value) || 0)}
              required
              className={`${inputClass} font-semibold`}
            >
              <option value="">-- Pilih Kebutuhan Bahan --</option>
              {availableBoms.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Kategori Tujuan Pengeluaran">
            <select
              value={rollDestination}
              onChange={(e) => setRollDestination(e.target.value)}
              className={`${inputClass} font-bold text-blue-900`}
            >
              <option value="CUTTING">✂️ CUTTING (Potong Kain / Roll)</option>
              <option value="SABLON">🎨 Supplier Sablon (Cetak Langsung)</option>
              <option value="PRODUKSI">🧵 Divisi Jahit / Produksi (Internal Pabrik)</option>
              <option value="MR_WU">🏭 Pabrik Mitra MR WU (Kerjasama)</option>
              <option value="TEMPAT_LAIN">📦 Tempat Lain / Supplier Lain / Retur</option>
            </select>
          </Field>
          <input type="hidden" name="destination" value={rollDestination} />
          <input
            type="hidden"
            name="purpose"
            value={rollDestination === "MR_WU" || rollDestination === "TEMPAT_LAIN" ? "PRODUKSI" : rollDestination}
          />

          <Field label="Jumlah (Qty)">
            <input
              name="quantity"
              type="number"
              min="0.0001"
              step="0.0001"
              placeholder="0"
              required
              className={`${inputClass} font-mono font-bold text-emerald-700`}
            />
          </Field>

          <Field label="Pengambil (Karyawan)">
            <select name="recipient_worker_id" className={inputClass}>
              <option value="">-- Pengambil Manual --</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.worker_code} · {w.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Nama Pengambil Manual">
            <input name="recipient_name" placeholder="Jika bukan karyawan terdaftar" className={inputClass} />
          </Field>

          <Field label="Keterangan">
            <input name="notes" placeholder="Catatan pengeluaran roll / aksesoris" className={inputClass} />
          </Field>

          {matchingSpvRequests.length > 0 ? (
            <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 max-w-2xl">
                <span className="text-xl">⚠️</span>
                <div>
                  <b className="font-bold text-amber-950">
                    Perhatian: Ada {matchingSpvRequests.length} Permintaan SPV yang Sedang Menunggu Bahan Ini!
                  </b>
                  <p className="text-amber-800 mt-0.5 leading-5">
                    SPV telah membuat antrean no <b>{matchingSpvRequests[0].request_code}</b> ({matchingSpvRequests[0].item_name_snapshot}: butuh {formatNumber(matchingSpvRequests[0].requested_qty)} {matchingSpvRequests[0].unit_snapshot}).
                    Untuk menghindari <b>pengeluaran dobel</b>, utamakan memproses antrean SPV di atas alih-alih pengeluaran manual langsung.
                  </p>
                </div>
              </div>
              <a
                href="#antrean-permintaan-gudang"
                className="rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition shadow-2xs whitespace-nowrap"
              >
                ➔ Penuhi Antrean SPV Di Atas
              </a>
            </div>
          ) : null}

          <div className="sm:col-span-2 lg:col-span-3 flex justify-end pt-2">
            <button
              type="submit"
              className={`${primaryButtonClass} w-full sm:w-auto px-8 py-3 text-sm font-black shadow-md flex items-center justify-center gap-2`}
            >
              <span>📦</span>
              <span>Catat Pengeluaran Bahan Baku</span>
            </button>
          </div>
        </form>
      ) : null}

      {/* 2. Form Komponen Hasil Cutting */}
      {itemType === "HASIL_CUTTING" ? (
        <form action={issueWipDirectly} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Tanggal Keluar">
            <input name="issue_date" type="date" defaultValue={todayStr} required className={inputClass} />
          </Field>

          <Field label="Komponen Hasil Potong (Cutting)">
            <select
              name="component_id"
              value={selectedCuttingComponentId || ""}
              onChange={(e) => setSelectedCuttingComponentId(Number(e.target.value) || 0)}
              required
              className={`${inputClass} font-semibold`}
            >
              <option value="">-- Pilih Komponen di Gudang Hasil --</option>
              {wipCuttingStocks.map((w) => (
                <option key={w.component_id} value={w.component_id}>
                  {w.component_code} · {w.component_name} {w.color ? `(${w.color})` : ""} · Stok:{" "}
                  {formatNumber(w.quantity)} {w.unit}
                </option>
              ))}
            </select>
          </Field>

          <input type="hidden" name="product_id" value={selectedCuttingItem?.product_id ?? ""} />

          <Field label="Kategori Tujuan Pengeluaran">
            <select
              value={cuttingDestination}
              onChange={(e) => setCuttingDestination(e.target.value as any)}
              className={`${inputClass} font-bold text-blue-900`}
            >
              <option value="SABLON">🎨 Supplier Sablon (Buaran)</option>
              <option value="PRODUKSI">🧵 Divisi Jahit / Siap Produksi (Internal Pabrik)</option>
              <option value="MR_WU">🏭 Pabrik Mitra Kerjasama MR WU</option>
              <option value="TEMPAT_LAIN">📦 Tempat Lain / Supplier Lain / Retur</option>
            </select>
          </Field>

          <input type="hidden" name="destination" value={cuttingDestination} />
          <input
            type="hidden"
            name="action"
            value={cuttingDestination === "SABLON" ? "KIRIM_SABLON_LANGSUNG" : "CUTTING_KE_SIAP_PRODUKSI"}
          />

          <Field label={`Jumlah Dikeluarkan (${selectedCuttingItem?.unit || "Pcs"})`}>
            <input
              name="quantity"
              type="number"
              min="0.0001"
              max={selectedCuttingItem ? selectedCuttingItem.quantity : undefined}
              step="0.0001"
              placeholder={selectedCuttingItem ? `Maks ${formatNumber(selectedCuttingItem.quantity)}` : "0"}
              required
              className={`${inputClass} font-mono font-bold text-emerald-700`}
            />
          </Field>

          <Field label="Keterangan">
            <input
              name="notes"
              placeholder={
                cuttingDestination === "SABLON"
                  ? "Contoh: Kirim ke Sablon Meja 2"
                  : cuttingDestination === "MR_WU"
                  ? "Contoh: Kirim ke Pabrik Rekanan MR WU"
                  : "Contoh: Serahkan ke Operator Jahit"
              }
              className={inputClass}
            />
          </Field>

          {matchingSpvRequests.length > 0 ? (
            <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 max-w-2xl">
                <span className="text-xl">⚠️</span>
                <div>
                  <b className="font-bold text-amber-950">
                    Perhatian: Ada {matchingSpvRequests.length} Permintaan SPV yang Sedang Menunggu Komponen Ini!
                  </b>
                  <p className="text-amber-800 mt-0.5 leading-5">
                    SPV telah membuat antrean no <b>{matchingSpvRequests[0].request_code}</b> ({matchingSpvRequests[0].item_name_snapshot}: butuh {formatNumber(matchingSpvRequests[0].requested_qty)} {matchingSpvRequests[0].unit_snapshot}).
                    Untuk menghindari <b>pengeluaran dobel</b>, utamakan memproses antrean SPV di atas alih-alih pengeluaran manual.
                  </p>
                </div>
              </div>
              <a
                href="#antrean-permintaan-gudang"
                className="rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition shadow-2xs whitespace-nowrap"
              >
                ➔ Penuhi Antrean SPV Di Atas
              </a>
            </div>
          ) : null}

          <div className="sm:col-span-2 lg:col-span-3 flex justify-end pt-2">
            <button
              type="submit"
              disabled={!selectedCuttingItem || selectedCuttingItem.quantity <= 0}
              className={`${primaryButtonClass} w-full sm:w-auto px-8 py-3 text-sm font-black shadow-md flex items-center justify-center gap-2`}
            >
              <span>✂️➔</span>
              <span>
                Keluarkan Hasil Cutting (
                {cuttingDestination === "SABLON"
                  ? "Ke Supplier Sablon"
                  : cuttingDestination === "PRODUKSI"
                  ? "Ke Divisi Jahit"
                  : cuttingDestination === "MR_WU"
                  ? "Kirim ke Pabrik Mitra MR WU"
                  : "Tempat Lain"}
                )
              </span>
            </button>
          </div>
        </form>
      ) : null}

      {/* 3. Form Komponen Hasil Sablon */}
      {itemType === "HASIL_SABLON" ? (
        <form action={issueWipDirectly} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Tanggal Keluar">
            <input name="issue_date" type="date" defaultValue={todayStr} required className={inputClass} />
          </Field>

          <Field label="Komponen Hasil Sablon di Gudang">
            <select
              name="component_id"
              value={selectedSablonComponentId || ""}
              onChange={(e) => setSelectedSablonComponentId(Number(e.target.value) || 0)}
              required
              className={`${inputClass} font-semibold`}
            >
              <option value="">-- Pilih Komponen Selesai Sablon --</option>
              {wipSablonStocks.map((w) => (
                <option key={w.component_id} value={w.component_id}>
                  {w.component_code} · {w.component_name} {w.color ? `(${w.color})` : ""} · Stok:{" "}
                  {formatNumber(w.quantity)} {w.unit}
                </option>
              ))}
            </select>
          </Field>

          <input type="hidden" name="product_id" value={selectedSablonItem?.product_id ?? ""} />
          <input type="hidden" name="destination" value={sablonDestination} />
          <input type="hidden" name="action" value="SABLON_KE_SIAP_PRODUKSI" />

          <Field label="Kategori Tujuan Pengeluaran">
            <select
              value={sablonDestination}
              onChange={(e) => setSablonDestination(e.target.value as any)}
              className={`${inputClass} font-bold text-blue-900`}
            >
              <option value="PRODUKSI">🧵 Divisi Jahit / Siap Produksi (Internal Pabrik)</option>
              <option value="MR_WU">🏭 Pabrik Mitra Kerjasama MR WU</option>
              <option value="TEMPAT_LAIN">📦 Tempat Lain / Supplier Lain / Retur</option>
            </select>
          </Field>

          <Field label={`Jumlah Dikeluarkan (${selectedSablonItem?.unit || "Pcs"})`}>
            <input
              name="quantity"
              type="number"
              min="0.0001"
              max={selectedSablonItem ? selectedSablonItem.quantity : undefined}
              step="0.0001"
              placeholder={selectedSablonItem ? `Maks ${formatNumber(selectedSablonItem.quantity)}` : "0"}
              required
              className={`${inputClass} font-mono font-bold text-emerald-700`}
            />
          </Field>

          <Field label="Keterangan">
            <input
              name="notes"
              placeholder={
                sablonDestination === "MR_WU"
                  ? "Contoh: Kirim ke Pabrik Rekanan MR WU"
                  : "Contoh: Diserahkan ke SPV Jahit"
              }
              className={inputClass}
            />
          </Field>

          <div className="sm:col-span-2 lg:col-span-3 flex justify-end pt-2">
            <button
              type="submit"
              disabled={!selectedSablonItem || selectedSablonItem.quantity <= 0}
              className={`${primaryButtonClass} w-full sm:w-auto px-8 py-3 text-sm font-black shadow-md flex items-center justify-center gap-2`}
            >
              <span>🎨➔</span>
              <span>
                Keluarkan Hasil Sablon (
                {sablonDestination === "PRODUKSI"
                  ? "Ke Divisi Jahit"
                  : sablonDestination === "MR_WU"
                  ? "Kirim ke Pabrik Mitra MR WU"
                  : "Tempat Lain"}
                )
              </span>
            </button>
          </div>
        </form>
      ) : null}
    </SectionCard>
  );
}
