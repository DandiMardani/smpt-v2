-- SMPT V2 - SPK dependent dropdown + reference read hardening
-- Purpose:
-- 1) spk.view must be sufficient to read reference data needed by the SPK form.
-- 2) Keep write authorization unchanged; this migration grants SELECT only through RLS.
-- 3) Existing master/operational policies remain untouched.

alter table public.projects enable row level security;
alter table public.project_products enable row level security;
alter table public.workers enable row level security;
alter table public.work_items enable row level security;

drop policy if exists projects_spk_reference_select on public.projects;
create policy projects_spk_reference_select
on public.projects
for select
to authenticated
using (public.has_permission('spk.view'));

drop policy if exists project_products_spk_reference_select on public.project_products;
create policy project_products_spk_reference_select
on public.project_products
for select
to authenticated
using (public.has_permission('spk.view'));

drop policy if exists workers_spk_reference_select on public.workers;
create policy workers_spk_reference_select
on public.workers
for select
to authenticated
using (public.has_permission('spk.view'));

drop policy if exists work_items_spk_reference_select on public.work_items;
create policy work_items_spk_reference_select
on public.work_items
for select
to authenticated
using (public.has_permission('spk.view'));

grant select on public.projects, public.project_products, public.workers, public.work_items to authenticated;
