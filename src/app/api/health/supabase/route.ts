import { NextResponse } from "next/server";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "Supabase environment variables are missing.",
      },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: {
        apikey: supabaseKey,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          status: response.status,
          error: "Supabase responded with an error.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Next.js berhasil terhubung ke Supabase.",
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Tidak dapat menghubungi Supabase.",
      },
      { status: 502 },
    );
  }
}