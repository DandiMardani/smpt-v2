export type ProjectCategory = "HAJI" | "REGULER";

/**
 * Menentukan kategori proyek (HAJI vs REGULER) secara konsisten dan cerdas.
 * Mendeteksi nilai eksplisit pada `product_category`, serta fallback kata kunci nama / kode proyek.
 */
export function resolveProjectCategory(project: {
  product_category?: string | null;
  name?: string | null;
  project_code?: string | null;
}): ProjectCategory {
  const cat = String(project.product_category ?? "").trim().toUpperCase();
  if (cat === "HAJI") return "HAJI";
  if (cat === "REGULER" || cat === "REGULAR") return "REGULER";

  // Deteksi cerdas dari nama atau kode proyek lama yang belum diisi kategorinya
  const text = `${project.name ?? ""} ${project.project_code ?? ""}`.toLowerCase();
  if (
    text.includes("haji") ||
    text.includes("embarkasi") ||
    text.includes("hajj") ||
    text.includes("kemenag") ||
    text.includes("paspor") ||
    text.includes("kabin")
  ) {
    return "HAJI";
  }

  return "REGULER";
}

/**
 * Label dan styling badge untuk kategori proyek.
 */
export function getProjectCategoryBadge(category: ProjectCategory) {
  if (category === "HAJI") {
    return {
      label: "Proyek Haji",
      icon: "🕋",
      fullLabel: "🕋 Proyek Haji",
      badgeClass:
        "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200 shadow-2xs",
    };
  }

  return {
    label: "Proyek Reguler",
    icon: "🎒",
    fullLabel: "🎒 Proyek Reguler",
    badgeClass:
      "inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 border border-indigo-200 shadow-2xs",
  };
}

/**
 * Format string label untuk dropdown pilihan proyek.
 */
export function formatProjectOption(project: {
  project_code: string;
  name: string;
  product_category?: string | null;
}): string {
  const category = resolveProjectCategory(project);
  const icon = category === "HAJI" ? "🕋 [HAJI]" : "🎒 [REGULER]";
  return `${icon} ${project.project_code} · ${project.name}`;
}
