"use client";

import { useState, type ReactNode } from "react";

type Props = {
  slipsNode: ReactNode;
  finalizeNode?: ReactNode;
  historyNode: ReactNode;
  canWrite: boolean;
  activeRunCode?: string;
  workerCount: number;
};

export default function PayrollViewTabs({
  slipsNode,
  finalizeNode,
  historyNode,
  canWrite,
  activeRunCode,
  workerCount,
}: Props) {
  const [activeTab, setActiveTab] = useState<"slips" | "finalize" | "history">("slips");

  return (
    <div className="space-y-4 min-w-0 max-w-full">
      {/* Tab Navigation Pill Bar - Mobile Native Touch Targets */}
      <div className="sticky top-14 sm:top-16 z-20 flex rounded-2xl border border-slate-200/90 bg-white/95 p-1 sm:p-1.5 shadow-sm backdrop-blur-md min-w-0 max-w-full">
        <button
          type="button"
          onClick={() => setActiveTab("slips")}
          className={`flex flex-1 items-center justify-center gap-1 rounded-xl py-2 px-1.5 sm:px-3 text-[11px] sm:text-xs md:text-sm font-bold transition min-w-0 ${
            activeTab === "slips"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <span className="truncate">📋 Slip & Gaji</span>
          {activeRunCode ? (
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-black shrink-0 ${
                activeTab === "slips" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {workerCount}
            </span>
          ) : null}
        </button>

        {canWrite && finalizeNode ? (
          <button
            type="button"
            onClick={() => setActiveTab("finalize")}
            className={`flex flex-1 items-center justify-center gap-1 rounded-xl py-2 px-1.5 sm:px-3 text-[11px] sm:text-xs md:text-sm font-bold transition min-w-0 ${
              activeTab === "finalize"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <span className="truncate">⚡ Finalisasi</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`flex flex-1 items-center justify-center gap-1 rounded-xl py-2 px-1.5 sm:px-3 text-[11px] sm:text-xs md:text-sm font-bold transition min-w-0 ${
            activeTab === "history"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <span className="truncate">📊 Riwayat</span>
        </button>
      </div>

      {/* Tab Content Panels */}
      {activeTab === "slips" && (
        <div className="space-y-4 animate-in fade-in duration-200">{slipsNode}</div>
      )}

      {activeTab === "finalize" && finalizeNode && (
        <div className="space-y-4 animate-in fade-in duration-200">{finalizeNode}</div>
      )}

      {activeTab === "history" && (
        <div className="space-y-4 animate-in fade-in duration-200">{historyNode}</div>
      )}
    </div>
  );
}
