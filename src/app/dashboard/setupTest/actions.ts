"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/access/current-user";
import { errorMessage, getText, redirectWithMessage } from "@/lib/master/action-utils";
import { createClient } from "@/lib/supabase/server";

const PATH = "/dashboard/setupTest";

// 1. Buat Snapshot Database Keseluruhan (Backup Sistem)
export async function createBackup(formData: FormData) {
  await requirePermission("setup_test.admin");
  const label = getText(formData, "label");
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.rpc("smpt_create_data_backup", {
      p_label: label || null,
    });
    if (error) throw error;
    revalidatePath(PATH);
    redirectWithMessage(PATH, "success", `Backup ${data?.backup_code || "baru"} berhasil dibuat.`);
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Backup gagal dibuat."));
  }
}

// 2. Pembersihan Data Terarsip (Hanya Presensi & Warung/Kasbon Terpilih)
export async function cleanupArchivedData(formData: FormData) {
  await requirePermission("setup_test.admin");

  const startDate = getText(formData, "start_date");
  const endDate = getText(formData, "end_date");
  const confirmation = getText(formData, "confirmation");

  const deleteAttendance = formData.get("delete_attendance") === "on";
  const deleteWarung = formData.get("delete_warung") === "on";
  const deleteKasbon = formData.get("delete_kasbon") === "on";

  // Validasi input
  if (!startDate || !endDate) {
    redirectWithMessage(PATH, "error", "Rentang tanggal awal dan akhir wajib diisi.");
  }

  if (confirmation !== "HAPUS") {
    redirectWithMessage(PATH, "error", "Konfirmasi gagal. Ketik kata HAPUS persis untuk melanjutkan.");
  }

  if (!deleteAttendance && !deleteWarung && !deleteKasbon) {
    redirectWithMessage(PATH, "error", "Pilih minimal satu kelompok data yang ingin dibersihkan.");
  }

  const supabase = await createClient();
  let deletedAttendanceCount = 0;
  let deletedWarungCount = 0;
  let deletedKasbonCount = 0;

  try {
    // Hapus Presensi (Jika dicentang)
    if (deleteAttendance) {
      const { data, error } = await supabase
        .from("attendance_records")
        .delete()
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate)
        .select("id");

      if (error) throw new Error(`Gagal membersihkan absensi: ${error.message}`);
      deletedAttendanceCount = data?.length || 0;
    }

    // Hapus Nota Warung (Jika dicentang - hanya yang lunas)
    if (deleteWarung) {
      const { data, error } = await supabase
        .from("cash_advances")
        .delete()
        .eq("category", "KASBON_WARUNG")
        .gte("advance_date", startDate)
        .lte("advance_date", endDate)
        .select("id");

      if (error) throw new Error(`Gagal membersihkan nota warung: ${error.message}`);
      deletedWarungCount = data?.length || 0;
    }

    // Hapus Kasbon Finansial (Jika dicentang)
    if (deleteKasbon) {
      const { data, error } = await supabase
        .from("cash_advances")
        .delete()
        .neq("category", "KASBON_WARUNG")
        .gte("advance_date", startDate)
        .lte("advance_date", endDate)
        .select("id");

      if (error) throw new Error(`Gagal membersihkan kasbon: ${error.message}`);
      deletedKasbonCount = data?.length || 0;
    }

    revalidatePath(PATH);
    redirectWithMessage(
      PATH,
      "success",
      `Pembersihan selesai: ${deletedAttendanceCount} absensi, ${deletedWarungCount} nota warung, dan ${deletedKasbonCount} kasbon periode ${startDate} s/d ${endDate} berhasil dibersihkan. Stok gudang tetap utuh.`,
    );
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Gagal memproses pembersihan data."));
  }
}
