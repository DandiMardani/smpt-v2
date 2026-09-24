-- SMPT V2 FINAL - Batch 5: Absensi, Payroll, Kasbon, Kas Kecil, Keuangan, Manufaktur

insert into public.permissions(code,description) values
('absensi.write','Input/verifikasi Absensi.'),('payroll.write','Finalisasi Payroll.'),('kasbon.write','Kelola Kasbon.'),('kas_kecil.write','Kelola Kas Kecil.'),('keuangan.write','Kelola transaksi Keuangan.')
on conflict(code) do update set description=excluded.description;

create sequence if not exists public.smpt_att_code_seq start with 1;
create sequence if not exists public.smpt_payroll_code_seq start with 1;
create sequence if not exists public.smpt_operator_payroll_seq start with 1;
create sequence if not exists public.smpt_advance_code_seq start with 1;
create sequence if not exists public.smpt_petty_code_seq start with 1;
create sequence if not exists public.smpt_finance_code_seq start with 1;
create sequence if not exists public.smpt_mfg_code_seq start with 1;

create table if not exists public.attendance_records (
  id bigint generated always as identity primary key,
  attendance_code text not null unique default ('ABS-'||lpad(nextval('public.smpt_att_code_seq')::text,8,'0')),
  worker_id bigint not null references public.workers(id) on delete restrict,
  attendance_date date not null,
  schedule_in time, schedule_out time, actual_in time, actual_out time,
  attendance_status text not null default 'HADIR' check(attendance_status in ('HADIR','IZIN','SAKIT','CUTI','ALPHA','LIBUR','DINAS_LUAR')),
  day_class text check(day_class is null or day_class in ('FULL_DAY','HALF_DAY')),
  overtime_minutes integer not null default 0 check(overtime_minutes>=0),
  verification_status text not null default 'DRAFT' check(verification_status in ('DRAFT','TERVERIFIKASI')),
  source text not null default 'MANUAL' check(source in ('MANUAL','FINGERPRINT_IMPORT')),
  source_file text,notes text, verified_by uuid references auth.users(id) on delete set null,verified_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(worker_id,attendance_date)
);
create index if not exists attendance_date_idx on public.attendance_records(attendance_date desc,worker_id);
do $$ begin if not exists(select 1 from pg_trigger where tgname='attendance_set_updated_at') then create trigger attendance_set_updated_at before update on public.attendance_records for each row execute function public.set_updated_at(); end if; end $$;

create table if not exists public.payroll_settings (
  key text primary key,value_numeric numeric(18,4),value_text text,description text,updated_by uuid references auth.users(id) on delete set null,updated_at timestamptz not null default now()
);
insert into public.payroll_settings(key,value_numeric,description) values
('MEAL_FULL',50000,'Uang makan BULANAN FULL DAY'),('MEAL_HALF',25000,'Uang makan BULANAN HALF DAY'),('OT_DIVISOR_HARIAN',8,'Tarif OT HARIAN = Upah Harian / divisor'),('OT_DIVISOR_BULANAN',190,'Tarif OT BULANAN = Gaji Bulanan / divisor'),('OT_BONUS_HARIAN_4H',5000,'Bonus OT >=4 jam HARIAN'),('OT_BONUS_BULANAN_4H',17500,'Bonus OT >=4 jam BULANAN'),('HARIAN_HOLIDAY_BONUS_FULL',20000,'Bonus HARIAN hari Minggu/libur FULL'),('HARIAN_HOLIDAY_BONUS_HALF',10000,'Bonus HARIAN hari Minggu/libur HALF') on conflict(key) do nothing;
insert into public.payroll_settings(key,value_text,description) values
('MEAL_POLICY_ALPHA','ZERO','Kebijakan uang makan ALPHA: FULL/HALF/ZERO/MANUAL'),('MEAL_POLICY_SAKIT','MANUAL','Kebijakan uang makan SAKIT'),('MEAL_POLICY_IZIN','MANUAL','Kebijakan uang makan IZIN'),('MEAL_POLICY_CUTI','MANUAL','Kebijakan uang makan CUTI'),('MEAL_POLICY_DINAS_LUAR','MANUAL','Kebijakan uang makan DINAS LUAR'),('MEAL_POLICY_LIBUR','ZERO','Kebijakan uang makan LIBUR'),('OT_BONUS_4H_MODE','MANUAL_REVIEW','Bonus OT >=4 jam: MANUAL_REVIEW/PER_HARI/PER_BULAN/NONAKTIF'),('BULANAN_HOLIDAY_MODE','MANUAL_REVIEW','Tambahan BULANAN hari libur: MANUAL_REVIEW/TANPA_TAMBAHAN'),('HARIAN_CUTOFF_MODE','MANUAL','Cutoff pembayaran HARIAN') on conflict(key) do nothing;

create table if not exists public.payroll_runs (
  id bigint generated always as identity primary key,
  payroll_code text not null unique default ('PAY-'||lpad(nextval('public.smpt_payroll_code_seq')::text,6,'0')),
  payroll_type text not null check(payroll_type in ('MINGGUAN','BULANAN')),
  period_start date not null,period_end date not null,status text not null default 'FINAL' check(status in ('DRAFT','FINAL','DIBATALKAN')),
  total_gross numeric(18,2) not null default 0,total_deduction numeric(18,2) not null default 0,total_net numeric(18,2) not null default 0,
  notes text,created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now(),finalized_at timestamptz,
  check(period_end>=period_start)
);
create table if not exists public.payroll_run_items (
  id bigint generated always as identity primary key,payroll_run_id bigint not null references public.payroll_runs(id) on delete restrict,worker_id bigint not null references public.workers(id) on delete restrict,
  worker_name_snapshot text not null,pay_system_snapshot text not null,daily_wage_snapshot numeric(18,2) not null default 0,monthly_salary_snapshot numeric(18,2) not null default 0,
  full_days numeric(18,2) not null default 0,half_days numeric(18,2) not null default 0,overtime_minutes integer not null default 0,
  base_amount numeric(18,2) not null default 0,meal_amount numeric(18,2) not null default 0,overtime_amount numeric(18,2) not null default 0,overtime_bonus numeric(18,2) not null default 0,
  deduction_amount numeric(18,2) not null default 0,net_amount numeric(18,2) not null default 0,created_at timestamptz not null default now(),unique(payroll_run_id,worker_id)
);

create table if not exists public.operator_payroll_runs (
  id bigint generated always as identity primary key,payroll_code text not null unique default ('OPR-'||lpad(nextval('public.smpt_operator_payroll_seq')::text,6,'0')),
  period_start date not null,period_end date not null,status text not null default 'FINAL' check(status in ('FINAL','DIBATALKAN')),
  total_operator_value numeric(18,2) not null default 0,total_submission_value numeric(18,2) not null default 0,notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now(),check(period_end>=period_start)
);
create table if not exists public.operator_payroll_items (
  id bigint generated always as identity primary key,run_id bigint not null references public.operator_payroll_runs(id) on delete restrict,worker_id bigint not null references public.workers(id) on delete restrict,
  work_item_id bigint not null references public.work_items(id) on delete restrict,worker_name_snapshot text not null,work_item_name_snapshot text not null,
  qty_approved numeric(18,4) not null,operator_price_snapshot numeric(18,2) not null,submission_price_snapshot numeric(18,2) not null,
  operator_value numeric(18,2) not null,submission_value numeric(18,2) not null,created_at timestamptz not null default now(),unique(run_id,worker_id,work_item_id,operator_price_snapshot,submission_price_snapshot)
);

create table if not exists public.cash_advances (
  id bigint generated always as identity primary key,advance_code text not null unique default ('KSB-'||lpad(nextval('public.smpt_advance_code_seq')::text,6,'0')),
  worker_id bigint not null references public.workers(id) on delete restrict,advance_date date not null default current_date,amount numeric(18,2) not null check(amount>0),
  paid_amount numeric(18,2) not null default 0 check(paid_amount>=0),status text not null default 'AKTIF' check(status in ('AKTIF','LUNAS','DIBATALKAN')),notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now()
);
create table if not exists public.cash_advance_payments (
  id bigint generated always as identity primary key,advance_id bigint not null references public.cash_advances(id) on delete restrict,payment_date date not null default current_date,amount numeric(18,2) not null check(amount>0),source text not null default 'MANUAL',reference text,notes text,created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now()
);

create table if not exists public.petty_cash_transactions (
  id bigint generated always as identity primary key,transaction_code text not null unique default ('KK-'||lpad(nextval('public.smpt_petty_code_seq')::text,7,'0')),
  transaction_date date not null default current_date,direction text not null check(direction in ('MASUK','KELUAR')),category text not null,amount numeric(18,2) not null check(amount>0),description text not null,document_no text,status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN')),created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now()
);

create table if not exists public.finance_transactions (
  id bigint generated always as identity primary key,transaction_code text not null unique default ('FIN-'||lpad(nextval('public.smpt_finance_code_seq')::text,7,'0')),
  transaction_date date not null default current_date,direction text not null check(direction in ('MASUK','KELUAR')),category text not null,amount numeric(18,2) not null check(amount>0),description text not null,reference_type text,reference_id bigint,document_no text,status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN')),created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now()
);

create table if not exists public.manufacturing_transactions (
  id bigint generated always as identity primary key,manufacturing_code text not null unique default ('MFG-'||lpad(nextval('public.smpt_mfg_code_seq')::text,7,'0')),
  transaction_date date not null default current_date,flow_type text not null check(flow_type in ('INTERNAL','TITIPAN','BARANG_LUAR','PENGIRIMAN')),
  project_id bigint references public.projects(id) on delete restrict,product_id bigint,material_id bigint references public.materials(id) on delete restrict,finished_good_id bigint references public.finished_goods(id) on delete restrict,vendor_id bigint references public.vendors(id) on delete restrict,
  quantity numeric(18,4) not null default 0 check(quantity>=0),unit text,document_no text,description text,status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN')),
  raw_stock_event_id bigint references public.stock_events(id) on delete restrict,logistics_event_id bigint references public.logistics_stock_events(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),created_at timestamptz not null default now(),
  foreign key(project_id,product_id) references public.project_products(project_id,id) on update restrict on delete restrict
);

create or replace function public.verify_attendance(p_attendance_id bigint,p_day_class text,p_overtime_minutes integer default 0,p_notes text default null) returns void
language plpgsql security definer set search_path='' as $$ begin
  if not public.has_permission('absensi.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Tidak memiliki izin verifikasi Absensi.' using errcode='42501';end if;
  if upper(coalesce(p_day_class,'')) not in ('FULL_DAY','HALF_DAY') then raise exception 'Klasifikasi hari harus FULL_DAY atau HALF_DAY.';end if;
  update public.attendance_records set day_class=upper(p_day_class),overtime_minutes=greatest(coalesce(p_overtime_minutes,0),0),verification_status='TERVERIFIKASI',notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),notes),verified_by=auth.uid(),verified_at=now() where id=p_attendance_id;
  if not found then raise exception 'Absensi tidak ditemukan.';end if;
end $$;
revoke all on function public.verify_attendance(bigint,text,integer,text) from public;grant execute on function public.verify_attendance(bigint,text,integer,text) to authenticated;

create or replace function public.finalize_general_payroll(p_type text,p_start date,p_end date,p_notes text default null) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_type text:=upper(btrim(p_type));v_run bigint;r record;v_full numeric;v_half numeric;v_ot int;v_base numeric;v_meal numeric;v_ot_amt numeric;v_bonus numeric;v_gross numeric;v_total numeric:=0;v_div numeric;v_bonus4 numeric;v_meal_full numeric;v_meal_half numeric;
begin
  if not public.has_permission('payroll.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Tidak memiliki izin Payroll.' using errcode='42501';end if;
  if v_type not in ('MINGGUAN','BULANAN') or p_start is null or p_end is null or p_end<p_start then raise exception 'Periode Payroll tidak valid.';end if;
  if exists(select 1 from public.payroll_runs where payroll_type=v_type and period_start=p_start and period_end=p_end and status<>'DIBATALKAN') then raise exception 'Payroll periode ini sudah ada.';end if;
  insert into public.payroll_runs(payroll_type,period_start,period_end,status,notes,finalized_at) values(v_type,p_start,p_end,'FINAL',p_notes,now()) returning id into v_run;
  select value_numeric into v_meal_full from public.payroll_settings where key='MEAL_FULL';select value_numeric into v_meal_half from public.payroll_settings where key='MEAL_HALF';
  for r in select * from public.workers w where w.status='AKTIF' and upper(coalesce(w.pay_system,''))=case when v_type='MINGGUAN' then 'HARIAN' else 'BULANAN' end loop
    select coalesce(sum(case when a.day_class='FULL_DAY' and a.attendance_status='HADIR' then 1 else 0 end),0),coalesce(sum(case when a.day_class='HALF_DAY' and a.attendance_status='HADIR' then 1 else 0 end),0),coalesce(sum(a.overtime_minutes),0)
      into v_full,v_half,v_ot from public.attendance_records a where a.worker_id=r.id and a.attendance_date between p_start and p_end and a.verification_status='TERVERIFIKASI';
    if v_type='MINGGUAN' then v_base:=round((v_full*r.daily_wage+v_half*r.daily_wage*0.5)::numeric,2);v_meal:=0;select value_numeric into v_div from public.payroll_settings where key='OT_DIVISOR_HARIAN';select value_numeric into v_bonus4 from public.payroll_settings where key='OT_BONUS_HARIAN_4H';
    else v_base:=r.monthly_salary;v_meal:=round((v_full*coalesce(v_meal_full,0)+v_half*coalesce(v_meal_half,0))::numeric,2);select value_numeric into v_div from public.payroll_settings where key='OT_DIVISOR_BULANAN';select value_numeric into v_bonus4 from public.payroll_settings where key='OT_BONUS_BULANAN_4H';end if;
    v_ot_amt:=round(((v_ot/60.0)*(case when v_type='MINGGUAN' then r.daily_wage else r.monthly_salary end)/greatest(coalesce(v_div,1),0.0001))::numeric,2);v_bonus:=case when v_ot>=240 then coalesce(v_bonus4,0) else 0 end;v_gross:=v_base+v_meal+v_ot_amt+v_bonus;
    insert into public.payroll_run_items(payroll_run_id,worker_id,worker_name_snapshot,pay_system_snapshot,daily_wage_snapshot,monthly_salary_snapshot,full_days,half_days,overtime_minutes,base_amount,meal_amount,overtime_amount,overtime_bonus,deduction_amount,net_amount)
    values(v_run,r.id,r.name,r.pay_system,r.daily_wage,r.monthly_salary,v_full,v_half,v_ot,v_base,v_meal,v_ot_amt,v_bonus,0,v_gross);v_total:=v_total+v_gross;
  end loop;
  update public.payroll_runs set total_gross=v_total,total_net=v_total where id=v_run;return v_run;
end $$;
revoke all on function public.finalize_general_payroll(text,date,date,text) from public;grant execute on function public.finalize_general_payroll(text,date,date,text) to authenticated;

create or replace function public.finalize_operator_payroll(p_start date,p_end date,p_notes text default null) returns bigint
language plpgsql security definer set search_path='' as $$ declare v_run bigint;r record;v_op numeric:=0;v_sub numeric:=0;begin
  if not public.has_permission('payroll.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Tidak memiliki izin Payroll Operator.' using errcode='42501';end if;if p_start is null or p_end is null or p_end<p_start then raise exception 'Periode tidak valid.';end if;
  insert into public.operator_payroll_runs(period_start,period_end,notes) values(p_start,p_end,p_notes) returning id into v_run;
  for r in select o.operator_worker_id worker_id,w.name worker_name,i.work_item_id,i.work_item_name_snapshot,sum(c.good_qty) qty,i.operator_price_snapshot,i.submission_price_snapshot
    from public.production_checks c join public.production_order_items i on i.id=c.order_item_id join public.production_orders o on o.id=i.order_id join public.workers w on w.id=o.operator_worker_id
    where c.status='AKTIF' and c.check_date between p_start and p_end group by o.operator_worker_id,w.name,i.work_item_id,i.work_item_name_snapshot,i.operator_price_snapshot,i.submission_price_snapshot loop
    insert into public.operator_payroll_items(run_id,worker_id,work_item_id,worker_name_snapshot,work_item_name_snapshot,qty_approved,operator_price_snapshot,submission_price_snapshot,operator_value,submission_value)
    values(v_run,r.worker_id,r.work_item_id,r.worker_name,r.work_item_name_snapshot,r.qty,r.operator_price_snapshot,r.submission_price_snapshot,round((r.qty*r.operator_price_snapshot)::numeric,2),round((r.qty*r.submission_price_snapshot)::numeric,2));v_op:=v_op+round((r.qty*r.operator_price_snapshot)::numeric,2);v_sub:=v_sub+round((r.qty*r.submission_price_snapshot)::numeric,2);
  end loop;
  update public.operator_payroll_runs set total_operator_value=v_op,total_submission_value=v_sub where id=v_run;return v_run;
end $$;
revoke all on function public.finalize_operator_payroll(date,date,text) from public;grant execute on function public.finalize_operator_payroll(date,date,text) to authenticated;

create or replace function public.pay_cash_advance(p_advance_id bigint,p_date date,p_amount numeric,p_source text default 'MANUAL',p_reference text default null,p_notes text default null) returns bigint
language plpgsql security definer set search_path='' as $$ declare a public.cash_advances%rowtype;v_id bigint;begin
  if not public.has_permission('kasbon.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Tidak memiliki izin Kasbon.' using errcode='42501';end if;select * into a from public.cash_advances where id=p_advance_id for update;if not found or a.status<>'AKTIF' then raise exception 'Kasbon tidak aktif.';end if;if coalesce(p_amount,0)<=0 or a.paid_amount+p_amount>a.amount then raise exception 'Nominal pembayaran melebihi sisa Kasbon (%).',a.amount-a.paid_amount;end if;
  insert into public.cash_advance_payments(advance_id,payment_date,amount,source,reference,notes) values(p_advance_id,coalesce(p_date,current_date),p_amount,coalesce(p_source,'MANUAL'),p_reference,p_notes) returning id into v_id;update public.cash_advances set paid_amount=paid_amount+p_amount,status=case when paid_amount+p_amount>=amount then 'LUNAS' else 'AKTIF' end where id=p_advance_id;return v_id;
end $$;
revoke all on function public.pay_cash_advance(bigint,date,numeric,text,text,text) from public;grant execute on function public.pay_cash_advance(bigint,date,numeric,text,text,text) to authenticated;

create or replace function public.record_manufacturing_transaction(p_flow_type text,p_date date,p_project_id bigint,p_product_id bigint,p_material_id bigint,p_finished_good_id bigint,p_vendor_id bigint,p_quantity numeric,p_unit text,p_document_no text,p_description text) returns bigint
language plpgsql security definer set search_path='' as $$ declare v_flow text:=upper(btrim(p_flow_type));v_perm text;v_id bigint;v_code text;v_event bigint;v_loc bigint;v_fg_unit text;begin
  v_perm:=case v_flow when 'TITIPAN' then 'manufaktur.titipan.write' when 'BARANG_LUAR' then 'manufaktur.barang_luar.write' when 'PENGIRIMAN' then 'manufaktur.pengiriman.write' else 'manufaktur.view' end;if v_flow='INTERNAL' then raise exception 'Flow INTERNAL bersifat monitoring dan tidak menerima input manual.';end if;if not public.has_permission(v_perm) and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Tidak memiliki izin Manufaktur.' using errcode='42501';end if;
  insert into public.manufacturing_transactions(transaction_date,flow_type,project_id,product_id,material_id,finished_good_id,vendor_id,quantity,unit,document_no,description) values(coalesce(p_date,current_date),v_flow,p_project_id,p_product_id,p_material_id,p_finished_good_id,p_vendor_id,coalesce(p_quantity,0),p_unit,p_document_no,p_description) returning id,manufacturing_code into v_id,v_code;
  -- TITIPAN adalah non-aset perusahaan. Dicatat di modul Manufaktur tetapi TIDAK mengubah stok Gudang internal.
  if v_flow='BARANG_LUAR' and p_finished_good_id is not null and p_quantity>0 then select id into v_loc from public.locations where name='PUSAT' limit 1;select unit into v_fg_unit from public.finished_goods where id=p_finished_good_id;v_event:=public.smpt_new_logistics_event('MANUFAKTUR BARANG LUAR','MANUFAKTUR',v_id,v_code,coalesce(p_date,current_date),p_description,null);perform public.smpt_apply_logistics_stock(v_event,'FINISHED_GOOD',p_finished_good_id,null,v_loc,p_quantity,v_fg_unit,'MANUFAKTUR MASUK',p_description);update public.manufacturing_transactions set logistics_event_id=v_event where id=v_id;end if;return v_id;
end $$;
revoke all on function public.record_manufacturing_transaction(text,date,bigint,bigint,bigint,bigint,bigint,numeric,text,text,text) from public;grant execute on function public.record_manufacturing_transaction(text,date,bigint,bigint,bigint,bigint,bigint,numeric,text,text,text) to authenticated;

-- ============================================================================
-- Payroll parity layer (V1.20 behavior guard)
-- Review keputusan ambigu disimpan terpisah, snapshot FINAL immutable.
-- ============================================================================

create table if not exists public.payroll_attendance_reviews (
  id bigint generated always as identity primary key,
  attendance_id bigint not null unique references public.attendance_records(id) on delete restrict,
  day_class text check(day_class is null or day_class in ('FULL_DAY','HALF_DAY')),
  overtime_review_status text check(overtime_review_status is null or overtime_review_status in ('DISETUJUI','DITOLAK')),
  overtime_candidate_snapshot integer not null default 0 check(overtime_candidate_snapshot>=0),
  overtime_approved_minutes integer not null default 0 check(overtime_approved_minutes>=0),
  meal_class text check(meal_class is null or meal_class in ('FULL','HALF','ZERO')),
  bonus_ot_review_status text check(bonus_ot_review_status is null or bonus_ot_review_status in ('DISETUJUI','DITOLAK')),
  is_holiday boolean not null default false,
  holiday_review_status text check(holiday_review_status is null or holiday_review_status in ('TANPA_TAMBAHAN','NOMINAL_MANUAL')),
  holiday_manual_amount numeric(18,2) not null default 0 check(holiday_manual_amount>=0),
  notes text,
  reviewed_by uuid references auth.users(id) on delete set null default auth.uid(),
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(overtime_approved_minutes<=overtime_candidate_snapshot)
);
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='payroll_attendance_reviews_set_updated_at') then
    create trigger payroll_attendance_reviews_set_updated_at before update on public.payroll_attendance_reviews for each row execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.attendance_month_closures (
  id bigint generated always as identity primary key,
  month_start date not null unique,
  status text not null default 'FINAL' check(status in ('FINAL','DIBATALKAN')),
  finalized_by uuid references auth.users(id) on delete set null default auth.uid(),
  finalized_at timestamptz not null default now(),
  notes text,
  check(month_start=date_trunc('month',month_start)::date)
);

alter table public.payroll_runs add column if not exists config_snapshot jsonb not null default '{}'::jsonb;
alter table public.payroll_runs add column if not exists snapshot_hash text;
alter table public.payroll_run_items add column if not exists holiday_bonus numeric(18,2) not null default 0;
alter table public.payroll_run_items add column if not exists holiday_manual_amount numeric(18,2) not null default 0;
alter table public.payroll_run_items add column if not exists pending_count integer not null default 0;

create table if not exists public.payroll_run_details (
  id bigint generated always as identity primary key,
  payroll_run_id bigint not null references public.payroll_runs(id) on delete restrict,
  attendance_id bigint not null references public.attendance_records(id) on delete restrict,
  worker_id bigint not null references public.workers(id) on delete restrict,
  attendance_date date not null,
  attendance_status text not null,
  day_class text,
  meal_class text,
  base_amount numeric(18,2) not null default 0,
  meal_amount numeric(18,2) not null default 0,
  overtime_candidate_minutes integer not null default 0,
  overtime_approved_minutes integer not null default 0,
  overtime_amount numeric(18,2) not null default 0,
  overtime_bonus numeric(18,2) not null default 0,
  is_holiday boolean not null default false,
  holiday_bonus numeric(18,2) not null default 0,
  holiday_manual_amount numeric(18,2) not null default 0,
  row_total numeric(18,2) not null default 0,
  source_hash text not null,
  created_at timestamptz not null default now(),
  unique(payroll_run_id,attendance_id)
);

create sequence if not exists public.smpt_payout_code_seq start with 1;
create sequence if not exists public.smpt_salary_submission_seq start with 1;

create table if not exists public.payroll_payouts (
  id bigint generated always as identity primary key,
  payout_code text not null unique default ('PYO-'||lpad(nextval('public.smpt_payout_code_seq')::text,7,'0')),
  payout_type text not null check(payout_type in ('MINGGUAN','BULANAN')),
  period_start date not null,
  period_end date not null,
  month_key text not null,
  status text not null default 'FINAL' check(status in ('FINAL','DIBATALKAN')),
  payment_status text not null default 'BELUM_DIBAYAR' check(payment_status in ('BELUM_DIBAYAR','SUDAH_DIBAYAR')),
  total_gross numeric(18,2) not null default 0,
  total_adjustment numeric(18,2) not null default 0,
  total_deduction numeric(18,2) not null default 0,
  total_net numeric(18,2) not null default 0,
  config_snapshot jsonb not null default '{}'::jsonb,
  snapshot_hash text not null,
  notes text,
  finalized_by uuid references auth.users(id) on delete set null default auth.uid(),
  finalized_at timestamptz not null default now(),
  paid_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  check(period_end>=period_start),
  unique(payout_type,period_start,period_end,status)
);

create table if not exists public.payroll_payout_details (
  id bigint generated always as identity primary key,
  payout_id bigint not null references public.payroll_payouts(id) on delete restrict,
  worker_id bigint not null references public.workers(id) on delete restrict,
  worker_name_snapshot text not null,
  department_snapshot text,
  identity_no_snapshot text,
  pay_system_snapshot text not null,
  daily_wage_snapshot numeric(18,2) not null default 0,
  monthly_salary_snapshot numeric(18,2) not null default 0,
  full_days numeric(18,2) not null default 0,
  half_days numeric(18,2) not null default 0,
  wage_salary_amount numeric(18,2) not null default 0,
  meal_amount numeric(18,2) not null default 0,
  overtime_minutes integer not null default 0,
  overtime_amount numeric(18,2) not null default 0,
  overtime_bonus numeric(18,2) not null default 0,
  holiday_bonus numeric(18,2) not null default 0,
  adjustment_amount numeric(18,2) not null default 0,
  deduction_amount numeric(18,2) not null default 0,
  total_paid numeric(18,2) not null default 0,
  friday_date date,
  friday_attendance_id bigint references public.attendance_records(id) on delete restrict,
  friday_provisional_amount numeric(18,2) not null default 0,
  source_hash text not null,
  created_at timestamptz not null default now(),
  unique(payout_id,worker_id)
);

create table if not exists public.payroll_payout_adjustments (
  id bigint generated always as identity primary key,
  source_payout_detail_id bigint not null unique references public.payroll_payout_details(id) on delete restrict,
  target_payout_id bigint not null references public.payroll_payouts(id) on delete restrict,
  worker_id bigint not null references public.workers(id) on delete restrict,
  source_friday date not null,
  provisional_amount numeric(18,2) not null,
  actual_amount numeric(18,2) not null,
  adjustment_amount numeric(18,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_payout_deductions (
  id bigint generated always as identity primary key,
  payout_id bigint not null references public.payroll_payouts(id) on delete restrict,
  worker_id bigint not null references public.workers(id) on delete restrict,
  cash_advance_id bigint not null references public.cash_advances(id) on delete restrict,
  amount numeric(18,2) not null check(amount>0),
  cash_advance_payment_id bigint references public.cash_advance_payments(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(payout_id,cash_advance_id)
);

create table if not exists public.salary_submissions (
  id bigint generated always as identity primary key,
  submission_code text not null unique default ('PGJ-'||lpad(nextval('public.smpt_salary_submission_seq')::text,7,'0')),
  payout_id bigint not null unique references public.payroll_payouts(id) on delete restrict,
  status text not null default 'SIAP_DIAJUKAN' check(status in ('SIAP_DIAJUKAN','DIBAYAR','DIBATALKAN')),
  total_workers integer not null default 0,
  total_gross numeric(18,2) not null default 0,
  total_deduction numeric(18,2) not null default 0,
  total_net numeric(18,2) not null default 0,
  snapshot_hash text not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  paid_by uuid references auth.users(id) on delete set null
);

create or replace function public.smpt_payroll_config_snapshot() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_object_agg(key,coalesce(to_jsonb(value_numeric),to_jsonb(value_text)))
  from public.payroll_settings
$$;
revoke all on function public.smpt_payroll_config_snapshot() from public;
grant execute on function public.smpt_payroll_config_snapshot() to authenticated;

create or replace function public.smpt_payroll_cfg_num(p_config jsonb,p_key text,p_default numeric) returns numeric
language sql immutable as $$
  select coalesce(nullif(p_config->>p_key,'')::numeric,p_default)
$$;
create or replace function public.smpt_payroll_cfg_text(p_config jsonb,p_key text,p_default text) returns text
language sql immutable as $$
  select upper(coalesce(nullif(p_config->>p_key,''),p_default))
$$;
revoke all on function public.smpt_payroll_cfg_num(jsonb,text,numeric) from public;
revoke all on function public.smpt_payroll_cfg_text(jsonb,text,text) from public;
grant execute on function public.smpt_payroll_cfg_num(jsonb,text,numeric),public.smpt_payroll_cfg_text(jsonb,text,text) to authenticated;

create or replace function public.review_payroll_attendance(
  p_attendance_id bigint,
  p_day_class text default null,
  p_overtime_review_status text default null,
  p_overtime_approved_minutes integer default 0,
  p_meal_class text default null,
  p_bonus_ot_review_status text default null,
  p_is_holiday boolean default false,
  p_holiday_review_status text default null,
  p_holiday_manual_amount numeric default 0,
  p_notes text default null
) returns void
language plpgsql security definer set search_path='' as $$
declare a public.attendance_records%rowtype;v_day text:=nullif(upper(btrim(coalesce(p_day_class,''))),'');v_ot text:=nullif(upper(btrim(coalesce(p_overtime_review_status,''))),'');v_meal text:=nullif(upper(btrim(coalesce(p_meal_class,''))),'');v_bonus text:=nullif(upper(btrim(coalesce(p_bonus_ot_review_status,''))),'');v_holiday text:=nullif(upper(btrim(coalesce(p_holiday_review_status,''))),'');
begin
  if not public.has_permission('payroll.write') and not public.has_permission('absensi.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Tidak memiliki izin review Payroll.' using errcode='42501'; end if;
  select * into a from public.attendance_records where id=p_attendance_id for update;
  if not found then raise exception 'Absensi tidak ditemukan.'; end if;
  if a.verification_status<>'TERVERIFIKASI' then raise exception 'Absensi harus TERVERIFIKASI sebelum review Payroll.'; end if;
  if v_day is not null and v_day not in ('FULL_DAY','HALF_DAY') then raise exception 'Klasifikasi hari tidak valid.'; end if;
  if v_ot is not null and v_ot not in ('DISETUJUI','DITOLAK') then raise exception 'Status review lembur tidak valid.'; end if;
  if v_meal is not null and v_meal not in ('FULL','HALF','ZERO') then raise exception 'Klasifikasi uang makan tidak valid.'; end if;
  if v_bonus is not null and v_bonus not in ('DISETUJUI','DITOLAK') then raise exception 'Status bonus OT tidak valid.'; end if;
  if v_holiday is not null and v_holiday not in ('TANPA_TAMBAHAN','NOMINAL_MANUAL') then raise exception 'Status hari libur tidak valid.'; end if;
  if coalesce(p_overtime_approved_minutes,0)<0 or coalesce(p_overtime_approved_minutes,0)>a.overtime_minutes then raise exception 'OT disetujui tidak boleh melebihi kandidat OT % menit.',a.overtime_minutes; end if;
  if v_ot='DITOLAK' then p_overtime_approved_minutes:=0; end if;
  if coalesce(p_holiday_manual_amount,0)<0 then raise exception 'Nominal hari libur tidak valid.'; end if;
  insert into public.payroll_attendance_reviews(attendance_id,day_class,overtime_review_status,overtime_candidate_snapshot,overtime_approved_minutes,meal_class,bonus_ot_review_status,is_holiday,holiday_review_status,holiday_manual_amount,notes,reviewed_by,reviewed_at)
  values(a.id,v_day,v_ot,a.overtime_minutes,coalesce(p_overtime_approved_minutes,0),v_meal,v_bonus,coalesce(p_is_holiday,false),v_holiday,coalesce(p_holiday_manual_amount,0),p_notes,auth.uid(),now())
  on conflict(attendance_id) do update set day_class=excluded.day_class,overtime_review_status=excluded.overtime_review_status,overtime_candidate_snapshot=excluded.overtime_candidate_snapshot,overtime_approved_minutes=excluded.overtime_approved_minutes,meal_class=excluded.meal_class,bonus_ot_review_status=excluded.bonus_ot_review_status,is_holiday=excluded.is_holiday,holiday_review_status=excluded.holiday_review_status,holiday_manual_amount=excluded.holiday_manual_amount,notes=excluded.notes,reviewed_by=auth.uid(),reviewed_at=now();
  update public.attendance_records set day_class=v_day where id=a.id;
end $$;
revoke all on function public.review_payroll_attendance(bigint,text,text,integer,text,text,boolean,text,numeric,text) from public;
grant execute on function public.review_payroll_attendance(bigint,text,text,integer,text,text,boolean,text,numeric,text) to authenticated;

create or replace function public.smpt_payroll_row_calc(
  p_attendance_id bigint,
  p_daily_wage numeric,
  p_monthly_salary numeric,
  p_pay_system text,
  p_config jsonb
) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.attendance_records%rowtype;r public.payroll_attendance_reviews%rowtype;v_system text:=upper(coalesce(p_pay_system,''));v_policy text;v_day text;v_meal text;v_ot_status text;v_bonus_status text;v_holiday_status text;v_candidate int;v_approved int;v_base numeric:=0;v_meal_amt numeric:=0;v_ot_amt numeric:=0;v_bonus numeric:=0;v_holiday_bonus numeric:=0;v_holiday_manual numeric:=0;v_div numeric;v_bonus_mode text;v_ready boolean:=true;v_message text:='';v_qualifies boolean:=false;
begin
  select * into a from public.attendance_records where id=p_attendance_id;
  if not found then return jsonb_build_object('ready',false,'message','Absensi tidak ditemukan.'); end if;
  if a.verification_status<>'TERVERIFIKASI' then return jsonb_build_object('ready',false,'message','Absensi belum TERVERIFIKASI.'); end if;
  select * into r from public.payroll_attendance_reviews where attendance_id=a.id;
  v_day:=coalesce(r.day_class,a.day_class);v_meal:=r.meal_class;v_ot_status:=r.overtime_review_status;v_bonus_status:=r.bonus_ot_review_status;v_holiday_status:=r.holiday_review_status;v_candidate:=coalesce(a.overtime_minutes,0);
  if a.attendance_status='HADIR' and v_day not in ('FULL_DAY','HALF_DAY') then v_ready:=false;v_message:='Klasifikasi FULL/HALF belum direview.'; end if;
  if v_ready and v_system='HARIAN' and a.attendance_status='HADIR' then
    v_base:=case when v_day='FULL_DAY' then coalesce(p_daily_wage,0) when v_day='HALF_DAY' then coalesce(p_daily_wage,0)/2 else 0 end;
    if coalesce(r.is_holiday,false) then v_holiday_bonus:=case when v_day='FULL_DAY' then public.smpt_payroll_cfg_num(p_config,'HARIAN_HOLIDAY_BONUS_FULL',20000) when v_day='HALF_DAY' then public.smpt_payroll_cfg_num(p_config,'HARIAN_HOLIDAY_BONUS_HALF',10000) else 0 end; end if;
  end if;
  if v_ready and v_system='BULANAN' then
    if a.attendance_status='HADIR' then v_meal:=case when v_day='FULL_DAY' then 'FULL' when v_day='HALF_DAY' then 'HALF' else null end;
    else
      v_policy:=public.smpt_payroll_cfg_text(p_config,'MEAL_POLICY_'||a.attendance_status,case when a.attendance_status='ALPHA' then 'ZERO' else 'MANUAL' end);
      if v_policy='MANUAL' and v_meal not in ('FULL','HALF','ZERO') then v_ready:=false;v_message:='Keputusan uang makan belum direview.'; else v_meal:=case when v_policy='MANUAL' then v_meal else v_policy end; end if;
    end if;
    if v_ready then v_meal_amt:=case v_meal when 'FULL' then public.smpt_payroll_cfg_num(p_config,'MEAL_FULL',50000) when 'HALF' then public.smpt_payroll_cfg_num(p_config,'MEAL_HALF',25000) else 0 end; end if;
  end if;
  if v_ready and v_candidate>0 then
    if r.id is null or r.overtime_candidate_snapshot<>v_candidate or v_ot_status not in ('DISETUJUI','DITOLAK') then v_ready:=false;v_message:='Review kandidat lembur belum selesai atau stale.';
    elsif v_ot_status='DISETUJUI' then v_approved:=least(v_candidate,coalesce(r.overtime_approved_minutes,0)); else v_approved:=0; end if;
  else v_approved:=0; end if;
  if v_ready and v_approved>0 then
    v_div:=case when v_system='HARIAN' then public.smpt_payroll_cfg_num(p_config,'OT_DIVISOR_HARIAN',8) else public.smpt_payroll_cfg_num(p_config,'OT_DIVISOR_BULANAN',190) end;
    v_ot_amt:=(v_approved/60.0)*(case when v_system='HARIAN' then coalesce(p_daily_wage,0) else coalesce(p_monthly_salary,0) end)/greatest(v_div,0.0001);
    v_qualifies:=v_approved>=240;v_bonus_mode:=public.smpt_payroll_cfg_text(p_config,'OT_BONUS_4H_MODE','MANUAL_REVIEW');
    if v_qualifies and v_bonus_mode='MANUAL_REVIEW' and v_bonus_status not in ('DISETUJUI','DITOLAK') then v_ready:=false;v_message:='Bonus OT >=4 jam belum direview.';
    elsif v_qualifies and (v_bonus_mode='PER_HARI' or (v_bonus_mode='MANUAL_REVIEW' and v_bonus_status='DISETUJUI')) then v_bonus:=case when v_system='HARIAN' then public.smpt_payroll_cfg_num(p_config,'OT_BONUS_HARIAN_4H',5000) else public.smpt_payroll_cfg_num(p_config,'OT_BONUS_BULANAN_4H',17500) end; end if;
  end if;
  if v_ready and v_system='BULANAN' and a.attendance_status='HADIR' and coalesce(r.is_holiday,false) and public.smpt_payroll_cfg_text(p_config,'BULANAN_HOLIDAY_MODE','MANUAL_REVIEW')='MANUAL_REVIEW' then
    if v_holiday_status not in ('TANPA_TAMBAHAN','NOMINAL_MANUAL') then v_ready:=false;v_message:='Hari libur BULANAN belum direview.';
    elsif v_holiday_status='NOMINAL_MANUAL' then v_holiday_manual:=coalesce(r.holiday_manual_amount,0); end if;
  end if;
  return jsonb_build_object('ready',v_ready,'message',v_message,'day_class',v_day,'meal_class',v_meal,'base_amount',round(v_base,2),'meal_amount',round(v_meal_amt,2),'overtime_candidate_minutes',v_candidate,'overtime_approved_minutes',coalesce(v_approved,0),'overtime_amount',round(v_ot_amt,2),'overtime_bonus',round(v_bonus,2),'is_holiday',coalesce(r.is_holiday,false),'holiday_bonus',round(v_holiday_bonus,2),'holiday_manual_amount',round(v_holiday_manual,2),'qualifies_4h',v_qualifies,'row_total',round(v_base+v_meal_amt+v_ot_amt+v_bonus+v_holiday_bonus+v_holiday_manual,2));
end $$;
revoke all on function public.smpt_payroll_row_calc(bigint,numeric,numeric,text,jsonb) from public;
grant execute on function public.smpt_payroll_row_calc(bigint,numeric,numeric,text,jsonb) to authenticated;

create or replace function public.finalize_attendance_month(p_month_start date,p_notes text default null) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_start date:=date_trunc('month',p_month_start)::date;v_end date:=(date_trunc('month',p_month_start)+interval '1 month - 1 day')::date;v_id bigint;a record;v_calc jsonb;v_config jsonb:=public.smpt_payroll_config_snapshot();
begin
  if not public.has_permission('absensi.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Tidak memiliki izin finalisasi Absensi.' using errcode='42501'; end if;
  if p_month_start is null or p_month_start<>v_start then raise exception 'Gunakan tanggal pertama bulan untuk finalisasi Absensi.'; end if;
  if exists(select 1 from public.attendance_month_closures where month_start=v_start and status='FINAL') then raise exception 'Absensi bulan ini sudah FINAL.'; end if;
  if exists(select 1 from public.attendance_records where attendance_date between v_start and v_end and verification_status<>'TERVERIFIKASI') then raise exception 'Masih ada Absensi yang belum TERVERIFIKASI.'; end if;
  for a in select ar.id,w.daily_wage,w.monthly_salary,w.pay_system,w.name from public.attendance_records ar join public.workers w on w.id=ar.worker_id where ar.attendance_date between v_start and v_end and w.status='AKTIF' and upper(coalesce(w.pay_system,'')) in ('HARIAN','BULANAN') loop
    v_calc:=public.smpt_payroll_row_calc(a.id,a.daily_wage,a.monthly_salary,a.pay_system,v_config);
    if coalesce((v_calc->>'ready')::boolean,false)=false then raise exception 'Review Payroll belum lengkap: % · %',a.name,coalesce(v_calc->>'message',''); end if;
  end loop;
  insert into public.attendance_month_closures(month_start,status,notes) values(v_start,'FINAL',p_notes) returning id into v_id;return v_id;
end $$;
revoke all on function public.finalize_attendance_month(date,text) from public;
grant execute on function public.finalize_attendance_month(date,text) to authenticated;

create or replace function public.finalize_general_payroll(p_type text,p_start date,p_end date,p_notes text default null) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_type text:=upper(btrim(coalesce(p_type,'')));v_run bigint;v_config jsonb:=public.smpt_payroll_config_snapshot();w record;a record;v_calc jsonb;v_full numeric;v_half numeric;v_ot int;v_base numeric;v_meal numeric;v_ot_amt numeric;v_bonus numeric;v_holiday numeric;v_manual numeric;v_total numeric:=0;v_bonus_mode text;v_has4 boolean;v_bonus_per_month numeric;v_hash text;
begin
  if not public.has_permission('payroll.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Tidak memiliki izin Payroll.' using errcode='42501'; end if;
  if v_type<>'BULANAN' then raise exception 'Finalisasi Payroll utama adalah BULANAN. Payout mingguan diproses terpisah Sabtu-Jumat.'; end if;
  if p_start is null or p_end is null or p_start<>date_trunc('month',p_start)::date or p_end<>(date_trunc('month',p_start)+interval '1 month - 1 day')::date then raise exception 'Periode Payroll BULANAN harus satu bulan kalender penuh.'; end if;
  if not exists(select 1 from public.attendance_month_closures where month_start=p_start and status='FINAL') then raise exception 'Absensi bulan ini belum FINAL.'; end if;
  if exists(select 1 from public.payroll_runs where payroll_type='BULANAN' and period_start=p_start and period_end=p_end and status<>'DIBATALKAN') then raise exception 'Payroll bulan ini sudah ada.'; end if;
  insert into public.payroll_runs(payroll_type,period_start,period_end,status,notes,finalized_at,config_snapshot) values('BULANAN',p_start,p_end,'FINAL',p_notes,now(),v_config) returning id into v_run;
  for w in select * from public.workers where status='AKTIF' and upper(coalesce(pay_system,'')) in ('HARIAN','BULANAN') order by id loop
    v_full:=0;v_half:=0;v_ot:=0;v_base:=0;v_meal:=0;v_ot_amt:=0;v_bonus:=0;v_holiday:=0;v_manual:=0;v_has4:=false;
    for a in select ar.* from public.attendance_records ar where ar.worker_id=w.id and ar.attendance_date between p_start and p_end order by ar.attendance_date,ar.id loop
      v_calc:=public.smpt_payroll_row_calc(a.id,w.daily_wage,w.monthly_salary,w.pay_system,v_config);
      if coalesce((v_calc->>'ready')::boolean,false)=false then raise exception 'Payroll belum siap: % · % · %',w.name,a.attendance_date,coalesce(v_calc->>'message',''); end if;
      if v_calc->>'day_class'='FULL_DAY' and a.attendance_status='HADIR' then v_full:=v_full+1; elsif v_calc->>'day_class'='HALF_DAY' and a.attendance_status='HADIR' then v_half:=v_half+1; end if;
      v_base:=v_base+coalesce((v_calc->>'base_amount')::numeric,0);v_meal:=v_meal+coalesce((v_calc->>'meal_amount')::numeric,0);v_ot:=v_ot+coalesce((v_calc->>'overtime_approved_minutes')::int,0);v_ot_amt:=v_ot_amt+coalesce((v_calc->>'overtime_amount')::numeric,0);v_bonus:=v_bonus+coalesce((v_calc->>'overtime_bonus')::numeric,0);v_holiday:=v_holiday+coalesce((v_calc->>'holiday_bonus')::numeric,0);v_manual:=v_manual+coalesce((v_calc->>'holiday_manual_amount')::numeric,0);v_has4:=v_has4 or coalesce((v_calc->>'qualifies_4h')::boolean,false);
      insert into public.payroll_run_details(payroll_run_id,attendance_id,worker_id,attendance_date,attendance_status,day_class,meal_class,base_amount,meal_amount,overtime_candidate_minutes,overtime_approved_minutes,overtime_amount,overtime_bonus,is_holiday,holiday_bonus,holiday_manual_amount,row_total,source_hash)
      values(v_run,a.id,w.id,a.attendance_date,a.attendance_status,v_calc->>'day_class',v_calc->>'meal_class',coalesce((v_calc->>'base_amount')::numeric,0),coalesce((v_calc->>'meal_amount')::numeric,0),coalesce((v_calc->>'overtime_candidate_minutes')::int,0),coalesce((v_calc->>'overtime_approved_minutes')::int,0),coalesce((v_calc->>'overtime_amount')::numeric,0),coalesce((v_calc->>'overtime_bonus')::numeric,0),coalesce((v_calc->>'is_holiday')::boolean,false),coalesce((v_calc->>'holiday_bonus')::numeric,0),coalesce((v_calc->>'holiday_manual_amount')::numeric,0),coalesce((v_calc->>'row_total')::numeric,0),md5(concat_ws('|',a.id,a.updated_at,v_calc::text)));
    end loop;
    if upper(w.pay_system)='BULANAN' then v_base:=coalesce(w.monthly_salary,0); end if;
    v_bonus_mode:=public.smpt_payroll_cfg_text(v_config,'OT_BONUS_4H_MODE','MANUAL_REVIEW');
    if v_has4 and v_bonus_mode='PER_BULAN' then v_bonus_per_month:=case when upper(w.pay_system)='HARIAN' then public.smpt_payroll_cfg_num(v_config,'OT_BONUS_HARIAN_4H',5000) else public.smpt_payroll_cfg_num(v_config,'OT_BONUS_BULANAN_4H',17500) end;v_bonus:=v_bonus+v_bonus_per_month; end if;
    insert into public.payroll_run_items(payroll_run_id,worker_id,worker_name_snapshot,pay_system_snapshot,daily_wage_snapshot,monthly_salary_snapshot,full_days,half_days,overtime_minutes,base_amount,meal_amount,overtime_amount,overtime_bonus,holiday_bonus,holiday_manual_amount,deduction_amount,net_amount,pending_count)
    values(v_run,w.id,w.name,upper(w.pay_system),w.daily_wage,w.monthly_salary,v_full,v_half,v_ot,round(v_base,2),round(v_meal,2),round(v_ot_amt,2),round(v_bonus,2),round(v_holiday,2),round(v_manual,2),0,round(v_base+v_meal+v_ot_amt+v_bonus+v_holiday+v_manual,2),0);
    v_total:=v_total+round(v_base+v_meal+v_ot_amt+v_bonus+v_holiday+v_manual,2);
  end loop;
  select md5(coalesce(string_agg(concat_ws('|',worker_id,net_amount),',' order by worker_id),'')) into v_hash from public.payroll_run_items where payroll_run_id=v_run;
  update public.payroll_runs set total_gross=v_total,total_net=v_total,snapshot_hash=v_hash where id=v_run;return v_run;
end $$;
revoke all on function public.finalize_general_payroll(text,date,date,text) from public;
grant execute on function public.finalize_general_payroll(text,date,date,text) to authenticated;

create or replace function public.smpt_payroll_weekly_component(p_attendance_id bigint,p_daily numeric,p_monthly numeric,p_system text,p_config jsonb) returns numeric
language plpgsql stable security definer set search_path='' as $$
declare c jsonb;begin c:=public.smpt_payroll_row_calc(p_attendance_id,p_daily,p_monthly,p_system,p_config);if coalesce((c->>'ready')::boolean,false)=false then raise exception '%',coalesce(c->>'message','Review Payroll belum lengkap.');end if;if upper(p_system)='HARIAN' then return coalesce((c->>'base_amount')::numeric,0)+coalesce((c->>'overtime_amount')::numeric,0)+coalesce((c->>'overtime_bonus')::numeric,0)+coalesce((c->>'holiday_bonus')::numeric,0);else return coalesce((c->>'meal_amount')::numeric,0);end if;end $$;
revoke all on function public.smpt_payroll_weekly_component(bigint,numeric,numeric,text,jsonb) from public;
grant execute on function public.smpt_payroll_weekly_component(bigint,numeric,numeric,text,jsonb) to authenticated;

create or replace function public.finalize_payroll_payout(p_type text,p_start date,p_end date,p_notes text default null) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_type text:=upper(btrim(coalesce(p_type,'')));v_payout bigint;v_config jsonb:=public.smpt_payroll_config_snapshot();w record;a record;d record;src record;v_calc jsonb;v_full numeric;v_half numeric;v_wage numeric;v_meal numeric;v_ot int;v_ot_amt numeric;v_bonus numeric;v_holiday numeric;v_adj numeric;v_gross numeric;v_total_gross numeric:=0;v_total_adj numeric:=0;v_hash text;v_friday_att bigint;v_friday_prov numeric;v_actual numeric;v_month_start date;v_month_end date;v_month_run bigint;
begin
  if not public.has_permission('payroll.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Tidak memiliki izin Payroll.' using errcode='42501'; end if;
  if v_type not in ('MINGGUAN','BULANAN') or p_start is null or p_end is null or p_end<p_start then raise exception 'Periode payout tidak valid.'; end if;
  if exists(select 1 from public.payroll_payouts where payout_type=v_type and period_start=p_start and period_end=p_end and status='FINAL') then raise exception 'Payout periode ini sudah FINAL.'; end if;
  if v_type='MINGGUAN' then
    if p_end-p_start<>6 or extract(isodow from p_end)<>5 then raise exception 'Payout MINGGUAN harus Sabtu-Jumat (7 hari, berakhir Jumat).'; end if;
  else
    v_month_start:=date_trunc('month',p_start)::date;v_month_end:=(date_trunc('month',p_start)+interval '1 month - 1 day')::date;
    if p_start<>v_month_start or p_end<>v_month_end then raise exception 'Payout BULANAN harus satu bulan kalender penuh.'; end if;
    select id into v_month_run from public.payroll_runs where payroll_type='BULANAN' and period_start=p_start and period_end=p_end and status='FINAL' order by id desc limit 1;
    if v_month_run is null then raise exception 'Payroll BULANAN harus FINAL sebelum payout bulanan.'; end if;
  end if;
  insert into public.payroll_payouts(payout_type,period_start,period_end,month_key,status,payment_status,config_snapshot,snapshot_hash,notes) values(v_type,p_start,p_end,to_char(p_end,'YYYY-MM'),'FINAL','BELUM_DIBAYAR',v_config,'PENDING',p_notes) returning id into v_payout;
  if v_type='MINGGUAN' then
    for w in select * from public.workers where status='AKTIF' and upper(coalesce(pay_system,'')) in ('HARIAN','BULANAN') order by id loop
      v_full:=0;v_half:=0;v_wage:=0;v_meal:=0;v_ot:=0;v_ot_amt:=0;v_bonus:=0;v_holiday:=0;v_adj:=0;v_friday_att:=null;v_friday_prov:=0;
      for a in select ar.* from public.attendance_records ar where ar.worker_id=w.id and ar.attendance_date between p_start and p_end order by ar.attendance_date,ar.id loop
        if a.attendance_date=p_end then
          if a.attendance_status='HADIR' and a.actual_in is not null then
            v_friday_att:=a.id;if upper(w.pay_system)='HARIAN' then v_friday_prov:=coalesce(w.daily_wage,0);v_wage:=v_wage+v_friday_prov;v_full:=v_full+1;else v_friday_prov:=public.smpt_payroll_cfg_num(v_config,'MEAL_FULL',50000);v_meal:=v_meal+v_friday_prov;v_full:=v_full+1;end if;
          end if;
        else
          v_calc:=public.smpt_payroll_row_calc(a.id,w.daily_wage,w.monthly_salary,w.pay_system,v_config);if coalesce((v_calc->>'ready')::boolean,false)=false then raise exception 'Payout belum siap: % · % · %',w.name,a.attendance_date,coalesce(v_calc->>'message','');end if;
          if a.attendance_status='HADIR' and v_calc->>'day_class'='FULL_DAY' then v_full:=v_full+1;elsif a.attendance_status='HADIR' and v_calc->>'day_class'='HALF_DAY' then v_half:=v_half+1;end if;
          if upper(w.pay_system)='HARIAN' then v_wage:=v_wage+coalesce((v_calc->>'base_amount')::numeric,0);v_ot:=v_ot+coalesce((v_calc->>'overtime_approved_minutes')::int,0);v_ot_amt:=v_ot_amt+coalesce((v_calc->>'overtime_amount')::numeric,0);v_bonus:=v_bonus+coalesce((v_calc->>'overtime_bonus')::numeric,0);v_holiday:=v_holiday+coalesce((v_calc->>'holiday_bonus')::numeric,0);else v_meal:=v_meal+coalesce((v_calc->>'meal_amount')::numeric,0);end if;
        end if;
      end loop;
      for src in select pd.*,p.config_snapshot from public.payroll_payout_details pd join public.payroll_payouts p on p.id=pd.payout_id left join public.payroll_payout_adjustments pa on pa.source_payout_detail_id=pd.id where pd.worker_id=w.id and pd.friday_attendance_id is not null and p.payout_type='MINGGUAN' and p.status='FINAL' and p.period_end<p_start and pa.id is null order by p.period_end loop
        begin
          v_actual:=public.smpt_payroll_weekly_component(src.friday_attendance_id,src.daily_wage_snapshot,src.monthly_salary_snapshot,src.pay_system_snapshot,src.config_snapshot);v_adj:=v_adj+(v_actual-src.friday_provisional_amount);
          insert into public.payroll_payout_adjustments(source_payout_detail_id,target_payout_id,worker_id,source_friday,provisional_amount,actual_amount,adjustment_amount) values(src.id,v_payout,w.id,src.friday_date,src.friday_provisional_amount,v_actual,v_actual-src.friday_provisional_amount);
        exception when others then raise exception 'Penyesuaian Jumat belum siap untuk %: %',w.name,sqlerrm; end;
      end loop;
      v_gross:=round(v_wage+v_meal+v_ot_amt+v_bonus+v_holiday+v_adj,2);
      insert into public.payroll_payout_details(payout_id,worker_id,worker_name_snapshot,department_snapshot,identity_no_snapshot,pay_system_snapshot,daily_wage_snapshot,monthly_salary_snapshot,full_days,half_days,wage_salary_amount,meal_amount,overtime_minutes,overtime_amount,overtime_bonus,holiday_bonus,adjustment_amount,deduction_amount,total_paid,friday_date,friday_attendance_id,friday_provisional_amount,source_hash)
      values(v_payout,w.id,w.name,w.department,w.identity_no,upper(w.pay_system),w.daily_wage,w.monthly_salary,v_full,v_half,round(v_wage,2),round(v_meal,2),v_ot,round(v_ot_amt,2),round(v_bonus,2),round(v_holiday,2),round(v_adj,2),0,v_gross,p_end,v_friday_att,round(v_friday_prov,2),md5(concat_ws('|',v_payout,w.id,v_full,v_half,v_wage,v_meal,v_ot,v_ot_amt,v_bonus,v_holiday,v_adj,v_friday_att,v_friday_prov)));
      v_total_gross:=v_total_gross+round(v_wage+v_meal+v_ot_amt+v_bonus+v_holiday,2);v_total_adj:=v_total_adj+round(v_adj,2);
    end loop;
  else
    for d in select pri.*,w.department,w.identity_no from public.payroll_run_items pri join public.workers w on w.id=pri.worker_id where pri.payroll_run_id=v_month_run and upper(pri.pay_system_snapshot)='BULANAN' order by pri.worker_id loop
      v_gross:=round(d.base_amount+d.overtime_amount+d.overtime_bonus+d.holiday_bonus+d.holiday_manual_amount,2);
      insert into public.payroll_payout_details(payout_id,worker_id,worker_name_snapshot,department_snapshot,identity_no_snapshot,pay_system_snapshot,daily_wage_snapshot,monthly_salary_snapshot,full_days,half_days,wage_salary_amount,meal_amount,overtime_minutes,overtime_amount,overtime_bonus,holiday_bonus,adjustment_amount,deduction_amount,total_paid,source_hash)
      values(v_payout,d.worker_id,d.worker_name_snapshot,d.department,d.identity_no,d.pay_system_snapshot,d.daily_wage_snapshot,d.monthly_salary_snapshot,d.full_days,d.half_days,d.base_amount,0,d.overtime_minutes,d.overtime_amount,d.overtime_bonus,d.holiday_bonus+d.holiday_manual_amount,0,0,v_gross,md5(concat_ws('|',v_payout,d.worker_id,v_gross)));
      v_total_gross:=v_total_gross+v_gross;
    end loop;
  end if;
  select md5(coalesce(string_agg(source_hash,',' order by worker_id),'')) into v_hash from public.payroll_payout_details where payout_id=v_payout;
  update public.payroll_payouts set total_gross=v_total_gross,total_adjustment=v_total_adj,total_net=v_total_gross+v_total_adj,snapshot_hash=v_hash where id=v_payout;
  insert into public.salary_submissions(payout_id,total_workers,total_gross,total_deduction,total_net,snapshot_hash) select v_payout,count(*),v_total_gross,0,v_total_gross+v_total_adj,v_hash from public.payroll_payout_details where payout_id=v_payout;
  return v_payout;
end $$;
revoke all on function public.finalize_payroll_payout(text,date,date,text) from public;
grant execute on function public.finalize_payroll_payout(text,date,date,text) to authenticated;

create or replace function public.mark_payroll_payout_paid(p_payout_id bigint) returns void
language plpgsql security definer set search_path='' as $$
declare p public.payroll_payouts%rowtype;d record;v_payment bigint;
begin
  if not public.has_permission('payroll.write') and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Tidak memiliki izin Payroll.' using errcode='42501'; end if;
  select * into p from public.payroll_payouts where id=p_payout_id for update;if not found or p.status<>'FINAL' then raise exception 'Payout FINAL tidak ditemukan.';end if;if p.payment_status='SUDAH_DIBAYAR' then return;end if;
  for d in select * from public.payroll_payout_deductions where payout_id=p.id and cash_advance_payment_id is null order by id loop
    v_payment:=public.pay_cash_advance(d.cash_advance_id,current_date,d.amount,case when p.payout_type='MINGGUAN' then 'PAYROLL_HARIAN' else 'PAYROLL_BULANAN' end,p.payout_code,'Potongan payout '||p.payout_code);update public.payroll_payout_deductions set cash_advance_payment_id=v_payment where id=d.id;
  end loop;
  update public.payroll_payouts set payment_status='SUDAH_DIBAYAR',paid_by=auth.uid(),paid_at=now() where id=p.id;update public.salary_submissions set status='DIBAYAR',paid_by=auth.uid(),paid_at=now() where payout_id=p.id;
end $$;
revoke all on function public.mark_payroll_payout_paid(bigint) from public;
grant execute on function public.mark_payroll_payout_paid(bigint) to authenticated;


-- RLS
alter table public.attendance_records enable row level security;alter table public.payroll_attendance_reviews enable row level security;alter table public.attendance_month_closures enable row level security;alter table public.payroll_settings enable row level security;alter table public.payroll_runs enable row level security;alter table public.payroll_run_items enable row level security;alter table public.payroll_run_details enable row level security;alter table public.payroll_payouts enable row level security;alter table public.payroll_payout_details enable row level security;alter table public.payroll_payout_adjustments enable row level security;alter table public.payroll_payout_deductions enable row level security;alter table public.salary_submissions enable row level security;alter table public.operator_payroll_runs enable row level security;alter table public.operator_payroll_items enable row level security;alter table public.cash_advances enable row level security;alter table public.cash_advance_payments enable row level security;alter table public.petty_cash_transactions enable row level security;alter table public.finance_transactions enable row level security;alter table public.manufacturing_transactions enable row level security;

drop policy if exists attendance_select on public.attendance_records;create policy attendance_select on public.attendance_records for select to authenticated using(public.has_permission('absensi.view'));
drop policy if exists attendance_write on public.attendance_records;create policy attendance_write on public.attendance_records for all to authenticated using(public.has_permission('absensi.write') or upper(coalesce(public.current_user_role(),''))='ADMIN') with check(public.has_permission('absensi.write') or upper(coalesce(public.current_user_role(),''))='ADMIN');
drop policy if exists payroll_reviews_select on public.payroll_attendance_reviews;create policy payroll_reviews_select on public.payroll_attendance_reviews for select to authenticated using(public.has_permission('payroll.view') or public.has_permission('absensi.view'));
drop policy if exists month_closures_select on public.attendance_month_closures;create policy month_closures_select on public.attendance_month_closures for select to authenticated using(public.has_permission('payroll.view') or public.has_permission('absensi.view'));
drop policy if exists payroll_settings_select on public.payroll_settings;create policy payroll_settings_select on public.payroll_settings for select to authenticated using(public.has_permission('payroll.view'));
drop policy if exists payroll_runs_select on public.payroll_runs;create policy payroll_runs_select on public.payroll_runs for select to authenticated using(public.has_permission('payroll.view'));
drop policy if exists payroll_items_select on public.payroll_run_items;create policy payroll_items_select on public.payroll_run_items for select to authenticated using(public.has_permission('payroll.view'));
drop policy if exists payroll_details_select on public.payroll_run_details;create policy payroll_details_select on public.payroll_run_details for select to authenticated using(public.has_permission('payroll.view'));
drop policy if exists payroll_payouts_select on public.payroll_payouts;create policy payroll_payouts_select on public.payroll_payouts for select to authenticated using(public.has_permission('payroll.view'));
drop policy if exists payroll_payout_details_select on public.payroll_payout_details;create policy payroll_payout_details_select on public.payroll_payout_details for select to authenticated using(public.has_permission('payroll.view'));
drop policy if exists payroll_payout_adjustments_select on public.payroll_payout_adjustments;create policy payroll_payout_adjustments_select on public.payroll_payout_adjustments for select to authenticated using(public.has_permission('payroll.view'));
drop policy if exists payroll_payout_deductions_select on public.payroll_payout_deductions;create policy payroll_payout_deductions_select on public.payroll_payout_deductions for select to authenticated using(public.has_permission('payroll.view'));
drop policy if exists salary_submissions_select on public.salary_submissions;create policy salary_submissions_select on public.salary_submissions for select to authenticated using(public.has_permission('payroll.view'));
drop policy if exists op_payroll_runs_select on public.operator_payroll_runs;create policy op_payroll_runs_select on public.operator_payroll_runs for select to authenticated using(public.has_permission('payroll.operator.view') or public.has_permission('payroll.view'));
drop policy if exists op_payroll_items_select on public.operator_payroll_items;create policy op_payroll_items_select on public.operator_payroll_items for select to authenticated using(public.has_permission('payroll.operator.view') or public.has_permission('payroll.view'));
drop policy if exists advances_select on public.cash_advances;create policy advances_select on public.cash_advances for select to authenticated using(public.has_permission('kasbon.view'));
drop policy if exists advances_write on public.cash_advances;create policy advances_write on public.cash_advances for insert to authenticated with check(public.has_permission('kasbon.write') or upper(coalesce(public.current_user_role(),''))='ADMIN');
drop policy if exists advance_payments_select on public.cash_advance_payments;create policy advance_payments_select on public.cash_advance_payments for select to authenticated using(public.has_permission('kasbon.view'));
drop policy if exists petty_select on public.petty_cash_transactions;create policy petty_select on public.petty_cash_transactions for select to authenticated using(public.has_permission('kas_kecil.view'));
drop policy if exists petty_write on public.petty_cash_transactions;create policy petty_write on public.petty_cash_transactions for insert to authenticated with check(public.has_permission('kas_kecil.write') or upper(coalesce(public.current_user_role(),''))='ADMIN');
drop policy if exists finance_select on public.finance_transactions;create policy finance_select on public.finance_transactions for select to authenticated using(public.has_permission('keuangan.view') or public.has_permission('laporan.view'));
drop policy if exists finance_write on public.finance_transactions;create policy finance_write on public.finance_transactions for insert to authenticated with check(public.has_permission('keuangan.write') or upper(coalesce(public.current_user_role(),''))='ADMIN');
drop policy if exists mfg_select on public.manufacturing_transactions;create policy mfg_select on public.manufacturing_transactions for select to authenticated using(public.has_permission('manufaktur.view'));

grant select,insert,update on public.attendance_records to authenticated;grant select on public.payroll_attendance_reviews,public.attendance_month_closures,public.payroll_settings,public.payroll_runs,public.payroll_run_items,public.payroll_run_details,public.payroll_payouts,public.payroll_payout_details,public.payroll_payout_adjustments,public.payroll_payout_deductions,public.salary_submissions,public.operator_payroll_runs,public.operator_payroll_items,public.cash_advance_payments,public.manufacturing_transactions to authenticated;grant select,insert on public.cash_advances,public.petty_cash_transactions,public.finance_transactions to authenticated;

grant usage,select on sequence public.attendance_records_id_seq,public.cash_advances_id_seq,public.petty_cash_transactions_id_seq,public.finance_transactions_id_seq,public.smpt_att_code_seq,public.smpt_advance_code_seq,public.smpt_petty_code_seq,public.smpt_finance_code_seq to authenticated;
