"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
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
      className={`group flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-150 ${
        nested ? "ml-2.5" : ""
      } ${
        active
          ? "bg-blue-600 text-white shadow-sm shadow-blue-500/25"
          : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 active:bg-slate-200/70"
      }`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full transition-transform ${
          active
            ? "bg-white scale-110"
            : "bg-slate-300 group-hover:bg-blue-500 group-hover:scale-110"
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
          title={`${badgeCount} permintaan Gudang menunggu`}
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
}: {
  entries: MenuEntry[];
  pathname: string;
  onNavigate?: () => void;
  badgeCounts: Record<string, number>;
}) {
  return (
    <nav className="space-y-1.5">
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

        return (
          <details
            key={entry.id}
            className="group rounded-xl transition"
            open={groupActive || undefined}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 [&::-webkit-details-marker]:hidden">
              <span>{entry.text}</span>
              <svg
                className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-open:rotate-90"
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

            <div className="mt-1 space-y-0.5 border-l-2 border-slate-200/80 pl-2">
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

                return (
                  <details
                    key={child.id}
                    className="group/sub"
                    open={subgroupActive || undefined}
                  >
                    <summary className="ml-2 flex cursor-pointer list-none items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 hover:bg-slate-100 hover:text-slate-600 [&::-webkit-details-marker]:hidden">
                      <span>{child.text}</span>
                      <svg
                        className="h-3 w-3 text-slate-400 transition-transform duration-200 group-open/sub:rotate-90"
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

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent body scrolling when mobile drawer is open
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

  return (
    <>
      {/* DESKTOP SIDEBAR */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-slate-200/80 bg-white shadow-[1px_0_10px_rgba(0,0,0,0.02)] lg:flex">
        {/* Brand header */}
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-sm font-black text-white shadow-sm shadow-blue-500/20">
              KD
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-slate-900">
                Kreasi Dinamika
              </p>
              <p className="truncate text-[11px] font-semibold text-blue-600">
                Sistem Terpadu (SMPT V2)
              </p>
            </div>
          </div>
        </div>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4">
          <MenuTree
            entries={entries}
            pathname={pathname}
            badgeCounts={badgeCounts}
          />
        </div>

        {/* User footer on desktop */}
        {userProfile ? (
          <div className="border-t border-slate-100 p-3.5">
            <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 p-2.5 border border-slate-100">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-xs font-bold text-blue-700">
                {userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-800">
                  {userProfile.displayName || userProfile.email}
                </p>
                <p className="truncate text-[11px] font-semibold text-blue-600">
                  {userProfile.role}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </aside>

      {/* MOBILE TRIGGER BUTTON (DISPATCH EVENT FOR HEADER) */}
      <div id="mobileSidebarControls" className="hidden" data-open={mobileOpen ? "1" : "0"} />

      {/* MOBILE DRAWER */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop blur */}
          <div
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity duration-300"
          />

          {/* Drawer container */}
          <aside className="relative flex h-full w-[85vw] max-w-sm flex-col bg-white shadow-2xl transition-transform duration-300 ease-out">
            {/* Drawer Header */}
            <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-xs font-black text-white shadow-xs">
                  KD
                </div>
                <div>
                  <p className="text-xs font-extrabold text-slate-900">
                    Kreasi Dinamika
                  </p>
                  <p className="text-[10px] font-semibold text-blue-600">
                    SMPT V2 Mobile
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                aria-label="Tutup menu"
              >
                ✕
              </button>
            </div>

            {/* User profile card inside mobile drawer */}
            {userProfile ? (
              <div className="bg-slate-50/80 px-5 py-3 border-b border-slate-100 flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-xs font-bold text-white shadow-xs">
                  {userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : "U"}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-800">
                    {userProfile.displayName || userProfile.email}
                  </p>
                  <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                    {userProfile.role}
                  </span>
                </div>
              </div>
            ) : null}

            {/* Scrollable menu inside mobile drawer */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <MenuTree
                entries={entries}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
                badgeCounts={badgeCounts}
              />
            </div>

            {/* Mobile drawer quick actions footer */}
            <div className="border-t border-slate-100 p-4 space-y-2 bg-slate-50/50">
              <Link
                href="/dashboard/akun"
                onClick={() => setMobileOpen(false)}
                className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50"
              >
                Akun Saya
              </Link>
            </div>
          </aside>
        </div>
      ) : null}

      {/* MOBILE BOTTOM DOCK (Native App Style Navigation) */}
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
