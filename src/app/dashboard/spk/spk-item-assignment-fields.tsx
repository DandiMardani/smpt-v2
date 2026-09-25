"use client";

import { useMemo, useState } from "react";
import { Field, buttonClass, inputClass } from "@/components/final/final-ui";
import { addSpkItemAction } from "@/lib/final/actions";

type WorkItemOption = {
  id: number;
  displayOrder: number;
  name: string;
  unit: string;
  qtyPerProduct: number;
  routingMode: string;
};

type Capacity = {
  work_item_id: number;
  unit?: string;
  qty_per_product?: number | string;
  routing_mode?: string;
  has_dependencies?: boolean;
  hard_enforced?: boolean;
  physical_available_equivalent?: number | string | null;
  reserved_equivalent?: number | string | null;
  available_after_reservation_equivalent?: number | string | null;
  route_available_raw?: number | string | null;
  hard_route_available_raw?: number | string | null;
  target_remaining_raw?: number | string | null;
  max_assignable_raw?: number | string | null;
};

type Props = {
  orderId: number;
  workItems: WorkItemOption[];
  capacities: Capacity[];
};

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value: unknown) {
  return n(value).toLocaleString("id-ID", { maximumFractionDigits: 4 });
}

export function SpkItemAssignmentFields({ orderId, workItems, capacities }: Props) {
  const [workItemId, setWorkItemId] = useState("");
  const [assignedQty, setAssignedQty] = useState("");

  const selectedItem = useMemo(
    () => workItems.find((item) => item.id === Number(workItemId)) ?? null,
    [workItemId, workItems],
  );

  const capacity = useMemo(
    () => capacities.find((item) => Number(item.work_item_id) === Number(workItemId)) ?? null,
    [capacities, workItemId],
  );

  const qty = n(assignedQty);
  const hasDependencies = Boolean(capacity?.has_dependencies);
  const hard = Boolean(capacity?.hard_enforced);
  const routeAvailableRaw = capacity?.route_available_raw == null ? null : n(capacity.route_available_raw);
  const hardAvailableRaw = capacity?.hard_route_available_raw == null ? null : n(capacity.hard_route_available_raw);
  const targetRemainingRaw = capacity?.target_remaining_raw == null ? null : n(capacity.target_remaining_raw);
  const maxAssignable = capacity?.max_assignable_raw == null ? null : n(capacity.max_assignable_raw);

  const exceedsTarget = Boolean(selectedItem && targetRemainingRaw != null && qty > targetRemainingRaw + 0.00005);
  const exceedsHard = Boolean(selectedItem && hard && hardAvailableRaw != null && qty > hardAvailableRaw + 0.00005);
  const warningOverWip = Boolean(selectedItem && hasDependencies && !hard && routeAvailableRaw != null && qty > routeAvailableRaw + 0.00005);
  const blocked = exceedsTarget || exceedsHard || Boolean(selectedItem && maxAssignable != null && maxAssignable <= 0);

  return (
    <form action={addSpkItemAction} className="mb-4 grid gap-3 md:grid-cols-3">
      <input type="hidden" name="order_id" value={orderId} />

      <Field label="Item Pekerjaan">
        <select
          name="work_item_id"
          required
          value={workItemId}
          onChange={(event) => {
            setWorkItemId(event.target.value);
            setAssignedQty("");
          }}
          className={inputClass}
        >
          <option value="">Pilih</option>
          {workItems.map((item) => {
            const c = capacities.find((x) => Number(x.work_item_id) === item.id);
            const route = c?.has_dependencies
              ? `${c.hard_enforced ? "HARD" : "WARNING"} · WIP ${fmt(c.available_after_reservation_equivalent)} eq`
              : "MANDIRI / tanpa predecessor";
            return (
              <option key={item.id} value={item.id}>
                #{item.displayOrder || 0} · {item.name} · Qty/Produk {fmt(item.qtyPerProduct)} · {route}
              </option>
            );
          })}
        </select>
      </Field>

      <Field label="Qty Penugasan">
        <input
          name="assigned_qty"
          type="number"
          min="0.0001"
          max={hard && maxAssignable != null ? Math.max(maxAssignable, 0) : targetRemainingRaw ?? undefined}
          step="0.0001"
          required
          value={assignedQty}
          onChange={(event) => setAssignedQty(event.target.value)}
          className={inputClass}
          aria-describedby="spk-wip-capacity-help"
        />
        <span id="spk-wip-capacity-help" className="mt-1 block text-xs">
          {!selectedItem ? (
            <span className="text-slate-500">Pilih Item Pekerjaan untuk melihat kapasitas WIP yang boleh ditugaskan.</span>
          ) : !capacity ? (
            <span className="text-amber-400">Kapasitas routing belum tersedia. Refresh halaman setelah migration diterapkan.</span>
          ) : !hasDependencies ? (
            <span className="text-slate-500">
              Tanpa WIP predecessor. Sisa target item: {fmt(targetRemainingRaw)} {selectedItem.unit}.
            </span>
          ) : (
            <span className={exceedsHard || exceedsTarget ? "text-red-400" : warningOverWip ? "text-amber-400" : "text-emerald-400"}>
              WIP fisik {fmt(capacity.physical_available_equivalent)} eq · sudah dialokasikan SPK aktif {fmt(capacity.reserved_equivalent)} eq · sisa {fmt(capacity.available_after_reservation_equivalent)} eq.
              {" "}Maks SPK saat ini {fmt(maxAssignable)} {selectedItem.unit}.
              {exceedsHard ? " HARD: qty ini melebihi WIP yang tersedia dan tidak bisa disimpan." : ""}
              {warningOverWip ? " WARNING: qty melebihi WIP saat ini; SPK boleh lanjut tetapi anomaly akan dicatat saat diterbitkan." : ""}
              {exceedsTarget ? " Qty juga melebihi sisa target Produk." : ""}
            </span>
          )}
        </span>
      </Field>

      <div>
        <button className={buttonClass} disabled={blocked} aria-disabled={blocked}>
          Simpan Item
        </button>
      </div>
    </form>
  );
}
