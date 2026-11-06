import { SupabaseClient } from "@supabase/supabase-js";

export async function checkIsCashAdvanceLocked(
  supabase: SupabaseClient<any, any, any>,
  advanceId: number | string,
  options?: { allowPayment?: boolean }
): Promise<{ isLocked: boolean; reason?: string }> {
  const { data: adv, error } = await supabase
    .from("cash_advances")
    .select("id, worker_id, advance_date, created_at, amount, paid_amount, status, notes, category")
    .eq("id", advanceId)
    .maybeSingle();

  if (error || !adv) {
    return { isLocked: false };
  }

  // 1. Status LUNAS
  if (adv.status === "LUNAS") {
    return {
      isLocked: true,
      reason: "Aksi ditolak: Kasbon ini sudah terkunci dalam slip gaji yang telah dilunasi.",
    };
  }

  // 2. Catatan menunjukkan telah dilunasi via payroll
  const notesLower = String(adv.notes || "").toLowerCase();
  if (notesLower.includes("payroll") || notesLower.includes("lunas via")) {
    return {
      isLocked: true,
      reason: "Aksi ditolak: Kasbon ini sudah terkunci dalam slip gaji yang telah dilunasi.",
    };
  }

  // 3. Referensi transaksi di tabel cash_advance_payments
  const { data: payRecords } = await supabase
    .from("cash_advance_payments")
    .select("id, source")
    .eq("advance_id", advanceId);

  if (payRecords && payRecords.length > 0) {
    const hasPayrollPayment = payRecords.some((p: any) =>
      String(p.source || "").toUpperCase().includes("PAYROLL")
    );
    if (hasPayrollPayment) {
      return {
        isLocked: true,
        reason: "Aksi ditolak: Kasbon ini sudah terkunci dalam slip gaji yang telah dilunasi.",
      };
    }
    // Jika ada riwayat cicilan non-payroll dan ini adalah aksi pembatalan/penghapusan
    if (!options?.allowPayment) {
      return {
        isLocked: true,
        reason: "Aksi ditolak: Kasbon ini sudah memiliki riwayat pembayaran / potongan cicilan aktif.",
      };
    }
  }

  // 4. Sudah ada pembayaran / cicilan yang masuk (jika aksi hapus/batal/edit skema)
  const paidAmt = Number(adv.paid_amount || 0);
  const totalAmt = Number(adv.amount || 0);
  if (!options?.allowPayment && paidAmt > 0) {
    return {
      isLocked: true,
      reason: "Aksi ditolak: Kasbon ini sudah memiliki riwayat pembayaran / cicilan aktif.",
    };
  }
  if (options?.allowPayment && paidAmt >= totalAmt && totalAmt > 0) {
    return {
      isLocked: true,
      reason: "Aksi ditolak: Kasbon ini sudah lunas sepenuhnya.",
    };
  }

  // 5. Cek apakah terhubung dengan slip gaji lunas (payroll_run_items PAID) yang mencakup tanggal kasbon ini
  const advDate = adv.advance_date || (adv.created_at ? String(adv.created_at).slice(0, 10) : "");
  if (advDate && adv.worker_id) {
    const { data: lockedPayrollItems } = await supabase
      .from("payroll_run_items")
      .select("id, payment_status, kasbon_perusahaan_amount, kasbon_warung_amount, payroll_runs(id, status, period_start, period_end, notes, config_snapshot)")
      .eq("worker_id", adv.worker_id);

    const isLockedInPayroll = (lockedPayrollItems || []).some((item: any) => {
      const run = item.payroll_runs;
      if (!run) return false;

      // Status pembayaran slip
      const itemStatus = String(item.payment_status || "").toUpperCase();
      const runStatus = String(run.status || "").toUpperCase();
      const runNotes = String(run.notes || "").toLowerCase();
      const isPaid =
        itemStatus === "PAID" ||
        itemStatus === "SUDAH_DIBAYAR" ||
        itemStatus === "SUDAH DIBAYAR" ||
        runStatus === "PAID" ||
        runStatus === "FINAL" ||
        runStatus === "SUDAH_DIBAYAR" ||
        runNotes.includes("sudah dibayar");

      if (!isPaid) return false;

      // Tanggal kasbon berada di dalam periode slip gaji yang sudah dibayar
      return (
        advDate >= run.period_start &&
        advDate <= run.period_end
      );
    });

    if (isLockedInPayroll) {
      return {
        isLocked: true,
        reason: "Aksi ditolak: Kasbon ini sudah terkunci dalam slip gaji yang telah dilunasi.",
      };
    }
  }

  return { isLocked: false };
}
