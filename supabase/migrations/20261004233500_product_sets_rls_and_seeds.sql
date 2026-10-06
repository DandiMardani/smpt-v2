-- Migration: Product Sets RLS Policy Fix and Standard Haj Sets
-- Timestamp: 20261004233500

-- 1. Allow all authenticated users (including ADMIN_MR_WU) to read product_sets
drop policy if exists sets_select on public.product_sets;
create policy sets_select on public.product_sets
for select to authenticated
using (true);

grant select on public.product_sets to authenticated;

-- 2. Insert standard Haj Luggage Sets if they don't exist
do $$
declare
  v_proj_id bigint;
begin
  select id into v_proj_id from public.projects order by id limit 1;

  insert into public.product_sets (set_code, name, unit, status, project_id, notes)
  values
    ('SET-HAJI-REGULER', 'SET KOPER HAJI REGULER (Besar 24" + Kecil 18" + Isian + Kardus)', 'SET', 'AKTIF', v_proj_id, 'Standar Koper Haji Reguler Lengkap'),
    ('SET-HAJI-GARUDA', 'SET KOPER HAJI GARUDA INDONESIA', 'SET', 'AKTIF', v_proj_id, 'Koper Haji Kloter Garuda'),
    ('SET-HAJI-SAUDI', 'SET KOPER HAJI SAUDIA AIRLINES', 'SET', 'AKTIF', v_proj_id, 'Koper Haji Kloter Saudia')
  on conflict (set_code) do update
  set name = excluded.name,
      status = 'AKTIF',
      unit = 'SET';
end;
$$;
