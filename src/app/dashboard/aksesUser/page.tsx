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
  ADMIN_EMBARKASI: "Admin Pengiriman Embarkasi — Distribusi koper haji, surat jalan armada, dateline & reject",
  ADMIN_MR_WU: "Portal Mitra Pabrik MR WU — Packing SET koper & serah terima pabrik",
  SUPERVISOR: "Operasional produksi, SPK, assignment, QC & rework",
  GUDANG: "Gudang, inventory custody, WIP & logistik",
  CUTTING: "Operator Cutting — input pemakaian bahan & hasil cutting",
  PEKERJA: "Pekerjaan & Slip Gaji Saya (Harian/Borongan/Bulanan)",
  WARUNG: "Portal Warung Mitra — Catat hutang makan/belanja pekerja",
  USER: "Base role fleksibel; akses tambahan lewat permission override",
  CHECKER: "LEGACY — checker baru gunakan USER + permission checker",
};

const CUSTOM_MODULES = [
  { id: "pengiriman_embarkasi.*", label: "🚚 Pengiriman & Dateline Embarkasi", desc: "Menerbitkan surat jalan armada, tracking pengiriman & konfirmasi asrama haji" },
  { id: "reject_embarkasi.*", label: "📦 Reject & Return Embarkasi", desc: "Mencatat klaim reject koper haji, perlengkapan rusak & pengiriman return pengganti" },
  { id: "mr_wu.*", label: "🏭 Pabrik Mitra MR WU", desc: "Akses pencatatan packing SET koper dan penerimaan material di pabrik MR WU" },
  { id: "target_embarkasi.*", label: "🎯 Target Kuota Embarkasi", desc: "Melihat dan mengelola target kuota koper haji per embarkasi" },
  { id: "pekerjaan_saya.*", label: "💰 Gaji & Slip Pekerjaan Saya", desc: "Melihat rincian upah, absensi, pinjaman & kasbon warung sendiri" },
  { id: "cutting.*", label: "✂️ Modul Cutting", desc: "Mencatat pemakaian kain/bahan dan hasil potongan" },
  { id: "sablon.*", label: "🎨 Modul Sablon", desc: "Mencatat serah terima dan pengerjaan sablon" },
  { id: "spk.*", label: "📋 Surat Perintah Kerja (SPK)", desc: "Melihat dan mengelola penugasan SPK" },
  { id: "borongan.*", label: "⚖️ Setoran Borongan / Checker", desc: "Input hasil kerja harian/borongan dan verifikasi" },
  { id: "qc.*", label: "🔍 Quality Control (QC)", desc: "Pemeriksaan kualitas dan rework barang" },
  { id: "barang_keluar_gudang.*", label: "📦 Gudang & Logistik", desc: "Pengeluaran bahan, stok gudang & mutasi material" },
  { id: "absensi.*", label: "👥 Modul Absensi", desc: "Pencatatan dan verifikasi kehadiran harian" },
  { id: "kasbon.*", label: "💵 Modul Kasbon Kantor", desc: "Pencatatan pinjaman perusahaan dan cicilan" },
  { id: "warung.*", label: "🍜 Portal Warung Mitra", desc: "Pencatatan hutang makan pekerja" },
  { id: "laporan.*", label: "📊 Laporan & Monitoring", desc: "Melihat rekap laporan dan monitoring produksi" },
 
  { 
    id: "kas_kecil.view", 
    label: "🪙 Kas Kecil (Lihat Nota & Export)", 
    desc: "Bisa melihat buku kas kecil, foto nota belanja, filter periode, dan export Excel/PDF" 
  },
  { 
    id: "master_pekerja.view", 
    label: "🪪 Master Pekerja (Lihat Detail, KTP & Export)", 
    desc: "Bisa melihat direktori pekerja, rincian NIK, foto fisik KTP, dan export data (Read Only)" 
  },
];

export default async function Page({ searchParams }: Props) {
  const access = await requirePermission("access_control.view");
  const isAdmin = access.role.toUpperCase() === "ADMIN";
  const canWrite = isAdmin && (access.permissionCodes.includes("access_control.write") || access.permissionCodes.includes("*"));
  const q = await searchParams;
  const selectedUserId = param(q, "user");
  const s = await createClient();

  const [usersResult, rolesResult, workersResult, overridesResult] = await Promise.all([
    s.rpc("smpt_admin_user_directory"),
    s.rpc("smpt_admin_role_options"),
    s.from("workers")
      .select("id,worker_code,name,position,status,pay_system")
      .eq("status", "AKTIF")
      .order("name")
      .limit(1000),
    selectedUserId
      ? s
          .from("user_permission_overrides")
          .select("permission_pattern")
          .eq("user_id", selectedUserId)
          .eq("is_active", true)
          .eq("effect", "ALLOW")
      : Promise.resolve({ data: [] }),
  ]);

  const err = [usersResult.error, rolesResult.error, workersResult.error].find(Boolean);
  if (err) throw new Error(err.message);

  const users = (usersResult.data ?? []) as UserRow[];
  const roles = (rolesResult.data ?? []) as RoleRow[];
  const workers = (workersResult.data ?? []) as WorkerRow[];
  const selected = users.find((x) => x.user_id === selectedUserId) ?? null;
  const createRoles = roles.filter((r) => r.role_code !== "CHECKER");
  const editRoles = roles.filter((r) => r.role_code !== "CHECKER" || selected?.role_code === "CHECKER");
  const selectedOverrides = ((overridesResult.data ?? []) as any[]).map((x) => String(x.permission_pattern).toLowerCase());

  return (
    <PageShell
      eyebrow="Admin"
      title="Manajemen User & Hak Akses"
      description="ADMIN mengelola akun, username/display name, role preset, custom hak akses per modul, status akun, dan penghapusan akun permanen dari satu halaman."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />
      {!canWrite ? <ReadOnly /> : null}
      <Flow>
        Role adalah preset dasar. Anda dapat meng-<b>custom hak akses tambahan</b> secara bebas untuk setiap user (misalnya akun Operator Cutting yang juga diizinkan melihat Gaji Saya, atau Supervisor yang diizinkan mengelola Gudang). Semua akun yang dihubungkan ke data pekerja otomatis dapat melihat rincian gaji & kasbon mereka sendiri.
      </Flow>

      {canWrite ? (
        <Card title="Tambah User Login">
          <form action={createUserAccessAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Email Login">
              <input name="email" type="email" required autoComplete="off" className={inputClass} placeholder="nama@perusahaan.com" />
            </Field>
            <Field label="Username / Nama Tampilan">
              <input name="display_name" className={inputClass} placeholder="Contoh: Nedih" />
            </Field>
            <Field label="Role Utama">
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
        <Card title={`Atur Akun & Custom Role: ${selected.email}`}>
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
                placeholder="Contoh: Nedih"
              />
            </Field>
            <Field label="Role Utama">
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

            {/* Custom Role / Granular Permissions Checklist */}
            <div className="xl:col-span-4 mt-2 rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-5 shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">🛠️</span>
                <h4 className="text-sm font-extrabold text-indigo-950">
                  Kustomisasi Hak Akses / Permission Tambahan (Bisa Di-Custom Bebas)
                </h4>
              </div>
              <p className="text-xs text-indigo-800 mb-4 leading-relaxed">
                Anda dapat menambahkan modul tambahan di luar role utama user. Misalnya akun <b>Nedih (Role CUTTING)</b> bisa dicentang modul <b>💰 Gaji & Slip Pekerjaan Saya</b> agar Nedih dapat sekaligus memantau gaji & hutangnya saat login.
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {CUSTOM_MODULES.map((m) => {
                  const isChecked = selectedOverrides.includes(m.id.toLowerCase());
                  return (
                    <label
                      key={m.id}
                      className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer transition"
                    >
                      <input
                        type="checkbox"
                        name="custom_permissions"
                        value={m.id}
                        defaultChecked={isChecked}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="text-xs">
                        <div className="font-bold text-slate-800">{m.label}</div>
                        <div className="text-slate-500 text-[11px] leading-tight mt-0.5">{m.desc}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="xl:col-span-4 flex items-center gap-3 pt-2">
              <button className={buttonClass}>Simpan Perubahan User & Custom Role</button>
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
          <Empty>Klik "Atur" pada akun di tabel bawah untuk mengubah username, role utama, custom hak akses modul, link pekerja, password, atau menghapus akun.</Empty>
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
                        Atur & Custom
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
