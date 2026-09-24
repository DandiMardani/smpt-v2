-- ============================================================
-- SMPT V2
-- STEP 8A - Core Master Data foundation
--
-- V1 source of truth: SMPT(4).zip
-- Core sheets mapped here:
--   Master_Proyek
--   Master_Produk_Proyek
--   Master_Bahan
--   Master_Item_Pekerjaan
--   Master_Kebutuhan_Bahan
-- ============================================================

-- ============================================================
-- 0. COMPLETE CORE MASTER PERMISSION CATALOG
--
-- V1 AccessControl grants these writes only through ADMIN wildcard
-- or explicit per-user override. They still need to exist in the
-- V2 permission catalog so overrides/admin UI can reference them.
-- ============================================================

insert into public.permissions (code, description)
values
  ('master_proyek.write', 'Tambah, ubah, atau hapus Master Proyek.'),
  ('master_produk_proyek.write', 'Tambah atau ubah Produk/Tas per Proyek.'),
  ('master_bahan.write', 'Tambah atau ubah Master Bahan.'),
  ('master_item.write', 'Tambah atau ubah Master Item Pekerjaan.'),
  ('master_kebutuhan.write', 'Tambah, ubah, atau hapus Master Kebutuhan/BOM.')
on conflict (code) do update
set description = excluded.description;


-- ============================================================
-- 1. CONCURRENCY-SAFE BUSINESS CODE SEQUENCES
--
-- V1 generated these by scanning the largest number in Sheets.
-- PostgreSQL sequences remove the race condition under concurrency.
-- Legacy codes can still be inserted explicitly during migration.
-- ============================================================

create sequence if not exists public.smpt_product_code_seq start with 1 increment by 1;
create sequence if not exists public.smpt_material_code_seq start with 1 increment by 1;
create sequence if not exists public.smpt_work_item_code_seq start with 1 increment by 1;
create sequence if not exists public.smpt_bom_code_seq start with 1 increment by 1;


-- ============================================================
-- 2. MASTER PROYEK
-- V1 Sheet: Master_Proyek
-- Columns:
-- ID Proyek | Nama Proyek | Kategori Produk | Nama Customer |
-- Nilai Kontrak | Target Produksi (legacy) | Tanggal Mulai |
-- Tanggal Selesai | Status Proyek
-- ============================================================

create table public.projects (
  id bigint generated always as identity primary key,

  project_code text not null unique,
  name text not null,
  product_category text,
  customer_name text,

  contract_value numeric(18,2) not null default 0,

  -- Target aktif V1 sekarang berada per Produk/Tas.
  -- Nilai ini hanya dipertahankan untuk data/fallback legacy.
  legacy_target_production numeric(18,4) not null default 0,

  start_date date,
  end_date date,
  status text not null default 'Pending',

  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint projects_code_not_blank
    check (btrim(project_code) <> ''),

  constraint projects_name_not_blank
    check (btrim(name) <> ''),

  constraint projects_contract_nonnegative
    check (contract_value >= 0),

  constraint projects_legacy_target_nonnegative
    check (legacy_target_production >= 0),

  constraint projects_date_order
    check (
      start_date is null
      or end_date is null
      or end_date >= start_date
    )
);

create index projects_status_idx
  on public.projects(status);

create index projects_name_lower_idx
  on public.projects(lower(name));


-- ============================================================
-- 3. MASTER PRODUK / TAS PER PROYEK
-- V1 Sheet: Master_Produk_Proyek
-- ID format V1: PRDK-000001
-- ============================================================

create table public.project_products (
  id bigint generated always as identity primary key,

  product_code text not null unique default (
    'PRDK-' || lpad(nextval('public.smpt_product_code_seq')::text, 6, '0')
  ),

  project_id bigint not null
    references public.projects(id)
    on update restrict
    on delete restrict,

  name text not null,
  target_production numeric(18,4) not null,
  unit text not null default 'pcs',
  status text not null default 'AKTIF',
  notes text,

  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint project_products_code_not_blank
    check (btrim(product_code) <> ''),

  constraint project_products_name_not_blank
    check (btrim(name) <> ''),

  constraint project_products_target_positive
    check (target_production > 0),

  constraint project_products_unit_not_blank
    check (btrim(unit) <> ''),

  constraint project_products_status_check
    check (status in ('AKTIF', 'NONAKTIF')),

  -- Enables composite child FKs so project/product mismatches
  -- cannot exist even if application code has a bug.
  unique (project_id, id)
);

create unique index project_products_project_name_uq
  on public.project_products(project_id, lower(btrim(name)));

create index project_products_project_status_idx
  on public.project_products(project_id, status);


-- ============================================================
-- 4. MASTER BAHAN
-- V1 Sheet: Master_Bahan
-- ID format V1: BHN-0001
-- ============================================================

create table public.materials (
  id bigint generated always as identity primary key,

  material_code text not null unique default (
    'BHN-' || lpad(nextval('public.smpt_material_code_seq')::text, 4, '0')
  ),

  name text not null,
  standard_unit text not null,
  category text not null,

  -- V1 uses AKTIF / TIDAK AKTIF. V2 stores one canonical inactive
  -- value while the import step will map TIDAK AKTIF -> NONAKTIF.
  status text not null default 'AKTIF',

  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint materials_code_not_blank
    check (btrim(material_code) <> ''),

  constraint materials_name_not_blank
    check (btrim(name) <> ''),

  constraint materials_unit_not_blank
    check (btrim(standard_unit) <> ''),

  constraint materials_category_not_blank
    check (btrim(category) <> ''),

  constraint materials_status_check
    check (status in ('AKTIF', 'NONAKTIF'))
);

create unique index materials_name_uq
  on public.materials(lower(btrim(name)));

create index materials_category_status_idx
  on public.materials(category, status);


-- ============================================================
-- 5. MASTER ITEM PEKERJAAN
-- V1 Sheet: Master_Item_Pekerjaan
-- Final V1 columns:
-- ID Item | ID Proyek | Nama Pekerjaan | Satuan |
-- Qty Pekerjaan/Produk | Harga Operator | Harga Pengajuan |
-- Status | Output Final | ID Produk | Nama Produk/Tas
-- ID format V1: ITM-00001
-- ============================================================

create table public.work_items (
  id bigint generated always as identity primary key,

  item_code text not null unique default (
    'ITM-' || lpad(nextval('public.smpt_work_item_code_seq')::text, 5, '0')
  ),

  project_id bigint not null
    references public.projects(id)
    on update restrict
    on delete restrict,

  -- Nullable only to allow unresolved pre-multi-product legacy rows
  -- during controlled migration. New V2 UI will always require product.
  product_id bigint,

  name text not null,
  unit text not null,
  qty_per_product integer not null,
  operator_price bigint not null default 0,
  proposed_price bigint not null default 0,
  status text not null default 'AKTIF',
  output_final boolean not null default false,

  legacy_unassigned_product boolean not null default false,

  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint work_items_code_not_blank
    check (btrim(item_code) <> ''),

  constraint work_items_name_not_blank
    check (btrim(name) <> ''),

  constraint work_items_unit_not_blank
    check (btrim(unit) <> ''),

  constraint work_items_qty_positive
    check (qty_per_product > 0),

  constraint work_items_operator_price_nonnegative
    check (operator_price >= 0),

  constraint work_items_proposed_price_nonnegative
    check (proposed_price >= 0),

  constraint work_items_status_check
    check (status in ('AKTIF', 'NONAKTIF')),

  constraint work_items_output_final_active_only
    check (output_final = false or status = 'AKTIF'),

  constraint work_items_product_assignment_check
    check (product_id is not null or legacy_unassigned_product = true),

  constraint work_items_product_matches_project_fk
    foreign key (project_id, product_id)
    references public.project_products(project_id, id)
    on update restrict
    on delete restrict
);

create unique index work_items_product_name_uq
  on public.work_items(
    project_id,
    coalesce(product_id, 0),
    lower(btrim(name))
  );

-- V1 final behaviour is one Output Final per Produk/Tas.
create unique index work_items_one_output_final_uq
  on public.work_items(
    project_id,
    coalesce(product_id, 0)
  )
  where output_final = true;

create index work_items_product_status_idx
  on public.work_items(project_id, product_id, status);


-- ============================================================
-- 6. MASTER KEBUTUHAN / BOM COSTING
-- V1 Sheet: Master_Kebutuhan_Bahan
-- ID format V1: KBT-0001
--
-- Component type:
--   BAHAN = physical material, requires material_id
--   JASA  = costing only
--   BIAYA = costing only
--
-- V1 stores TOTAL_KEBUTUHAN physically and resynchronizes it when
-- product target changes. V2 intentionally calculates total from
-- target * qty_per_unit so it cannot drift out of sync.
-- ============================================================

create table public.bom_requirements (
  id bigint generated always as identity primary key,

  requirement_code text not null unique default (
    'KBT-' || lpad(nextval('public.smpt_bom_code_seq')::text, 4, '0')
  ),

  project_id bigint not null
    references public.projects(id)
    on update restrict
    on delete restrict,

  -- Nullable for controlled import/fallback of V1 project-level BOM.
  product_id bigint,

  material_id bigint
    references public.materials(id)
    on update restrict
    on delete restrict,

  component_type text not null default 'BAHAN',

  -- Kept because JASA/BIAYA do not have Master Bahan rows and because
  -- V1 stored the visible component name as part of the BOM row.
  component_name text not null,
  unit text not null,

  qty_per_unit numeric(18,4) not null default 0,
  unit_price numeric(18,2) not null default 0,
  status text not null default 'AKTIF',

  -- Exact stored V1 TOTAL_KEBUTUHAN can be retained for migration audit.
  -- Runtime V2 must use calculated_total_requirement from the view below.
  legacy_total_requirement numeric(18,4),
  legacy_project_level boolean not null default false,

  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bom_requirements_code_not_blank
    check (btrim(requirement_code) <> ''),

  constraint bom_requirements_component_type_check
    check (component_type in ('BAHAN', 'JASA', 'BIAYA')),

  constraint bom_requirements_component_name_not_blank
    check (btrim(component_name) <> ''),

  constraint bom_requirements_unit_not_blank
    check (btrim(unit) <> ''),

  constraint bom_requirements_qty_nonnegative
    check (qty_per_unit >= 0),

  constraint bom_requirements_price_nonnegative
    check (unit_price >= 0),

  constraint bom_requirements_status_check
    check (status in ('AKTIF', 'NONAKTIF')),

  constraint bom_requirements_material_rule
    check (
      (component_type = 'BAHAN' and material_id is not null)
      or
      (component_type in ('JASA', 'BIAYA') and material_id is null)
    ),

  constraint bom_requirements_product_matches_project_fk
    foreign key (project_id, product_id)
    references public.project_products(project_id, id)
    on update restrict
    on delete restrict
);

create unique index bom_requirements_component_uq
  on public.bom_requirements(
    project_id,
    coalesce(product_id, 0),
    component_type,
    lower(btrim(component_name))
  );

create index bom_requirements_project_product_status_idx
  on public.bom_requirements(project_id, product_id, status);

create index bom_requirements_material_idx
  on public.bom_requirements(material_id)
  where material_id is not null;


-- ============================================================
-- 7. CALCULATED BOM VIEW
--
-- Removes V1's stored-total synchronization problem.
-- For product-linked rows: product target is authoritative.
-- For legacy project-level rows: project legacy target is fallback.
-- ============================================================

create or replace view public.bom_requirements_calculated
with (security_invoker = true)
as
select
  br.id,
  br.requirement_code,
  br.project_id,
  pr.project_code,
  pr.name as project_name,
  br.product_id,
  pp.product_code,
  pp.name as product_name,
  br.material_id,
  m.material_code,
  br.component_type,
  br.component_name,
  br.unit,
  br.qty_per_unit,
  br.unit_price,
  br.status,
  br.legacy_total_requirement,
  br.legacy_project_level,
  case
    when br.product_id is not null then pp.target_production
    else pr.legacy_target_production
  end as effective_target_production,
  round(
    (
      case
        when br.product_id is not null then pp.target_production
        else pr.legacy_target_production
      end
    ) * br.qty_per_unit,
    4
  ) as calculated_total_requirement,
  round(br.qty_per_unit * br.unit_price, 2) as cost_per_product,
  round(
    (
      case
        when br.product_id is not null then pp.target_production
        else pr.legacy_target_production
      end
    ) * br.qty_per_unit * br.unit_price,
    2
  ) as calculated_total_cost
from public.bom_requirements br
join public.projects pr
  on pr.id = br.project_id
left join public.project_products pp
  on pp.id = br.product_id
left join public.materials m
  on m.id = br.material_id;


-- ============================================================
-- 8. IMMUTABLE PARENT RELATION RULES
--
-- V1 explicitly blocks moving Produk/Tas to another Proyek and
-- moving Item Pekerjaan to another Proyek/Produk after creation.
-- Keep those rules in PostgreSQL, not only in UI code.
-- ============================================================

create or replace function public.prevent_project_product_parent_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'Produk/Tas tidak dapat dipindahkan ke proyek lain.';
  end if;
  return new;
end;
$$;

create trigger project_products_parent_immutable
before update of project_id
on public.project_products
for each row
execute function public.prevent_project_product_parent_change();


create or replace function public.prevent_work_item_parent_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'Item tidak dapat dipindahkan ke proyek lain.';
  end if;

  if old.product_id is not null
     and new.product_id is distinct from old.product_id then
    raise exception 'Item tidak dapat dipindahkan ke Produk/Tas lain.';
  end if;

  return new;
end;
$$;

create trigger work_items_parent_immutable
before update of project_id, product_id
on public.work_items
for each row
execute function public.prevent_work_item_parent_change();


-- ============================================================
-- 9. UPDATED_AT + AUDIT USER
-- ============================================================

create or replace function public.set_master_updated_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();

  if auth.uid() is not null then
    new.updated_by = auth.uid();
  end if;

  return new;
end;
$$;

create trigger projects_updated_audit
before update on public.projects
for each row
execute function public.set_master_updated_audit();

create trigger project_products_updated_audit
before update on public.project_products
for each row
execute function public.set_master_updated_audit();

create trigger materials_updated_audit
before update on public.materials
for each row
execute function public.set_master_updated_audit();

create trigger work_items_updated_audit
before update on public.work_items
for each row
execute function public.set_master_updated_audit();

create trigger bom_requirements_updated_audit
before update on public.bom_requirements
for each row
execute function public.set_master_updated_audit();


-- ============================================================
-- 10. LEGACY IMPORT AUDIT MAP
--
-- Kept outside public API schema. Raw V1 row may be stored here during
-- import so every migrated record can be traced back to its Sheet row.
-- ============================================================

create schema if not exists private;

create table private.legacy_import_map (
  id bigint generated always as identity primary key,
  source_system text not null default 'SMPT_V1_GSHEET',
  source_sheet text not null,
  source_key text not null,
  source_row integer,
  target_table text not null,
  target_id bigint not null,
  raw_data jsonb,
  imported_at timestamptz not null default now(),

  constraint legacy_import_source_row_positive
    check (source_row is null or source_row > 0),

  unique (source_system, source_sheet, source_key, target_table)
);

revoke all on schema private from public;
revoke all on all tables in schema private from anon, authenticated;


-- ============================================================
-- 11. ROW LEVEL SECURITY
-- Direct Master Data reads/writes follow V1 master permissions.
-- Operational modules that need narrow reference data will receive
-- dedicated RPC/view access later, rather than exposing contract/pay data.
-- ============================================================

alter table public.projects enable row level security;
alter table public.project_products enable row level security;
alter table public.materials enable row level security;
alter table public.work_items enable row level security;
alter table public.bom_requirements enable row level security;


-- Master Proyek
create policy projects_select_master
on public.projects
for select
to authenticated
using (public.has_permission('master_proyek.view'));

create policy projects_insert_master
on public.projects
for insert
to authenticated
with check (public.has_permission('master_proyek.write'));

create policy projects_update_master
on public.projects
for update
to authenticated
using (public.has_permission('master_proyek.write'))
with check (public.has_permission('master_proyek.write'));

create policy projects_delete_master
on public.projects
for delete
to authenticated
using (public.has_permission('master_proyek.write'));


-- Produk/Tas Proyek
create policy project_products_select_master
on public.project_products
for select
to authenticated
using (public.has_permission('master_produk_proyek.view'));

create policy project_products_insert_master
on public.project_products
for insert
to authenticated
with check (public.has_permission('master_produk_proyek.write'));

create policy project_products_update_master
on public.project_products
for update
to authenticated
using (public.has_permission('master_produk_proyek.write'))
with check (public.has_permission('master_produk_proyek.write'));


-- Master Bahan
create policy materials_select_master
on public.materials
for select
to authenticated
using (public.has_permission('master_bahan.view'));

create policy materials_insert_master
on public.materials
for insert
to authenticated
with check (public.has_permission('master_bahan.write'));

create policy materials_update_master
on public.materials
for update
to authenticated
using (public.has_permission('master_bahan.write'))
with check (public.has_permission('master_bahan.write'));


-- Master Item Pekerjaan
create policy work_items_select_master
on public.work_items
for select
to authenticated
using (public.has_permission('master_item.view'));

create policy work_items_insert_master
on public.work_items
for insert
to authenticated
with check (public.has_permission('master_item.write'));

create policy work_items_update_master
on public.work_items
for update
to authenticated
using (public.has_permission('master_item.write'))
with check (public.has_permission('master_item.write'));


-- Master Kebutuhan / BOM
create policy bom_requirements_select_master
on public.bom_requirements
for select
to authenticated
using (public.has_permission('master_kebutuhan.view'));

create policy bom_requirements_insert_master
on public.bom_requirements
for insert
to authenticated
with check (public.has_permission('master_kebutuhan.write'));

create policy bom_requirements_update_master
on public.bom_requirements
for update
to authenticated
using (public.has_permission('master_kebutuhan.write'))
with check (public.has_permission('master_kebutuhan.write'));

create policy bom_requirements_delete_master
on public.bom_requirements
for delete
to authenticated
using (public.has_permission('master_kebutuhan.write'));


-- ============================================================
-- 12. TABLE PRIVILEGES
-- RLS remains the authorization boundary.
-- ============================================================

revoke all on table
  public.projects,
  public.project_products,
  public.materials,
  public.work_items,
  public.bom_requirements
from anon;

revoke all on table
  public.projects,
  public.project_products,
  public.materials,
  public.work_items,
  public.bom_requirements
from authenticated;

grant select, insert, update, delete
on table
  public.projects,
  public.project_products,
  public.materials,
  public.work_items,
  public.bom_requirements
to authenticated;

grant select
on public.bom_requirements_calculated
to authenticated;

grant usage, select
on sequence
  public.smpt_product_code_seq,
  public.smpt_material_code_seq,
  public.smpt_work_item_code_seq,
  public.smpt_bom_code_seq
to authenticated;


-- ============================================================
-- 13. COMMENTS FOR FUTURE MIGRATION / MAINTENANCE
-- ============================================================

comment on table public.projects is
  'SMPT V2 normalized replacement for V1 Master_Proyek.';

comment on column public.projects.project_code is
  'V1 ID Proyek; retained as stable business code for migration/audit.';

comment on column public.projects.legacy_target_production is
  'Legacy project-level target. New authoritative production target is project_products.target_production.';

comment on table public.project_products is
  'SMPT V2 replacement for V1 Master_Produk_Proyek.';

comment on table public.materials is
  'SMPT V2 replacement for V1 Master_Bahan.';

comment on table public.work_items is
  'SMPT V2 replacement for V1 Master_Item_Pekerjaan.';

comment on table public.bom_requirements is
  'SMPT V2 replacement for V1 Master_Kebutuhan_Bahan / BOM costing.';

comment on column public.bom_requirements.legacy_total_requirement is
  'Original stored V1 TOTAL_KEBUTUHAN for reconciliation only; runtime uses bom_requirements_calculated.';
