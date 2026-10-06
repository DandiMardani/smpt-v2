-- Migration: Fix MR WU Locations duplicate, clean set name, and allow reading finished_goods
-- Timestamp: 20261005001500

-- 1. Deactivate duplicate/generic MR WU location (LOK-00101) so only the 3 specific branches (Dadap, Angkasa, Gudang Utama) are active
update public.locations
set status = 'NONAKTIF', notes = coalesce(notes, '') || ' [DEPRECATED - Duplicate of specific branches]'
where location_code = 'LOK-00101' or (name = 'Pabrik Mitra MR WU' and location_code not in ('LOK-00001','LOK-00002','LOK-00003'));

-- 2. Clean up SET-HAJI-REGULER name removing hardcoded 24" so it matches standard Master Set format
update public.product_sets
set name = 'SET KOPER HAJI REGULER'
where set_code = 'SET-HAJI-REGULER';

-- 3. Allow all authenticated users (including ADMIN_MR_WU) to read finished_goods so item names display properly instead of 'Barang'
drop policy if exists finished_goods_select on public.finished_goods;
create policy finished_goods_select on public.finished_goods
for select to authenticated
using (true);

grant select on public.finished_goods to authenticated;
