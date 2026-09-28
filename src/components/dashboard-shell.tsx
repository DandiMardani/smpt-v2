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
import type { MenuEntry, MenuGroupChild, MenuLeaf } from "@/lib/access/menu";

type UserProfile = {
  displayName: string;
  email: string;
  role: string;
};

type Props = {
  children: ReactNode;
  menuEntries: MenuEntry[];
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

function getCategoryIcon(groupId: string, className = "h-5 w-5") {
  switch (groupId) {
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
    case "manajemenPekerja":
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
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
        </svg>
      );
    case "payrollGroup":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect width="20" height="14" x="2" y="5" rx="2" />
          <line x1="2" x2="22" y1="10" y2="10" />
        </svg>
      );
    case "keamananAkses":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case "keuanganLaporan":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
          <path d="M12 18V6" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
  }
}

export function DashboardShell({
  children,
  menuEntries,
  hajiEntries,
  regulerEntries,
  gudangEntries,
  sdmEntries,
  badgeCounts,
  userProfile,
  pendingGudangCount = 0,
}: Props) {
  const pathname = usePathname();

  const [workspace, setWorkspace] = useState<"REGULER" | "HAJI" | "GUDANG" | "SDM">("REGULER");
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [contentWide, setContentWide] = useState<boolean>(true);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState<boolean>(false);
  const [sidebarFilter, setSidebarFilter] = useState<string>("");
  const [mobileFilter, setMobileFilter] = useState<string>("");
  const [activeFlyoutGroup, setActiveFlyoutGroup] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [mobileOpenGroups, setMobileOpenGroups] = useState<Record<string, boolean>>({});

  const userDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const flyoutTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    try {
      const savedWorkspace = localStorage.getItem("smpt_workspace");
      if (
        savedWorkspace === "HAJI" ||
        savedWorkspace === "REGULER" ||
        savedWorkspace === "GUDANG" ||
        savedWorkspace === "SDM"
      ) {
        setWorkspace(savedWorkspace);
        document.cookie = `smpt_workspace=${savedWorkspace}; path=/; max-age=31536000; SameSite=Lax`;
      } else {
        document.cookie = `smpt_workspace=REGULER; path=/; max-age=31536000; SameSite=Lax`;
      }
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

  const handleWorkspaceChange = useCallback((mode: "REGULER" | "HAJI" | "GUDANG" | "SDM") => {
    setWorkspace(mode);
    try {
      localStorage.setItem("smpt_workspace", mode);
      document.cookie = `smpt_workspace=${mode}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}
  }, []);

  const isLinkActive = useCallback((href: string) => {
    const [hrefPath] = href.split("?");
    return pathname === hrefPath;
  }, [pathname]);

  const getNextWorkspace = useCallback(
    (current: "REGULER" | "HAJI" | "GUDANG" | "SDM"): "REGULER" | "HAJI" | "GUDANG" | "SDM" => {
      if (current === "REGULER") return "HAJI";
      if (current === "HAJI") return "GUDANG";
      if (current === "GUDANG") return "SDM";
      return "REGULER";
    },
    []
  );

  const effectiveMenuEntries: MenuEntry[] = useMemo(() => {
    if (workspace === "REGULER" && regulerEntries && regulerEntries.length > 0) return regulerEntries;
    if (workspace === "HAJI" && hajiEntries && hajiEntries.length > 0) return hajiEntries;
    if (workspace === "GUDANG" && gudangEntries && gudangEntries.length > 0) return gudangEntries;
    if (workspace === "SDM" && sdmEntries && sdmEntries.length > 0) return sdmEntries;
    return menuEntries;
  }, [workspace, regulerEntries, hajiEntries, gudangEntries, sdmEntries, menuEntries]);

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
    setMobileFilter("");
  }, [pathname]);

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

  const filteredMobileEntries = useMemo(() => {
    const q = mobileFilter.trim().toLowerCase();
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
  }, [mobileFilter, effectiveMenuEntries]);

  return (
    <div className="min-h-screen bg-slate-50/80 text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* 1. DESKTOP SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200/80 bg-white transition-[width] duration-300 ease-in-out lg:flex shadow-xs ${
          sidebarCollapsed ? "w-20" : "w-72"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-4">
          <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-700 text-sm font-black text-white shadow-md shadow-blue-500/25">
              KD
            </div>
            {!sidebarCollapsed ? (
              <div className="min-w-0 transition-opacity duration-200">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-black tracking-tight text-slate-900">Kreasi Dinamika</span>
                  <span className="rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white shadow-xs">
                    V2 PRO
                  </span>
                </div>
                <p className="truncate text-[11px] font-semibold text-slate-400">Sistem Manufaktur Terpadu</p>
              </div>
            ) : null}
          </Link>

          <button
            type="button"
            onClick={handleToggleSidebar}
            title={sidebarCollapsed ? "Perlebar Sidebar (Ctrl+B)" : "Ciutkan Sidebar (Ctrl+B)"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 transition active:scale-95"
          >
            <svg
              className={`h-4 w-4 transition-transform duration-300 ${sidebarCollapsed ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>

        {/* Desktop Mode Switcher */}
        {!sidebarCollapsed ? (
          <div className="border-b border-slate-100 bg-slate-50/70 p-2">
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-200/70 p-1 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => handleWorkspaceChange("REGULER")}
                className={`flex flex-col items-center justify-center py-1.5 rounded-lg transition-all ${
                  workspace === "REGULER" ? "bg-indigo-600 text-white shadow-xs font-extrabold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>🎒</span>
                <span>Reguler</span>
              </button>
              <button
                type="button"
                onClick={() => handleWorkspaceChange("HAJI")}
                className={`flex flex-col items-center justify-center py-1.5 rounded-lg transition-all ${
                  workspace === "HAJI" ? "bg-emerald-600 text-white shadow-xs font-extrabold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>🕋</span>
                <span>Haji</span>
              </button>
              <button
                type="button"
                onClick={() => handleWorkspaceChange("GUDANG")}
                className={`flex flex-col items-center justify-center py-1.5 rounded-lg transition-all ${
                  workspace === "GUDANG" ? "bg-sky-600 text-white shadow-xs font-extrabold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>📦</span>
                <span>Gudang</span>
              </button>
              <button
                type="button"
                onClick={() => handleWorkspaceChange("SDM")}
                className={`flex flex-col items-center justify-center py-1.5 rounded-lg transition-all ${
                  workspace === "SDM" ? "bg-amber-600 text-white shadow-xs font-extrabold" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span>👥</span>
                <span>SDM</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center border-b border-slate-100 py-2">
            <button
              type="button"
              onClick={() => handleWorkspaceChange(getNextWorkspace(workspace))}
              title={`Beralih mode (${workspace})`}
              className={`flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-bold shadow-xs transition ${
                workspace === "REGULER"
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : workspace === "HAJI"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : workspace === "GUDANG"
                  ? "border-sky-200 bg-sky-50 text-sky-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {workspace === "REGULER" ? "🎒" : workspace === "HAJI" ? "🕋" : workspace === "GUDANG" ? "📦" : "👥"}
            </button>
          </div>
        )}

        {/* Desktop Search Filter */}
        {!sidebarCollapsed ? (
          <div className="px-3.5 pt-3 pb-1">
            <div className="relative">
              <input
                type="text"
                value={sidebarFilter}
                onChange={(e) => setSidebarFilter(e.target.value)}
                placeholder="Cari menu... (Ctrl+K)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-1.5 pl-8 pr-8 text-xs text-slate-800 placeholder-slate-400 transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              <svg className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {sidebarFilter ? (
                <button type="button" onClick={() => setSidebarFilter("")} className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600">✕</button>
              ) : (
                <kbd className="absolute right-2 top-2 rounded border border-slate-200 bg-white px-1 text-[9px] font-bold text-slate-400">⌘K</kbd>
              )}
            </div>
          </div>
        ) : null}

        {/* Desktop Menu Tree */}
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
                      {badgeCounts[entry.id] ? (
                        <span className="rounded-full bg-amber-400 px-1.5 py-0.2 text-[10px] font-extrabold text-amber-950">
                          {badgeCounts[entry.id]}
                        </span>
                      ) : null}
                    </Link>
                  );
                }

                return (
                  <details
                    key={entry.id}
                    open={Boolean(sidebarFilter) || (openGroups[entry.id] ?? true)}
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
                      <svg className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-open/group:rotate-90" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                      </svg>
                    </summary>

                    <div className="mt-1 space-y-0.5 border-l-2 border-slate-200/80 pl-2 ml-4">
                      {entry.children.map((child) => {
                        if (child.type === "item") {
                          const active = isLinkActive(child.href);
                          const count = badgeCounts[child.id] ?? 0;
                          return (
                            <Link
                              key={child.id}
                              href={child.href}
                              className={`group/link flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                                active ? "bg-blue-600 text-white font-bold shadow-xs shadow-blue-500/20" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                              }`}
                            >
                              <span className="truncate">{child.text}</span>
                              {count > 0 ? (
                                <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${active ? "bg-white text-blue-700" : "bg-amber-100 text-amber-900 border border-amber-300"}`}>
                                  {count}
                                </span>
                              ) : null}
                            </Link>
                          );
                        }

                        const subActive = child.children.some((sub) => sub.href === pathname);
                        return (
                          <details key={child.id} open={subActive || Boolean(sidebarFilter) || undefined} className="group/sub">
                            <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-100 hover:text-slate-700 [&::-webkit-details-marker]:hidden">
                              <span>{child.text}</span>
                              <svg className="h-3 w-3 text-slate-400 transition-transform duration-200 group-open/sub:rotate-90" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                              </svg>
                            </summary>
                            <div className="mt-0.5 space-y-0.5 pl-2">
                              {child.children.map((subItem) => {
                                const active = isLinkActive(subItem.href);
                                const count = badgeCounts[subItem.id] ?? 0;
                                return (
                                  <Link
                                    key={subItem.id}
                                    href={subItem.href}
                                    className={`group/sublink flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs font-medium transition ${
                                      active ? "bg-blue-600 text-white font-bold shadow-xs shadow-blue-500/20" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                    }`}
                                  >
                                    <span className="truncate">{subItem.text}</span>
                                    {count > 0 ? (
                                      <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${active ? "bg-white text-blue-700" : "bg-amber-100 text-amber-900 border border-amber-300"}`}>
                                        {count}
                                      </span>
                                    ) : null}
                                  </Link>
                                );
                              })}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </nav>
          ) : (
            <nav className="flex flex-col items-center space-y-2">
              {effectiveMenuEntries.map((entry) => {
                if (entry.type === "item") {
                  const active = isLinkActive(entry.href);
                  return (
                    <Link
                      key={entry.id}
                      href={entry.href}
                      title={entry.text}
                      className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition ${
                        active ? "bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      {getCategoryIcon(entry.id, "h-5 w-5")}
                      {badgeCounts[entry.id] ? (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white shadow-xs">
                          {badgeCounts[entry.id]}
                        </span>
                      ) : null}
                    </Link>
                  );
                }

                const hasActive = entry.children.some((child) =>
                  child.type === "item" ? isLinkActive(child.href) : child.children.some((sub) => isLinkActive(sub.href))
                );
                const isFlyoutOpen = activeFlyoutGroup === entry.id;

                const flatGroupLinks: { id: string; text: string; href: string }[] = [];
                for (const child of entry.children) {
                  if (child.type === "item") {
                    flatGroupLinks.push(child);
                  } else {
                    for (const sub of child.children) flatGroupLinks.push(sub);
                  }
                }

                return (
                  <div
                    key={entry.id}
                    className="relative"
                    onMouseEnter={() => {
                      if (flyoutTimeoutRef.current) clearTimeout(flyoutTimeoutRef.current);
                      setActiveFlyoutGroup(entry.id);
                    }}
                    onMouseLeave={() => {
                      flyoutTimeoutRef.current = setTimeout(() => setActiveFlyoutGroup(null), 200);
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveFlyoutGroup(isFlyoutOpen ? null : entry.id)}
                      title={entry.text}
                      className={`relative flex h-11 w-11 items-center justify-center rounded-xl transition ${
                        hasActive ? "bg-blue-100 text-blue-700 font-bold border border-blue-200" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      {getCategoryIcon(entry.id, "h-5 w-5")}
                    </button>

                    {isFlyoutOpen ? (
                      <div className="absolute left-full top-0 z-50 ml-2 w-64 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xl animate-in fade-in zoom-in-95 duration-150">
                        <div className="mb-2 border-b border-slate-100 pb-2">
                          <p className="text-xs font-black uppercase tracking-wider text-slate-800">{entry.text}</p>
                          <p className="text-[10px] text-slate-400">Pilih modul navigasi</p>
                        </div>
                        <div className="max-h-80 overflow-y-auto space-y-1">
                          {flatGroupLinks.map((link) => {
                            const isItemActive = isLinkActive(link.href);
                            const count = badgeCounts[link.id] ?? 0;
                            return (
                              <Link
                                key={link.id}
                                href={link.href}
                                onClick={() => setActiveFlyoutGroup(null)}
                                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                                  isItemActive ? "bg-blue-600 text-white font-bold" : "text-slate-700 hover:bg-slate-100"
                                }`}
                              >
                                <span className="truncate">{link.text}</span>
                                {count > 0 ? (
                                  <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${isItemActive ? "bg-white text-blue-700" : "bg-amber-100 text-amber-900 border border-amber-300"}`}>
                                    {count}
                                  </span>
                                ) : null}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>
          )}
        </div>

        {/* Desktop User Footer */}
        <div className="border-t border-slate-100 p-3">
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 p-2 border border-slate-100">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-xs font-bold text-white shadow-xs">
                {userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-800">{userProfile.displayName || userProfile.email}</p>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="truncate text-[10px] font-semibold text-blue-600">{userProfile.role}</p>
                </div>
              </div>
              <Link href="/dashboard/akun" title="Pengaturan Akun" className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700">
                ⚙️
              </Link>
            </div>
          ) : (
            <div className="flex justify-center">
              <Link href="/dashboard/akun" title={`${userProfile.displayName || userProfile.email} (${userProfile.role})`} className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-xs font-bold text-white shadow-xs">
                {userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : "U"}
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* 2. MAIN LAYOUT */}
      <div className={`flex min-h-screen flex-col w-full max-w-full min-w-0 overflow-x-clip transition-[padding] duration-300 ease-in-out ${sidebarCollapsed ? "lg:pl-20" : "lg:pl-72"}`}>
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-md transition-all duration-300 shadow-xs w-full max-w-full">
          <div className={`mx-auto flex h-16 w-full items-center justify-between gap-2 px-3 sm:px-6 transition-all duration-300 min-w-0 ${contentWide ? "max-w-none" : "max-w-7xl"}`}>
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

              <button
                type="button"
                onClick={handleToggleSidebar}
                title={sidebarCollapsed ? "Perlebar Sidebar (Ctrl+B)" : "Ciutkan Sidebar (Ctrl+B)"}
                className="hidden lg:flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 transition active:scale-95"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                  <path d={sidebarCollapsed ? "m14 9 3 3-3 3" : "m17 9-3 3 3 3"} />
                </svg>
              </button>

              <nav className="flex items-center gap-1.5 min-w-0 text-xs font-semibold">
                <Link href="/dashboard" className="flex items-center gap-1 text-slate-400 hover:text-slate-700 transition shrink-0">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  <span className="hidden sm:inline">Home</span>
                </Link>

                {currentBreadcrumb.group ? (
                  <>
                    <span className="text-slate-300 hidden md:inline">/</span>
                    <span className="text-slate-500 truncate hidden md:inline">{currentBreadcrumb.group}</span>
                  </>
                ) : null}

                <span className="text-slate-300">/</span>
                <span className="font-extrabold text-slate-900 truncate">{currentBreadcrumb.page}</span>
              </nav>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleWorkspaceChange(getNextWorkspace(workspace))}
                title={`Beralih mode: ${workspace}`}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-extrabold transition shadow-xs hover:shadow-md active:scale-95 ${
                  workspace === "REGULER"
                    ? "border-indigo-200 bg-indigo-50/90 text-indigo-700 hover:bg-indigo-100"
                    : workspace === "HAJI"
                    ? "border-emerald-200 bg-emerald-50/90 text-emerald-700 hover:bg-emerald-100"
                    : workspace === "GUDANG"
                    ? "border-sky-200 bg-sky-50/90 text-sky-700 hover:bg-sky-100"
                    : "border-amber-200 bg-amber-50/90 text-amber-700 hover:bg-amber-100"
                }`}
              >
                <span className="text-sm">
                  {workspace === "REGULER" ? "🎒" : workspace === "HAJI" ? "🕋" : workspace === "GUDANG" ? "📦" : "👥"}
                </span>
                <span className="hidden sm:inline">
                  {workspace === "REGULER"
                    ? "Proyek Reguler"
                    : workspace === "HAJI"
                    ? "Proyek Haji"
                    : workspace === "GUDANG"
                    ? "Gudang & Logistik"
                    : "SDM & Payroll"}
                </span>
                <span className="text-[10px] opacity-60">⇄</span>
              </button>

              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="hidden sm:flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-500 shadow-xs hover:border-slate-300 hover:bg-white hover:text-slate-800 transition"
              >
                <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span className="hidden md:inline">Cari modul...</span>
                <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-400">Ctrl+K</kbd>
              </button>

              <button
                type="button"
                onClick={handleToggleWide}
                title={contentWide ? "Tampilan Terpusat" : "Tampilan Lebar Penuh"}
                className={`hidden md:flex h-9 w-9 items-center justify-center rounded-xl border shadow-xs transition active:scale-95 ${
                  contentWide ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {contentWide ? (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                onClick={handleToggleFullscreen}
                title="Layar Penuh"
                className="hidden lg:flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs hover:border-slate-300 hover:bg-slate-50 transition active:scale-95"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                  <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                  <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                  <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
              </button>

              {pendingGudangCount > 0 ? (
                <Link
                  href="/dashboard/barangKeluarGudang"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900 shadow-xs hover:bg-amber-100 transition"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  <span className="hidden sm:inline">Gudang</span>
                  <span className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{pendingGudangCount}</span>
                </Link>
              ) : null}

              {/* User Dropdown */}
              <div className="relative" ref={userDropdownRef}>
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white p-1 pr-2.5 shadow-xs hover:border-slate-300 transition"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-xs font-black text-white shadow-xs">
                    {userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : "U"}
                  </div>
                  <div className="text-left hidden sm:block">
                    <p className="truncate text-xs font-bold text-slate-800 max-w-[120px]">
                      {userProfile.displayName || userProfile.email.split("@")[0]}
                    </p>
                  </div>
                  <svg className="h-3 w-3 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </button>

                {userDropdownOpen ? (
                  <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl z-50">
                    <div className="border-b border-slate-100 p-3">
                      <p className="text-xs font-bold text-slate-900 truncate">{userProfile.displayName || "Pengguna"}</p>
                      <p className="text-[11px] text-slate-500 truncate">{userProfile.email}</p>
                      <span className="mt-1.5 inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200/60">
                        Role: {userProfile.role}
                      </span>
                    </div>
                    <div className="p-1 space-y-1">
                      <Link href="/dashboard/akun" onClick={() => setUserDropdownOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        👤 Profil & Akun Saya
                      </Link>
                      <button type="button" onClick={() => { setUserDropdownOpen(false); handleToggleWide(); }} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        <span>📐 Mode Lebar Penuh</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${contentWide ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                          {contentWide ? "AKTIF" : "STANDAR"}
                        </span>
                      </button>
                    </div>
                    <div className="border-t border-slate-100 p-1">
                      <form action={logout}>
                        <button type="submit" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 transition">
                          🚪 Keluar Sistem
                        </button>
                      </form>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <main className={`w-full max-w-full min-w-0 flex-1 p-3 pb-24 sm:p-6 sm:pb-24 lg:pb-12 transition-all duration-300 ${contentWide ? "max-w-none px-3 sm:px-6 lg:px-8" : "mx-auto max-w-7xl px-3 sm:px-6 lg:px-8"}`}>
          {children}
        </main>

        <footer className="border-t border-slate-200/70 bg-white/50 py-4 text-center text-xs font-medium text-slate-400">
          Kreasi Dinamika Maju Bersama © 2026 · Sistem Manajemen Produksi Terpadu (SMPT V2)
        </footer>
      </div>

      {/* 3. COMMAND PALETTE MODAL (CTRL+K) */}
      {searchOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 pt-16 sm:pt-20">
          <div onClick={() => setSearchOpen(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" />
          <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5">
              <svg className="h-5 w-5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ketik untuk mencari menu atau modul (cth: SPK, Titipan)..."
                className="w-full text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
              />
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 shrink-0">ESC</kbd>
            </div>
            <div className="max-h-96 overflow-y-auto p-2 space-y-1">
              {searchResults.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">Tidak ditemukan menu dengan kata kunci &quot;{searchQuery}&quot;</div>
              ) : (
                searchResults.map((item, idx) => {
                  const isSelected = idx === selectedSearchIndex;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setSearchOpen(false)}
                      className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-xs transition ${
                        isSelected ? "bg-blue-600 text-white font-bold shadow-xs" : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={isSelected ? "text-white" : "text-slate-400"}>{getCategoryIcon(item.id, "h-4 w-4")}</span>
                        <span className="truncate">{item.title}</span>
                      </div>
                      <span className={`text-[10px] font-semibold truncate ${isSelected ? "text-blue-100" : "text-slate-400"}`}>
                        {item.groupTitle} {item.subgroupTitle ? `› ${item.subgroupTitle}` : ""}
                      </span>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ========================================================================= */}
      {/* 4. SEAMLESS MOBILE DRAWER (HEADER & PENCARIAN DILEBUR JADI SATU)          */}
      {/* ========================================================================= */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity duration-300" />

          <aside className="relative flex h-full w-[85vw] max-w-sm flex-col bg-white shadow-2xl transition-transform duration-300 ease-out">
            {/* 1 BLOK HEADER MENYATU: Profil + Dropdown Mode + Tutup + Input Search */}
            <div className="border-b border-slate-100 bg-slate-50/90 p-3 space-y-2.5">
              {/* Baris 1: Profil User + Mode Capsule + Tombol Close */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-xs font-black text-white shadow-xs">
                    {userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : "U"}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-extrabold text-slate-900 leading-tight">
                      {userProfile.displayName || userProfile.email.split("@")[0]}
                    </p>
                    <span className="text-[10px] font-bold text-blue-600 uppercase">
                      {userProfile.role}
                    </span>
                  </div>
                </div>

                {/* Pemilih Mode Ramping (Dropdown Langsung) */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <select
                    value={workspace}
                    onChange={(e) => handleWorkspaceChange(e.target.value as "REGULER" | "HAJI" | "GUDANG" | "SDM")}
                    className={`text-[11px] font-extrabold rounded-lg px-2 py-1 border shadow-xs focus:outline-none cursor-pointer transition ${
                      workspace === "REGULER"
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : workspace === "HAJI"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : workspace === "GUDANG"
                        ? "border-sky-200 bg-sky-50 text-sky-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    <option value="REGULER">🎒 Reguler</option>
                    <option value="HAJI">🕋 Haji</option>
                    <option value="GUDANG">📦 Gudang</option>
                    <option value="SDM">👥 SDM</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 active:scale-95 transition"
                    aria-label="Tutup menu"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Baris 2: Input Pencarian Menyatu */}
              <div className="relative">
                <input
                  type="text"
                  value={mobileFilter}
                  onChange={(e) => setMobileFilter(e.target.value)}
                  placeholder="🔍 Ketik menu (spk, qc, barang)..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none shadow-2xs"
                />
                {mobileFilter && (
                  <button
                    type="button"
                    onClick={() => setMobileFilter("")}
                    className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* DAFTAR MENU (ACCORDION RAPI) */}
            <div className="flex-1 overflow-y-auto px-3.5 py-2.5">
              {filteredMobileEntries.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Tidak ada menu yang sesuai dengan &quot;{mobileFilter}&quot;
                </div>
              ) : (
                <nav className="space-y-1">
                  {filteredMobileEntries.map((entry) => {
                    if (entry.type === "item") {
                      const active = isLinkActive(entry.href);
                      return (
                        <Link
                          key={entry.id}
                          href={entry.href}
                          onClick={() => setMobileOpen(false)}
                          className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-bold transition ${
                            active ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {getCategoryIcon(entry.id, "h-4 w-4")}
                          <span>{entry.text}</span>
                        </Link>
                      );
                    }

                    const hasActiveChild = entry.children.some((child) =>
                      child.type === "item" ? isLinkActive(child.href) : child.children.some((sub) => isLinkActive(sub.href))
                    );
                    const isGroupOpen = Boolean(mobileFilter) || (mobileOpenGroups[entry.id] ?? hasActiveChild);

                    return (
                      <details
                        key={entry.id}
                        open={isGroupOpen}
                        onToggle={(e) => {
                          const isOpen = e.currentTarget.open;
                          setMobileOpenGroups((prev) => ({ ...prev, [entry.id]: isOpen }));
                        }}
                        className="group rounded-xl transition"
                      >
                        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition [&::-webkit-details-marker]:hidden">
                          <div className="flex items-center gap-2">
                            <span>{getCategoryIcon(entry.id, "h-3.5 w-3.5")}</span>
                            <span>{entry.text}</span>
                          </div>
                          <svg className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-open:rotate-90" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                          </svg>
                        </summary>

                        <div className="mt-0.5 space-y-0.5 border-l-2 border-slate-200/80 pl-2 ml-3">
                          {entry.children.map((child) => {
                            if (child.type === "item") {
                              const active = isLinkActive(child.href);
                              return (
                                <Link
                                  key={child.id}
                                  href={child.href}
                                  onClick={() => setMobileOpen(false)}
                                  className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                                    active ? "bg-blue-600 text-white font-bold shadow-xs" : "text-slate-600 hover:bg-slate-100"
                                  }`}
                                >
                                  <span>{child.text}</span>
                                  {badgeCounts[child.id] ? (
                                    <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${active ? "bg-white text-blue-700" : "bg-amber-100 text-amber-900 border border-amber-300"}`}>
                                      {badgeCounts[child.id]}
                                    </span>
                                  ) : null}
                                </Link>
                              );
                            }

                            const subActive = child.children.some((sub) => isLinkActive(sub.href));
                            return (
                              <details key={child.id} open={Boolean(mobileFilter) || subActive || undefined} className="group/sub">
                                <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
                                  <span>{child.text}</span>
                                  <svg className="h-3 w-3 text-slate-400 transition-transform duration-200 group-open/sub:rotate-90" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                                  </svg>
                                </summary>
                                <div className="mt-0.5 space-y-0.5 pl-2">
                                  {child.children.map((sub) => (
                                    <Link
                                      key={sub.id}
                                      href={sub.href}
                                      onClick={() => setMobileOpen(false)}
                                      className={`flex items-center justify-between rounded-lg px-2 py-1 text-xs transition ${
                                        isLinkActive(sub.href) ? "bg-blue-600 text-white font-bold" : "text-slate-600 hover:bg-slate-100"
                                      }`}
                                    >
                                      <span>{sub.text}</span>
                                    </Link>
                                  ))}
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </details>
                    );
                  })}
                </nav>
              )}
            </div>

            {/* Footer Mobile */}
            <div className="border-t border-slate-100 p-2.5 bg-slate-50/70 flex items-center gap-2">
              <Link
                href="/dashboard/akun"
                onClick={() => setMobileOpen(false)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
              >
                ⚙️ Akun Saya
              </Link>
              <form action={logout} className="shrink-0">
                <button
                  type="submit"
                  title="Keluar Akun"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition"
                >
                  🚪
                </button>
              </form>
            </div>
          </aside>
        </div>
      ) : null}

      {/* 5. FLOATING MOBILE BOTTOM NAVIGATION DOCK */}
      <nav className="fixed bottom-3 inset-x-3 z-40 mx-auto flex h-14 max-w-sm items-center justify-around rounded-2xl border border-slate-200/90 bg-white/92 px-2 shadow-2xl backdrop-blur-xl ring-1 ring-slate-900/5 lg:hidden">
        <Link
          href="/dashboard"
          className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 py-1 text-[10px] font-bold transition ${
            pathname === "/dashboard" ? "text-blue-600 bg-blue-50/80" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>Home</span>
        </Link>

        {workspace === "HAJI" && (
          <>
            <Link
              href="/dashboard/spk"
              className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 py-1 text-[10px] font-bold transition ${
                pathname.startsWith("/dashboard/spk") ? "text-emerald-700 bg-emerald-50/80" : "text-slate-500 hover:text-slate-900"
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
                pathname.startsWith("/dashboard/qc") ? "text-emerald-700 bg-emerald-50/80" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <span className="text-sm leading-none">🔍</span>
              <span>QC</span>
            </Link>
          </>
        )}

        {workspace === "REGULER" && (
          <>
            <Link
              href="/dashboard/produksiReguler"
              className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-bold transition ${
                pathname.startsWith("/dashboard/produksiReguler") ? "text-indigo-700 bg-indigo-50/80" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <span className="text-sm leading-none">⚡</span>
              <span>Setoran</span>
            </Link>
            <Link
              href="/dashboard/qc"
              className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-bold transition ${
                pathname.startsWith("/dashboard/qc") ? "text-emerald-700 bg-emerald-50/80" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <span className="text-sm leading-none">🔍</span>
              <span>QC</span>
            </Link>
          </>
        )}

        {workspace === "GUDANG" && (
          <Link
            href="/dashboard/barangMasukGudang"
            className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 py-1 text-[10px] font-bold transition ${
              pathname.includes("barangMasukGudang") ? "text-sky-700 bg-sky-50/80" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            <span>Masuk</span>
          </Link>
        )}

        {workspace === "SDM" && (
          <Link
            href="/dashboard/payroll"
            className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 py-1 text-[10px] font-bold transition ${
              pathname.startsWith("/dashboard/payroll") ? "text-amber-700 bg-amber-50/80" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect width="18" height="12" x="3" y="6" rx="2" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>Payroll</span>
          </Link>
        )}

        <button
          type="button"
          onClick={() => handleWorkspaceChange(getNextWorkspace(workspace))}
          title="Beralih Ruang Kerja"
          className="flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-extrabold text-slate-700 active:scale-95 transition"
        >
          <span className="text-sm leading-none">
            {workspace === "REGULER" ? "🎒" : workspace === "HAJI" ? "🕋" : workspace === "GUDANG" ? "📦" : "👥"}
          </span>
          <span className="text-[9px] font-black uppercase tracking-tight text-blue-600">
            {workspace === "REGULER" ? "Reg" : workspace === "HAJI" ? "Haji" : workspace === "GUDANG" ? "Gdg" : "SDM"} ⇄
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 rounded-xl px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:text-slate-900 transition"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
          <span>Menu</span>
        </button>
      </nav>
    </div>
  );
}
