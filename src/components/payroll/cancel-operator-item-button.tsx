"use client";

import { useState } from "react";
import { deleteOperatorPayrollItemAction } from "@/lib/final/actions";

export function CancelOperatorPayrollItemButton({ itemId, runId }: { itemId?: number; runId?: number }) {
  const [isPending, setIsPending] = useState(false);

  return (
    <form
      action={async (formData) => {
        const confirmMsg = runId
          ? "Batalkan seluruh item borongan pada batch periode payroll ini?"
          : "Batalkan rincian item payroll operator borongan ini?";
        if (!confirm(confirmMsg)) return;
        setIsPending(true);
        try {
          const res = await deleteOperatorPayrollItemAction(formData);
          if (res?.success) {
            window.location.reload();
          }
        } catch (err: any) {
          if (err?.digest?.startsWith("NEXT_REDIRECT") || err?.message === "NEXT_REDIRECT") {
            throw err;
          }
          alert(err instanceof Error ? err.message : "Gagal membatalkan item payroll operator.");
        } finally {
          setIsPending(false);
        }
      }}
    >
      {runId ? <input type="hidden" name="run_id" value={runId} /> : null}
      {itemId ? <input type="hidden" name="item_id" value={itemId} /> : null}
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
