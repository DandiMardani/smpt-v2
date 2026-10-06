"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NotificationItem } from "@/app/api/notifications/route";

export function AdminNotificationBell({ userRole }: { userRole?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [lastReadTimestamp, setLastReadTimestamp] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<string>("ALL");
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Load last read timestamp from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("smpt_last_notif_read");
      if (stored) setLastReadTimestamp(Number(stored));
    } catch {
      // ignore
    }
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.notifications)) {
        setNotifications(json.notifications);
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Poll every 45s for live updates
    const interval = setInterval(fetchNotifications, 45000);
    return () => clearInterval(interval);
  }, []);

  // Close when clicked outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const unreadCount = notifications.filter(
    (n) => new Date(n.timestamp).getTime() > lastReadTimestamp
  ).length;

  const handleMarkAllRead = () => {
    const now = Date.now();
    setLastReadTimestamp(now);
    try {
      localStorage.setItem("smpt_last_notif_read", String(now));
    } catch {
      // ignore
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === "ALL") return true;
    if (activeTab === "ABSENSI") return n.category === "ABSENSI";
    if (activeTab === "PENGIRIMAN") return n.category === "PENGIRIMAN";
    if (activeTab === "PABRIK") return n.category === "PACKING" || n.category === "TRANSFER";
    return true;
  });

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case "ABSENSI":
        return "📝";
      case "PENGIRIMAN":
        return "🚚";
      case "PACKING":
        return "📦";
      case "TRANSFER":
        return "🔄";
      default:
        return "📌";
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen && unreadCount > 0) {
            handleMarkAllRead();
          }
        }}
        title="Notifikasi & Log Input Aktivitas"
        className={`relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border transition shadow-2xs cursor-pointer ${
          isOpen
            ? "border-blue-500 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`}
        aria-label="Notifikasi Input Data"
      >
        <svg
          className="h-4 w-4 sm:h-4.5 sm:w-4.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>

        {/* Counter Badge */}
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white shadow-xs animate-bounce">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : (
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
        )}
      </button>

      {/* Popover Flyout */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-[340px] sm:w-[420px] max-w-[calc(100vw-24px)] rounded-3xl border border-slate-200 bg-white shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-sm">
                🔔
              </span>
              <div>
                <h4 className="text-xs font-black text-slate-900 tracking-tight">
                  Notifikasi & Lacak Input
                </h4>
                <p className="text-[10px] text-slate-500">
                  Aktivitas pencatatan & input staf lapangan
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={fetchNotifications}
                disabled={loading}
                title="Refresh Notifikasi"
                className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 text-xs cursor-pointer"
              >
                <span className={loading ? "animate-spin" : ""}>🔄</span>
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-100 bg-white px-3 py-2 text-[11px] font-bold overflow-x-auto no-scrollbar">
            {[
              { id: "ALL", label: "Semua" },
              { id: "ABSENSI", label: "Presensi" },
              { id: "PENGIRIMAN", label: "Logistik" },
              { id: "PABRIK", label: "MR WU & Pabrik" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`rounded-lg px-2.5 py-1 transition whitespace-nowrap cursor-pointer ${
                  activeTab === t.id
                    ? "bg-slate-900 text-white shadow-2xs"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Notification List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 text-xs">
            {filteredNotifications.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <span className="text-2xl block mb-1">📭</span>
                <p className="text-xs font-semibold">Belum ada aktivitas tercatat</p>
                <p className="text-[10px]">Aktivitas staf saat input data akan muncul di sini.</p>
              </div>
            ) : (
              filteredNotifications.map((item) => {
                const isUnread =
                  new Date(item.timestamp).getTime() > lastReadTimestamp;

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 transition hover:bg-slate-50/90 flex items-start gap-3 ${
                      isUnread ? "bg-blue-50/30" : ""
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 border border-slate-200/80 text-sm">
                      {getCategoryIcon(item.category)}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[9px] font-black border ${item.badge.color}`}
                        >
                          {item.badge.label}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {item.timeAgo}
                        </span>
                      </div>

                      <h5 className="font-extrabold text-slate-900 text-xs line-clamp-1">
                        {item.title}
                      </h5>

                      <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5 leading-relaxed">
                        {item.description}
                      </p>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-400 font-medium truncate">
                          Oleh: <b className="text-slate-700">{item.actor}</b>
                        </span>

                        <Link
                          href={item.link}
                          onClick={() => setIsOpen(false)}
                          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 px-2 py-1 text-[10px] font-bold text-white shadow-2xs transition active:scale-95"
                        >
                          <span>Track Inputan</span>
                          <span>➔</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-[11px]">
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="font-bold text-slate-500 hover:text-slate-900 transition cursor-pointer"
            >
              ✓ Tandai Telah Ditinjau
            </button>

            <Link
              href="/dashboard?view=manager"
              onClick={() => setIsOpen(false)}
              className="font-bold text-blue-600 hover:text-blue-800 transition"
            >
              Buka Dashboard Monitoring ➔
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
