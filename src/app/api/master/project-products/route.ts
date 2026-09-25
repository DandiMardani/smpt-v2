import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = Number(url.searchParams.get("project_id"));

  if (!Number.isSafeInteger(projectId) || projectId <= 0) {
    return NextResponse.json({ products: [] }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ products: [] }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("project_products")
    .select("id,name")
    .eq("project_id", projectId)
    .eq("status", "AKTIF")
    .order("name");

  if (error) {
    return NextResponse.json(
      { products: [], error: "Produk tidak dapat dibaca." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { products: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
