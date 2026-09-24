"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/access/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  errorMessage,
  getId,
  getText,
  redirectWithMessage,
  requireOneOf,
} from "@/lib/master/action-utils";

const PATH = "/dashboard/masterBahan";
const STATUSES = ["AKTIF", "NONAKTIF"] as const;
const CALCULATION_TYPES = ["SHEET", "LENGTH", "PCS", "ROLL_LENGTH"] as const;

export async function createMaterial(formData: FormData) {
  await requirePermission("master_bahan.write");

  try {
    const name = getText(formData, "name");
    const standardUnit = getText(formData, "standard_unit");
    const category = getText(formData, "category");
    const calculationType = requireOneOf(
      getText(formData, "calculation_type") || "LENGTH",
      CALCULATION_TYPES,
      "Tipe kalkulasi",
    );
    const status = requireOneOf(
      getText(formData, "status") || "AKTIF",
      STATUSES,
      "Status bahan",
    );

    if (!name) throw new Error("Nama bahan wajib diisi.");
    if (!standardUnit) throw new Error("Satuan standar wajib dipilih.");
    if (!category) throw new Error("Kategori bahan wajib diisi.");
    if (["SHEET", "LENGTH", "ROLL_LENGTH"].includes(calculationType) && standardUnit.toUpperCase() === "ROLL") {
      throw new Error("Untuk kalkulasi berbasis panjang, Satuan Standar harus panjang aktual seperti Meter/Yard, bukan Roll. Roll tetap dicatat sebagai physical lot/container.");
    }

    const supabase = await createClient();
    const { error } = await supabase.from("materials").insert({
      name,
      standard_unit: standardUnit,
      category,
      calculation_type: calculationType,
      status,
    });

    if (error) throw error;
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Gagal menambah Master Bahan."));
  }

  revalidatePath(PATH);
  redirectWithMessage(PATH, "success", "Master Bahan berhasil ditambahkan.");
}

export async function updateMaterial(formData: FormData) {
  await requirePermission("master_bahan.write");

  try {
    const id = getId(formData, "id");
    const name = getText(formData, "name");
    const standardUnit = getText(formData, "standard_unit");
    const category = getText(formData, "category");
    const calculationType = requireOneOf(
      getText(formData, "calculation_type") || "LENGTH",
      CALCULATION_TYPES,
      "Tipe kalkulasi",
    );
    const status = requireOneOf(
      getText(formData, "status") || "AKTIF",
      STATUSES,
      "Status bahan",
    );

    if (!name) throw new Error("Nama bahan wajib diisi.");
    if (!standardUnit) throw new Error("Satuan standar wajib dipilih.");
    if (!category) throw new Error("Kategori bahan wajib diisi.");
    if (["SHEET", "LENGTH", "ROLL_LENGTH"].includes(calculationType) && standardUnit.toUpperCase() === "ROLL") {
      throw new Error("Untuk kalkulasi berbasis panjang, Satuan Standar harus panjang aktual seperti Meter/Yard, bukan Roll. Roll tetap dicatat sebagai physical lot/container.");
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("materials")
      .update({
        name,
        standard_unit: standardUnit,
        category,
        calculation_type: calculationType,
        status,
      })
      .eq("id", id);

    if (error) throw error;
  } catch (error) {
    redirectWithMessage(PATH, "error", errorMessage(error, "Gagal memperbarui Master Bahan."));
  }

  revalidatePath(PATH);
  redirectWithMessage(PATH, "success", "Master Bahan berhasil diperbarui.");
}
