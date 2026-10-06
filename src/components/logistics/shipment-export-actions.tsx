"use client";

import Link from "next/link";
import { ExportButton } from "@/components/export/export-button";

export function ShipmentExportActions() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/dashboard/pengirimanEmbarkasi/print-manifest"
        target="_blank"
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 shadow-xs transition hover:bg-sky-100 select-none"
      >
        🖨️ Export PDF / Cetak Laporan Rekap
      </Link>
      <ExportButton
        href="/api/export/xlsx?report=pengiriman"
        label="Unduh Dokumen Excel / Rekap"
        variant="green"
        size="sm"
        icon="📥"
      />
    </div>
  );
}
