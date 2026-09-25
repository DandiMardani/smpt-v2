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

  masterProyek: "master_proyek.view",
  masterItem: "master_item.view",
  masterKebutuhan: "master_kebutuhan.view",
  masterProdukProyek: "master_produk_proyek.view",
  masterBahan: "master_bahan.view",
  masterPekerja: "master_pekerja.view",
  masterBarangJadi: "master_barang_jadi.view",
  masterLokasi: "master_lokasi.view",
  masterVendor: "master_vendor.view",
  masterEmbarkasi: "master_embarkasi.view",

  barangMasukGudang: "barang_masuk_gudang.view",
  barangKeluarGudang: "barang_keluar_gudang.view",
  stokGudang: "stok_gudang.view",
  bahan: "log_bahan.view",
  procurement: "procurement.view",

  cutting: "cutting.view",
  sablon: "sablon.view",
  permintaanProduksi: "permintaan_produksi.view",
  spk: "spk.view",
  produksi: "produksi.view",
  borongan: "borongan.view",
  setoran: "pekerjaan_saya.view",
  hasilProduksi: "hasil_produksi.view",
  manufaktur: "manufaktur.view",

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

  absensi: "absensi.view",
  payroll: "payroll.view",
  kasbon: "kasbon.view",
  warung: "warung.view",

  kasKecil: "kas_kecil.view",
  keuangan: "keuangan.view",
  laporan: "laporan.view",
  aksesUser: "access_control.view",
  setupTest: "setup_test.admin",
};

function hrefFor(menuId: string): string {
  return menuId === "dashboard" ? "/dashboard" : `/dashboard/${menuId}`;
}

function item(id: string, text: string): MenuLeaf {
  return {
    type: "item",
    id,
    text,
    href: hrefFor(id),
  };
}

export const SMPT_MENU_TREE: readonly MenuEntry[] = [
  item("dashboard", "Dashboard"),
  {
    type: "group",
    id: "masterData",
    text: "Master Data",
    children: [
      {
        type: "subgroup",
        id: "masterProduksi",
        text: "Produksi & Material",
        children: [
          item("masterProyek", "Master Proyek"),
          item("masterProdukProyek", "Produk / Tas Proyek"),
          item("masterItem", "Master Item Pekerjaan"),
          item("masterKebutuhan", "Master Kebutuhan Bahan"),
          item("masterBahan", "Master Bahan"),
        ],
      },
      {
        type: "subgroup",
        id: "masterSdm",
        text: "SDM",
        children: [item("masterPekerja", "Master Pekerja")],
      },
      {
        type: "subgroup",
        id: "masterLogistik",
        text: "Barang Jadi & Logistik",
        children: [
          item("masterBarangJadi", "Master Barang Jadi"),
          item("masterLokasi", "Master Lokasi"),
          item("masterVendor", "Master Supplier / Vendor"),
          item("masterEmbarkasi", "Master Embarkasi"),
        ],
      },
    ],
  },
  {
    type: "group",
    id: "gudangMaterial",
    text: "Gudang & Material",
    children: [
      item("barangMasukGudang", "Barang Masuk Gudang"),
      item("barangKeluarGudang", "Barang Keluar Gudang"),
      item("stokGudang", "Stok Gudang"),
      item("bahan", "Log Bahan Baku"),
      item("procurement", "Procurement / PO"),
    ],
  },
  {
    type: "group",
    id: "produksiGroup",
    text: "Produksi",
    children: [
      item("cutting", "Cutting"),
      item("sablon", "Sablon"),
      item("permintaanProduksi", "Permintaan Barang"),
      item("spk", "Surat Perintah Kerja"),
      item("setoran", "Gaji & Pekerjaan Saya"),
      item("produksi", "Siap Produksi"),
      item("borongan", "Setoran Borongan"),
      item("hasilProduksi", "Hasil Produksi"),
      item("manufaktur", "Barang Titipan & Maklon"),
    ],
  },
  {
    type: "group",
    id: "qcLogistik",
    text: "QC & Logistik",
    children: [
      {
        type: "subgroup",
        id: "qcSub",
        text: "Quality Control",
        children: [item("qc", "Quality Control")],
      },
      {
        type: "subgroup",
        id: "barangJadiSub",
        text: "Barang Jadi",
        children: [
          item("stokBarangJadi", "Stok Barang Jadi"),
          item("transferBarangJadi", "Transfer Barang Jadi"),
          item("barangLuar", "Penerimaan Barang Luar"),
          item("masterSet", "Master Set"),
          item("packingSet", "Packing Set"),
          item("stokSet", "Stok Set"),
        ],
      },
      {
        type: "subgroup",
        id: "distribusiSub",
        text: "Distribusi Embarkasi",
        children: [
          item("targetEmbarkasi", "Target Embarkasi"),
          item("pengirimanEmbarkasi", "Pengiriman & Tracking"),
          item("rejectEmbarkasi", "Reject & Kekurangan"),
        ],
      },
    ],
  },
  {
    type: "group",
    id: "sdmPayroll",
    text: "SDM & Payroll",
    children: [
      item("absensi", "Absensi"),
      item("payroll", "Payroll"),
      item("kasbon", "Kasbon"),
      item("warung", "Kasbon Warung Luar"),
    ],
  },
  {
    type: "group",
    id: "keuanganLaporan",
    text: "Keuangan & Laporan",
    children: [
      item("kasKecil", "Kas Kecil"),
      item("keuangan", "Keuangan"),
      item("laporan", "Laporan"),
      item("aksesUser", "Manajemen User"),
      item("setupTest", "Setup & Data Test"),
    ],
  },
];

export function getAllowedMenuIds(permissionCodes: Iterable<string>): string[] {
  const permissions = new Set(permissionCodes);

  const allowed = Object.entries(MENU_PERMISSION_BY_ID)
    .filter(([, permission]) => permissions.has(permission))
    .map(([menuId]) => menuId);

  // Supplier is an extension of the existing Vendor master. USER accounts with
  // granular supplier.view should reuse the same page instead of a duplicate menu.
  if (permissions.has("supplier.view") && !allowed.includes("masterVendor")) {
    allowed.push("masterVendor");
  }

  return allowed;
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
