"use client";

import { useState } from "react";
import { Badge, Card, Metric, TableWrap, Td, Th, dangerClass } from "@/components/final/final-ui";
import { qty } from "@/lib/final/final-utils";
import { cancelCheckerResultAction } from "@/lib/final/actions";
import { CheckerTasksClient } from "./checker-tasks-client";
import { AdminApprovalClient } from "./admin-approval-client";
import { CheckerEditModal } from "./checker-edit-modal";
import { CheckerDirectInputForm } from "./checker-direct-input-form";
import type {
  CheckerTaskItem,
  ProductionCheck,
  CheckerEditRequest,
  ProjectOptionItem,
  ProductOptionItem,
  WorkItemOptionItem,
  WorkerOptionItem,
} from "./types";

interface BoronganPageClientProps {
  tasks: CheckerTaskItem[];
  checks: ProductionCheck[];
  editRequests: CheckerEditRequest[];
  canOperate: boolean;
  isAdminOrManager: boolean;
  isCheckerRole: boolean;
  userEmail?: string;
  hasRoutingDependenciesCount: number;
  projects?: ProjectOptionItem[];
  products?: ProductOptionItem[];
  workItems?: WorkItemOptionItem[];
  workers?: WorkerOptionItem[];
}

export function BoronganPageClient({
  tasks,
  checks,
  editRequests,
  canOperate,
  isAdminOrManager,
  isCheckerRole,
  userEmail,
  hasRoutingDependenciesCount,
  projects = [],
  products = [],
  workItems = [],
  workers = [],
}: BoronganPageClientProps) {
  const [activeTab, setActiveTab] = useState<"pemeriksaan" | "mandiri" | "persetujuan">("pemeriksaan");
  const [selectedCheck, setSelectedCheck] = useState<ProductionCheck | null>(null);
  const [selectedContext, setSelectedContext] = useState<{
    spk_code?: string;
    work_item_name?: string;
    operator_name?: string;
    unit?: string;
  } | null>(null);

  const pendingRequestsCount = editRequests.filter((r) => r.status === "pending").length;

  const handleOpenEditModal = (
    check: ProductionCheck,
    taskContext: {
      spk_code?: string;
      work_item_name?: string;
      operator_name?: string;
      unit?: string;
    }
  ) => {
    setSelectedCheck(check);
    setSelectedContext(taskContext);
  };

  return (
    <div className="space-y-5">
      {/* Modal Ajukan Perubahan */}
      <CheckerEditModal
        isOpen={Boolean(selectedCheck)}
        onClose={() => {
          setSelectedCheck(null);
          setSelectedContext(null);
        }}
        check={selectedCheck}
        taskContext={selectedContext}
      />

      {/* Navigasi Tab */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/90 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("pemeriksaan")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition cursor-pointer ${
            activeTab === "pemeriksaan"
              ? "bg-blue-600 text-white shadow-xs"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <span>📋</span>
          <span>Pemeriksaan & Input Setoran</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              activeTab === "pemeriksaan" ? "bg-white/25 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {tasks.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("mandiri")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition cursor-pointer ${
            activeTab === "mandiri"
              ? "bg-indigo-600 text-white shadow-xs"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <span>⚡</span>
          <span>Input Mandiri (Auto-SPK)</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              activeTab === "mandiri"
                ? "bg-white/25 text-white"
                : "bg-indigo-50 text-indigo-700 border border-indigo-200"
            }`}
          >
            Auto-SPK
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("persetujuan")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold transition cursor-pointer ${
            activeTab === "persetujuan"
              ? "bg-amber-600 text-white shadow-xs"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <span>⚖️</span>
          <span>
            {isAdminOrManager ? "Persetujuan Edit Setoran (Admin)" : "Status Pengajuan Edit"}
          </span>
          {pendingRequestsCount > 0 ? (
            <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] text-white font-extrabold animate-pulse">
              {pendingRequestsCount} pending
            </span>
          ) : (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                activeTab === "persetujuan"
                  ? "bg-white/25 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {editRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: Pemeriksaan & Input Setoran */}
      {activeTab === "pemeriksaan" && (
        <div className="space-y-5">
          {/* Quick banner to switch to direct input if needed */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200/90 bg-gradient-to-r from-indigo-50/80 via-blue-50/40 to-white p-3.5 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-2xs text-sm">
                ⚡
              </span>
              <div>
                <p className="text-xs font-extrabold text-slate-900">
                  Perlu catat setoran tanpa SPK dari SPV sebelumnya?
                </p>
                <p className="text-[11px] text-slate-500">
                  Gunakan fitur <b>Input Mandiri (Auto-SPK)</b> untuk otomatis menerbitkan SPK langsung dari hasil kerja operator.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("mandiri")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-xs hover:bg-indigo-700 transition cursor-pointer"
            >
              <span>⚡</span>
              <span>Buka Form Input Mandiri</span>
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Tugas SPK Aktif" value={tasks.length} />
            <Metric label="Setoran Saya (Terkunci)" value={checks.length} />
            <Metric label="Pekerjaan Berantai" value={hasRoutingDependenciesCount} />
            <Metric label="Pengajuan Edit Pending" value={pendingRequestsCount} />
          </div>

          <Card title="Pekerjaan Menunggu Checker">
            <CheckerTasksClient
              tasks={tasks}
              canOperate={canOperate}
              isCheckerRole={isCheckerRole}
              userEmail={userEmail}
              onSelectCheckForEdit={handleOpenEditModal}
            />
          </Card>

          <Card title="Riwayat Input Saya (Setoran Terkunci)">
            <TableWrap>
              <thead>
                <tr>
                  <Th>Kode Pemeriksaan</Th>
                  <Th>Tanggal</Th>
                  <Th>SPK & Pekerjaan</Th>
                  <Th>Qty Sah (Terkunci)</Th>
                  <Th>Reject</Th>
                  <Th>Status</Th>
                  <Th>Aksi Perubahan</Th>
                </tr>
              </thead>
              <tbody>
                {checks.length === 0 ? (
                  <tr>
                    <Td colSpan={7} className="text-center py-6 text-slate-400">
                      Belum ada riwayat hasil pemeriksaan yang Anda input.
                    </Td>
                  </tr>
                ) : (
                  checks.map((x) => {
                    const spkCode = x.spk_code || (tasks.find((t) => t.id === x.order_item_id)?.spk_code) || "-";
                    const workItemName = x.work_item_name || (tasks.find((t) => t.id === x.order_item_id)?.work_item_name_snapshot) || "-";
                    const opName = x.operator_name || (tasks.find((t) => t.id === x.order_item_id)?.operator_name) || "-";
                    const unit = x.unit || (tasks.find((t) => t.id === x.order_item_id)?.unit_snapshot) || "PCS";
                    const hasPending = Boolean(x.pending_request);
                    const hasRejected = Boolean(x.rejected_request) && !hasPending;
                    // Setoran sudah direvisi dan disahkan Admin — semua aksi mutasi dikunci
                    const hasApproved = Boolean(x.approved_request);
                    // Setoran utama sudah DIBATALKAN → tidak ada aksi perubahan yang boleh ditawarkan
                    const isCheckCancelled = String(x.status || "").trim().toUpperCase() === "DIBATALKAN";
                    // Tombol Batalkan hanya valid jika: status AKTIF, TIDAK ada approved, TIDAK ada pending
                    const canCancel = canOperate && x.status === "AKTIF" && !hasApproved && !hasPending;

                    return (
                      <tr key={x.id} className="hover:bg-slate-50/50 transition">
                        <Td className="font-mono text-xs font-bold text-slate-700">
                          <div className="flex items-center gap-1.5">
                            <span>🔒</span>
                            <span>{x.check_code || `CHK-${x.id}`}</span>
                          </div>
                        </Td>
                        <Td>{x.check_date}</Td>
                        <Td>
                          <div className="font-bold text-slate-900">{spkCode}</div>
                          <div className="text-xs text-slate-500">{workItemName}</div>
                          {opName !== "-" && (
                            <div className="text-[11px] text-slate-400">Op: {opName}</div>
                          )}
                        </Td>
                        <Td>
                          <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            {qty(x.good_qty)} {unit}
                          </span>
                        </Td>
                        <Td className={Number(x.reject_qty) > 0 ? "font-bold text-rose-600" : ""}>
                          {qty(x.reject_qty)} {unit}
                        </Td>
                        <Td>
                          <div className="flex flex-col gap-1 items-start">
                            <Badge>{x.status}</Badge>
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              Terkunci
                            </span>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex flex-wrap items-center gap-2">
                            {hasApproved ? (
                              // Setoran sudah disetujui Admin → semua aksi mutasi dikunci permanen
                              <span
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 cursor-help"
                                title={`Disetujui Admin${x.approved_request?.reviewed_at ? ` pada ${new Date(x.approved_request.reviewed_at).toLocaleDateString("id-ID")}` : ""}. Qty baru: ${x.approved_request?.requested_qty ?? "-"}`}
                              >
                                <span>✅</span>
                                <span>Disetujui Admin</span>
                              </span>
                            ) : hasPending && !isCheckCancelled ? (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 flex items-center gap-1">
                                <span>⏳</span>
                                <span>Menunggu Persetujuan Admin</span>
                              </span>
                            ) : hasRejected ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 cursor-help"
                                title={x.rejected_request?.review_notes || "Pengajuan sebelumnya ditolak oleh Admin."}
                              >
                                <span>❌</span>
                                <span>Ditolak Admin</span>
                              </span>
                            ) : !isCheckCancelled ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenEditModal(x, {
                                    spk_code: spkCode,
                                    work_item_name: workItemName,
                                    operator_name: opName,
                                    unit,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50/80 px-2.5 py-1 text-xs font-extrabold text-amber-900 shadow-2xs transition hover:bg-amber-100 cursor-pointer"
                              >
                                <span>✏️</span>
                                <span>Ajukan Perubahan</span>
                              </button>
                            ) : null}

                            {canCancel && (
                              <form action={cancelCheckerResultAction}>
                                <input type="hidden" name="check_id" value={x.id} />
                                <button className={dangerClass}>Batalkan</button>
                              </form>
                            )}
                          </div>
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </TableWrap>
          </Card>
        </div>
      )}

      {/* TAB 2: Input Setoran Mandiri (Auto-SPK) */}
      {activeTab === "mandiri" && (
        <div className="space-y-5">
          <CheckerDirectInputForm
            projects={projects}
            products={products}
            workItems={workItems}
            workers={workers}
            canOperate={canOperate}
            userEmail={userEmail}
          />
        </div>
      )}

      {/* TAB 3: Persetujuan Edit Setoran (Admin) */}
      {activeTab === "persetujuan" && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Total Pengajuan Edit" value={editRequests.length} />
            <Metric label="Menunggu Persetujuan" value={pendingRequestsCount} />
            <Metric
              label="Disetujui"
              value={editRequests.filter((r) => r.status === "approved").length}
            />
            <Metric
              label="Ditolak"
              value={editRequests.filter((r) => r.status === "rejected").length}
            />
          </div>

          <Card title="Persetujuan Perubahan Hasil Setoran Checker">
            <AdminApprovalClient
              requests={editRequests}
              isAdminOrManager={isAdminOrManager}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

