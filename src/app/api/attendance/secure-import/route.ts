import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ImportBody = {
  mode?: "preview" | "commit";
  sourceFile?: string;
  rows?: unknown[];
};

export async function POST(request: Request) {
  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return NextResponse.json({ error: "Payload JSON tidak valid." }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length || rows.length > 5000) {
    return NextResponse.json(
      { error: "Baris import harus berisi 1 sampai 5000 data." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sesi login telah berakhir." }, { status: 401 });
  }

  if (body.mode === "preview") {
    const { data, error } = await supabase.rpc("preview_secure_attendance_import", {
      p_rows: rows,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (body.mode === "commit") {
    const sourceFile = String(body.sourceFile ?? "").trim();
    if (!sourceFile || sourceFile.length > 255) {
      return NextResponse.json({ error: "Nama file sumber tidak valid." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("commit_secure_attendance_import", {
      p_source_file: sourceFile,
      p_rows: rows,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  }

  return NextResponse.json({ error: "Mode import tidak dikenal." }, { status: 400 });
}
