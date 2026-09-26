import {
  Card,
  Notice,
  PageShell,
} from "@/components/final/final-ui";
import { getCurrentAccessContext } from "@/lib/access/current-user";
import { param, type SearchParams } from "@/lib/final/final-utils";
import { changeOwnPasswordAction } from "./actions";
import { ChangePasswordForm } from "./change-password-form";

type Props = { searchParams: Promise<SearchParams> };

export default async function Page({ searchParams }: Props) {
  const access = await getCurrentAccessContext();
  const q = await searchParams;

  return (
    <PageShell
      eyebrow="Akun"
      title="Akun Saya"
      description="Ganti password login Anda sendiri. Password baru tidak dapat dilihat kembali setelah disimpan."
    >
      <Notice success={param(q, "success")} error={param(q, "error")} />

      <Card title="Informasi Akun">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4 shadow-xs">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Nama</div>
            <div className="mt-1 text-base font-bold text-slate-900">{access.displayName}</div>
          </div>
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4 shadow-xs">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Email</div>
            <div className="mt-1 text-base font-bold text-slate-900">{access.email}</div>
          </div>
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/70 p-4 shadow-xs">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Role</div>
            <div className="mt-1 text-base font-bold text-blue-600">{access.role}</div>
          </div>
        </div>
      </Card>

      <Card title="Ganti Password Saya">
        <ChangePasswordForm action={changeOwnPasswordAction} />
      </Card>
    </PageShell>
  );
}
