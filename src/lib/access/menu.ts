export type MenuLeaf = {
  type: "item";
  id: string;
  text: string;
  href: string;
};

export type MenuSubgroup = {
  type: "subgroup";
  id: string;
  text: string;
  children: MenuLeaf[];
};

export type MenuGroupChild = MenuLeaf | MenuSubgroup;

export type MenuGroup = {
  type: "group";
  id: string;
  text: string;
  children: MenuGroupChild[];
};

export type MenuEntry = MenuLeaf | MenuGroup;

export const MENU_PERMISSION_BY_ID: Readonly<Record<string, string>> = {
  dashboard: "dashboard.view",

  // 1. Master Data
  masterProyek: "master_proyek.view",
  masterProdukProyek: "master_produk_proyek.view",
  masterItem: "master_item.view",
  masterKebutuhan: "master_kebutuhan.view",
  masterLokasi: "master_lokasi.view",
  masterVendor: "master_vendor.view",
  masterEmbarkasi: "master_embarkasi.view",

  // 2. Gudang & Material
  procurement: "procurement.view",
  barangMasukGudang: "barang_masuk_gudang.view",
  barangKeluarGudang: "barang_keluar_gudang.view",
  stokGudang: "stok_gudang.view",
  bahan: "log_bahan.view",
  masterBahan: "master_bahan.view",

  // 3. Produksi
  cutting: "cutting.view",
  sablon: "sablon.view",
  permintaanProduksi: "permintaan_produksi.view",
  spk: "spk.view",
  produksi: "produksi.view",
  produksiReguler: "hasil_produksi.view",
  borongan: "borongan.view",
  hasilProduksi: "hasil_produksi.view",
  manufaktur: "manufaktur.view",

  // 4. QC & Logistik
  qc: "qc.view",
  stokBarangJadi: "stok_barang_jadi.view",
  transferBarangJadi: "transfer_barang_jadi.view",
  barangLuar: "barang_luar.view",
  masterSet: "master_set.view",
  packingSet: "packing_set.view",
  stokSet: "stok_set.view",
  targetEmbarkasi: "target_embarkasi.view",
  pengirimanEmbarkasi: "pengiriman_embarkasi.view",
  rejectEmbarkasi: "reject_embarkasi.view",
  pengirimanKlien: "stok_barang_jadi.view",

  // 5. SDM & Payroll
  masterPekerja: "master_pekerja.view",
  absensi: "absensi.view",
  kasbon: "kasbon.view",
  warung: "warung.view",
  setoran: "pekerjaan_saya.view",
  payroll: "payroll.view",

  // 6. Keuangan & Kas
  kasKecil: "kas_kecil.view",
  keuangan: "keuangan.view",
  laporan: "laporan.view",

  // 7. Pengaturan Sistem
  aksesUser: "access_control.view",
  setupTest: "setup_test.admin",
};

function hrefFor(menuId: string): string {
  return menuId === "dashboard" ? "/dashboard" : `/dashboard/${menuId}`;
}

function item(id: string, text: string, customHref?: string): MenuLeaf {
  return {
    type: "item",
    id,
    text,
    href: customHref || hrefFor(id),
  };
}

// 1. POHON MENU GLOBAL (LENGKAP & TANPA DUPLIKAT)
export const SMPT_MENU_TREE: readonly MenuEntry[] = [
  item("dashboard", "Dashboard Utama"),
  {
    type: "group",
    id: "masterData",
    text: "Master Data",
    children: [
      item("masterProyek", "Master Proyek"),
      item("masterProdukProyek", "Produk / Spesifikasi Proyek"),
      item("masterItem", "Item & Tarif Pekerjaan"),
      item("masterKebutuhan", "Kebutuhan Bahan (BOM)"),
      item("masterLokasi", "Master Lokasi Gudang"),
      item("masterVendor", "Master Supplier / Vendor"),
      item("masterEmbarkasi", "Master Embarkasi"),
    ],
  },
  {
    type: "group",
    id: "gudangMaterial",
    text: "Gudang & Material",
    children: [
      item("masterBahan", "Master Bahan Baku"),
      item("procurement", "Procurement / PO"),
      item("barangMasukGudang", "Barang Masuk Gudang"),
      item("barangKeluarGudang", "Barang Keluar Gudang"),
      item("stokGudang", "Stok Gudang Material"),
      item("bahan", "Log Arus Bahan Baku"),
    ],
  },
  {
    type: "group",
    id: "produksiGroup",
    text: "Pabrik & Produksi",
    children: [
      item("cutting", "Cutting / Potong"),
      item("sablon", "Sablon"),
      item("permintaanProduksi", "Permintaan Bahan SPV"),
      item("spk", "Surat Perintah Kerja (SPK)"),
      item("produksi", "Siap Produksi"),
      item("produksiReguler", "Setoran Jahit Cepat"),
      item("borongan", "Setoran Borongan"),
      item("hasilProduksi", "Hasil Produksi & Checker"),
      item("manufaktur", "Maklon & Titipan Luar"),
    ],
  },
  {
    type: "group",
    id: "qcLogistik",
    text: "QC & Distribusi Logistik",
    children: [
      item("qc", "Quality Control (QC)"),
      item("stokBarangJadi", "Stok Barang Jadi"),
      item("transferBarangJadi", "Transfer Antar Gudang"),
      item("barangLuar", "Penerimaan Barang Luar"),
      item("masterSet", "Master Set"),
      item("packingSet", "Packing Set"),
      item("stokSet", "Stok Set"),
      item("targetEmbarkasi", "Target Embarkasi"),
      item("pengirimanEmbarkasi", "Pengiriman & Tracking"),
      item("rejectEmbarkasi", "Reject & Retur"),
      item("pengirimanKlien", "Surat Jalan & Kirim Klien"),
    ],
  },
  {
    type: "group",
    id: "sdmPayroll",
    text: "SDM & Tenaga Kerja",
    children: [
      item("masterPekerja", "Master Data Pekerja"),
      item("absensi", "Presensi & Absensi"),
      item("kasbon", "Kasbon Pinjaman Kantor"),
      item("warung", "Kasbon Warung Luar"),
      item("setoran", "Catatan Hasil & Pekerjaan"),
      item("payroll", "Payroll & Slip Gaji"),
    ],
  },
  {
    type: "group",
    id: "keuanganGroup",
    text: "Keuangan & Kas",
    children: [
      item("kasKecil", "Kas Kecil Operasional"),
      item("keuangan", "Buku Keuangan"),
      item("laporan", "Laporan Rekap"),
    ],
  },
  {
    type: "group",
    id: "sistemGroup",
    text: "Pengaturan & Cadangan",
    children: [
      item("aksesUser", "Manajemen User & Hak Akses"),
      item("setupTest", "Arsip & Backup Data"),
    ],
  },
];

export type WorkspaceMode = "HAJI" | "REGULER" | "GUDANG" | "SDM";

// 2. TAB HAJI (Fokus Embarkasi - Tanpa Kas Kecil / SDM Campuran)
export const SMPT_HAJI_MENU_TREE: readonly MenuEntry[] = [
  item("dashboard", "Dashboard Haji"),
  {
    type: "group",
    id: "masterData",
    text: "Master Data Haji",
    children: [
      item("masterProyek", "Master Proyek", "/dashboard/masterProyek?category=HAJI"),
      item("masterItem", "Item & Tarif Pekerjaan", "/dashboard/masterItem?category=HAJI"),
      item("masterKebutuhan", "Kebutuhan Bahan & BOM", "/dashboard/masterKebutuhan?category=HAJI"),
      item("masterProdukProyek", "Master Produk Proyek", "/dashboard/masterProdukProyek?category=HAJI"),
      item("masterEmbarkasi", "Master Embarkasi"),
    ],
  },
  {
    type: "group",
    id: "produksiGroup",
    text: "Produksi Haji",
    children: [
      item("cutting", "Cutting"),
      item("sablon", "Sablon"),
      item("permintaanProduksi", "Permintaan Bahan SPV"),
      item("spk", "Surat Perintah Kerja (SPK)", "/dashboard/spk?category=HAJI"),
      item("produksi", "Siap Produksi"),
      item("borongan", "Setoran Borongan"),
      item("hasilProduksi", "Hasil Produksi & Checker"),
      item("manufaktur", "Barang Titipan & Maklon"),
    ],
  },
  {
    type: "group",
    id: "qcLogistik",
    text: "QC & Distribusi Embarkasi",
    children: [
      item("qc", "Quality Control", "/dashboard/qc?category=HAJI"),
      item("masterSet", "Master Set"),
      item("packingSet", "Packing Set"),
      item("stokSet", "Stok Set"),
      item("targetEmbarkasi", "Target Embarkasi"),
      item("pengirimanEmbarkasi", "Pengiriman & Tracking"),
      item("rejectEmbarkasi", "Reject & Kekurangan"),
    ],
  },
  {
    type: "group",
    id: "sistemGroup",
    text: "Pengaturan & Cadangan",
    children: [
      item("aksesUser", "Manajemen User & Hak Akses"),
      item("setupTest", "Arsip & Backup Data"),
    ],
  },
];

// 3. TAB REGULER (Fokus Proyek Umum / Klien Luar)
export const SMPT_REGULER_MENU_TREE: readonly MenuEntry[] = [
  item("dashboard", "Dashboard Reguler"),
  {
    type: "group",
    id: "masterData",
    text: "Master Data Proyek",
    children: [
      item("masterProyek", "Master Proyek", "/dashboard/masterProyek?category=REGULER"),
      item("masterProdukProyek", "Produk & Spesifikasi", "/dashboard/masterProdukProyek?category=REGULER"),
      item("masterItem", "Item & Tarif Pekerjaan", "/dashboard/masterItem?category=REGULER"),
      item("masterKebutuhan", "Kebutuhan Bahan & BOM", "/dashboard/masterKebutuhan?category=REGULER"),
    ],
  },
  {
    type: "group",
    id: "produksiGroup",
    text: "Produksi Reguler",
    children: [
      item("cutting", "Cutting / Potong"),
      item("sablon", "Sablon"),
      item("produksiReguler", "Setoran Jahit Cepat"),
      item("hasilProduksi", "Rekap Hasil Produksi"),
      item("manufaktur", "Subkon & Maklon Luar"),
    ],
  },
  {
    type: "group",
    id: "qcLogistik",
    text: "QC, Packing & Kirim Klien",
    children: [
      item("qc", "Quality Control (QC)", "/dashboard/qc?category=REGULER"),
      item("pengirimanKlien", "Surat Jalan & Kirim Klien"),
    ],
  },
  {
    type: "group",
    id: "sistemGroup",
    text: "Pengaturan & Cadangan",
    children: [
      item("aksesUser", "Manajemen User & Hak Akses"),
      item("setupTest", "Arsip & Backup Data"),
    ],
  },
];

// 4. TAB GUDANG (Fokus Arus Material & Barang Jadi)
export const SMPT_GUDANG_MENU_TREE: readonly MenuEntry[] = [
  item("dashboard", "Dashboard Gudang"),
  {
    type: "group",
    id: "gudangMaterial",
    text: "Material & Gudang Bahan",
    children: [
      item("masterBahan", "Master Bahan Baku"),
      item("masterVendor", "Master Supplier / Vendor"),
      item("masterLokasi", "Master Lokasi Gudang & Rak"),
      item("procurement", "Procurement / PO"),
      item("barangMasukGudang", "Barang Masuk Gudang"),
      item("barangKeluarGudang", "Barang Keluar Gudang"),
      item("stokGudang", "Stok Gudang Material"),
      item("bahan", "Log Arus Bahan Baku"),
    ],
  },
  {
    type: "group",
    id: "qcLogistik",
    text: "Gudang Barang Jadi",
    children: [
      item("stokBarangJadi", "Stok Barang Jadi"),
      item("barangLuar", "Penerimaan Barang Luar"),
      item("transferBarangJadi", "Transfer Antar Gudang"),
    ],
  },
  {
    type: "group",
    id: "sistemGroup",
    text: "Pengaturan & Cadangan",
    children: [
      item("setupTest", "Arsip & Backup Data"),
    ],
  },
];

// 5. TAB SDM (Fokus Pekerja, Kasbon, Keuangan & Penggajian)
export const SMPT_SDM_MENU_TREE: readonly MenuEntry[] = [
  item("dashboard", "Dashboard SDM"),
  {
    type: "group",
    id: "sdmPayroll",
    text: "Tenaga Kerja & Presensi",
    children: [
      item("masterPekerja", "Master Data Pekerja"),
      item("absensi", "Presensi & Absensi"),
    ],
  },
  {
    type: "group",
    id: "kasbonGroup",
    text: "Kasbon & Fasilitas Warung",
    children: [
      item("kasbon", "Kasbon Pinjaman Kantor"),
      item("warung", "Portal Warung"),
    ],
  },
  {
    type: "group",
    id: "payrollGroup",
    text: "Penggajian & Slip",
    children: [
      item("setoran", "Catatan Hasil & Pekerjaan"),
      item("payroll", "Payroll & Slip Gaji"),
    ],
  },
  {
    type: "group",
    id: "keuanganGroup",
    text: "Keuangan & Kas Operasional",
    children: [
      item("kasKecil", "Kas Kecil"),
      item("keuangan", "Buku Keuangan"),
      item("laporan", "Laporan Rekap"),
    ],
  },
  {
    type: "group",
    id: "sistemGroup",
    text: "Pengaturan & Cadangan",
    children: [
      item("aksesUser", "Manajemen User & Hak Akses"),
      item("setupTest", "Arsip & Backup Data"),
    ],
  },
];

export function getAllowedMenuIds(permissionCodes: Iterable<string>): string[] {
  const permissions = new Set(permissionCodes);

  if (permissions.has("*")) {
    return Object.keys(MENU_PERMISSION_BY_ID);
  }

  return Object.entries(MENU_PERMISSION_BY_ID)
    .filter(([, permission]) => permissions.has(permission))
    .map(([menuId]) => menuId);
}

function filterGroupChild(
  child: MenuGroupChild,
  allowedMenuIds: ReadonlySet<string>,
): MenuGroupChild | null {
  if (child.type === "item") {
    return allowedMenuIds.has(child.id) ? child : null;
  }

  const children = child.children.filter((menuItem) =>
    allowedMenuIds.has(menuItem.id),
  );

  if (children.length === 0) {
    return null;
  }

  return {
    ...child,
    children,
  };
}

export function filterMenuTree(
  entries: readonly MenuEntry[],
  allowedIds: Iterable<string>,
): MenuEntry[] {
  const allowedMenuIds = new Set(allowedIds);
  const result: MenuEntry[] = [];

  entries.forEach((entry) => {
    if (entry.type === "item") {
      if (allowedMenuIds.has(entry.id)) {
        result.push(entry);
      }
      return;
    }

    const children = entry.children
      .map((child) => filterGroupChild(child, allowedMenuIds))
      .filter((child): child is MenuGroupChild => child !== null);

    if (children.length > 0) {
      result.push({
        ...entry,
        children,
      });
    }
  });

  return result;
}

export function findMenuItemById(menuId: string): MenuLeaf | null {
  for (const entry of SMPT_MENU_TREE) {
    if (entry.type === "item") {
      if (entry.id === menuId) {
        return entry;
      }
      continue;
    }

    for (const child of entry.children) {
      if (child.type === "item") {
        if (child.id === menuId) {
          return child;
        }
        continue;
      }

      const nested = child.children.find((menuItem) => menuItem.id === menuId);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}
