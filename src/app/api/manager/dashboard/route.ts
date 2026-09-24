import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function jakartaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function asDate(value: string | null, fallback: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  return value;
}

function asOptionalId(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function asBoundedInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Sesi berakhir." }, { status: 401 });
  }

  const today = jakartaToday();
  const params = request.nextUrl.searchParams;
  const section = String(params.get("section") || "summary").trim().toUpperCase();
  const from = asDate(params.get("from"), today);
  const to = asDate(params.get("to"), today);

  if (section === "SUMMARY") {
    const { data, error } = await supabase.rpc("smpt_manager_dashboard_summary", {
      p_from: from,
      p_to: to,
    });

    if (error) {
      const status = error.code === "42501" ? 403 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json(data ?? {});
  }

  const detailSections = new Set(["PRODUCTION", "MATERIAL", "WORKFORCE", "FINANCE", "ATTENTION", "HISTORY"]);
  if (!detailSections.has(section)) {
    return NextResponse.json({ error: "Section dashboard tidak valid." }, { status: 400 });
  }

  const projectId = asOptionalId(params.get("project"));
  const productId = asOptionalId(params.get("product"));
  const limit = asBoundedInt(params.get("limit"), 50, 1, 100);
  const offset = asBoundedInt(params.get("offset"), 0, 0, 1000000);

  const { data, error } = await supabase.rpc("smpt_manager_dashboard_detail", {
    p_section: section,
    p_from: from,
    p_to: to,
    p_project_id: projectId,
    p_product_id: productId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    const status = error.code === "42501" ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data ?? { section, items: [] });
}
