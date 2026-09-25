-- ============================================================================
-- SMPT V2: KASBON MULTI-KATEGORI (WARUNG & PERUSAHAAN CICILAN),
--          INTEGRASI OTOMATIS SLIP GAJI / PAYROLL,
--          DAN PORTAL AKSES PEMILIK WARUNG
-- ============================================================================

-- 1. Penambahan Kolom Kategori & Angsuran pada tabel cash_advances
alter table public.cash_advances 
  add column if not exists category text not null default 'KASBON_PERUSAHAAN',
  add column if not exists warung_name text default null,
  add column if not exists installment_count integer not null default 1,
  add column if not exists installment_amount numeric(18,2) not null default 0,
  add column if not exists installments_paid integer not null default 0;

-- Pastikan data lama memiliki installment_amount terisi
update public.cash_advances
set installment_amount = amount
where (installment_amount is null or installment_amount = 0) and amount > 0;

-- 2. Penambahan Kolom Rincian Potongan & Lembur Manual pada payroll_run_items
alter table public.payroll_run_items
  add column if not exists kasbon_perusahaan_amount numeric(18,2) not null default 0,
  add column if not exists kasbon_warung_amount numeric(18,2) not null default 0,
  add column if not exists manual_overtime_hours numeric(18,2) not null default 0,
  add column if not exists manual_overtime_amount numeric(18,2) not null default 0;

-- 3. Penambahan Kolom Lembur Manual pada attendance_records
alter table public.attendance_records
  add column if not exists manual_overtime_hours numeric(18,2) not null default 0;

-- 4. Registrasi Role & Permission untuk Pemilik Warung
insert into public.roles (name, code)
select 'Pemilik Warung Luar', 'WARUNG'
where not exists (
  select 1 from public.roles where upper(coalesce(code, name)) = 'WARUNG'
);

insert into public.permissions (code, description) values
  ('warung.view', 'Melihat ringkasan hutang dan histori warung luar.'),
  ('warung.write', 'Mencatat hutang pekerja di warung luar.')
on conflict (code) do update set description = excluded.description;

-- Hubungkan permission ke role WARUNG
with preset(role_code, permission_code) as (
  values
    ('WARUNG', 'dashboard.view'),
    ('WARUNG', 'warung.view'),
    ('WARUNG', 'warung.write')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from preset x
join public.roles r on upper(coalesce(r.code, r.name)) = x.role_code
join public.permissions p on p.code = x.permission_code
on conflict do nothing;

-- ADMIN & MANAGER juga mendapatkan warung.view & warung.write
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where upper(coalesce(r.code, r.name)) = 'ADMIN'
  and p.code in ('warung.view', 'warung.write')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where upper(coalesce(r.code, r.name)) = 'MANAGER'
  and p.code = 'warung.view'
on conflict do nothing;

-- 5. Perbarui RLS Policy pada cash_advances agar Warung & Pekerja bisa akses sesuai porsinya
drop policy if exists advances_select on public.cash_advances;
create policy advances_select on public.cash_advances for select to authenticated
using (
  public.has_permission('kasbon.view')
  or upper(coalesce(public.current_user_role(),'')) = 'ADMIN'
  or (public.has_permission('warung.view') and category = 'KASBON_WARUNG')
  or (worker_id = public.smpt_current_worker_id())
);

drop policy if exists advances_write on public.cash_advances;
create policy advances_write on public.cash_advances for insert to authenticated
with check (
  public.has_permission('kasbon.write')
  or upper(coalesce(public.current_user_role(),'')) = 'ADMIN'
  or (public.has_permission('warung.write') and category = 'KASBON_WARUNG')
);

-- 6. RPC untuk mencatat hutang warung secara terisolasi dan aman
create or replace function public.record_warung_debt(
  p_worker_id bigint,
  p_amount numeric,
  p_warung_name text default null,
  p_date date default current_date,
  p_notes text default null
) returns bigint
language plpgsql security definer set search_path='' as $$
declare
  v_id bigint;
  v_warung text;
begin
  if not public.has_permission('warung.write') 
     and not public.has_permission('kasbon.write') 
     and upper(coalesce(public.current_user_role(),'')) <> 'ADMIN' then
    raise exception 'Tidak memiliki izin mencatat hutang warung.' using errcode='42501';
  end if;

  if p_worker_id is null or not exists(select 1 from public.workers where id = p_worker_id and status = 'AKTIF') then
    raise exception 'Pekerja tidak valid atau nonaktif.';
  end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Nominal hutang harus lebih besar dari 0.';
  end if;

  v_warung := coalesce(nullif(btrim(p_warung_name), ''), 'Warung Luar');

  insert into public.cash_advances (
    worker_id,
    advance_date,
    amount,
    paid_amount,
    category,
    warung_name,
    installment_count,
    installment_amount,
    installments_paid,
    status,
    notes,
    created_by
  ) values (
    p_worker_id,
    coalesce(p_date, current_date),
    p_amount,
    0,
    'KASBON_WARUNG',
    v_warung,
    1,
    p_amount,
    0,
    'AKTIF',
    p_notes,
    auth.uid()
  ) returning id into v_id;

  return v_id;
end $$;
revoke all on function public.record_warung_debt(bigint, numeric, text, date, text) from public;
grant execute on function public.record_warung_debt(bigint, numeric, text, date, text) to authenticated;

-- 7. Update pay_cash_advance untuk mendukung tracking cicilan
create or replace function public.pay_cash_advance(
  p_advance_id bigint,
  p_date date,
  p_amount numeric,
  p_source text default 'MANUAL',
  p_reference text default null,
  p_notes text default null
) returns bigint
language plpgsql security definer set search_path='' as $$
declare
  a public.cash_advances%rowtype;
  v_id bigint;
  v_new_paid numeric;
  v_new_status text;
  v_inc_inst int := 0;
begin
  if not public.has_permission('kasbon.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then
    raise exception 'Tidak memiliki izin Kasbon.' using errcode='42501';
  end if;

  select * into a from public.cash_advances where id = p_advance_id for update;
  if not found or a.status <> 'AKTIF' then
    raise exception 'Kasbon tidak aktif atau tidak ditemukan.';
  end if;

  if coalesce(p_amount, 0) <= 0 or (a.paid_amount + p_amount) > a.amount then
    raise exception 'Nominal pembayaran melebihi sisa Kasbon (%).', (a.amount - a.paid_amount);
  end if;

  v_new_paid := a.paid_amount + p_amount;
  v_new_status := case when v_new_paid >= a.amount then 'LUNAS' else 'AKTIF' end;
  v_inc_inst := case when a.installment_count > 1 then 1 else 0 end;

  insert into public.cash_advance_payments(
    advance_id, payment_date, amount, source, reference, notes, created_by
  ) values (
    p_advance_id, coalesce(p_date, current_date), p_amount, coalesce(p_source, 'MANUAL'), p_reference, p_notes, auth.uid()
  ) returning id into v_id;

  update public.cash_advances set
    paid_amount = v_new_paid,
    installments_paid = least(a.installment_count, a.installments_paid + v_inc_inst),
    status = v_new_status
  where id = p_advance_id;

  return v_id;
end $$;
revoke all on function public.pay_cash_advance(bigint, date, numeric, text, text, text) from public;
grant execute on function public.pay_cash_advance(bigint, date, numeric, text, text, text) to authenticated;

-- 8. RPC: get_worker_financial_summary untuk transparansi karyawan (cek hutang & estimasi gaji)
create or replace function public.get_worker_financial_summary(p_worker_id bigint default null)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_target_id bigint;
  w record;
  v_total_warung numeric := 0;
  v_total_perusahaan numeric := 0;
  v_cicilan_perusahaan numeric := 0;
  v_cur_month_start date := date_trunc('month', current_date)::date;
  v_cur_month_end date := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  v_full_days numeric := 0;
  v_half_days numeric := 0;
  v_ot_min int := 0;
  v_est_wage numeric := 0;
  v_warung_items jsonb;
  v_loan_items jsonb;
begin
  if p_worker_id is not null then
    v_target_id := p_worker_id;
  else
    v_target_id := public.smpt_current_worker_id();
  end if;

  if v_target_id is null then
    return jsonb_build_object('error', 'Pekerja tidak teridentifikasi');
  end if;

  select * into w from public.workers where id = v_target_id;
  if not found then
    return jsonb_build_object('error', 'Data pekerja tidak ditemukan');
  end if;

  -- 1. Hitung total hutang warung aktif
  select coalesce(sum(amount - paid_amount), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'advance_code', advance_code,
           'date', advance_date,
           'warung_name', coalesce(warung_name, 'Warung Luar'),
           'amount', amount,
           'remaining', amount - paid_amount,
           'notes', notes
         ) order by advance_date desc), '[]'::jsonb)
  into v_total_warung, v_warung_items
  from public.cash_advances
  where worker_id = v_target_id and status = 'AKTIF' and category = 'KASBON_WARUNG';

  -- 2. Hitung total sisa kasbon perusahaan & cicilan aktif bulan ini
  select coalesce(sum(amount - paid_amount), 0),
         coalesce(sum(least(case when installment_amount > 0 then installment_amount else (amount - paid_amount) end, amount - paid_amount)), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'advance_code', advance_code,
           'date', advance_date,
           'amount', amount,
           'remaining', amount - paid_amount,
           'installment_count', installment_count,
           'installment_amount', installment_amount,
           'installments_paid', installments_paid,
           'notes', notes
         ) order by advance_date desc), '[]'::jsonb)
  into v_total_perusahaan, v_cicilan_perusahaan, v_loan_items
  from public.cash_advances
  where worker_id = v_target_id and status = 'AKTIF' and category = 'KASBON_PERUSAHAAN';

  -- 3. Estimasi upah terkumpul bulan berjalan
  select coalesce(sum(case when day_class='FULL_DAY' and attendance_status='HADIR' then 1 else 0 end),0),
         coalesce(sum(case when day_class='HALF_DAY' and attendance_status='HADIR' then 1 else 0 end),0),
         coalesce(sum(overtime_minutes),0)
  into v_full_days, v_half_days, v_ot_min
  from public.attendance_records
  where worker_id = v_target_id and attendance_date between v_cur_month_start and current_date;

  if upper(coalesce(w.pay_system, '')) = 'BULANAN' then
    v_est_wage := coalesce(w.monthly_salary, 0);
  else
    v_est_wage := round((v_full_days * coalesce(w.daily_wage, 0) + v_half_days * coalesce(w.daily_wage, 0) * 0.5)::numeric, 2);
  end if;

  return jsonb_build_object(
    'worker_id', w.id,
    'worker_code', w.worker_code,
    'worker_name', w.name,
    'pay_system', w.pay_system,
    'total_debt_all', (v_total_warung + v_total_perusahaan),
    'total_warung_debt', v_total_warung,
    'total_company_loan_remaining', v_total_perusahaan,
    'monthly_company_installment', v_cicilan_perusahaan,
    'current_month_worked_days', v_full_days + (v_half_days * 0.5),
    'estimated_gross_wage', v_est_wage,
    'estimated_net_wage', greatest(0, v_est_wage - v_total_warung - v_cicilan_perusahaan),
    'warung_items', v_warung_items,
    'company_loan_items', v_loan_items
  );
end $$;
revoke all on function public.get_worker_financial_summary(bigint) from public;
grant execute on function public.get_worker_financial_summary(bigint) to authenticated;

notify pgrst, 'reload schema';
