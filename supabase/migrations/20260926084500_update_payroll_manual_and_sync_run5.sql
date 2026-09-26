-- Migration: 20260926084500_update_payroll_manual_and_sync_run5.sql

-- Drop previous overloaded versions
drop function if exists public.update_payroll_item_manual(bigint, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric);
drop function if exists public.update_payroll_item_manual(bigint, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, int, numeric);

-- 1. Perbarui RPC update_payroll_item_manual agar menerima dan mengupdate overtime_minutes & manual_overtime_hours
create or replace function public.update_payroll_item_manual(
  p_item_id bigint,
  p_base_amount numeric default null,
  p_meal_amount numeric default null,
  p_overtime_amount numeric default null,
  p_manual_overtime_amount numeric default null,
  p_overtime_bonus numeric default null,
  p_holiday_bonus numeric default null,
  p_kasbon_perusahaan_amount numeric default null,
  p_kasbon_warung_amount numeric default null,
  p_deduction_amount numeric default null,
  p_overtime_minutes int default null,
  p_manual_overtime_hours numeric default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item record;
  v_run_id bigint;
  v_base numeric;
  v_meal numeric;
  v_ot numeric;
  v_manual_ot numeric;
  v_bonus numeric;
  v_holiday numeric;
  v_kasbon_p numeric;
  v_kasbon_w numeric;
  v_deduction numeric;
  v_ot_min int;
  v_manual_ot_h numeric;
  v_gross numeric;
  v_net numeric;
  v_run_gross numeric := 0;
  v_run_deduction numeric := 0;
  v_run_net numeric := 0;
begin
  if auth.uid() is not null and not public.has_permission('payroll.write') and upper(coalesce(public.current_user_role(),'')) <> 'ADMIN' then
    raise exception 'Tidak memiliki izin Payroll.' using errcode = '42501';
  end if;

  select * into v_item from public.payroll_run_items where id = p_item_id;
  if not found then
    raise exception 'Item payroll dengan ID % tidak ditemukan.', p_item_id;
  end if;
  v_run_id := v_item.payroll_run_id;

  v_base := coalesce(p_base_amount, v_item.base_amount, 0);
  v_meal := coalesce(p_meal_amount, v_item.meal_amount, 0);
  v_ot := coalesce(p_overtime_amount, v_item.overtime_amount, 0);
  v_manual_ot := coalesce(p_manual_overtime_amount, v_item.manual_overtime_amount, 0);
  v_bonus := coalesce(p_overtime_bonus, v_item.overtime_bonus, 0);
  v_holiday := coalesce(p_holiday_bonus, v_item.holiday_bonus, 0);
  v_kasbon_p := coalesce(p_kasbon_perusahaan_amount, v_item.kasbon_perusahaan_amount, 0);
  v_kasbon_w := coalesce(p_kasbon_warung_amount, v_item.kasbon_warung_amount, 0);
  v_deduction := coalesce(p_deduction_amount, v_kasbon_p + v_kasbon_w);
  v_ot_min := coalesce(p_overtime_minutes, v_item.overtime_minutes, 0);
  v_manual_ot_h := coalesce(p_manual_overtime_hours, v_item.manual_overtime_hours, 0);

  v_gross := round((v_base + v_meal + v_ot + v_manual_ot + v_bonus + v_holiday)::numeric, 2);
  v_net := greatest(0, round((v_gross - v_deduction)::numeric, 2));

  update public.payroll_run_items set
    base_amount = v_base,
    meal_amount = v_meal,
    overtime_amount = v_ot,
    manual_overtime_amount = v_manual_ot,
    overtime_bonus = v_bonus,
    holiday_bonus = v_holiday,
    kasbon_perusahaan_amount = v_kasbon_p,
    kasbon_warung_amount = v_kasbon_w,
    deduction_amount = v_deduction,
    overtime_minutes = v_ot_min,
    manual_overtime_hours = v_manual_ot_h,
    net_amount = v_net
  where id = p_item_id;

  -- Sinkronkan total run di payroll_runs
  select
    coalesce(sum(base_amount + meal_amount + overtime_amount + manual_overtime_amount + overtime_bonus + holiday_bonus), 0),
    coalesce(sum(deduction_amount), 0),
    coalesce(sum(net_amount), 0)
  into v_run_gross, v_run_deduction, v_run_net
  from public.payroll_run_items
  where payroll_run_id = v_run_id;

  update public.payroll_runs set
    total_gross = v_run_gross,
    total_deduction = v_run_deduction,
    total_net = v_run_net
  where id = v_run_id;

  return jsonb_build_object(
    'item_id', p_item_id,
    'gross', v_gross,
    'net', v_net,
    'run_gross', v_run_gross,
    'run_net', v_run_net
  );
end;
$$;

grant execute on function public.update_payroll_item_manual(bigint, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, int, numeric) to authenticated, service_role;

-- 2. Sinkronkan bonus 4H Usman Alamsyah (worker_id = 9) di Run 5 jika ada 2x lembur Minggu
update public.payroll_run_items set
  overtime_bonus = 35000,
  net_amount = greatest(0, round((base_amount + meal_amount + overtime_amount + manual_overtime_amount + 35000 + holiday_bonus - deduction_amount)::numeric, 2))
where worker_id = 9 and payroll_run_id = (select id from public.payroll_runs where payroll_type = 'BULANAN' order by id desc limit 1);

-- Sinkronkan total payroll_runs
update public.payroll_runs r set
  total_gross = sub.gross,
  total_deduction = sub.deduction,
  total_net = sub.net
from (
  select
    payroll_run_id,
    sum(base_amount + meal_amount + overtime_amount + manual_overtime_amount + overtime_bonus + holiday_bonus) as gross,
    sum(deduction_amount) as deduction,
    sum(net_amount) as net
  from public.payroll_run_items
  group by payroll_run_id
) sub
where r.id = sub.payroll_run_id and r.id = (select id from public.payroll_runs where payroll_type = 'BULANAN' order by id desc limit 1);
