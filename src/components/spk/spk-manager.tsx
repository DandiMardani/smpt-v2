"use client";

import { useMemo, useState } from "react";
import {
  cancelSpkAction,
  createSpkUnifiedAction,
  editSpkAction,
  publishSpkAction,
} from "@/app/dashboard/spk/actions";

export type SpkProject = {
  id: number;
  name: string;
};

export type SpkProduct = {
  id: number;
  project_id: number;
  name: string;
  target_production?: number | null;
};

export type SpkWorkItem = {
  id: number;
  project_id: number;
  product_id: number | null;
  name: string;
  unit: string;
  operator_price: number | string;
  qty_per_product: number | string;
  display_order: number | null;
  status: string;
};

export type SpkOperator = {
  id: number;
  worker_code: string;
  name: string;
  position: string | null;
  phone?: string | null;
};

export type SpkChecker = {
  user_id: string;
  email: string;
  display_name: string | null;
};

export type SpkSupervisor = {
  id: number;
  worker_code: string;
  name: string;
  position: string | null;
};

export type SpkOrderItem = {
  id: number;
  order_id: number;
  work_item_id: number;
  work_item_name_snapshot: string;
  unit_snapshot: string;
  assigned_qty: number | string;
  operator_price_snapshot: number | string;
  is_final_output_snapshot?: boolean;
  status: string;
  has_checks?: boolean;
};

export type SpkOrder = {
  id: number;
  spk_code: string;
  order_date: string;
  due_date: string | null;
  status: string;
  project_id: number;
  product_id: number;
  operator_worker_id: number;
  checker_email: string;
  supervisor_worker_id: number | null;
  notes: string | null;
  has_checks?: boolean;
  items: SpkOrderItem[];
};

type Props = {
  canWrite: boolean;
  projects: SpkProject[];
  products: SpkProduct[];
  workItems: SpkWorkItem[];
  operators: SpkOperator[];
  checkers: SpkChecker[];
  supervisors: SpkSupervisor[];
  orders: SpkOrder[];
};

function num(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function money(val: unknown): string {
  return "Rp " + Math.round(num(val)).toLocaleString("id-ID");
}

function qtyFmt(val: unknown): string {
  return num(val).toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export function SpkManager({
  canWrite,
  projects,
  products,
  workItems,
  operators,
  checkers,
  supervisors,
  orders,
}: Props) {
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<SpkOrder | null>(null);
  const [editingOrder, setEditingOrder] = useState<SpkOrder | null>(null);
  const [editItemQtys, setEditItemQtys] = useState<Record<number, string>>({});
  const [removedItemIds, setRemovedItemIds] = useState<Set<number>>(new Set());
  const [addWorkItemId, setAddWorkItemId] = useState<string>("");
  const [addWorkItemQty, setAddWorkItemQty] = useState<string>("100");

  // Form State
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [checkedItemIds, setCheckedItemIds] = useState<Set<number>>(new Set());
  const [itemQuantities, setItemQuantities] = useState<Record<number, string>>({});
  const [publishNow, setPublishNow] = useState(false);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Lookup Maps
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const operatorMap = useMemo(() => new Map(operators.map((o) => [o.id, o])), [operators]);
  const supervisorMap = useMemo(() => new Map(supervisors.map((s) => [s.id, s])), [supervisors]);

  // Filtered Products for selected project
  const availableProducts = useMemo(() => {
    const pId = Number(selectedProjectId);
    if (!pId) return [];
    return products.filter((p) => p.project_id === pId);
  }, [products, selectedProjectId]);

  // Filtered Work Items for selected project and product
  const availableWorkItems = useMemo(() => {
    const pId = Number(selectedProjectId);
    const prId = Number(selectedProductId);
    if (!pId || !prId) return [];
    return workItems.filter(
      (w) => w.project_id === pId && (w.product_id === prId || w.product_id === null),
    );
  }, [workItems, selectedProjectId, selectedProductId]);

  // Statistics
  const stats = useMemo(() => {
    const total = orders.length;
    const draft = orders.filter((o) => o.status === "DRAFT").length;
    const aktif = orders.filter((o) => o.status === "AKTIF").length;
    const selesai = orders.filter((o) => o.status === "SELESAI").length;
    const batal = orders.filter((o) => o.status === "DIBATALKAN").length;
    return { total, draft, aktif, selesai, batal };
  }, [orders]);

  // Filtered Orders List
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchStatus = statusFilter === "ALL" || order.status === statusFilter;
      if (!matchStatus) return false;

      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const code = (order.spk_code || "").toLowerCase();
      const proj = (projectMap.get(order.project_id)?.name || "").toLowerCase();
      const prod = (productMap.get(order.product_id)?.name || "").toLowerCase();
      const op = (operatorMap.get(order.operator_worker_id)?.name || "").toLowerCase();
      const checker = (order.checker_email || "").toLowerCase();
      return (
        code.includes(term) ||
        proj.includes(term) ||
        prod.includes(term) ||
        op.includes(term) ||
        checker.includes(term)
      );
    });
  }, [orders, statusFilter, searchTerm, projectMap, productMap, operatorMap]);

  // Toggle item checkbox
  const handleToggleItem = (itemId: number) => {
    setCheckedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
        // Default quantity jika belum diisi
        if (!itemQuantities[itemId]) {
          const selectedProduct = productMap.get(Number(selectedProductId));
          const target = Number(selectedProduct?.target_production || 0);
          setItemQuantities((q) => ({
            ...q,
            [itemId]: target > 0 ? String(target) : "100",
          }));
        }
      }
      return next;
    });
  };

  // Select all / Deselect all
  const handleSelectAll = () => {
    if (checkedItemIds.size === availableWorkItems.length) {
      setCheckedItemIds(new Set());
    } else {
      const allIds = new Set(availableWorkItems.map((w) => w.id));
      setCheckedItemIds(allIds);
      const newQuantities: Record<number, string> = { ...itemQuantities };
      const selectedProduct = productMap.get(Number(selectedProductId));
      const target = Number(selectedProduct?.target_production || 0);
      availableWorkItems.forEach((w) => {
        if (!newQuantities[w.id]) {
          newQuantities[w.id] = target > 0 ? String(target) : "100";
        }
      });
      setItemQuantities(newQuantities);
    }
  };

  // Reset Modal Form
  const handleOpenCreateModal = () => {
    setSelectedProjectId("");
    setSelectedProductId("");
    setCheckedItemIds(new Set());
    setItemQuantities({});
    setPublishNow(false);
    setIsModalOpen(true);
  };

  // Print SPK
  const handlePrintSpk = (order: SpkOrder) => {
    const proj = projectMap.get(order.project_id);
    const prod = productMap.get(order.product_id);
    const op = operatorMap.get(order.operator_worker_id);
    const spv = supervisorMap.get(order.supervisor_worker_id ?? 0);

    const totalQty = order.items.reduce((acc, it) => acc + num(it.assigned_qty), 0);
    const totalNilai = order.items.reduce(
      (acc, it) => acc + num(it.assigned_qty) * num(it.operator_price_snapshot),
      0,
    );

    const printHtml = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Surat Perintah Kerja - ${order.spk_code}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px; background: #fff; }
          .sheet { max-width: 800px; margin: 0 auto; border: 1.5px solid #0f2747; border-radius: 8px; padding: 28px; box-sizing: border-box; }
          .header { border-bottom: 2.5px solid #0f2747; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-start; }
          .company { font-size: 20px; font-weight: 900; color: #0f2747; letter-spacing: 0.5px; }
          .title { font-size: 15px; font-weight: 800; color: #2563eb; margin-top: 4px; text-transform: uppercase; letter-spacing: 1px; }
          .right { text-align: right; font-size: 13px; color: #475569; }
          .right .code { font-size: 18px; font-weight: 800; color: #0f2747; font-family: monospace; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; margin-bottom: 20px; background: #f8fafc; padding: 14px 18px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 13px; }
          .meta-grid div { display: flex; justify-content: space-between; }
          .meta-grid span { color: #64748b; }
          .meta-grid strong { color: #0f172a; text-align: right; }
          .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
          .table th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; font-weight: 700; color: #1e293b; }
          .table td { border: 1px solid #e2e8f0; padding: 8px 10px; }
          .table tr.total td { font-weight: 800; background: #f8fafc; border-top: 2px solid #0f2747; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 36px; text-align: center; font-size: 12px; }
          .sig-box { border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px; height: 110px; display: flex; flex-direction: column; justify-content: space-between; }
          .sig-title { font-weight: 700; color: #475569; }
          .sig-name { font-weight: 800; color: #0f172a; border-top: 1px solid #94a3b8; padding-top: 4px; }
          .notes { font-size: 12px; color: #64748b; margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          @media print { body { padding: 0; } .sheet { border: 0; padding: 0; } }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="header">
            <div>
              <div class="company">PT KREASI DINAMIKA MAJU BERSAMA</div>
              <div class="title">SURAT PERINTAH KERJA (SPK)</div>
            </div>
            <div class="right">
              <div class="code">${order.spk_code}</div>
              <div>Tanggal: <strong>${order.order_date}</strong></div>
              ${order.due_date ? `<div>Jatuh Tempo: <strong>${order.due_date}</strong></div>` : ""}
            </div>
          </div>

          <div class="meta-grid">
            <div><span>Proyek:</span> <strong>${proj?.name || `Proyek #${order.project_id}`}</strong></div>
            <div><span>Produk / Tas:</span> <strong>${prod?.name || `Produk #${order.product_id}`}</strong></div>
            <div><span>Operator Borongan:</span> <strong>${op?.name || `ID #${order.operator_worker_id}`} (${op?.worker_code || "-"})</strong></div>
            <div><span>Checker:</span> <strong>${order.checker_email}</strong></div>
            <div><span>Supervisor:</span> <strong>${spv?.name || "SPV Produksi"}</strong></div>
            <div><span>Status Dokumen:</span> <strong>${order.status}</strong></div>
          </div>

          <table class="table">
            <thead>
              <tr>
                <th style="width: 38px; text-align: center;">No</th>
                <th>Item Pekerjaan</th>
                <th style="text-align: right; width: 110px;">Qty Ditugaskan</th>
                <th style="text-align: center; width: 70px;">Satuan</th>
                <th style="text-align: right; width: 120px;">Harga Satuan</th>
                <th style="text-align: right; width: 130px;">Total Borongan</th>
              </tr>
            </thead>
            <tbody>
              ${order.items
                .map((it, idx) => {
                  const sub = num(it.assigned_qty) * num(it.operator_price_snapshot);
                  return `
                    <tr>
                      <td style="text-align: center;">${idx + 1}</td>
                      <td><strong>${it.work_item_name_snapshot}</strong></td>
                      <td style="text-align: right;">${qtyFmt(it.assigned_qty)}</td>
                      <td style="text-align: center;">${it.unit_snapshot}</td>
                      <td style="text-align: right;">${money(it.operator_price_snapshot)}</td>
                      <td style="text-align: right; font-weight: 600;">${money(sub)}</td>
                    </tr>
                  `;
                })
                .join("")}
              <tr class="total">
                <td colspan="2" style="text-align: right;">TOTAL PENUGASAN:</td>
                <td style="text-align: right;">${qtyFmt(totalQty)}</td>
                <td></td>
                <td></td>
                <td style="text-align: right; color: #065f46;">${money(totalNilai)}</td>
              </tr>
            </tbody>
          </table>

          ${order.notes ? `<div class="notes"><strong>Catatan Khusus:</strong> ${order.notes}</div>` : ""}

          <div class="signatures">
            <div class="sig-box">
              <div class="sig-title">Dibuat Oleh (Supervisor)</div>
              <div class="sig-name">${spv?.name || "Supervisor"}</div>
            </div>
            <div class="sig-box">
              <div class="sig-title">Diterima Oleh (Operator Borongan)</div>
              <div class="sig-name">${op?.name || "Operator"}</div>
            </div>
            <div class="sig-box">
              <div class="sig-title">Diverifikasi Oleh (Checker)</div>
              <div class="sig-name">${order.checker_email}</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const printWin = window.open("", "_blank", "width=850,height=900");
    if (printWin) {
      printWin.document.open();
      printWin.document.write(printHtml);
      printWin.document.close();
      setTimeout(() => {
        printWin.focus();
        printWin.print();
      }, 350);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. KPI Summary Cards (Identik dengan V1 spkSummary) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div
          onClick={() => setStatusFilter("ALL")}
          className={`cursor-pointer rounded-2xl border p-4 shadow-xs transition ${
            statusFilter === "ALL"
              ? "border-blue-500 bg-blue-50/50"
              : "border-slate-200/80 bg-white hover:border-slate-300"
          }`}
        >
          <span className="text-xs font-semibold text-slate-500 block">Total SPK</span>
          <strong className="text-2xl font-black text-slate-900">{stats.total}</strong>
        </div>

        <div
          onClick={() => setStatusFilter("DRAFT")}
          className={`cursor-pointer rounded-2xl border p-4 shadow-xs transition ${
            statusFilter === "DRAFT"
              ? "border-amber-500 bg-amber-50/50"
              : "border-slate-200/80 bg-white hover:border-slate-300"
          }`}
        >
          <span className="text-xs font-semibold text-amber-700 block">Draft</span>
          <strong className="text-2xl font-black text-amber-800">{stats.draft}</strong>
        </div>

        <div
          onClick={() => setStatusFilter("AKTIF")}
          className={`cursor-pointer rounded-2xl border p-4 shadow-xs transition ${
            statusFilter === "AKTIF"
              ? "border-emerald-500 bg-emerald-50/50"
              : "border-slate-200/80 bg-white hover:border-slate-300"
          }`}
        >
          <span className="text-xs font-semibold text-emerald-700 block">Aktif</span>
          <strong className="text-2xl font-black text-emerald-800">{stats.aktif}</strong>
        </div>

        <div
          onClick={() => setStatusFilter("SELESAI")}
          className={`cursor-pointer rounded-2xl border p-4 shadow-xs transition ${
            statusFilter === "SELESAI"
              ? "border-blue-500 bg-blue-50/50"
              : "border-slate-200/80 bg-white hover:border-slate-300"
          }`}
        >
          <span className="text-xs font-semibold text-blue-700 block">Selesai</span>
          <strong className="text-2xl font-black text-blue-800">{stats.selesai}</strong>
        </div>

        <div
          onClick={() => setStatusFilter("DIBATALKAN")}
          className={`cursor-pointer rounded-2xl border p-4 shadow-xs transition ${
            statusFilter === "DIBATALKAN"
              ? "border-rose-500 bg-rose-50/50"
              : "border-slate-200/80 bg-white hover:border-slate-300"
          }`}
        >
          <span className="text-xs font-semibold text-rose-700 block">Dibatalkan</span>
          <strong className="text-2xl font-black text-rose-800">{stats.batal}</strong>
        </div>
      </div>

      {/* 2. Main Action Header & Toolbar */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">Daftar Surat Perintah Kerja (SPK)</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Penugasan borongan dari Supervisor kepada satu operator untuk satu proyek & produk.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {canWrite ? (
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition active:scale-95"
              >
                + Buat SPK Baru
              </button>
            ) : null}
          </div>
        </div>

        {/* Toolbar Pencarian & Filter */}
        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 pt-3.5">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="🔍 Cari No. SPK, proyek, operator, atau checker..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs text-slate-800 shadow-2xs focus:border-blue-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs focus:border-blue-500 focus:outline-none"
            >
              <option value="ALL">Semua Status ({orders.length})</option>
              <option value="DRAFT">Draft ({stats.draft})</option>
              <option value="AKTIF">Aktif ({stats.aktif})</option>
              <option value="SELESAI">Selesai ({stats.selesai})</option>
              <option value="DIBATALKAN">Dibatalkan ({stats.batal})</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Daftar SPK Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
        {filteredOrders.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            {searchTerm || statusFilter !== "ALL"
              ? "Tidak ada SPK yang sesuai dengan filter pencarian."
              : "Belum ada Surat Perintah Kerja yang dibuat. Klik tombol '+ Buat SPK Baru' di atas untuk memulai."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 text-left">
                <tr>
                  <th className="px-3.5 py-2.5">No. SPK & Tanggal</th>
                  <th className="px-3.5 py-2.5">Proyek & Produk</th>
                  <th className="px-3.5 py-2.5">Operator & Checker</th>
                  <th className="px-3.5 py-2.5">Rincian Item</th>
                  <th className="px-3.5 py-2.5 text-center">Status</th>
                  <th className="px-3.5 py-2.5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredOrders.map((order) => {
                  const proj = projectMap.get(order.project_id);
                  const prod = productMap.get(order.product_id);
                  const op = operatorMap.get(order.operator_worker_id);

                  const statusClass =
                    order.status === "AKTIF"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : order.status === "DRAFT"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : order.status === "SELESAI"
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-slate-100 text-slate-600 border-slate-200";

                  const totalItems = order.items.length;
                  const totalAssignedQty = order.items.reduce((acc, it) => acc + num(it.assigned_qty), 0);

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-3.5 py-2.5">
                        <div className="font-mono font-bold text-blue-700 text-sm">{order.spk_code}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Tgl: <span className="font-medium text-slate-700">{order.order_date}</span>
                        </div>
                        {order.due_date ? (
                          <div className="text-[10px] text-slate-400">Jatuh Tempo: {order.due_date}</div>
                        ) : null}
                      </td>

                      <td className="px-3.5 py-2.5">
                        <div className="font-bold text-slate-900">{proj?.name || `Proyek #${order.project_id}`}</div>
                        <div className="text-xs text-blue-600 font-medium mt-0.5">
                          {prod?.name || `Produk #${order.product_id}`}
                        </div>
                      </td>

                      <td className="px-3.5 py-2.5">
                        <div className="font-bold text-slate-800">{op?.name || `Operator #${order.operator_worker_id}`}</div>
                        <div className="text-[11px] text-slate-500">
                          Checker: <span className="font-medium text-slate-700">{order.checker_email}</span>
                        </div>
                      </td>

                      <td className="px-3.5 py-2.5">
                        <div className="font-medium text-slate-800">
                          {totalItems} item pekerjaan · Total {qtyFmt(totalAssignedQty)}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">
                          {order.items.map((i) => i.work_item_name_snapshot).join(", ")}
                        </div>
                      </td>

                      <td className="px-3.5 py-2.5 text-center">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${statusClass}`}>
                          {order.status}
                        </span>
                      </td>

                      <td className="px-3.5 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handlePrintSpk(order)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                            title="Cetak SPK Resmi"
                          >
                            🖨️ Cetak
                          </button>

                          <button
                            type="button"
                            onClick={() => setDetailOrder(order)}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition shadow-2xs"
                            title="Lihat Detail Rincian"
                          >
                            🔍 Detail
                          </button>

                          {/* Tombol Edit SPK (Hanya jika belum Selesai dan belum ada setoran sah) */}
                          {canWrite && !["SELESAI", "DIBATALKAN"].includes(order.status) && !order.has_checks ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingOrder(order);
                                const initialQtys: Record<number, string> = {};
                                order.items.forEach((it) => {
                                  initialQtys[it.id] = String(it.assigned_qty);
                                });
                                setEditItemQtys(initialQtys);
                                setRemovedItemIds(new Set());
                                setAddWorkItemId("");
                                setAddWorkItemQty("100");
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition shadow-2xs"
                              title="Edit Item & Qty SPK"
                            >
                              ✏️ Edit
                            </button>
                          ) : canWrite && (["SELESAI", "DIBATALKAN"].includes(order.status) || order.has_checks) ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-400 select-none cursor-not-allowed"
                              title={
                                order.status === "SELESAI"
                                  ? "SPK Selesai (Terkunci dari Perubahan)"
                                  : order.status === "DIBATALKAN"
                                  ? "SPK Dibatalkan"
                                  : "Terkunci (Sudah ada input setoran sah dari Checker)"
                              }
                            >
                              🔒 Terkunci
                            </span>
                          ) : null}

                          {order.status === "DRAFT" && canWrite ? (
                            <form action={publishSpkAction}>
                              <input type="hidden" name="order_id" value={order.id} />
                              <button
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 transition shadow-2xs"
                                title="Terbitkan Sekarang"
                              >
                                🚀 Terbitkan
                              </button>
                            </form>
                          ) : null}

                          {(order.status === "DRAFT" || order.status === "AKTIF") && canWrite ? (
                            <form
                              action={cancelSpkAction}
                              onSubmit={(e) => {
                                if (!confirm(`Batalkan SPK ${order.spk_code}?`)) e.preventDefault();
                              }}
                            >
                              <input type="hidden" name="order_id" value={order.id} />
                              <button
                                className="inline-flex items-center gap-1 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-600 px-1 py-1"
                                title="Batalkan SPK"
                              >
                                ✕
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. MODAL BUAT SPK BARU (Alur Terpadu 1-Langkah Identik V1) */}
      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-4xl rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">Buat Surat Perintah Kerja (SPK)</h3>
                <p className="text-xs text-slate-500">
                  Pilih proyek, produk, operator borongan, checker, lalu tentukan item pekerjaan dan Qty Penugasan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form action={createSpkUnifiedAction} className="mt-4 space-y-5">
              <input type="hidden" name="publish_now" value={publishNow ? "1" : "0"} />

              {/* Section 1: Informasi Penugasan */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  📋 Informasi Penugasan
                </h4>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tanggal SPK <span className="text-rose-500">*</span>
                    </label>
                    <input
                      name="order_date"
                      type="date"
                      required
                      defaultValue={new Date().toISOString().split("T")[0]}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Proyek <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="project_id"
                      required
                      value={selectedProjectId}
                      onChange={(e) => {
                        setSelectedProjectId(e.target.value);
                        setSelectedProductId("");
                        setCheckedItemIds(new Set());
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Pilih Proyek...</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Produk / Tas <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="product_id"
                      required
                      value={selectedProductId}
                      onChange={(e) => {
                        setSelectedProductId(e.target.value);
                        setCheckedItemIds(new Set());
                      }}
                      disabled={!selectedProjectId || availableProducts.length === 0}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
                    >
                      <option value="">
                        {!selectedProjectId
                          ? "Pilih Proyek Terlebih Dahulu"
                          : availableProducts.length === 0
                          ? "Tidak ada produk aktif"
                          : "Pilih Produk / Tas..."}
                      </option>
                      {availableProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.target_production ? `(Target: ${p.target_production})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Operator Borongan <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="operator_worker_id"
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Pilih Operator...</option>
                      {operators.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.name} ({op.worker_code} · {op.position || "Operator Jahit"})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Checker <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="checker_email"
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Pilih Checker...</option>
                      {checkers.map((c) => (
                        <option key={c.user_id} value={c.email}>
                          {c.display_name || c.email} ({c.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Supervisor (Pembuat)
                    </label>
                    <select
                      name="supervisor_worker_id"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Mengikuti Akun Login</option>
                      {supervisors.map((spv) => (
                        <option key={spv.id} value={spv.id}>
                          {spv.name} ({spv.worker_code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Jatuh Tempo (Opsional)
                    </label>
                    <input
                      name="due_date"
                      type="date"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Catatan Penugasan
                    </label>
                    <input
                      name="notes"
                      type="text"
                      placeholder="Catatan pengerjaan bagi operator..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Katalog Item Pekerjaan (Identik dengan V1 ModalSPK) */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-2.5">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      ✂️ Item Pekerjaan Yang Ditugaskan
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Centang pekerjaan yang diserahkan ke operator dan isi Qty Penugasan.
                    </p>
                  </div>

                  {availableWorkItems.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                        {checkedItemIds.size} dari {availableWorkItems.length} item dipilih
                      </span>
                      <button
                        type="button"
                        onClick={handleSelectAll}
                        className="text-xs text-blue-600 hover:underline font-semibold"
                      >
                        {checkedItemIds.size === availableWorkItems.length ? "Batal Pilih Semua" : "Pilih Semua"}
                      </button>
                    </div>
                  ) : null}
                </div>

                {!selectedProjectId || !selectedProductId ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Pilih <b>Proyek</b> dan <b>Produk</b> di atas untuk menampilkan daftar item pekerjaan.
                  </div>
                ) : availableWorkItems.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Belum ada item pekerjaan aktif untuk produk ini. Tambahkan item di Master Item Pekerjaan.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {availableWorkItems.map((item) => {
                      const isChecked = checkedItemIds.has(item.id);
                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl border p-3 transition ${
                            isChecked
                              ? "border-blue-400 bg-blue-50/30"
                              : "border-slate-200 bg-slate-50/40 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <label className="flex items-start gap-2.5 cursor-pointer flex-1">
                              <input
                                type="checkbox"
                                name="selected_items"
                                value={item.id}
                                checked={isChecked}
                                onChange={() => handleToggleItem(item.id)}
                                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                              <div>
                                <div className="font-bold text-slate-900 text-xs">
                                  #{item.display_order || 0} · {item.name}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                                  <span className="font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                    Tarif: {money(item.operator_price)} / {item.unit}
                                  </span>
                                  <span>·</span>
                                  <span>Qty/Tas: {qtyFmt(item.qty_per_product)}</span>
                                </div>
                              </div>
                            </label>

                            {isChecked ? (
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-slate-600 font-semibold">Qty Penugasan:</span>
                                <div className="flex items-center">
                                  <input
                                    type="number"
                                    name={`qty_${item.id}`}
                                    min="0.01"
                                    step="any"
                                    required={isChecked}
                                    value={itemQuantities[item.id] || ""}
                                    onChange={(e) =>
                                      setItemQuantities({
                                        ...itemQuantities,
                                        [item.id]: e.target.value,
                                      })
                                    }
                                    className="w-24 rounded-l-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                                    placeholder="0"
                                  />
                                  <span className="rounded-r-lg border border-l-0 border-slate-300 bg-slate-100 px-2 py-1.5 text-xs font-semibold text-slate-600">
                                    {item.unit}
                                  </span>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action Buttons (1-Langkah Simpan & Terbitkan Identik V1) */}
              <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  onClick={() => setPublishNow(false)}
                  disabled={checkedItemIds.size === 0}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 transition shadow-2xs disabled:opacity-50"
                >
                  💾 Simpan Draft
                </button>

                <button
                  type="submit"
                  onClick={() => setPublishNow(true)}
                  disabled={checkedItemIds.size === 0}
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 transition shadow-xs active:scale-95 disabled:opacity-50"
                >
                  🚀 Simpan & Terbitkan (Langsung Aktif)
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* 5. MODAL DETAIL SPK */}
      {detailOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-3xl rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">
                  Detail SPK: <span className="text-blue-600 font-mono">{detailOrder.spk_code}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Status: <b>{detailOrder.status}</b> · Tanggal: {detailOrder.order_date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailOrder(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500">Proyek:</span>
                  <div className="font-bold text-slate-900">
                    {projectMap.get(detailOrder.project_id)?.name || "-"}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Produk / Tas:</span>
                  <div className="font-bold text-blue-600">
                    {productMap.get(detailOrder.product_id)?.name || "-"}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Operator Borongan:</span>
                  <div className="font-bold text-slate-900">
                    {operatorMap.get(detailOrder.operator_worker_id)?.name || "-"}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Checker:</span>
                  <div className="font-bold text-slate-800">{detailOrder.checker_email}</div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Daftar Pekerjaan ({detailOrder.items.length} Item)
                </h4>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 font-semibold text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left">Item Pekerjaan</th>
                        <th className="px-3 py-2 text-right">Qty Penugasan</th>
                        <th className="px-3 py-2 text-center">Satuan</th>
                        <th className="px-3 py-2 text-right">Harga Operator</th>
                        <th className="px-3 py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {detailOrder.items.map((it) => {
                        const sub = num(it.assigned_qty) * num(it.operator_price_snapshot);
                        return (
                          <tr key={it.id}>
                            <td className="px-3 py-2 font-bold text-slate-800">{it.work_item_name_snapshot}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-900">
                              {qtyFmt(it.assigned_qty)}
                            </td>
                            <td className="px-3 py-2 text-center text-slate-500">{it.unit_snapshot}</td>
                            <td className="px-3 py-2 text-right text-slate-600">
                              {money(it.operator_price_snapshot)}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-600">{money(sub)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handlePrintSpk(detailOrder)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                >
                  🖨️ Cetak SPK
                </button>
                <button
                  type="button"
                  onClick={() => setDetailOrder(null)}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal Edit SPK */}
      {editingOrder ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>✏️</span> Edit SPK: <span className="text-blue-600 font-mono">{editingOrder.spk_code}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Perbarui kuantiti penugasan atau sesuaikan item pekerjaan sebelum diperiksa Checker.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            {/* Banner Notifikasi Checker */}
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
              <div className="font-bold flex items-center gap-1.5 mb-1">
                <span>🔔</span> Notifikasi Otomatis ke Checker
              </div>
              <p>
                Setiap revisi kuantiti atau item yang disimpan akan otomatis memicu tanda peringatan <b>⚠️ Diperbarui SPV</b> pada halaman Checker ({editingOrder.checker_email}).
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500">Proyek & Produk:</span>
                <div className="font-bold text-slate-900">
                  {projectMap.get(editingOrder.project_id)?.name || "-"} ·{" "}
                  <span className="text-blue-600">{productMap.get(editingOrder.product_id)?.name || "-"}</span>
                </div>
              </div>
              <div>
                <span className="text-slate-500">Operator Borongan:</span>
                <div className="font-bold text-slate-900">
                  {operatorMap.get(editingOrder.operator_worker_id)?.name || "-"} (
                  {operatorMap.get(editingOrder.operator_worker_id)?.worker_code || "-"})
                </div>
              </div>
            </div>

            <form action={editSpkAction} className="mt-4 space-y-4">
              <input type="hidden" name="order_id" value={editingOrder.id} />

              {/* Rincian Item Pekerjaan */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Rincian Item & Qty Penugasan
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {editingOrder.items.filter((it) => !removedItemIds.has(it.id)).length} Item Aktif
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 font-semibold text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left">Item Pekerjaan</th>
                        <th className="px-3 py-2 text-right">Harga Satuan</th>
                        <th className="px-3 py-2 text-center w-36">Qty Penugasan</th>
                        <th className="px-3 py-2 text-center w-16">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {editingOrder.items.map((it) => {
                        const isRemoved = removedItemIds.has(it.id);
                        if (isRemoved) return null;

                        const activeItemCount = editingOrder.items.filter((x) => !removedItemIds.has(x.id)).length;

                        return (
                          <tr key={it.id} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2.5 font-medium text-slate-800">
                              <input type="hidden" name="existing_item_id" value={it.id} />
                              <input type="hidden" name={`item_work_id_${it.id}`} value={it.work_item_id} />
                              <div>{it.work_item_name_snapshot}</div>
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium text-slate-600">
                              {money(it.operator_price_snapshot)}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  name={`item_qty_${it.id}`}
                                  value={editItemQtys[it.id] ?? it.assigned_qty}
                                  onChange={(e) =>
                                    setEditItemQtys((prev) => ({
                                      ...prev,
                                      [it.id]: e.target.value,
                                    }))
                                  }
                                  min="1"
                                  className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-center font-bold text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  required
                                />
                                <span className="text-slate-500 text-[11px] uppercase">{it.unit_snapshot}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {activeItemCount > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => setRemovedItemIds((prev) => new Set(prev).add(it.id))}
                                  className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                                  title="Hapus Item dari SPK"
                                >
                                  🗑️
                                </button>
                              ) : (
                                <span className="text-slate-300 text-xs">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Hidden inputs untuk items yang dihapus */}
                {Array.from(removedItemIds).map((rId) => (
                  <input key={rId} type="hidden" name="remove_item_id" value={rId} />
                ))}
              </div>

              {/* Tambah Item Baru ke SPK */}
              {(() => {
                const existingWorkItemIds = new Set(
                  editingOrder.items
                    .filter((it) => !removedItemIds.has(it.id))
                    .map((it) => it.work_item_id)
                );
                const unassignedItems = workItems.filter(
                  (w) =>
                    w.project_id === editingOrder.project_id &&
                    (w.product_id === editingOrder.product_id || w.product_id === null) &&
                    !existingWorkItemIds.has(w.id)
                );

                if (unassignedItems.length === 0) return null;

                return (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-3.5">
                    <h5 className="text-xs font-bold text-slate-700 mb-2">➕ Tambah Item Pekerjaan ke SPK Ini (Opsional)</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                      <div className="sm:col-span-2">
                        <select
                          name="add_work_item_id"
                          value={addWorkItemId}
                          onChange={(e) => setAddWorkItemId(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                        >
                          <option value="">-- Pilih Item untuk Ditambahkan --</option>
                          {unassignedItems.map((wi) => (
                            <option key={wi.id} value={wi.id}>
                              {wi.name} ({money(wi.operator_price)})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <input
                          type="number"
                          name="add_work_item_qty"
                          placeholder="Qty Penugasan"
                          value={addWorkItemQty}
                          onChange={(e) => setAddWorkItemQty(e.target.value)}
                          min="1"
                          disabled={!addWorkItemId}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 disabled:opacity-50"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 transition shadow-2xs flex items-center gap-1.5"
                >
                  <span>💾</span> Simpan Perubahan SPK
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
