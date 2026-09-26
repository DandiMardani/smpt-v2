-- Migration: 20260926213000_standardize_project_category.sql
-- Menyelaraskan Kategori Proyek (HAJI vs REGULER) pada tabel projects

-- 1. Update data proyek yang sudah ada:
-- Bila nama atau kode proyek mengandung kata kunci haji/embarkasi/kemenag/paspor/kabin, set ke 'HAJI'
-- Selain itu, bila kosong atau belum standar, set ke 'REGULER'
update public.projects
set product_category = case
  when lower(name) like '%haji%'
    or lower(project_code) like '%haji%'
    or lower(name) like '%embarkasi%'
    or lower(name) like '%kemenag%'
    or lower(name) like '%paspor%'
    or lower(name) like '%kabin%'
    or upper(coalesce(product_category, '')) = 'HAJI'
    then 'HAJI'
  else 'REGULER'
end
where product_category is null
   or product_category = ''
   or upper(product_category) not in ('HAJI', 'REGULER');

-- 2. Set default value untuk kolom product_category ke 'REGULER'
alter table public.projects
  alter column product_category set default 'REGULER';

-- 3. Tambahkan index untuk mempercepat filter kategori proyek
create index if not exists projects_product_category_idx
  on public.projects(product_category);
