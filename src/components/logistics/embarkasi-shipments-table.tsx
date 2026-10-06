"use client";

import { useState } from "react";
import Link from "next/link";
import { qty } from "@/lib/final/final-utils";
import { ShipmentCardDocumentActions } from "@/components/logistics/shipment-card-document-actions";
import {
  cancelShipmentAction,
  receiveShipmentAction,
  sendShipmentAction,
} from "@/lib/final/actions";

export type ShipmentItem = {
  id: number;
  shipment_code: string;
  document_no?: string | null;
  shipment_date: string;
  quantity: number;
  status: string;
  received_qty?: number | null;
  reject_qty?: number | null;
  damaged_qty?: number | null;
  missing_qty?: number | null;
  driver_name?: string | null;
  vehicle_no?: string | null;
  public_token?: string | null;
  notes?: string | null;
  delivery_deadline?: string | null;
  surat_jalan_photo_url?: string | null;
  source_location_name: string;
  embarkation_name: string;
  embarkation_code?: string | null;
  item_name: string;
};

type Props = {
  shipments: ShipmentItem[];
  canOperate: boolean;
  title?: string;
  subtitle?: string;
};

export function EmbarkasiShipmentTable({
  shipments,
  canOperate,
  title,
  subtitle,
}: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Filter logic
  const filteredShipments = shipments.filter((item) => {
    if (statusFilter !== "ALL" && item.status !== statusFilter) {
      return false;
    }
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();
    return (
      item.shipment_code.toLowerCase().includes(query) ||
      (item.document_no && item.document_no.toLowerCase().includes(query)) ||
      item.embarkation_name.toLowerCase().includes(query) ||
      item.item_name.toLowerCase().includes(query) ||
      (item.driver_name && item.driver_name.toLowerCase().includes(query)) ||
      (item.vehicle_no && item.vehicle_no.toLowerCase().includes(query)) ||
      item.source_location_name.toLowerCase().includes(query)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DITERIMA":
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case "DIKIRIM":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "DISIAPKAN":
        return "bg-amber-100 text-amber-800 border-amber-300";
      default:
        return "bg-slate-100 text-slate-700 border-slate-300";
    }
  };

  const renderDeadlineBadge = (deadline?: string | null, status?: string) => {
    if (status === "DITERIMA") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          🏁 Sampai Asrama
        </span>
      );
    }
    if (!deadline) {
      return <span className="text-slate-400 text-[11px] font-medium">-</span>;
    }

    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
    const isLate = todayStr > deadline;
    const isToday = todayStr === deadline;

    if (isLate) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
          ⚠️ Lewat Dateline ({deadline})
        </span>
      );
    }
    if (isToday) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
          ⏰ Dateline Hari Ini
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200">
        🎯 Dateline: {deadline}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {title && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 font-medium">{subtitle}</p>}
          </div>
          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
            Total {shipments.length} Pengiriman
          </span>
        </div>
      )}

      {/* Search & Filter Bar (Mobile-Friendly) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs">
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {[
            { key: "ALL", label: "Semua", count: shipments.length },
            {
              key: "DISIAPKAN",
              label: "⏳ Disiapkan",
              count: shipments.filter((s) => s.status === "DISIAPKAN").length,
            },
            {
              key: "DIKIRIM",
              label: "🚚 Sedang Jalan",
              count: shipments.filter((s) => s.status === "DIKIRIM").length,
            },
            {
              key: "DITERIMA",
              label: "✅ Selesai Tiba",
              count: shipments.filter((s) => s.status === "DITERIMA").length,
            },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1.5 ${
                statusFilter === tab.key
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  statusFilter === tab.key ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="Cari SJ, embarkasi, armada..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-slate-400 transition"
          />
        </div>
      </div>

      {filteredShipments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-medium text-slate-500">
          {searchQuery
            ? `Tidak ada pengiriman yang cocok dengan "${searchQuery}".`
            : "Belum ada data pengiriman untuk filter yang dipilih."}
        </div>
      ) : (
        <>
          {/* ======================================================== */}
          {/* 1. TAMPILAN TABEL DESKTOP & TABLET (hidden di mobile) */}
          {/* ======================================================== */}
          <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead>
                  <tr className="bg-slate-50/90 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3 text-left">No. Surat Jalan</th>
                    <th className="py-3 px-3 text-left">Embarkasi Tujuan</th>
                    <th className="py-3 px-3 text-left">Item Muatan</th>
                    <th className="py-3 px-3 text-right">Jumlah (Qty)</th>
                    <th className="py-3 px-3 text-left">Asal Muat</th>
                    <th className="py-3 px-3 text-left">Armada & Driver</th>
                    <th className="py-3 px-3 text-center">Dateline Tiba</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3 text-center">Riwayat & Aksi</th>
                  </tr>
                </thead>
                {filteredShipments.map((x) => {
                  const isExpanded = expandedIds.has(x.id);

                  return (
                    <tbody key={x.id} className="divide-y divide-slate-100">
                        <tr className={`hover:bg-slate-50/80 transition ${isExpanded ? "bg-indigo-50/30" : ""}`}>
                          {/* No. SJ & Tanggal */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                              {x.document_no || x.shipment_code}
                            </span>
                            <span className="block mt-1 text-[11px] text-slate-500 font-medium">
                              📅 {x.shipment_date}
                            </span>
                          </td>

                          {/* Embarkasi Tujuan */}
                          <td className="py-3 px-3">
                            <span className="font-extrabold text-slate-900 block line-clamp-1">
                              {x.embarkation_name}
                            </span>
                            {x.embarkation_code && (
                              <span className="font-mono text-[10px] text-slate-400">
                                [{x.embarkation_code}]
                              </span>
                            )}
                          </td>

                          {/* Item Muatan */}
                          <td className="py-3 px-3">
                            <span className="font-bold text-slate-800 line-clamp-1">
                              {x.item_name}
                            </span>
                          </td>

                          {/* Qty Muatan */}
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            <span className="font-black text-slate-900 text-sm">
                              {qty(x.quantity)}
                            </span>
                            <span className="block text-[10px] text-slate-500 font-semibold">
                              Unit / SET
                            </span>
                          </td>

                          {/* Asal Muat */}
                          <td className="py-3 px-3 text-slate-600 line-clamp-1">
                            {x.source_location_name}
                          </td>

                          {/* Driver / Armada */}
                          <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                            <span className="font-semibold text-slate-800 block">
                              {x.driver_name || "-"}
                            </span>
                            {x.vehicle_no && (
                              <span className="text-[11px] text-slate-500 font-mono">
                                {x.vehicle_no}
                              </span>
                            )}
                          </td>

                          {/* Dateline Tiba */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {renderDeadlineBadge(x.delivery_deadline, x.status)}
                          </td>

                          {/* Status Badge */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-extrabold border ${getStatusBadge(
                                x.status
                              )}`}
                            >
                              {x.status === "DITERIMA"
                                ? "✅ DITERIMA"
                                : x.status === "DIKIRIM"
                                ? "🚚 DIKIRIM"
                                : "⏳ DISIAPKAN"}
                            </span>
                          </td>

                          {/* Tombol Buka Tutup Riwayat */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => toggleExpand(x.id)}
                              className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition shadow-2xs ${
                                isExpanded
                                  ? "bg-slate-800 text-white"
                                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              <span>{isExpanded ? "▲ Tutup" : "▼ Buka Riwayat"}</span>
                            </button>
                          </td>
                        </tr>

                        {/* Collapsible Accordion Drawer */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={9} className="p-0 bg-slate-50/70 border-b-2 border-slate-200">
                              <div className="p-4 sm:p-5 space-y-4">
                                <ShipmentDetailDrawer
                                  shipment={x}
                                  canOperate={canOperate}
                                  onClose={() => toggleExpand(x.id)}
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    );
                  })}
                </table>
            </div>
          </div>

          {/* ======================================================== */}
          {/* 2. TAMPILAN MOBILE-FRIENDLY COMPACT CARDS (hanya di hp) */}
          {/* ======================================================== */}
          <div className="md:hidden space-y-3">
            {filteredShipments.map((x) => {
              const isExpanded = expandedIds.has(x.id);

              return (
                <div
                  key={x.id}
                  className={`rounded-2xl border bg-white p-4 shadow-2xs transition ${
                    isExpanded ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-200/90"
                  }`}
                >
                  {/* Mobile Row Header */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-mono text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200 truncate">
                        {x.document_no || x.shipment_code}
                      </span>
                    </div>
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-black border ${getStatusBadge(
                        x.status
                      )}`}
                    >
                      {x.status}
                    </span>
                  </div>

                  {/* Mobile Info Body */}
                  <div className="mt-2.5 space-y-1.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">
                          Tujuan:
                        </span>
                        <p className="font-extrabold text-slate-900 text-sm">
                          {x.embarkation_name}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 uppercase font-bold block">
                          Muatan:
                        </span>
                        <p className="font-black text-slate-900 text-sm">
                          {qty(x.quantity)}{" "}
                          <span className="text-[10px] font-bold text-slate-500">SET / Unit</span>
                        </p>
                      </div>
                    </div>

                    <p className="text-slate-600 line-clamp-1">
                      📦 <b>{x.item_name}</b>
                    </p>

                    <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                      <span>📍 Asal: {x.source_location_name}</span>
                      <span>🚚 {x.driver_name || "-"}</span>
                    </div>

                    {x.delivery_deadline && (
                      <div className="pt-1 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Dateline Tiba:</span>
                        {renderDeadlineBadge(x.delivery_deadline, x.status)}
                      </div>
                    )}
                  </div>

                  {/* Mobile Action Footer */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400 font-medium">
                      📅 {x.shipment_date}
                    </span>

                    <button
                      type="button"
                      onClick={() => toggleExpand(x.id)}
                      className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition shadow-2xs ${
                        isExpanded
                          ? "bg-slate-900 text-white"
                          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span>{isExpanded ? "▲ Tutup" : "🔍 Buka Riwayat & Aksi ▼"}</span>
                    </button>
                  </div>

                  {/* Mobile Collapsible Drawer */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t-2 border-indigo-100 bg-indigo-50/20 -mx-4 -mb-4 p-4 rounded-b-2xl space-y-3">
                      <ShipmentDetailDrawer
                        shipment={x}
                        canOperate={canOperate}
                        onClose={() => toggleExpand(x.id)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Sub-component: Accordion Detail Drawer (Riwayat Buka-Tutup)
function ShipmentDetailDrawer({
  shipment: x,
  canOperate,
  onClose,
}: {
  shipment: ShipmentItem;
  canOperate: boolean;
  onClose: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4 text-xs">
      {/* 1. Header & Tracking Timeline */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700">
            RIWAYAT DISTRIBUSI & MANIFEST FISIK
          </span>
          <h4 className="text-sm font-extrabold text-slate-900">
            {x.document_no ? `SJ: ${x.document_no}` : x.shipment_code} ➔ {x.embarkation_name}
          </h4>
        </div>

        <div className="flex items-center gap-2">
          <ShipmentCardDocumentActions
            shipmentId={x.id}
            shipmentCode={x.shipment_code}
            documentNo={x.document_no}
            photoUrl={x.surat_jalan_photo_url}
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 text-xs font-bold"
            title="Tutup Riwayat"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 2. Visual Status Step Tracker */}
      <div className="grid grid-cols-3 gap-2 py-2">
        <div
          className={`rounded-xl p-2.5 text-center border ${
            ["DISIAPKAN", "DIKIRIM", "DITERIMA"].includes(x.status)
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-slate-50 border-slate-200 text-slate-400"
          }`}
        >
          <span className="block text-sm">1️⃣</span>
          <span className="font-extrabold text-[11px] block mt-1">Disiapkan</span>
          <span className="text-[10px] text-slate-500">Draft Diterbitkan</span>
        </div>

        <div
          className={`rounded-xl p-2.5 text-center border ${
            ["DIKIRIM", "DITERIMA"].includes(x.status)
              ? "bg-blue-50 border-blue-200 text-blue-900"
              : "bg-slate-50 border-slate-200 text-slate-400"
          }`}
        >
          <span className="block text-sm">2️⃣</span>
          <span className="font-extrabold text-[11px] block mt-1">Dikirim</span>
          <span className="text-[10px] text-slate-500">Armada Berangkat</span>
        </div>

        <div
          className={`rounded-xl p-2.5 text-center border ${
            x.status === "DITERIMA"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-slate-50 border-slate-200 text-slate-400"
          }`}
        >
          <span className="block text-sm">3️⃣</span>
          <span className="font-extrabold text-[11px] block mt-1">Diterima</span>
          <span className="text-[10px] text-slate-500">Tiba di Asrama</span>
        </div>
      </div>

      {/* 3. Detail Rincian Muatan & Armada */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 rounded-xl bg-slate-50/80 p-3 border border-slate-100">
        <div>
          <span className="text-slate-500 block">Titik Asal:</span>
          <span className="font-bold text-slate-900">{x.source_location_name}</span>
        </div>
        <div>
          <span className="text-slate-500 block">Driver & No. Polisi:</span>
          <span className="font-bold text-slate-900">
            {x.driver_name || "-"} {x.vehicle_no ? `(${x.vehicle_no})` : ""}
          </span>
        </div>
        <div>
          <span className="text-slate-500 block">Jumlah Muatan:</span>
          <span className="font-black text-indigo-700">{qty(x.quantity)} Unit / SET</span>
        </div>
        <div>
          <span className="text-slate-500 block">Tracking Token:</span>
          <span className="font-mono text-slate-600">{x.public_token || "-"}</span>
        </div>
      </div>

      {x.notes && (
        <p className="text-slate-500 italic bg-amber-50/50 p-2 rounded-lg border border-amber-100">
          📝 Catatan Pengiriman: {x.notes}
        </p>
      )}

      {/* 4. Rincian Konfirmasi Penerimaan Fisik di Asrama Haji */}
      {x.status === "DITERIMA" && (
        <div className="rounded-xl bg-emerald-50/80 border border-emerald-200 p-3 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-emerald-900 uppercase tracking-wide text-[11px]">
              ✅ Hasil Konfirmasi Penerimaan Fisik di Asrama Haji:
            </span>
            <span className="font-black text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-300">
              Total: {qty(x.received_qty || 0)} Unit
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <div className="rounded-lg bg-white p-2 border border-emerald-200 text-center">
              <span className="text-slate-400 block text-[10px]">Diterima Baik:</span>
              <span className="font-black text-emerald-700 text-sm">{qty(x.received_qty)}</span>
            </div>
            <div className="rounded-lg bg-white p-2 border border-rose-200 text-center">
              <span className="text-slate-400 block text-[10px]">Reject:</span>
              <span className="font-black text-rose-700 text-sm">{qty(x.reject_qty || 0)}</span>
            </div>
            <div className="rounded-lg bg-white p-2 border border-amber-200 text-center">
              <span className="text-slate-400 block text-[10px]">Rusak:</span>
              <span className="font-black text-amber-700 text-sm">{qty(x.damaged_qty || 0)}</span>
            </div>
            <div className="rounded-lg bg-white p-2 border border-purple-200 text-center">
              <span className="text-slate-400 block text-[10px]">Kurang:</span>
              <span className="font-black text-purple-700 text-sm">{qty(x.missing_qty || 0)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 5. Aksi Cepat Operasional (Send / Receive / Cancel) */}
      {canOperate && (
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {x.status === "DISIAPKAN" && (
              <form action={sendShipmentAction}>
                <input type="hidden" name="shipment_id" value={x.id} />
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
                >
                  🚀 Berangkatkan Armada Sekarang (Kurangi Stok Fisik)
                </button>
              </form>
            )}

            {x.status === "DIKIRIM" && (
              <details className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 w-full sm:w-auto">
                <summary className="cursor-pointer font-bold text-xs text-blue-700 select-none">
                  📥 Buka Form Konfirmasi Tiba di Asrama Haji ▾
                </summary>
                <form
                  action={receiveShipmentAction}
                  className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-5"
                >
                  <input type="hidden" name="shipment_id" value={x.id} />
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Qty Diterima
                    </label>
                    <input
                      name="received_qty"
                      type="number"
                      min="0"
                      step="any"
                      defaultValue={x.quantity}
                      required
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Qty Reject
                    </label>
                    <input
                      name="reject_qty"
                      type="number"
                      min="0"
                      step="any"
                      defaultValue="0"
                      required
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Qty Rusak
                    </label>
                    <input
                      name="damaged_qty"
                      type="number"
                      min="0"
                      step="any"
                      defaultValue="0"
                      required
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                      Qty Kurang
                    </label>
                    <input
                      name="missing_qty"
                      type="number"
                      min="0"
                      step="any"
                      defaultValue="0"
                      required
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold text-slate-800"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                    >
                      ✅ Konfirmasi Tiba
                    </button>
                  </div>
                </form>
              </details>
            )}
          </div>

          {["DISIAPKAN", "DIKIRIM"].includes(x.status) && (
            <form action={cancelShipmentAction}>
              <input type="hidden" name="shipment_id" value={x.id} />
              <button
                type="submit"
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                onClick={(e) => {
                  if (!confirm("Yakin ingin membatalkan surat jalan ini?")) {
                    e.preventDefault();
                  }
                }}
              >
                ❌ Batalkan Surat Jalan
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
