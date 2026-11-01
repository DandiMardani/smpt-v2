"use client";

import { useState } from "react";
import { deleteOperatorPayrollRunAction } from "@/lib/final/actions";

export function CancelOperatorPayrollRunButton({ runId }: { runId: number }) {
  const [isPending, setIsPending] = useState(false);

  return (
    <form
      action={async (formData) => {
        if (!confirm("Batalkan seluruh batch Payroll Operator (Borongan) ini? Semua rincian item akan dihapus.")) return;
        setIsPending(true);
        try {
          await deleteOperatorPayrollRunAction(formData);
          window.location.reload();
        } catch (err: any) {
          if (err?.digest?.startsWith("NEXT_REDIRECT") || err?.message === "NEXT_REDIRECT") {
            throw err;
          }
          alert(err instanceof Error ? err.message : "Gagal membatalkan batch payroll operator.");
        } finally {
          setIsPending(false);
        }
      }}
    >
      <input type="hidden" name="run_id" value={runId} />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-rose-100 px-3 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-200 transition-colors cursor-pointer disabled:opacity-50"
      >
        {isPending ? "Membatalkan..." : "Batalkan"}
      </button>
    </form>
  );
}

