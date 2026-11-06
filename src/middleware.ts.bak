import type { NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/proxy";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - tracking (public worker tracking)
     * - api/keepalive (cron job)
     */
    "/login",
    "/dashboard/:path*",
  ],
};
