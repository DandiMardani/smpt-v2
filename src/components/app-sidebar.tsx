"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import type {
  MenuEntry,
  MenuGroupChild,
  MenuLeaf,
} from "@/lib/access/menu";

type AppSidebarProps = {
  entries: MenuEntry[];
  badgeCounts?: Record<string, number>;
  userProfile?: {
    displayName: string;
    email: string;
    role: string;
  };
};

function itemIsActive(item: MenuLeaf, pathname: string): boolean {
  return pathname === item.href;
}

function childContainsActive(
  child: MenuGroupChild,
  pathname: string,
): boolean {
  if (child.type === "item") {
    return itemIsActive(child, pathname);
  }
  return child.children.some((item) => itemIsActive(item, pathname));
}

function entryContainsActive(entry: MenuEntry, pathname: string): boolean {
  if (entry.type === "item") {
    return itemIsActive(entry, pathname);
  }
  return entry.children.some((child) => childContainsActive(child, pathname));
}

function MenuLink({
  item,
  pathname,
  nested = false,
  onNavigate,
  badgeCount = 0,
}: {
  item: MenuLeaf;
  pathname: string;
  nested?: boolean;
  onNavigate?: () => void;
  badgeCount?: number;
}) {
  const active = itemIsActive(item, pathname);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`group flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150 ${
        nested ? "ml-2.5" : ""
      } ${
        active
          ? "bg-blue-600 text-white shadow-sm shadow-blue-500/25"
          : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 active:bg-slate-200/70"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full transition-transform ${
          active
            ? "bg-white scale-125"
            : "bg-slate-300 group-hover:bg-blue-500 group-hover:scale-125"
        }`}
      />
      <span className="min-w-0 flex-1 truncate">{item.text}</span>
      {badgeCount > 0 ? (
        <span
          className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
            active
              ? "bg-white text-blue-700"
              : "bg-amber-100 text-amber-800 border border-amber-300"
          }`}
          title={`${badgeCount} item menunggu`}
        >
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      ) : null}
    </Link>
  );
}

function MenuTree({
  entries,
  pathname,
  onNavigate,
  badgeCounts,
  isSearching,
}: {
  entries: MenuEntry[];
  pathname: string;
  onNavigate?: () => void;
  badgeCounts: Record<string, number>;
  isSearching: boolean;
}) {
  return (
    <nav className="space-y-1">
      {entries.map((entry) => {
        if (entry.type === "item") {
          return (
            <MenuLink
              key={entry.id}
              item={entry}
              pathname={pathname}
              onNavigate={onNavigate}
              badgeCount={badgeCounts[entry.id] ?? 0}
            />
          );
        }

        const groupActive = entryContainsActive(entry, pathname);
        // Jika sedang mencari kata kunci, accordion otomatis terbuka
        const shouldOpen = isSearching || groupActive;

        return (
          <details
            key={entry.id}
            className="group rounded-xl transition"
            open={shouldOpen || undefined}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 [&::-webkit-details-marker]:hidden">
              <span className="truncate">{entry.text}</span>
              <svg
                className="h-3 w-3 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-90"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                  clipRule="evenodd"
                />
              </svg>
            </summary>

            <div className="mt-0.5 space-y-0.5 border-l-2 border-slate-200/80 pl-2">
              {entry.children.map((child) => {
                if (child.type === "item") {
                  return (
                    <MenuLink
                      key={child.id}
                      item={child}
                      pathname={pathname}
                      nested
                      onNavigate={onNavigate}
                      badgeCount={badgeCounts[child.id] ?? 0}
                    />
                  );
                }

                const subgroupActive = childContainsActive(child, pathname);
                const subShouldOpen = isSearching || subgroupActive;

                return (
                  <details
                    key={child.id}
                    className="group/sub"
                    open={subShouldOpen || undefined}
                  >
                    <summary className="ml-2 flex cursor-pointer list-none items-center justify-between rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 hover:bg-slate-100 hover:text-slate-600 [&::-webkit-details-marker]:hidden">
                      <span className="truncate">{child.text}</span>
                      <svg
                        className="h-2.5 w-2.5 shrink-0 text-slate-400 transition-transform duration-200 group-open/sub:rotate-90"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </summary>

                    <div className="mt-0.5 space-y-0.5">
                      {child.children.map((item) => (
                        <MenuLink
                          key={item.id}
                          item={item}
                          pathname={pathname}
                          nested
                          onNavigate={onNavigate}
                          badgeCount={badgeCounts[item.id] ?? 0}
                        />
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
  );
}

export function AppSidebar({
  entries,
  badgeCounts = {},
  userProfile,
}: AppSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Tutup drawer saat rute berpindah
  useEffect(() => {
    setMobileOpen(false);
    setSearchQuery("");
  }, [pathname]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Filter pencarian menu dinamis
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;

    const filterChild = (child: MenuGroupChild): MenuGroupChild | null => {
      if (child.type === "item") {
        return child.text.toLowerCase().includes(q) ? child : null;
      }
      const matched = child.children.filter((item) =>
        item.text.toLowerCase().includes(q)
      );
      if (matched.length > 0) {
        return { ...child, children: matched };
      }
      return null;
    };

    return entries
      .map((entry) => {
        if (entry.type === "item") {
          return entry.text.toLowerCase().includes(q) ? entry : null;
        }
        const matchedChildren = entry.children
          .map(filterChild)
          .filter((c): c is MenuGroupChild => c !== null);

        if (matchedChildren.length > 0) {
          return { ...entry, children: matchedChildren };
        }
        return null;
      })
      .filter((e): e is MenuEntry => e !== null);
  }, [entries, searchQuery]);

  return (
    <>
      {/* DESKTOP SIDEBAR */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-slate-200/80 bg-white shadow-[1px_0_10px_rgba(0,0,0,0.02)] lg:flex">
        {/* Brand Header */}
        <div className="border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-xs font-black text-white shadow-xs">
              KD
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-extrabold text-slate-900">
                Kreasi Dinamika
              </p>
              <p className="truncate text-[10px] font-semibold text-blue-600">
                SMPT V2 Desktop
              </p>
            </div>
          </div>

          {/* Kotak Pencarian Desktop */}
          <div className="mt-3 relative">
            <input
              type="text"
              placeholder="Cari menu kerja..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-blue-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-2 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-3.5 py-3">
          {filteredEntries.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              Menu tidak ditemukan.
            </div>
          ) : (
            <MenuTree
              entries={filteredEntries}
              pathname={pathname}
              badgeCounts={badgeCounts}
              isSearching={Boolean(searchQuery.trim())}
            />
          )}
        </div>

        {/* User footer on desktop */}
        {userProfile ? (
          <div className="border-t border-slate-100 p-3">
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-2 border border-slate-100">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-xs font-bold text-blue-700">
                {userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-800">
                  {userProfile.displayName || userProfile.email}
                </p>
                <p className="truncate text-[10px] font-semibold text-blue-600">
                  {userProfile.role}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </aside>

      <div id="mobileSidebarControls" className="hidden" data-open={mobileOpen ? "1" : "0"} />

      {/* MOBILE DRAWER */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity duration-300"
          />

          <aside className="relative flex h-full w-[85vw] max-w-sm flex-col bg-white shadow-2xl transition-transform duration-300 ease-out">
            {/* Header Mobile Ramping: Brand + User Info + Tombol Close */}
            <div className="border-b border-slate-100 px-4 py-3 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white shadow-xs">
                    {userProfile?.displayName ? userProfile.displayName.charAt(0).toUpperCase() : "K"}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-900 leading-tight">
                      {userProfile?.displayName || userProfile?.email || "Kreasi Dinamika"}
                    </p>
                    <span className="text-[10px] font-semibold text-blue-600 uppercase">
                      {userProfile?.role || "ADMIN"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
                  aria-label="Tutup menu"
                >
                  ✕
                </button>
              </div>

              {/* Kotak Pencarian Menu Mobile */}
              <div className="mt-2.5 relative">
                <input
                  type="text"
                  placeholder="🔍 Ketik nama menu (spk, qc, barang)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white pl-3 pr-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none shadow-2xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Menu Area */}
            <div className="flex-1 overflow-y-auto px-3.5 py-3">
              {filteredEntries.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Tidak ada menu yang sesuai dengan "{searchQuery}".
                </div>
              ) : (
                <MenuTree
                  entries={filteredEntries}
                  pathname={pathname}
                  onNavigate={() => setMobileOpen(false)}
                  badgeCounts={badgeCounts}
                  isSearching={Boolean(searchQuery.trim())}
                />
              )}
            </div>

            {/* Footer Mobile Sederhana */}
            <div className="border-t border-slate-100 p-3 bg-slate-50/60">
              <Link
                href="/dashboard/akun"
                onClick={() => setMobileOpen(false)}
                className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
              >
                ⚙️ Pengaturan Akun
              </Link>
            </div>
          </aside>
        </div>
      ) : null}

      {/* MOBILE BOTTOM DOCK */}
      <nav className="fixed bottom-0 inset-x-0 z-30 flex h-16 items-center justify-around border-t border-slate-200/80 bg-white/95 px-3 backdrop-blur-md shadow-lg lg:hidden">
        <Link
          href="/dashboard"
          className={`flex flex-col items-center gap-1 text-[11px] font-semibold transition ${
            pathname === "/dashboard" ? "text-blue-600" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>Home</span>
        </Link>

        <Link
          href="/dashboard/spk"
          className={`flex flex-col items-center gap-1 text-[11px] font-semibold transition ${
            pathname.startsWith("/dashboard/spk") ? "text-blue-600" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span>SPK</span>
        </Link>

        <Link
          href="/dashboard/barangMasukGudang"
          className={`relative flex flex-col items-center gap-1 text-[11px] font-semibold transition ${
            pathname.includes("Gudang") ? "text-blue-600" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <span>Gudang</span>
          {badgeCounts.barangKeluarGudang ? (
            <span className="absolute -top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
              {badgeCounts.barangKeluarGudang}
            </span>
          ) : null}
        </Link>

        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex flex-col items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-900 transition"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
          <span>Menu</span>
        </button>
      </nav>
    </>
  );
}
