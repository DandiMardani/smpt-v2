"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// 1. Aksi Simpan Koreksi Edit Manual
export async function updateBulananItemAction(formData: FormData) {
  const itemId = Number(formData.get("item_id"));
  const runId = Number(formData.get("run_id"));
  const baseAmount = Number(formData.get("base_amount") || 0);
  const overtimeAmount = Number(formData.get("overtime_amount") || 0);
  const kasbonKantor = Number(formData.get("kasbon_perusahaan_amount") || 0);
  const kasbonWarung = Number(formData.get("kasbon_warung_amount") || 0);

  if (!itemId || !runId) throw new Error("ID Item tidak valid.");

  const supabase = await createClient();

  // Rumus murni sesuai permintaan
  const gross = baseAmount + overtimeAmount;
  const deduction = kasbonKantor + kasbonWarung;
  const net = Math.max(0, gross - deduction);

  const { error: itemErr } = await supabase
    .from("payroll_run_items")
    .update({
      base_amount: baseAmount,
      overtime_amount: overtimeAmount,
      meal_amount: 0, // Pastikan tidak ada uang makan siluman
      kasbon_perusahaan_amount: kasbonKantor,
      kasbon_warung_amount: kasbonWarung,
      deduction_amount: deduction,
      net_amount: net,
    })
    .eq("id", itemId);

  if (itemErr) throw new Error("Gagal update data pekerja: " + itemErr.message);

  // Recalculate total run
  await recalculateRunTotals(supabase, runId);
  revalidatePath("/dashboard/payroll");
}

// 2. Aksi Verifikasi Lunas (Bisa 1 orang atau banyak sekaligus)
export async function verifyBulananPaymentAction(itemIds: number[], runId: number) {
  if (!itemIds || itemIds.length === 0) throw new Error("Pilih pekerja yang ingin diverifikasi.");

  const supabase = await createClient();

  // Ambil detail items yang mau dilunasi
  const { data: items, error: fetchErr } = await supabase
    .from("payroll_run_items")
    .select("id, worker_id, kasbon_perusahaan_amount, kasbon_warung_amount, payment_status")
    .in("id", itemIds);

  if (fetchErr || !items) throw new Error("Gagal membaca data item payroll.");

  for (const it of items) {
    if (it.payment_status === "PAID") continue; // Lewati jika sudah lunas

    const workerId = it.worker_id;
    const cutP = Number(it.kasbon_perusahaan_amount || 0);
    const cutW = Number(it.kasbon_warung_amount || 0);

    // A. Proses Kasbon Warung -> Langsung Lunas Penuh
    if (cutW > 0) {
      await supabase
        .from("cash_advances")
        .update({
          status: "LUNAS",
          notes: `Lunas via Payroll Bulanan #${runId}`,
        })
        .eq("worker_id", workerId)
        .eq("category", "KASBON_WARUNG")
        .eq("status", "AKTIF");
    }

    // B. Proses Kasbon Kantor / Pinjaman Angsuran
    if (cutP > 0) {
      const { data: advancesP } = await supabase
        .from("cash_advances")
        .select("id, amount, paid_amount, installment_amount")
        .eq("worker_id", workerId)
        .in("category", ["KASBON_PERUSAHAAN", "KASBON_KANTOR"])
        .eq("status", "AKTIF");

      if (advancesP && advancesP.length > 0) {
        let remainingToDeduct = cutP;
        for (const adv of advancesP) {
          if (remainingToDeduct <= 0) break;
          const totalAmount = Number(adv.amount || 0);
          const currentPaid = Number(adv.paid_amount || 0);
          const sisaSaldo = Math.max(0, totalAmount - currentPaid);

          const potongSesiIni = Math.min(sisaSaldo, remainingToDeduct);
          const newPaid = currentPaid + potongSesiIni;
          const isLunas = newPaid >= totalAmount;

          await supabase
            .from("cash_advances")
            .update({
              paid_amount: newPaid,
              status: isLunas ? "LUNAS" : "AKTIF",
            })
            .eq("id", adv.id);

          remainingToDeduct -= potongSesiIni;
        }
      }
    }

    // C. Tandai Item Payroll Pekerja sebagai PAID
    await supabase
      .from("payroll_run_items")
      .update({
        payment_status: "PAID",
      })
      .eq("id", it.id);
  }

  await recalculateRunTotals(supabase, runId);
  revalidatePath("/dashboard/payroll");
}

// 3. Aksi Batal Lunas (Rollback jika salah pencet)
export async function revertBulananPaymentAction(itemId: number, runId: number) {
  const supabase = await createClient();

  await supabase
    .from("payroll_run_items")
    .update({ payment_status: "PENDING" })
    .eq("id", itemId);

  await recalculateRunTotals(supabase, runId);
  revalidatePath("/dashboard/payroll");
}

// Helper hitung ulang total run
async function recalculateRunTotals(supabase: any, runId: number) {
  const { data: allItems } = await supabase
    .from("payroll_run_items")
    .select("base_amount, meal_amount, overtime_amount, manual_overtime_amount, overtime_bonus, holiday_bonus, holiday_manual_amount, deduction_amount, net_amount, payment_status")
    .eq("payroll_run_id", runId);

  if (allItems) {
    const totalGross = allItems.reduce(
      (acc: number, it: any) =>
        acc +
        Number(it.base_amount || 0) +
        Number(it.overtime_amount || 0) +
        Number(it.manual_overtime_amount || 0) +
        Number(it.overtime_bonus || 0),
      0
    );
    const totalDed = allItems.reduce((acc: number, it: any) => acc + Number(it.deduction_amount || 0), 0);
    const totalNet = allItems.reduce((acc: number, it: any) => acc + Number(it.net_amount || 0), 0);

    const allPaid = allItems.length > 0 && allItems.every((it: any) => it.payment_status === "PAID");

    await supabase
      .from("payroll_runs")
      .update({
        total_gross: totalGross,
        total_deduction: totalDed,
        total_net: totalNet,
        status: allPaid ? "PAID" : "DRAFT",
      })
      .eq("id", runId);
  }
}
