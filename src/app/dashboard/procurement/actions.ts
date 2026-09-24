"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/access/current-user";
import {
  errorMessage,
  getId,
  getNumber,
  getOptionalDate,
  getOptionalId,
  getText,
  redirectWithMessage,
} from "@/lib/master/action-utils";
import { callRpc } from "@/lib/operations/ops-utils";

const PATH = "/dashboard/procurement";

function optionalNumber(formData: FormData, key: string, min = 0): number | null {
  const raw = getText(formData, key);
  if (!raw) return null;
  return getNumber(formData, key, { min });
}

function refresh() {
  [PATH, "/dashboard/barangMasukGudang", "/dashboard/masterVendor"].forEach((path) =>
    revalidatePath(path),
  );
}

export async function createPlan(formData: FormData) {
  await requirePermission("procurement.create");
  try {
    const planId = await callRpc<number>("smpt_create_purchase_plan", {
      p_project_id: getId(formData, "project_id"),
      p_product_id: getOptionalId(formData, "product_id"),
      p_plan_date: getOptionalDate(formData, "plan_date"),
      p_notes: getText(formData, "notes") || null,
    });
    refresh();
    redirect(`${PATH}?plan=${planId}&success=${encodeURIComponent("Purchase Planning siap direview.")}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirectWithMessage(PATH, "error", errorMessage(error, "Gagal membuat Purchase Planning."));
  }
}

export async function savePlanLine(formData: FormData) {
  await requirePermission("procurement.edit_draft");
  const planId = getId(formData, "plan_id");
  try {
    await callRpc("smpt_update_purchase_plan_line", {
      p_line_id: getId(formData, "line_id"),
      p_confirmed_incoming: getNumber(formData, "confirmed_incoming", { min: 0 }),
      p_planned_quantity: getNumber(formData, "planned_quantity", { min: 0 }),
      p_supplier_id: getOptionalId(formData, "supplier_id"),
      p_unit_price: optionalNumber(formData, "unit_price", 0),
      p_notes: getText(formData, "notes") || null,
    });
  } catch (error) {
    redirect(`${PATH}?plan=${planId}&error=${encodeURIComponent(errorMessage(error, "Gagal menyimpan baris planning."))}`);
  }
  refresh();
  redirect(`${PATH}?plan=${planId}&success=${encodeURIComponent("Baris planning diperbarui.")}`);
}

export async function createDraftPo(formData: FormData) {
  await requirePermission("procurement.create");
  const planId = getId(formData, "plan_id");
  try {
    const poId = await callRpc<number>("smpt_create_draft_purchase_order", {
      p_purchase_plan_id: planId,
      p_supplier_id: getId(formData, "supplier_id"),
      p_order_date: getOptionalDate(formData, "order_date"),
      p_expected_date: getOptionalDate(formData, "expected_date"),
      p_notes: getText(formData, "notes") || null,
    });
    refresh();
    redirect(`${PATH}?plan=${planId}&po=${poId}&success=${encodeURIComponent("Draft PO dibuat. Review qty, unit, dan harga sebelum diterbitkan.")}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`${PATH}?plan=${planId}&error=${encodeURIComponent(errorMessage(error, "Gagal membuat Draft PO."))}`);
  }
}

export async function savePoLine(formData: FormData) {
  await requirePermission("procurement.edit_draft");
  const poId = getId(formData, "po_id");
  const planId = getOptionalId(formData, "plan_id");
  try {
    await callRpc("smpt_update_draft_purchase_order_line", {
      p_line_id: getId(formData, "line_id"),
      p_ordered_quantity: getNumber(formData, "ordered_quantity", { min: 0.0001 }),
      p_purchase_unit: getText(formData, "purchase_unit"),
      p_conversion_factor: optionalNumber(formData, "conversion_factor", 0.00000001),
      p_unit_price: getNumber(formData, "unit_price", { min: 0 }),
      p_notes: getText(formData, "notes") || null,
    });
  } catch (error) {
    redirect(`${PATH}?${planId ? `plan=${planId}&` : ""}po=${poId}&error=${encodeURIComponent(errorMessage(error, "Gagal menyimpan baris PO."))}`);
  }
  refresh();
  redirect(`${PATH}?${planId ? `plan=${planId}&` : ""}po=${poId}&success=${encodeURIComponent("Draft PO diperbarui.")}`);
}

export async function issuePo(formData: FormData) {
  await requirePermission("procurement.issue");
  const poId = getId(formData, "po_id");
  const planId = getOptionalId(formData, "plan_id");
  try {
    const poNumber = await callRpc<string>("smpt_issue_purchase_order", {
      p_purchase_order_id: poId,
    });
    refresh();
    redirect(`${PATH}?${planId ? `plan=${planId}&` : ""}po=${poId}&success=${encodeURIComponent(`${poNumber} diterbitkan dan siap diterima Gudang.`)}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect(`${PATH}?${planId ? `plan=${planId}&` : ""}po=${poId}&error=${encodeURIComponent(errorMessage(error, "Gagal menerbitkan PO."))}`);
  }
}

export async function cancelPo(formData: FormData) {
  await requirePermission("procurement.cancel");
  const poId = getId(formData, "po_id");
  const planId = getOptionalId(formData, "plan_id");
  try {
    await callRpc("smpt_cancel_purchase_order", {
      p_purchase_order_id: poId,
      p_reason: getText(formData, "reason") || null,
    });
  } catch (error) {
    redirect(`${PATH}?${planId ? `plan=${planId}&` : ""}po=${poId}&error=${encodeURIComponent(errorMessage(error, "Gagal membatalkan PO."))}`);
  }
  refresh();
  redirect(`${PATH}?${planId ? `plan=${planId}&` : ""}success=${encodeURIComponent("PO dibatalkan.")}`);
}
