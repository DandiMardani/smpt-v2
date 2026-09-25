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
import {
  adminSetUserPasswordAction,
  createUserAccessAction,
  deleteUserAccessAction,
  saveUserAccessAction,
} from "./actions";
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
type WorkerRow = {
  id: number;
  worker_code: string;
  name: string;
  position: string | null;
  status: string;
  pay_system: string | null;
};

const roleHelp: Record<string, string> = {
  ADMIN: "Full system & administrasi",
  MANAGER: "Monitoring, laporan & export — read-only",
  SUPERVISOR: "Operasional produksi, SPK, assignment, QC & rework",
  GUDANG: "Gudang, inventory custody, WIP & logistik",
  CUTTING: "Operator Cutting — input pemakaian bahan & hasil cutting",
  PEKERJA: "Pekerjaan & Slip Gaji Saya (Harian/Borongan/Bulanan)",
  WARUNG: "Portal Warung Mitra — Catat hutang makan/belanja pekerja",
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
    s.from("workers")
      .select("id,worker_code,name,position,status,pay_system")
      .eq("status", "AKTIF")
      .order("name")
      .limit(1000),
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
      description="ADMIN mengelola akun, username/display name, preset role, status, link pekerja, password, dan penghapusan akun permanen dari satu halaman."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnly /> : null}
      <Flow>
        Role adalah preset akses. ADMIN = full; PEKERJA = akses khusus slip gaji & transparansi hutang/pekerjaan; WARUNG = mitra warung luar pencatat hutang makan; MANAGER = read-only.
      </Flow>

      {canWrite ? (
        <Card title="Tambah User Login">
          <form action={createUserAccessAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Email Login">
              <input name="email" type="email" required autoComplete="off" className={inputClass} placeholder="nama@perusahaan.com" />
            </Field>
            <Field label="Username / Nama Tampilan">
              <input name="display_name" className={inputClass} placeholder="Contoh: Dandi Mardani" />
            </Field>
            <Field label="Role">
              <select name="role_code" required defaultValue="USER" className={inputClass}>
                {createRoles.map((r) => (
                  <option key={r.role_id} value={r.role_code}>{r.role_code} — {roleHelp[r.role_code] || "Role aplikasi"}</option>
                ))}
              </select>
            </Field>
            <PasswordPair
              passwordName="password"
              confirmationName="confirm_password"
              passwordLabel="Password Sementara"
              confirmationLabel="Konfirmasi Password"
              className={inputClass}
            />
            <Field label="Hubungkan ke Pekerja (Wajib jika Role PEKERJA)">
              <select name="worker_id" defaultValue="" className={inputClass}>
                <option value="">Tidak terhubung — wajib jika Role = PEKERJA</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} · [{w.pay_system || "HARIAN"}] ({w.position || w.worker_code})
                  </option>
                ))}
              </select>
            </Field>
            <div className="xl:col-span-3">
              <button className={buttonClass}>Buat User Baru</button>
              <p className="mt-2 text-xs text-slate-500">Akun yang dibuat ADMIN langsung dikonfirmasi sehingga dapat langsung login tanpa menunggu email verifikasi.</p>
            </div>
          </form>
        </Card>
      ) : null}

      {canWrite && selected ? (
        <Card title={`Atur Akun: ${selected.email}`}>
          <form action={saveUserAccessAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="user_id" value={selected.user_id} />
            <Field label="Email Login">
              <input
                value={selected.email}
                readOnly
                disabled
                className={`${inputClass} !bg-slate-100 !text-slate-600 cursor-not-allowed`}
              />
            </Field>
            <Field label="Username / Nama Tampilan">
              <input
                name="display_name"
                defaultValue={selected.display_name ?? ""}
                className={inputClass}
                placeholder="Contoh: Budi Santoso"
              />
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
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} · [{w.pay_system || "HARIAN"}] ({w.position || w.worker_code})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status Akun">
              <select name="is_active" defaultValue={selected.is_active ? "true" : "false"} className={inputClass}>
                <option value="true">AKTIF</option>
                <option value="false">NONAKTIF</option>
              </select>
            </Field>
            <div className="xl:col-span-4 flex items-center gap-3">
              <button className={buttonClass}>Simpan Perubahan User</button>
              <Link href="/dashboard/aksesUser" className="text-sm font-semibold text-slate-500 hover:text-slate-700">
                Batal
              </Link>
            </div>
          </form>

          {/* Ganti Password */}
          <div className="mt-6 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-bold text-slate-900">Ganti Password User</h3>
            <p className="mt-1 text-xs text-slate-500">ADMIN dapat menetapkan password baru untuk akun ini.</p>
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

          {/* Hapus Akun Permanen */}
          <div className="mt-6 border-t border-red-100 pt-5">
            <h3 className="text-sm font-bold text-red-600">Zona Bahaya: Hapus Akun Permanen</h3>
            {access.userId !== selected.user_id ? (
              <div className="mt-2 space-y-3">
                <p className="text-xs text-slate-600">
                  Menghapus akun <b>{selected.email}</b> ({selected.display_name || "Tanpa Nama"}) akan mencabut seluruh akses login secara permanen dari sistem. Riwayat transaksi masa lalu tetap aman.
                </p>
                <form action={deleteUserAccessAction}>
                  <input type="hidden" name="user_id" value={selected.user_id} />
                  <button
                    type="submit"
                    className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-red-700 transition"
                  >
                    🗑️ Hapus Akun Ini Permanen
                  </button>
                </form>
              </div>
            ) : (
              <p className="mt-2 text-xs text-amber-700 font-medium">
                🛡️ Ini adalah akun ADMIN Anda yang sedang digunakan saat ini. Anda tidak dapat menghapus akun Anda sendiri untuk mencegah terkunci dari sistem.
              </p>
            )}
          </div>
        </Card>
      ) : canWrite ? (
        <Card title="Atur User">
          <Empty>Klik "Atur" pada akun di tabel bawah untuk mengubah username, role, link pekerja, password, atau menghapus akun.</Empty>
        </Card>
      ) : null}

      <Card title={`Daftar Akun Pengguna (${users.length})`}>
        <TableWrap>
          <thead>
            <tr>
              <Th>Email Login</Th>
              <Th>Username / Nama</Th>
              <Th>Role Akses</Th>
              <Th>Pekerja Terhubung</Th>
              <Th>Status</Th>
              <Th>Aksi</Th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><Td>Belum ada akun.</Td><Td>-</Td><Td>-</Td><Td>-</Td><Td>-</Td><Td>-</Td></tr>
            ) : users.map((x) => (
              <tr key={x.user_id}>
                <Td>
                  <span className="font-bold text-slate-900">{x.email}</span>
                </Td>
                <Td>
                  <span className="font-medium text-slate-800">{x.display_name || "-"}</span>
                </Td>
                <Td><Badge>{x.role_code || "USER"}</Badge></Td>
                <Td>
                  {x.worker_name ? (
                    <div>
                      <span className="font-medium text-slate-800">{x.worker_name}</span>
                      <div className="text-xs text-slate-500">
                        {x.worker_code} · {x.worker_position || "-"}
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-400 text-xs italic">Belum terhubung</span>
                  )}
                </Td>
                <Td><Badge>{x.is_active ? "AKTIF" : "NONAKTIF"}</Badge></Td>
                <Td>
                  {canWrite ? (
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/dashboard/aksesUser?user=${encodeURIComponent(x.user_id)}`}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        Atur
                      </Link>
                      {access.userId !== x.user_id ? (
                        <form action={deleteUserAccessAction} className="inline">
                          <input type="hidden" name="user_id" value={x.user_id} />
                          <button
                            type="submit"
                            className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline"
                          >
                            Hapus
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : "-"}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </PageShell>
  );
}
