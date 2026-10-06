import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAllowedMenuIds } from "@/lib/access/menu";

export type CurrentAccessContext = {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  permissionCodes: string[];
  allowedMenuIds: string[];
};

type PermissionRow = { permission_code: string };
type ProfileRow = {
  display_name: string | null;
  is_active: boolean;
  role_id: number;
};

function accessRedirect(code: string): never {
  redirect(`/login?access=${encodeURIComponent(code)}`);
}

export const getCurrentAccessContext = cache(
  async (): Promise<CurrentAccessContext> => {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) redirect("/login");

    const [roleResult, permissionResult, profileResult] = await Promise.all([
      supabase.rpc("current_user_role"),
      supabase.rpc("current_user_permissions"),
      supabase
        .from("profiles")
        .select("display_name, is_active, role_id")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    if (profileResult.error) accessRedirect("profile_read_error");
    if (!profileResult.data) accessRedirect("profile_missing");

    const profile = profileResult.data as ProfileRow;
    if (!profile.is_active) accessRedirect("account_inactive");

    if (roleResult.error) accessRedirect("role_rpc_error");
    if (!roleResult.data) accessRedirect("role_invalid");

    if (permissionResult.error) accessRedirect("permission_read_error");

    const permissionRows = (permissionResult.data ?? []) as PermissionRow[];
    const roleName = String(roleResult.data);
    let permissionCodes: string[] = Array.from(
      new Set(
        permissionRows
          .map((row) => String(row.permission_code ?? "").trim())
          .filter(Boolean),
      ),
    ).sort();

    // Petugas pengiriman embarkasi hanya memiliki hak akses melihat (view-only monitoring)
    if (roleName === "ADMIN_EMBARKASI") {
      permissionCodes = permissionCodes.filter((code) => code !== "pengiriman_embarkasi.operate");
    }

    const email = user.email ?? "";
    const fallbackName = email ? email.split("@")[0] : "User";

    return {
      userId: user.id,
      email,
      displayName: profile.display_name?.trim() || fallbackName,
      role: roleName,
      permissionCodes,
      allowedMenuIds: getAllowedMenuIds(permissionCodes),
    };
  },
);

export async function requirePermission(permission: string) {
  const normalizedPermission = permission.trim().toLowerCase();
  if (!normalizedPermission) accessRedirect("permission_invalid");
  const access = await getCurrentAccessContext();
  if (!access.permissionCodes.includes(normalizedPermission)) {
    redirect(`/dashboard/access-denied?permission=${encodeURIComponent(normalizedPermission)}`);
  }
  return access;
}

export async function requireAnyPermission(permissions: readonly string[]) {
  const normalized = permissions
    .map((permission) => permission.trim().toLowerCase())
    .filter(Boolean);
  if (normalized.length === 0) accessRedirect("permission_invalid");
  const access = await getCurrentAccessContext();
  if (!normalized.some((permission) => access.permissionCodes.includes(permission))) {
    redirect(`/dashboard/access-denied?permission=${encodeURIComponent(normalized.join(","))}`);
  }
  return access;
}
