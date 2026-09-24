-- SMPT V2 - Dropdown/reference visibility hardening after Repeat Order + Manual HARIAN flow.
-- New migration only. No previously-pushed migration is modified.
--
-- Fixes discovered by the full dropdown audit:
-- 1) Hasil Produksi can read projects/products/work_items, but workers RLS did not
--    include hasil_produksi.view. The Pekerja HARIAN dropdown therefore returned 0 rows.
-- 2) Master Proyek Repeat Order renders product targets from project_products, but
--    master_proyek.view did not have explicit SELECT visibility on that reference.

-- Hasil Produksi needs a narrow read-only worker reference for the manual HARIAN flow.
drop policy if exists workers_hasil_produksi_reference_select on public.workers;
create policy workers_hasil_produksi_reference_select on public.workers
for select to authenticated
using (public.has_permission('hasil_produksi.view'));

grant select on public.workers to authenticated;

-- Repeat Order target/config preview lives on Master Proyek and reads project_products.
drop policy if exists project_products_master_proyek_reference_select on public.project_products;
create policy project_products_master_proyek_reference_select on public.project_products
for select to authenticated
using (public.has_permission('master_proyek.view'));

grant select on public.project_products to authenticated;

notify pgrst, 'reload schema';
