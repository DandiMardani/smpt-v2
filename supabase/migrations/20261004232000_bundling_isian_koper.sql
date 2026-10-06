-- Migration: Bundling Isian Koper and MR WU Packing Integration
-- Timestamp: 20261004232000

-- 1. Create table for Finished Goods Bundling
create table if not exists public.finished_goods_bundling (
  id bigserial primary key,
  bundling_code text not null unique,
  bundling_date date not null default current_date,
  bundle_name text not null default 'Bundle Isian Koper Haji',
  bundle_finished_good_id bigint not null references public.finished_goods(id),
  location_id bigint not null default 1 references public.locations(id), -- default Pabrik Pusat
  bundle_qty numeric not null check (bundle_qty > 0),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- 2. Create table for Bundling Items
create table if not exists public.finished_goods_bundling_items (
  id bigserial primary key,
  bundling_id bigint not null references public.finished_goods_bundling(id) on delete cascade,
  component_finished_good_id bigint not null references public.finished_goods(id),
  qty_per_bundle numeric not null default 1 check (qty_per_bundle > 0),
  total_qty numeric not null check (total_qty > 0),
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists fg_bundling_date_idx on public.finished_goods_bundling(bundling_date desc);
create index if not exists fg_bundling_loc_idx on public.finished_goods_bundling(location_id);
create index if not exists fg_bundling_items_bnd_idx on public.finished_goods_bundling_items(bundling_id);

-- Enable RLS
alter table public.finished_goods_bundling enable row level security;
alter table public.finished_goods_bundling_items enable row level security;

-- Policies
drop policy if exists fg_bundling_select on public.finished_goods_bundling;
create policy fg_bundling_select on public.finished_goods_bundling for select to authenticated using (true);

drop policy if exists fg_bundling_insert on public.finished_goods_bundling;
create policy fg_bundling_insert on public.finished_goods_bundling for insert to authenticated with check (true);

drop policy if exists fg_bundling_items_select on public.finished_goods_bundling_items;
create policy fg_bundling_items_select on public.finished_goods_bundling_items for select to authenticated using (true);

drop policy if exists fg_bundling_items_insert on public.finished_goods_bundling_items;
create policy fg_bundling_items_insert on public.finished_goods_bundling_items for insert to authenticated with check (true);

grant select, insert on public.finished_goods_bundling to authenticated;
grant select, insert on public.finished_goods_bundling_items to authenticated;

-- 3. Register Permissions
insert into public.permissions (code, description)
values
  ('bundling_isian.view', 'Melihat daftar dan riwayat bundling isian koper'),
  ('bundling_isian.write', 'Melakukan proses bundling isian koper di pabrik pusat')
on conflict (code) do update set description = excluded.description;

-- Grant to ADMIN, MANAGER
do $$
declare
  v_role_id bigint;
  v_p_bnd_v bigint;
  v_p_bnd_w bigint;
  v_p_pack_w bigint;
begin
  select id into v_p_bnd_v from public.permissions where code = 'bundling_isian.view' limit 1;
  select id into v_p_bnd_w from public.permissions where code = 'bundling_isian.write' limit 1;
  select id into v_p_pack_w from public.permissions where code = 'packing_set.write' limit 1;

  for v_role_id in select id from public.roles where code in ('ADMIN', 'MANAGER') loop
    insert into public.role_permissions (role_id, permission_id)
    values (v_role_id, v_p_bnd_v), (v_role_id, v_p_bnd_w)
    on conflict do nothing;
  end loop;

  -- Grant packing_set.write to ADMIN_MR_WU so they can record packing in MR WU
  select id into v_role_id from public.roles where code = 'ADMIN_MR_WU' limit 1;
  if v_role_id is not null and v_p_pack_w is not null then
    insert into public.role_permissions (role_id, permission_id)
    values (v_role_id, v_p_pack_w)
    on conflict do nothing;
  end if;
end;
$$;

-- 4. RPC function to process bundling isian atomically
create or replace function public.process_bundling_isian(
  p_date date,
  p_bundle_fg_id bigint,
  p_location_id bigint,
  p_bundle_qty numeric,
  p_notes text,
  p_components jsonb -- array of { finished_good_id: number, qty_per_bundle: number }
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_bundling_code text;
  v_bundling_id bigint;
  v_comp jsonb;
  v_fg_id bigint;
  v_qty_per numeric;
  v_total_needed numeric;
  v_current_stock numeric;
  v_comp_name text;
  v_bundle_name text;
  v_balance_id bigint;
begin
  if p_bundle_qty <= 0 then
    raise exception 'Jumlah bundle harus lebih besar dari 0.';
  end if;

  select name into v_bundle_name from public.finished_goods where id = p_bundle_fg_id;
  if v_bundle_name is null then
    raise exception 'Barang jadi bundle tidak ditemukan (ID: %).', p_bundle_fg_id;
  end if;

  -- Generate bundling code BND-YYYYMMDD-XXXX
  select 'BND-' || to_char(coalesce(p_date, current_date), 'YYYYMMDD') || '-' || lpad((coalesce(count(*), 0) + 1)::text, 4, '0')
  into v_bundling_code
  from public.finished_goods_bundling
  where bundling_date = coalesce(p_date, current_date);

  -- 1. Validate all components stock first
  for v_comp in select * from jsonb_array_elements(p_components) loop
    v_fg_id := (v_comp->>'finished_good_id')::bigint;
    v_qty_per := coalesce((v_comp->>'qty_per_bundle')::numeric, 1);
    v_total_needed := v_qty_per * p_bundle_qty;

    select name into v_comp_name from public.finished_goods where id = v_fg_id;
    
    select coalesce(quantity, 0) into v_current_stock
    from public.logistics_stock_balances
    where item_kind = 'FINISHED_GOOD'
      and finished_good_id = v_fg_id
      and location_id = p_location_id;

    if coalesce(v_current_stock, 0) < v_total_needed then
      raise exception 'Stok komponen "%" tidak mencukupi di lokasi ini. Tersedia: %, Dibutuhkan: %',
        coalesce(v_comp_name, '#' || v_fg_id), coalesce(v_current_stock, 0), v_total_needed;
    end if;
  end loop;

  -- 2. Deduct component stocks and record items
  insert into public.finished_goods_bundling (
    bundling_code, bundling_date, bundle_name, bundle_finished_good_id,
    location_id, bundle_qty, notes, created_by
  ) values (
    v_bundling_code, coalesce(p_date, current_date), v_bundle_name, p_bundle_fg_id,
    p_location_id, p_bundle_qty, p_notes, auth.uid()
  ) returning id into v_bundling_id;

  for v_comp in select * from jsonb_array_elements(p_components) loop
    v_fg_id := (v_comp->>'finished_good_id')::bigint;
    v_qty_per := coalesce((v_comp->>'qty_per_bundle')::numeric, 1);
    v_total_needed := v_qty_per * p_bundle_qty;

    insert into public.finished_goods_bundling_items (
      bundling_id, component_finished_good_id, qty_per_bundle, total_qty
    ) values (
      v_bundling_id, v_fg_id, v_qty_per, v_total_needed
    );

    -- Deduct component stock
    update public.logistics_stock_balances
    set quantity = quantity - v_total_needed,
        updated_at = now()
    where item_kind = 'FINISHED_GOOD'
      and finished_good_id = v_fg_id
      and location_id = p_location_id;

    -- Record ledger for component out
    insert into public.logistics_stock_ledger (
      item_kind, finished_good_id, location_id, movement_kind,
      quantity_delta, notes
    ) values (
      'FINISHED_GOOD', v_fg_id, p_location_id, 'OUT',
      -v_total_needed, 'Komponen Bundling ' || v_bundling_code
    );
  end loop;

  -- 3. Add bundle stock in logistics_stock_balances
  select id into v_balance_id
  from public.logistics_stock_balances
  where item_kind = 'FINISHED_GOOD'
    and finished_good_id = p_bundle_fg_id
    and location_id = p_location_id
  for update;

  if v_balance_id is not null then
    update public.logistics_stock_balances
    set quantity = quantity + p_bundle_qty,
        updated_at = now()
    where id = v_balance_id;
  else
    insert into public.logistics_stock_balances (
      item_kind, finished_good_id, location_id, quantity
    ) values (
      'FINISHED_GOOD', p_bundle_fg_id, p_location_id, p_bundle_qty
    );
  end if;

  -- Record ledger for bundle in
  insert into public.logistics_stock_ledger (
    item_kind, finished_good_id, location_id, movement_kind,
    quantity_delta, notes
  ) values (
    'FINISHED_GOOD', p_bundle_fg_id, p_location_id, 'IN',
    p_bundle_qty, 'Hasil Bundling Isian ' || v_bundling_code
  );

  return jsonb_build_object(
    'success', true,
    'bundling_id', v_bundling_id,
    'bundling_code', v_bundling_code,
    'bundle_qty', p_bundle_qty
  );
end;
$$;
