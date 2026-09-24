"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const ALLOWED_PATHS = new Set([
  "/dashboard/masterItem",
  "/dashboard/masterKebutuhan",
  "/dashboard/masterItem/routing",
]);

const PROJECT_ALIASES = new Set([
  "project",
  "project_id",
  "projectid",
  "project_filter",
  "project_id_filter",
  "filter_project",
  "filter_project_id",
  "proyek",
  "id_proyek",
  "idproyek",
  "proyek_filter",
  "filter_proyek",
]);

function normalize(value: string | undefined | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");
}

function normalizedKeys(select: HTMLSelectElement) {
  return [select.name, select.id, select.dataset.field, select.dataset.smptField]
    .filter(Boolean)
    .map((value) => normalize(value));
}

function isProjectSelect(select: HTMLSelectElement) {
  const keys = normalizedKeys(select);

  if (keys.some((key) => PROJECT_ALIASES.has(key))) return true;

  return keys.some(
    (key) =>
      (key.includes("project") || key.includes("proyek")) &&
      !key.includes("product") &&
      !key.includes("produk"),
  );
}

function isProductFieldName(name: string) {
  const key = normalize(name);
  return (
    key.includes("product") ||
    key.includes("produk") ||
    key === "tas" ||
    key.includes("tas_id")
  );
}

function hasSupportedFilterButton(form: HTMLFormElement) {
  const submitters = Array.from(
    form.querySelectorAll<HTMLElement>(
      'button[type="submit"], button:not([type]), input[type="submit"]',
    ),
  );

  return submitters.some((element) => {
    const label =
      element instanceof HTMLInputElement
        ? element.value
        : element.textContent ?? "";

    const normalized = normalize(label);
    return (
      normalized.includes("terapkan_filter") ||
      normalized.includes("buka_routing") ||
      normalized.includes("buka_alur")
    );
  });
}

export default function ProjectProductAuto() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // PENTING:
    // Komponen ini HANYA untuk filter Master Item, Master Kebutuhan,
    // dan Routing Item Pekerjaan. Jangan menyentuh Cutting/SPK/Permintaan
    // atau halaman operasional lain; halaman tersebut mengelola dropdown sendiri.
    if (!ALLOWED_PATHS.has(pathname)) return;

    const onChange = (event: Event) => {
      const target = event.target;

      if (!(target instanceof HTMLSelectElement) || !isProjectSelect(target)) {
        return;
      }

      const form = target.closest("form");
      if (!form || !hasSupportedFilterButton(form)) return;

      const params = new URLSearchParams();
      const data = new FormData(form);

      for (const [key, rawValue] of data.entries()) {
        if (isProductFieldName(key)) continue;
        if (typeof rawValue !== "string") continue;

        const value = rawValue.trim();
        if (value) params.append(key, value);
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    };

    document.addEventListener("change", onChange, true);
    return () => document.removeEventListener("change", onChange, true);
  }, [pathname, router]);

  return null;
}
