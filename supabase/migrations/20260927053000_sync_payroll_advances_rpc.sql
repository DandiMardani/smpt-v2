-- Migration: 20260927053000_sync_payroll_advances_rpc.sql
-- Fungsi untuk menyinkronkan ulang kasbon kantor dan kasbon warung ke slip gaji payroll yang sudah dibuat

create or replace function public.smpt_sync_payroll_run_advances(p_run_id bigint)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item record;
  v_kasbon_p numeric;
  v_kasbon_w numeric;
  v_deduction numeric;
  v_gross numeric;
  v_net numeric;
  v_run_gross numeric := 0;
  v_run_deduction numeric := 0;
  v_run_net numeric := 0;
  v_updated_count int := 0;
begin
  if auth.uid() is not null 
     and not public.has_permission('payroll.write') 
     and upper(coalesce(public.current_user_role(),'')) <> 'ADMIN' then
    raise exception 'Tidak memiliki izin Payroll.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.payroll_runs where id = p_run_id) then
    raise exception 'Payroll run dengan ID % tidak ditemukan.', p_run_id;
  end if;

  for v_item in (
    select id, worker_id, base_amount, meal_amount, overtime_amount, manual_overtime_amount, overtime_bonus, holiday_bonus
    from public.payroll_run_items
    where payroll_run_id = p_run_id
  ) loop
    -- 1. Ambil cicilan aktif Kasbon Perusahaan
    select coalesce(sum(least(case when installment_amount > 0 then installment_amount else (amount - paid_amount) end, amount - paid_amount)), 0)
    into v_kasbon_p
    from public.cash_advances
    where worker_id = v_item.worker_id and status = 'AKTIF' and category = 'KASBON_PERUSAHAAN';

    -- 2. Ambil saldo aktif Kasbon Warung
    select coalesce(sum(amount - paid_amount), 0)
    into v_kasbon_w
    from public.cash_advances
    where worker_id = v_item.worker_id and status = 'AKTIF' and category = 'KASBON_WARUNG';

    v_deduction := v_kasbon_p + v_kasbon_w;
    v_gross := round((coalesce(v_item.base_amount, 0) + coalesce(v_item.meal_amount, 0) + coalesce(v_item.overtime_amount, 0) + coalesce(v_item.manual_overtime_amount, 0) + coalesce(v_item.overtime_bonus, 0) + coalesce(v_item.holiday_bonus, 0))::numeric, 2);
    v_net := greatest(0, round((v_gross - v_deduction)::numeric, 2));

    update public.payroll_run_items set
      kasbon_perusahaan_amount = v_kasbon_p,
      kasbon_warung_amount = v_kasbon_w,
      deduction_amount = v_deduction,
      net_amount = v_net
    where id = v_item.id;

    v_updated_count := v_updated_count + 1;
  end loop;

  -- 3. Sinkronkan total di tabel payroll_runs
  select
    coalesce(sum(base_amount + meal_amount + overtime_amount + manual_overtime_amount + overtime_bonus + holiday_bonus), 0),
    coalesce(sum(deduction_amount), 0),
    coalesce(sum(net_amount), 0)
  into v_run_gross, v_run_deduction, v_run_net
  from public.payroll_run_items
  where payroll_run_id = p_run_id;

  update public.payroll_runs set
    total_gross = v_run_gross,
    total_deduction = v_run_deduction,
    total_net = v_run_net
  where id = p_run_id;

  return jsonb_build_object(
    'run_id', p_run_id,
    'updated_workers', v_updated_count,
    'total_gross', v_run_gross,
    'total_deduction', v_run_deduction,
    'total_net', v_run_net
  );
end;
$$;

revoke all on function public.smpt_sync_payroll_run_advances(bigint) from public;
grant execute on function public.smpt_sync_payroll_run_advances(bigint) to authenticated, service_role;
