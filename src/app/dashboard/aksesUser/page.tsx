import Link from "next/link";
import {
  Badge,
  Card,
  Empty,
  Field,
  Flow,
  Notice,
  PageShell,
  ReadOnly,
  TableWrap,
  Td,
  Th,
  buttonClass,
  inputClass,
} from "@/components/final/final-ui";
import { requirePermission } from "@/lib/access/current-user";
import { param, type SearchParams } from "@/lib/final/final-utils";
import { createClient } from "@/lib/supabase/server";
import { adminSetUserPasswordAction, createUserAccessAction, saveUserAccessAction } from "./actions";
import { PasswordPair } from "./password-pair";

type Props = { searchParams: Promise<SearchParams> };
type UserRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  role_code: string;
  is_active: boolean;
  worker_id: number | null;
  worker_name: string | null;
  worker_code: string | null;
  worker_position: string | null;
};
type RoleRow = { role_id: number; role_code: string };
type WorkerRow = { id: number; worker_code: string; name: string; position: string | null; status: string };

const roleHelp: Record<string, string> = {
  ADMIN: "Full system & administrasi",
  MANAGER: "Monitoring, laporan & export — read-only",
  SUPERVISOR: "Operasional produksi, SPK, assignment, QC & rework",
  GUDANG: "Gudang, inventory custody, WIP & logistik",
  PEKERJA: "Pekerjaan Saya + data milik sendiri",
  USER: "Base role fleksibel; akses tambahan lewat permission override",
  CHECKER: "LEGACY — checker baru gunakan USER + permission checker",
};

export default async function Page({ searchParams }: Props) {
  const access = await requirePermission("access_control.view");
  const isAdmin = access.role.toUpperCase() === "ADMIN";
  const canWrite = isAdmin && (access.permissionCodes.includes("access_control.write") || access.permissionCodes.includes("*"));
  const q = await searchParams;
  const selectedUserId = param(q, "user");
  const s = await createClient();

  const [usersResult, rolesResult, workersResult] = await Promise.all([
    s.rpc("smpt_admin_user_directory"),
    s.rpc("smpt_admin_role_options"),
    s.from("workers").select("id,worker_code,name,position,status").eq("status", "AKTIF").order("name").limit(1000),
  ]);

  const err = [usersResult.error, rolesResult.error, workersResult.error].find(Boolean);
  if (err) throw new Error(err.message);

  const users = (usersResult.data ?? []) as UserRow[];
  const roles = (rolesResult.data ?? []) as RoleRow[];
  const workers = (workersResult.data ?? []) as WorkerRow[];
  const selected = users.find((x) => x.user_id === selectedUserId) ?? null;
  const createRoles = roles.filter((r) => r.role_code !== "CHECKER");
  const editRoles = roles.filter((r) => r.role_code !== "CHECKER" || selected?.role_code === "CHECKER");

  return (
    <PageShell
      eyebrow="Admin"
      title="Manajemen User"
      description="ADMIN mengelola akun, preset role, status, link pekerja, dan password dari satu halaman. CHECKER adalah role legacy; checker baru memakai USER + permission checker."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnly /> : null}
      <Flow>
        Role adalah preset akses. ADMIN = full; MANAGER = read-only; SUPERVISOR = produksi; GUDANG = inventory/logistik; PEKERJA = data sendiri; USER = fleksibel. Role PEKERJA wajib dihubungkan ke Master Pekerja.
      </Flow>

      {canWrite ? (
        <Card title="Tambah User Login">
          <form action={createUserAccessAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Email Login">
              <input name="email" type="email" required autoComplete="off" className={inputClass} placeholder="nama@perusahaan.com" />
            </Field>
            <PasswordPair
              passwordName="password"
              confirmationName="confirm_password"
              passwordLabel="Password Sementara"
              confirmationLabel="Konfirmasi Password"
              className={inputClass}
            />
            <Field label="Role">
              <select name="role_code" required defaultValue="USER" className={inputClass}>
                {createRoles.map((r) => (
                  <option key={r.role_id} value={r.role_code}>{r.role_code} — {roleHelp[r.role_code] || "Role aplikasi"}</option>
                ))}
              </select>
            </Field>
            <Field label="Pekerja / Worker Link">
              <select name="worker_id" defaultValue="" className={inputClass}>
                <option value="">Tidak terhubung — wajib jika Role = PEKERJA</option>
                {workers.map((w) => <option key={w.id} value={w.id}>{w.name} · {w.position || w.worker_code}</option>)}
              </select>
            </Field>
            <div className="xl:col-span-4">
              <button className={buttonClass}>Buat User</button>
              <p className="mt-2 text-xs text-slate-500">Akun yang dibuat ADMIN langsung dikonfirmasi agar dapat login tanpa menunggu email konfirmasi.</p>
            </div>
          </form>
        </Card>
      ) : null}

      {canWrite && selected ? (
        <Card title={`Atur ${selected.email}`}>
          <form action={saveUserAccessAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="user_id" value={selected.user_id} />
            <Field label="Akun">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-sm text-slate-800">
                <span className="font-bold">{selected.email}</span>
                <div className="text-xs text-slate-500">{selected.display_name || "Belum ada nama tampilan"}</div>
              </div>
            </Field>
            <Field label="Role">
              <select name="role_code" required defaultValue={selected.role_code} className={inputClass}>
                {editRoles.map((r) => (
                  <option key={r.role_id} value={r.role_code}>{r.role_code} — {roleHelp[r.role_code] || "Role aplikasi"}</option>
                ))}
              </select>
            </Field>
            <Field label="Hubungkan ke Pekerja">
              <select name="worker_id" defaultValue={selected.worker_id ?? ""} className={inputClass}>
                <option value="">Tidak terhubung — wajib jika Role = PEKERJA</option>
                {workers.map((w) => <option key={w.id} value={w.id}>{w.name} · {w.position || w.worker_code}</option>)}
              </select>
            </Field>
            <Field label="Status Akun">
              <select name="is_active" defaultValue={selected.is_active ? "true" : "false"} className={inputClass}>
                <option value="true">AKTIF</option>
                <option value="false">NONAKTIF</option>
              </select>
            </Field>
            <div className="xl:col-span-4">
              <button className={buttonClass}>Simpan Akses User</button>
            </div>
          </form>

          <div className="mt-5 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-bold text-slate-900">Ganti Password User</h3>
            <p className="mt-1 text-xs text-slate-500">ADMIN dapat menetapkan password baru untuk akun ini. Password tidak pernah ditampilkan kembali setelah disimpan.</p>
            <form action={adminSetUserPasswordAction} className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input type="hidden" name="user_id" value={selected.user_id} />
              <PasswordPair
                passwordName="new_password"
                confirmationName="confirm_password"
                passwordLabel="Password Baru"
                confirmationLabel="Konfirmasi Password"
                className={inputClass}
              />
              <div className="flex items-end xl:col-span-2">
                <button className={buttonClass}>Ganti Password User</button>
              </div>
            </form>
          </div>
        </Card>
      ) : canWrite ? (
        <Card title="Atur User"><Empty>Klik Atur pada akun di tabel bawah untuk mengubah role, pekerja, status, atau password.</Empty></Card>
      ) : null}

      <Card title={`Daftar Akun (${users.length})`}>
        <TableWrap>
          <thead><tr><Th>Email</Th><Th>Role</Th><Th>Pekerja</Th><Th>Status</Th><Th>Aksi</Th></tr></thead>
          <tbody>
            {users.length === 0 ? (
              <tr><Td>Belum ada akun.</Td><Td>-</Td><Td>-</Td><Td>-</Td><Td>-</Td></tr>
            ) : users.map((x) => (
              <tr key={x.user_id}>
                <Td><b className="text-slate-900 font-bold">{x.email}</b><div className="text-xs text-slate-500">{x.display_name || x.user_id}</div></Td>
                <Td><Badge>{x.role_code || "USER"}</Badge></Td>
                <Td>{x.worker_name ? <>{x.worker_name}<div className="text-xs text-slate-500">{x.worker_code} · {x.worker_position || "-"}</div></> : <span className="text-slate-500">Tidak terhubung</span>}</Td>
                <Td><Badge>{x.is_active ? "AKTIF" : "NONAKTIF"}</Badge></Td>
                <Td>{canWrite ? <Link href={`/dashboard/aksesUser?user=${encodeURIComponent(x.user_id)}`} className="text-sm font-bold text-blue-600 hover:text-blue-700">Atur</Link> : "-"}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </PageShell>
  );
}
