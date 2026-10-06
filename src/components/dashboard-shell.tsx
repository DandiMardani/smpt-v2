"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type ReactNode,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { logout } from "@/app/auth/actions";
import type { MenuEntry, MenuGroupChild } from "@/lib/access/menu";
import { AdminNotificationBell } from "@/components/navigation/admin-notification-bell";

type UserProfile = {
  displayName: string;
  email: string;
  role: string;
};

type Props = {
  children: ReactNode;
  menuEntries: MenuEntry[];
  allEntries?: MenuEntry[];
  hajiEntries?: MenuEntry[];
  regulerEntries?: MenuEntry[];
  gudangEntries?: MenuEntry[];
  sdmEntries?: MenuEntry[];
  badgeCounts: Record<string, number>;
  userProfile: UserProfile;
  pendingGudangCount?: number;
};

type FlatMenuItem = {
  id: string;
  title: string;
  href: string;
  groupTitle: string;
  subgroupTitle?: string;
};

function getCategoryIcon(id: string, className = "h-4 w-4") {
  switch (id) {
    case "dashboard":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect width="7" height="9" x="3" y="3" rx="1.5" />
          <rect width="7" height="5" x="14" y="3" rx="1.5" />
          <rect width="7" height="9" x="14" y="12" rx="1.5" />
          <rect width="7" height="5" x="3" y="16" rx="1.5" />
        </svg>
      );
    case "masterData":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v14a9 3 0 0 0 18 0V5" />
          <path d="M3 12a9 3 0 0 0 18 0" />
        </svg>
      );
    case "gudangMaterial":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      );
    case "produksiGroup":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
          <path d="M17 18h1" />
          <path d="M12 18h1" />
          <path d="M7 18h1" />
        </svg>
      );
    case "qcLogistik":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "sdmPayroll":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "kasbonGroup":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect width="20" height="14" x="2" y="5" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      );
    case "payrollGroup":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect width="18" height="12" x="3" y="6" rx="2" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case "keuanganGroup":
    case "keuanganLaporan":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
          <path d="M12 18V6" />
        </svg>
      );
    case "sistemGroup":
    case "keamananAkses":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="8" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
  }
}

function getMenuItemBadge(id: string): { label: string; color: string } | null {
  switch (id) {
    // Bahan & Material: Master katalog vs Arus mutasi
    case "masterBahan":
      return { label: "Katalog", color: "bg-blue-50 text-blue-700 border-blue-200" };
    case "bahan":
      return { label: "Arus Stok", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "masterBarangJadi":
      return { label: "Katalog", color: "bg-blue-50 text-blue-700 border-blue-200" };
    case "stokBarangJadi":
      return { label: "Gudang Fisik", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };

    // Produksi & Setoran
    case "produksiReguler":
      return { label: "Harian", color: "bg-indigo-50 text-indigo-700 border-indigo-200" };
    case "borongan":
      return { label: "Borongan", color: "bg-purple-50 text-purple-700 border-purple-200" };
    case "hasilProduksi":
      return { label: "Checker", color: "bg-amber-50 text-amber-700 border-amber-200" };
    case "manufaktur":
      return { label: "Maklon", color: "bg-slate-100 text-slate-700 border-slate-200" };

    // Pengiriman: Haji vs Reguler
    case "pengirimanEmbarkasi":
      return { label: "Kirim Haji", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "pengirimanKlien":
      return { label: "Kirim Reguler", color: "bg-indigo-50 text-indigo-700 border-indigo-200" };

    // Kasbon & SDM
    case "kasbon":
      return { label: "Kasbon Kantor", color: "bg-rose-50 text-rose-700 border-rose-200" };
    case "warung":
      return { label: "Warung Makan", color: "bg-amber-50 text-amber-700 border-amber-200" };
    case "setoran":
      return { label: "Gaji Saya", color: "bg-cyan-50 text-cyan-700 border-cyan-200" };
    case "payroll":
      return { label: "Slip & Rekap", color: "bg-blue-50 text-blue-700 border-blue-200" };

    default:
      return null;
  }
}

export function DashboardShell({
  children,
  menuEntries,
  allEntries,
  hajiEntries,
  regulerEntries,
  gudangEntries,
  sdmEntries,
  badgeCounts,
  userProfile,
  pendingGudangCount = 0,
}: Props) {
  const pathname = usePathname();

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [contentWide, setContentWide] = useState<boolean>(true);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState<boolean>(false);
  const [sidebarFilter, setSidebarFilter] = useState<string>("");
  const [mobileFilter, setMobileFilter] = useState<string>("");
  const [activeFlyoutGroup, setActiveFlyoutGroup] = useState<string | null>(null);
  const [activeMobileCategory, setActiveMobileCategory] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [mobileOpenGroups, setMobileOpenGroups] = useState<Record<string, boolean>>({});

  const userDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const flyoutTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    try {
      const savedCollapsed = localStorage.getItem("smpt_sidebar_collapsed");
      if (savedCollapsed !== null) {
        setSidebarCollapsed(savedCollapsed === "true");
      }
      const savedWide = localStorage.getItem("smpt_content_wide");
      if (savedWide !== null) {
        setContentWide(savedWide !== "false");
      }
    } catch {}
  }, []);

  const isLinkActive = useCallback((href: string) => {
    const [hrefPath] = href.split("?");
    return pathname === hrefPath;
  }, [pathname]);

  const effectiveMenuEntries: MenuEntry[] = useMemo(() => {
    return allEntries && allEntries.length > 0 ? allEntries : menuEntries;
  }, [allEntries, menuEntries]);

  const mobileMenuEntries: MenuEntry[] = useMemo(() => {
    const q = mobileFilter.trim().toLowerCase();
    const sourceEntries = allEntries && allEntries.length > 0 ? allEntries : effectiveMenuEntries;
    if (!q) return sourceEntries;

    return sourceEntries
      .map((entry) => {
        if (entry.type === "item") return entry.text.toLowerCase().includes(q) ? entry : null;
        const filteredChildren = entry.children.filter((child) => {
          if (child.type === "item") return child.text.toLowerCase().includes(q);
          return false;
        });
        if (filteredChildren.length > 0 || entry.text.toLowerCase().includes(q)) {
          return { ...entry, children: filteredChildren.length > 0 ? filteredChildren : entry.children };
        }
        return null;
      })
      .filter(Boolean) as MenuEntry[];
  }, [mobileFilter, effectiveMenuEntries, allEntries]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("smpt_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
    setActiveFlyoutGroup(null);
  }, []);

  const handleToggleWide = useCallback(() => {
    setContentWide((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("smpt_content_wide", String(next));
      } catch {}
      return next;
    });
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        handleToggleSidebar();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
        setUserDropdownOpen(false);
        setMobileOpen(false);
        setActiveFlyoutGroup(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleToggleSidebar]);

  useEffect(() => {
    setMobileOpen(false);
    setUserDropdownOpen(false);
    setActiveFlyoutGroup(null);
  }, [pathname]);

  useEffect(() => {
    if (mobileOpen) {
      const currentGroup = effectiveMenuEntries.find(
        (entry) =>
          entry.type === "group" &&
          entry.children.some((child) => child.type === "item" && isLinkActive(child.href))
      );
      if (currentGroup) {
        setActiveMobileCategory(currentGroup.id);
      }
    }
  }, [mobileOpen, effectiveMenuEntries, isLinkActive]);

  useEffect(() => {
    if (mobileOpen || searchOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen, searchOpen]);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchOpen]);

  const flatMenuItems = useMemo<FlatMenuItem[]>(() => {
    const list: FlatMenuItem[] = [];
    for (const entry of effectiveMenuEntries) {
      if (entry.type === "item") {
        list.push({ id: entry.id, title: entry.text, href: entry.href, groupTitle: "Dashboard" });
      } else {
        const groupTitle = entry.text;
        for (const child of entry.children) {
          if (child.type === "item") {
            list.push({ id: child.id, title: child.text, href: child.href, groupTitle });
          } else {
            const subgroupTitle = child.text;
            for (const subChild of child.children) {
              list.push({ id: subChild.id, title: subChild.text, href: subChild.href, groupTitle, subgroupTitle });
            }
          }
        }
      }
    }
    return list;
  }, [effectiveMenuEntries]);

  const currentBreadcrumb = useMemo(() => {
    const found = flatMenuItems.find((item) => item.href === pathname);
    if (!found) {
      if (pathname === "/dashboard") return { page: "Dashboard", group: null };
      if (pathname.startsWith("/dashboard/akun")) return { page: "Akun Saya", group: "Pengaturan" };
      if (pathname.startsWith("/dashboard/spk")) return { page: "Surat Perintah Kerja", group: "Produksi" };
      return { page: "SMPT V2", group: "Dashboard" };
    }
    return { page: found.title, group: found.groupTitle, subgroup: found.subgroupTitle };
  }, [pathname, flatMenuItems]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return flatMenuItems;
    return flatMenuItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.groupTitle.toLowerCase().includes(q) ||
        (item.subgroupTitle && item.subgroupTitle.toLowerCase().includes(q))
    );
  }, [searchQuery, flatMenuItems]);

  useEffect(() => {
    setSelectedSearchIndex(0);
  }, [searchQuery]);

  const filteredSidebarEntries = useMemo(() => {
    const q = sidebarFilter.trim().toLowerCase();
    if (!q) return effectiveMenuEntries;
    return effectiveMenuEntries
      .map((entry) => {
        if (entry.type === "item") return entry.text.toLowerCase().includes(q) ? entry : null;
        const filteredChildren: MenuGroupChild[] = [];
        for (const child of entry.children) {
          if (child.type === "item") {
            if (child.text.toLowerCase().includes(q)) filteredChildren.push(child);
          } else {
            const filteredSubs = child.children.filter((sub) => sub.text.toLowerCase().includes(q));
            if (filteredSubs.length > 0 || child.text.toLowerCase().includes(q)) {
              filteredChildren.push({ ...child, children: filteredSubs.length > 0 ? filteredSubs : child.children });
            }
          }
        }
        if (filteredChildren.length > 0 || entry.text.toLowerCase().includes(q)) {
          return { ...entry, children: filteredChildren.length > 0 ? filteredChildren : entry.children };
        }
        return null;
      })
      .filter(Boolean) as MenuEntry[];
  }, [sidebarFilter, effectiveMenuEntries]);

  return (
    <div className="min-h-screen bg-slate-50/80 text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* 1. DESKTOP SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200/80 bg-white transition-[width] duration-300 ease-in-out lg:flex shadow-xs ${
          sidebarCollapsed ? "w-20" : "w-72"
        }`}
      >
        <div className={`relative flex h-16 shrink-0 items-center border-b border-slate-100 transition-all duration-300 ${
          sidebarCollapsed ? "justify-center px-2" : "justify-between px-4"
        }`}>
          {sidebarCollapsed ? (
            <div className="flex items-center justify-center w-full relative">
              <Link
                href="/dashboard"
                title="Dashboard Kreasi Dinamika"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-700 text-sm font-black text-white shadow-md shadow-blue-500/25 transition hover:scale-105 active:scale-95"
              >
                KD
              </Link>
              <button
                type="button"
                onClick={handleToggleSidebar}
                title="Perlebar Sidebar (Ctrl+B)"
                className="absolute -right-5 top-1/2 -translate-y-1/2 z-50 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition active:scale-95"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-700 text-sm font-black text-white shadow-md shadow-blue-500/25">
                  KD
                </div>
                <div className="min-w-0 transition-opacity duration-200">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-black tracking-tight text-slate-900">Kreasi Dinamika</span>
                    <span className="rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white shadow-xs">
                      V2 PRO
                    </span>
                  </div>
                  <p className="truncate text-[11px] font-semibold text-slate-400">Sistem Manufaktur Terpadu</p>
                </div>
              </Link>

              <button
                type="button"
                onClick={handleToggleSidebar}
                title="Ciutkan Sidebar (Ctrl+B)"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 transition active:scale-95"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Quick Search on Desktop Sidebar */}
        {!sidebarCollapsed && (
          <div className="border-b border-slate-100 bg-slate-50/70 p-2.5">
            <div className="relative">
              <input
                type="text"
                value={sidebarFilter}
                onChange={(e) => setSidebarFilter(e.target.value)}
                placeholder="Cari menu & modul..."
                className="w-full rounded-xl border border-slate-200 bg-white pl-8 pr-7 py-1.5 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <svg className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {sidebarFilter && (
                <button
                  type="button"
                  onClick={() => setSidebarFilter("")}
                  className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scrollable Navigation List Desktop */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {!sidebarCollapsed ? (
            <nav className="space-y-1.5">
              {filteredSidebarEntries.map((entry) => {
                if (entry.type === "item") {
                  const active = isLinkActive(entry.href);
                  return (
                    <Link
                      key={entry.id}
                      href={entry.href}
                      className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-bold transition ${
                        active ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/30" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      <div className={active ? "text-white" : "text-slate-400 group-hover:text-blue-600"}>
                        {getCategoryIcon(entry.id, "h-4 w-4")}
                      </div>
                      <span className="truncate flex-1">{entry.text}</span>
                    </Link>
                  );
                }

                const isGroupActive = entry.children.some((child) => {
                  if (child.type === "item") return isLinkActive(child.href);
                  return (child as any).children?.some((sub: any) => isLinkActive(sub.href));
                });
                const isGroupOpen = Boolean(sidebarFilter) || (openGroups[entry.id] ?? isGroupActive);

                return (
                  <details
                    key={entry.id}
                    open={isGroupOpen}
                    onToggle={(e) => {
                      const isOpen = e.currentTarget.open;
                      setOpenGroups((prev) => ({ ...prev, [entry.id]: isOpen }));
                    }}
                    className="group/group rounded-xl transition"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition [&::-webkit-details-marker]:hidden">
                      <div className="flex items-center gap-2.5">
                        <span className="text-slate-400 group-hover/group:text-slate-600">{getCategoryIcon(entry.id, "h-4 w-4")}</span>
                        <span>{entry.text}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-400 group-hover/group:bg-slate-200 group-hover/group:text-slate-600">
                          {entry.children.length}
                        </span>
                        <svg className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-open/group:rotate-90" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </summary>

                    <div className="mt-1 space-y-0.5 border-l-2 border-slate-200/80 pl-2 ml-4">
                      {entry.children.map((child) => {
                        if (child.type === "item") {
                          const active = isLinkActive(child.href);
                          return (
                            <Link
                              key={child.id}
                              href={child.href}
                              className={`group/link flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                                active ? "bg-blue-600 text-white font-bold shadow-xs shadow-blue-500/20" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                              }`}
                            >
                              <span className="truncate">{child.text}</span>
                              {(() => {
                                const badge = getMenuItemBadge(child.id);
                                if (!badge) return null;
                                return (
                                  <span
                                    className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-tight border ${
                                      active ? "bg-white/20 text-white border-white/30" : badge.color
                                    }`}
                                  >
                                    {badge.label}
                                  </span>
                                );
                              })()}
                            </Link>
                          );
                        }
                        return null;
                      })}
                    </div>
                  </details>
                );
              })}
            </nav>
          ) : null}
        </div>

        {/* Desktop Sidebar Footer */}
        <div className={`border-t border-slate-100 bg-slate-50/70 p-2.5 shrink-0 ${sidebarCollapsed ? "flex flex-col items-center gap-2" : "flex items-center justify-between gap-2"}`}>
          {!sidebarCollapsed ? (
            <>
              <Link
                href="/dashboard/akun"
                className="flex items-center gap-2.5 min-w-0 flex-1 rounded-xl p-1 hover:bg-slate-200/60 transition"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white shadow-xs">
                  {userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : "U"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-800">{userProfile.displayName || "User"}</p>
                  <p className="truncate text-[10px] font-medium text-slate-400">{userProfile.role}</p>
                </div>
              </Link>
              <form action={logout}>
                <button
                  type="submit"
                  title="Keluar dari akun"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 transition shadow-xs active:scale-95"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/dashboard/akun"
                title={`Akun: ${userProfile.displayName || "User"} (${userProfile.role})`}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-xs font-bold text-white shadow-xs hover:opacity-90 transition"
              >
                {userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : "U"}
              </Link>
              <form action={logout}>
                <button
                  type="submit"
                  title="Keluar dari akun"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 transition shadow-xs active:scale-95"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </form>
            </>
          )}
        </div>
      </aside>

      {/* 2. DYNAMIC MAIN LAYOUT */}
      <div className={`flex min-h-screen flex-col w-full max-w-full min-w-0 overflow-x-clip transition-[padding] duration-300 ease-in-out ${sidebarCollapsed ? "lg:pl-20" : "lg:pl-72"}`}>
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-md transition-all duration-300 shadow-xs w-full max-w-full">
          <div className="mx-auto flex h-16 w-full items-center justify-between gap-2 px-3 sm:px-6 transition-all duration-300 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 lg:hidden"
                aria-label="Buka menu"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>

              <nav className="flex items-center gap-1.5 min-w-0 text-xs font-semibold">
                <Link href="/dashboard" className="flex items-center gap-1 text-slate-400 hover:text-slate-700 transition shrink-0">
                  <span>Home</span>
                </Link>
                {currentBreadcrumb.group ? (
                  <>
                    <span className="text-slate-300">/</span>
                    <span className="text-slate-500 truncate hidden sm:inline">{currentBreadcrumb.group}</span>
                  </>
                ) : null}
                <span className="text-slate-300">/</span>
                <span className="font-extrabold text-slate-900 truncate">{currentBreadcrumb.page}</span>
              </nav>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Notification Bell with Tracking Flyout (Hanya untuk tim manajemen & operasional yang berkepentingan) */}
              {!["PEKERJA", "WARUNG"].includes(userProfile.role.toUpperCase()) ? (
                <AdminNotificationBell userRole={userProfile.role} />
              ) : null}

              {/* User Avatar */}
              <Link
                href="/dashboard/akun"
                title={`Akun: ${userProfile.displayName || "User"} (${userProfile.role})`}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white shadow-xs hover:opacity-90 transition"
              >
                {userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : "U"}
              </Link>

              {/* Desktop Header Logout Button */}
              <form action={logout} className="hidden sm:inline-block">
                <button
                  type="submit"
                  title="Keluar dari akun"
                  className="flex items-center gap-1.5 rounded-lg border border-rose-200/80 bg-rose-50/80 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition shadow-xs active:scale-95"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>Keluar</span>
                </button>
              </form>
            </div>
          </div>
        </header>

        {/* Padding Bawah Ditambah (pb-32 di mobile) agar konten & footer tidak tenggelam di balik Floating Dock */}
        <main className="w-full max-w-full min-w-0 flex-1 p-3 pb-32 sm:p-6 sm:pb-32 lg:pb-12">
          {children}
        </main>
      </div>

      {/* 3. MOBILE DRAWER ELEGAN (SATU KARTU PROFIL RINGKAS) */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity duration-300" />

          <aside className="relative flex h-full w-[85vw] max-w-sm flex-col bg-white shadow-2xl transition-transform duration-300 ease-out">
            {/* Header Profil Terpadu (Menghemat 40% Ruang Atas) */}
            <div className="border-b border-slate-100 p-4 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-sm font-black text-white shadow-md shadow-blue-500/20">
                  {userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : "KD"}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs font-black text-slate-900">{userProfile.displayName || "Kreasi Dinamika"}</p>
                    <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[9px] font-extrabold text-blue-700">
                      {userProfile.role}
                    </span>
                  </div>
                  <p className="truncate text-[10px] font-medium text-slate-400">{userProfile.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Quick Search on Mobile Drawer */}
            <div className="px-3.5 py-2 border-b border-slate-100 bg-white">
              <div className="relative">
                <input
                  type="text"
                  value={mobileFilter}
                  onChange={(e) => setMobileFilter(e.target.value)}
                  placeholder="Cari semua menu & modul..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-7 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <svg className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                {mobileFilter && (
                  <button
                    type="button"
                    onClick={() => setMobileFilter("")}
                    className="absolute right-2.5 top-2.5 h-4 w-4 rounded-full bg-slate-200 text-slate-600 text-[10px] flex items-center justify-center hover:bg-slate-300"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Navigation Area (Lega & Jelas) */}
            <div className="flex-1 overflow-y-auto px-3.5 py-3">
              {mobileMenuEntries.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-xs text-slate-400 font-medium">Tidak ada menu yang cocok</p>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileFilter("");
                    }}
                    className="mt-2 text-xs text-blue-600 font-bold hover:underline"
                  >
                    Tampilkan Semua Menu
                  </button>
                </div>
              ) : (
                <nav className="space-y-1.5">
                  {mobileMenuEntries.map((entry) => {
                    if (entry.type === "item") {
                      const active = isLinkActive(entry.href);
                      return (
                        <Link
                          key={entry.id}
                          href={entry.href}
                          onClick={() => setMobileOpen(false)}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
                            active ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30" : "text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          <div className={active ? "text-white" : "text-slate-400"}>
                            {getCategoryIcon(entry.id, "h-4 w-4")}
                          </div>
                          <span>{entry.text}</span>
                        </Link>
                      );
                    }

                    const isCategoryOpen = Boolean(mobileFilter) || activeMobileCategory === entry.id;

                    return (
                      <div
                        key={entry.id}
                        className={`rounded-xl border transition-all ${
                          isCategoryOpen ? "border-blue-200/90 bg-slate-50/60 shadow-xs" : "border-slate-200/70 bg-white"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMobileCategory((prev) => (prev === entry.id ? null : entry.id));
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 text-left text-xs font-bold transition rounded-xl ${
                            isCategoryOpen ? "text-blue-900 bg-blue-50/70" : "text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={isCategoryOpen ? "text-blue-600" : "text-slate-400"}>
                              {getCategoryIcon(entry.id, "h-4 w-4")}
                            </span>
                            <span className="truncate">{entry.text}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              {entry.children.length}
                            </span>
                            <svg
                              className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                                isCategoryOpen ? "rotate-90 text-blue-600" : ""
                              }`}
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </div>
                        </button>

                        {isCategoryOpen && (
                          <div className="space-y-0.5 p-1.5 border-t border-slate-100 bg-white rounded-b-xl">
                            {entry.children.map((child) => {
                              if (child.type === "item") {
                                const active = isLinkActive(child.href);
                                const badge = getMenuItemBadge(child.id);
                                return (
                                  <Link
                                    key={child.id}
                                    href={child.href}
                                    onClick={() => setMobileOpen(false)}
                                    className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold transition ${
                                      active
                                        ? "bg-blue-600 text-white font-bold shadow-xs shadow-blue-500/20"
                                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                                    }`}
                                  >
                                    <span className="truncate">{child.text}</span>
                                    {badge && (
                                      <span
                                        className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide border ${
                                          active ? "bg-white/20 text-white border-white/30" : badge.color
                                        }`}
                                      >
                                        {badge.label}
                                      </span>
                                    )}
                                  </Link>
                                );
                              }
                              return null;
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </nav>
              )}
            </div>

            {/* Mobile Drawer Footer Ringkas */}
            <div className="border-t border-slate-100 p-3 bg-slate-50/70 flex gap-2">
              <Link
                href="/dashboard/akun"
                onClick={() => setMobileOpen(false)}
                className="flex-1 flex items-center justify-center rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50"
              >
                👤 Akun Saya
              </Link>
              <form action={logout} className="flex-1">
                <button
                  type="submit"
                  className="w-full flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 transition"
                >
                  🚪 Keluar
                </button>
              </form>
            </div>
          </aside>
        </div>
      ) : null}

      {/* 4. FLOATING MOBILE BOTTOM NAVIGATION DOCK (UNIVERSAL SHORTCUTS) */}
      <nav className="fixed bottom-3 inset-x-3 z-40 mx-auto flex h-14 max-w-md items-center justify-around rounded-2xl border border-slate-200/90 bg-white/95 px-2 shadow-2xl backdrop-blur-xl ring-1 ring-slate-900/5 lg:hidden">
        <Link
          href="/dashboard"
          className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-bold transition ${
            pathname === "/dashboard" ? "text-blue-600 bg-blue-50/80 font-black" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>Home</span>
        </Link>

        <Link
          href="/dashboard/spk"
          className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-bold transition ${
            pathname.startsWith("/dashboard/spk") ? "text-emerald-700 bg-emerald-50/80 font-black" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
          </svg>
          <span>SPK</span>
        </Link>

        <Link
          href="/dashboard/qc"
          className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-bold transition ${
            pathname.startsWith("/dashboard/qc") ? "text-emerald-700 bg-emerald-50/80 font-black" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <span className="text-sm leading-none">🔍</span>
          <span>QC</span>
        </Link>

        <Link
          href="/dashboard/stokGudang"
          className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-bold transition ${
            pathname.startsWith("/dashboard/stokGudang") || pathname.startsWith("/dashboard/stokBarangJadi")
              ? "text-sky-700 bg-sky-50/80 font-black"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
          <span>Stok</span>
        </Link>

        <Link
          href="/dashboard/pengirimanEmbarkasi"
          className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-bold transition ${
            pathname.startsWith("/dashboard/pengirimanEmbarkasi") || pathname.startsWith("/dashboard/targetEmbarkasi")
              ? "text-purple-700 bg-purple-50/80 font-black"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <span className="text-sm leading-none">🚚</span>
          <span>Kirim</span>
        </Link>

        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-bold text-slate-600 hover:text-slate-900 transition"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
          <span>Semua</span>
        </button>
      </nav>
    </div>
  );
}
