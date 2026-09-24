-- SMPT V2 FINAL - Batch 3: SPK, Operator Assignment, Checker, Hasil Produksi
-- Locked flow: Operator/Pekerjaan Saya is read-only. Supervisor assigns Operator + Checker.
-- Canonical production output is Qty Sah recorded by assigned Checker.

insert into public.permissions(code,description) values
('spk.write','Membuat dan menerbitkan Surat Perintah Kerja.'),
('borongan.operate','Checker mencatat Qty Sah untuk SPK yang ditugaskan.'),
('access_control.write','Menghubungkan akun pengguna ke Master Pekerja.')
on conflict (code) do update set description=excluded.description;

create sequence if not exists public.smpt_spk_code_seq start with 1;
create sequence if not exists public.smpt_check_code_seq start with 1;

create table if not exists public.user_worker_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  worker_id bigint not null unique references public.workers(id) on delete restrict,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists(select 1 from pg_trigger where tgname='user_worker_links_set_updated_at') then
    create trigger user_worker_links_set_updated_at before update on public.user_worker_links for each row execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.production_orders (
  id bigint generated always as identity primary key,
  spk_code text not null unique default ('SPK-'||lpad(nextval('public.smpt_spk_code_seq')::text,6,'0')),
  order_date date not null default current_date,
  project_id bigint not null references public.projects(id) on delete restrict,
  product_id bigint not null,
  operator_worker_id bigint not null references public.workers(id) on delete restrict,
  checker_email text not null,
  supervisor_worker_id bigint references public.workers(id) on delete restrict,
  due_date date,
  status text not null default 'DRAFT' check(status in ('DRAFT','AKTIF','SELESAI','DIBATALKAN')),
  notes text,
  published_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(project_id,product_id) references public.project_products(project_id,id) on update restrict on delete restrict,
  check(btrim(checker_email)<>'')
);
create index if not exists production_orders_status_idx on public.production_orders(status,order_date desc,id desc);
create index if not exists production_orders_operator_idx on public.production_orders(operator_worker_id,status,order_date desc);
create index if not exists production_orders_checker_idx on public.production_orders(lower(checker_email),status,order_date desc);
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='production_orders_set_updated_at') then
    create trigger production_orders_set_updated_at before update on public.production_orders for each row execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.production_order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.production_orders(id) on delete restrict,
  work_item_id bigint not null references public.work_items(id) on delete restrict,
  work_item_name_snapshot text not null,
  unit_snapshot text not null,
  qty_per_product_snapshot numeric(18,4) not null check(qty_per_product_snapshot>0),
  operator_price_snapshot numeric(18,2) not null default 0 check(operator_price_snapshot>=0),
  submission_price_snapshot numeric(18,2) not null default 0 check(submission_price_snapshot>=0),
  assigned_qty numeric(18,4) not null check(assigned_qty>0),
  is_final_output_snapshot boolean not null default false,
  status text not null default 'AKTIF' check(status in ('AKTIF','SELESAI','DIBATALKAN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id,work_item_id)
);
create index if not exists production_order_items_work_idx on public.production_order_items(work_item_id,status);
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='production_order_items_set_updated_at') then
    create trigger production_order_items_set_updated_at before update on public.production_order_items for each row execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.production_checks (
  id bigint generated always as identity primary key,
  check_code text not null unique default ('CHK-'||lpad(nextval('public.smpt_check_code_seq')::text,6,'0')),
  order_item_id bigint not null references public.production_order_items(id) on delete restrict,
  check_date date not null default current_date,
  good_qty numeric(18,4) not null default 0 check(good_qty>=0),
  reject_qty numeric(18,4) not null default 0 check(reject_qty>=0),
  notes text,
  checker_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  checker_email text not null,
  status text not null default 'AKTIF' check(status in ('AKTIF','DIBATALKAN')),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check(good_qty+reject_qty>0)
);
create index if not exists production_checks_item_idx on public.production_checks(order_item_id,status,check_date desc,id desc);
create index if not exists production_checks_checker_idx on public.production_checks(checker_user_id,check_date desc);

create or replace function public.smpt_current_worker_id() returns bigint
language sql stable security definer set search_path=''
as $$ select uw.worker_id from public.user_worker_links uw where uw.user_id=auth.uid() and uw.active=true limit 1 $$;
revoke all on function public.smpt_current_worker_id() from public;
grant execute on function public.smpt_current_worker_id() to authenticated;

create or replace function public.smpt_work_item_snapshot(p_work_item_id bigint) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare v jsonb;
begin
  select to_jsonb(w) into v from public.work_items w where w.id=p_work_item_id;
  if v is null then raise exception 'Item pekerjaan tidak ditemukan.'; end if;
  return jsonb_build_object(
    'id',p_work_item_id,
    'project_id',nullif(coalesce(v->>'project_id',''),'')::bigint,
    'product_id',nullif(coalesce(v->>'product_id',''),'')::bigint,
    'name',coalesce(nullif(v->>'name',''),nullif(v->>'item_name',''),nullif(v->>'work_name',''),'Item #'||p_work_item_id),
    'unit',coalesce(nullif(v->>'unit',''),nullif(v->>'satuan',''),'PCS'),
    'qty_per_product',coalesce(nullif(v->>'qty_per_product','')::numeric,nullif(v->>'quantity_per_product','')::numeric,1),
    'operator_price',coalesce(nullif(v->>'operator_price','')::numeric,nullif(v->>'harga_operator','')::numeric,0),
    'submission_price',coalesce(nullif(v->>'submission_price','')::numeric,nullif(v->>'proposal_price','')::numeric,nullif(v->>'harga_pengajuan','')::numeric,0),
    'is_final_output',case when upper(coalesce(v->>'is_final_output',v->>'output_final','TIDAK')) in ('TRUE','T','1','YA','YES') then true else false end,
    'status',upper(coalesce(nullif(v->>'status',''),'AKTIF'))
  );
end $$;
revoke all on function public.smpt_work_item_snapshot(bigint) from public;
grant execute on function public.smpt_work_item_snapshot(bigint) to authenticated;

create or replace function public.link_worker_account(p_email text,p_worker_id bigint) returns void
language plpgsql security definer set search_path=''
as $$
declare v_user uuid;
begin
  if upper(coalesce(public.current_user_role(),''))<>'ADMIN' and not public.has_permission('access_control.write') then
    raise exception 'Hanya ADMIN yang dapat menghubungkan akun pekerja.' using errcode='42501';
  end if;
  select id into v_user from auth.users where lower(email)=lower(btrim(p_email)) limit 1;
  if v_user is null then raise exception 'Akun dengan email tersebut belum ada di Supabase Auth.'; end if;
  perform 1 from public.workers where id=p_worker_id and status='AKTIF';
  if not found then raise exception 'Pekerja tidak ditemukan atau NONAKTIF.'; end if;
  insert into public.user_worker_links(user_id,worker_id,active,created_by)
  values(v_user,p_worker_id,true,auth.uid())
  on conflict(user_id) do update set worker_id=excluded.worker_id,active=true,updated_at=now();
end $$;
revoke all on function public.link_worker_account(text,bigint) from public;
grant execute on function public.link_worker_account(text,bigint) to authenticated;

create or replace function public.create_production_order(
  p_order_date date,p_project_id bigint,p_product_id bigint,p_operator_worker_id bigint,
  p_checker_email text,p_supervisor_worker_id bigint default null,p_due_date date default null,p_notes text default null
) returns bigint
language plpgsql security definer set search_path=''
as $$
declare v_id bigint;
begin
  if not public.has_permission('spk.write') then raise exception 'Tidak memiliki izin membuat SPK.' using errcode='42501'; end if;
  perform 1 from public.project_products where id=p_product_id and project_id=p_project_id and status='AKTIF';
  if not found then raise exception 'Produk/Tas tidak sesuai proyek atau NONAKTIF.'; end if;
  perform 1 from public.workers where id=p_operator_worker_id and status='AKTIF';
  if not found then raise exception 'Operator tidak ditemukan atau NONAKTIF.'; end if;
  if btrim(coalesce(p_checker_email,''))='' then raise exception 'Email Checker wajib diisi.'; end if;
  if not exists(select 1 from auth.users where lower(email)=lower(btrim(p_checker_email))) then
    raise exception 'Akun Checker belum terdaftar di Supabase Auth.';
  end if;
  insert into public.production_orders(order_date,project_id,product_id,operator_worker_id,checker_email,supervisor_worker_id,due_date,notes)
  values(coalesce(p_order_date,current_date),p_project_id,p_product_id,p_operator_worker_id,lower(btrim(p_checker_email)),p_supervisor_worker_id,p_due_date,nullif(btrim(coalesce(p_notes,'')),'')) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.create_production_order(date,bigint,bigint,bigint,text,bigint,date,text) from public;
grant execute on function public.create_production_order(date,bigint,bigint,bigint,text,bigint,date,text) to authenticated;

create or replace function public.add_production_order_item(p_order_id bigint,p_work_item_id bigint,p_assigned_qty numeric) returns bigint
language plpgsql security definer set search_path=''
as $$
declare v_order public.production_orders%rowtype; v jsonb; v_id bigint; v_project bigint; v_product bigint;
begin
  if not public.has_permission('spk.write') then raise exception 'Tidak memiliki izin mengubah SPK.' using errcode='42501'; end if;
  select * into v_order from public.production_orders where id=p_order_id for update;
  if not found or v_order.status<>'DRAFT' then raise exception 'SPK harus DRAFT.'; end if;
  if coalesce(p_assigned_qty,0)<=0 then raise exception 'Qty penugasan harus lebih besar dari nol.'; end if;
  v:=public.smpt_work_item_snapshot(p_work_item_id);
  if (v->>'status')<>'AKTIF' then raise exception 'Item pekerjaan NONAKTIF.'; end if;
  v_project:=(v->>'project_id')::bigint; v_product:=(v->>'product_id')::bigint;
  if v_project is not null and v_project<>v_order.project_id then raise exception 'Item pekerjaan tidak sesuai proyek SPK.'; end if;
  if v_product is not null and v_product<>v_order.product_id then raise exception 'Item pekerjaan tidak sesuai Produk/Tas SPK.'; end if;
  insert into public.production_order_items(order_id,work_item_id,work_item_name_snapshot,unit_snapshot,qty_per_product_snapshot,operator_price_snapshot,submission_price_snapshot,assigned_qty,is_final_output_snapshot)
  values(p_order_id,p_work_item_id,v->>'name',v->>'unit',(v->>'qty_per_product')::numeric,(v->>'operator_price')::numeric,(v->>'submission_price')::numeric,p_assigned_qty,(v->>'is_final_output')::boolean)
  on conflict(order_id,work_item_id) do update set assigned_qty=excluded.assigned_qty,work_item_name_snapshot=excluded.work_item_name_snapshot,unit_snapshot=excluded.unit_snapshot,qty_per_product_snapshot=excluded.qty_per_product_snapshot,operator_price_snapshot=excluded.operator_price_snapshot,submission_price_snapshot=excluded.submission_price_snapshot,is_final_output_snapshot=excluded.is_final_output_snapshot,updated_at=now()
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.add_production_order_item(bigint,bigint,numeric) from public;
grant execute on function public.add_production_order_item(bigint,bigint,numeric) to authenticated;

create or replace function public.remove_production_order_item(p_order_id bigint,p_order_item_id bigint) returns void
language plpgsql security definer set search_path=''
as $$
begin
  if not public.has_permission('spk.write') then raise exception 'Tidak memiliki izin mengubah SPK.' using errcode='42501'; end if;
  perform 1 from public.production_orders where id=p_order_id and status='DRAFT' for update;
  if not found then raise exception 'SPK harus DRAFT.'; end if;
  delete from public.production_order_items where id=p_order_item_id and order_id=p_order_id;
end $$;
revoke all on function public.remove_production_order_item(bigint,bigint) from public;
grant execute on function public.remove_production_order_item(bigint,bigint) to authenticated;

create or replace function public.publish_production_order(p_order_id bigint) returns void
language plpgsql security definer set search_path=''
as $$
declare v_order public.production_orders%rowtype; r record; v_target numeric; v_existing numeric;
begin
  if not public.has_permission('spk.write') then raise exception 'Tidak memiliki izin menerbitkan SPK.' using errcode='42501'; end if;
  select * into v_order from public.production_orders where id=p_order_id for update;
  if not found or v_order.status<>'DRAFT' then raise exception 'SPK harus DRAFT.'; end if;
  if not exists(select 1 from public.production_order_items where order_id=p_order_id) then raise exception 'SPK belum memiliki item pekerjaan.'; end if;
  for r in select * from public.production_order_items where order_id=p_order_id loop
    select round((pp.target_production*r.qty_per_product_snapshot)::numeric,4) into v_target from public.project_products pp where pp.id=v_order.product_id;
    select coalesce(sum(i.assigned_qty),0) into v_existing
      from public.production_order_items i join public.production_orders o on o.id=i.order_id
      where i.work_item_id=r.work_item_id and o.product_id=v_order.product_id and o.id<>p_order_id and o.status in ('AKTIF','SELESAI') and i.status<>'DIBATALKAN';
    if v_existing+r.assigned_qty>v_target then raise exception 'Qty item % melebihi kebutuhan Produk/Tas. Maksimum sisa %.',r.work_item_name_snapshot,greatest(v_target-v_existing,0); end if;
  end loop;
  update public.production_orders set status='AKTIF',published_at=now(),updated_by=auth.uid() where id=p_order_id;
end $$;
revoke all on function public.publish_production_order(bigint) from public;
grant execute on function public.publish_production_order(bigint) to authenticated;

create or replace function public.cancel_production_order(p_order_id bigint) returns void
language plpgsql security definer set search_path=''
as $$
begin
  if not public.has_permission('spk.write') then raise exception 'Tidak memiliki izin membatalkan SPK.' using errcode='42501'; end if;
  perform 1 from public.production_orders where id=p_order_id and status in ('DRAFT','AKTIF') for update;
  if not found then raise exception 'SPK tidak dapat dibatalkan.'; end if;
  if exists(select 1 from public.production_order_items i join public.production_checks c on c.order_item_id=i.id where i.order_id=p_order_id and c.status='AKTIF') then
    raise exception 'SPK sudah memiliki Qty Sah Checker. Batalkan hasil Checker terlebih dahulu.';
  end if;
  update public.production_orders set status='DIBATALKAN',cancelled_at=now(),updated_by=auth.uid() where id=p_order_id;
  update public.production_order_items set status='DIBATALKAN' where order_id=p_order_id;
end $$;
revoke all on function public.cancel_production_order(bigint) from public;
grant execute on function public.cancel_production_order(bigint) to authenticated;

create or replace function public.record_checker_result(p_order_item_id bigint,p_check_date date,p_good_qty numeric,p_reject_qty numeric,p_notes text default null) returns bigint
language plpgsql security definer set search_path=''
as $$
declare v_item public.production_order_items%rowtype; v_order public.production_orders%rowtype; v_used numeric; v_email text; v_id bigint; v_remaining int;
begin
  if not public.has_permission('borongan.operate') then raise exception 'Akun ini bukan Checker yang berizin.' using errcode='42501'; end if;
  v_email:=lower(coalesce(auth.jwt()->>'email',''));
  select * into v_item from public.production_order_items where id=p_order_item_id for update;
  if not found or v_item.status<>'AKTIF' then raise exception 'Item SPK tidak aktif.'; end if;
  select * into v_order from public.production_orders where id=v_item.order_id for update;
  if v_order.status<>'AKTIF' then raise exception 'SPK belum aktif atau sudah ditutup.'; end if;
  if lower(v_order.checker_email)<>v_email then raise exception 'SPK ini ditugaskan ke Checker lain.' using errcode='42501'; end if;
  if coalesce(p_good_qty,0)<0 or coalesce(p_reject_qty,0)<0 or coalesce(p_good_qty,0)+coalesce(p_reject_qty,0)<=0 then raise exception 'Qty Checker tidak valid.'; end if;
  select coalesce(sum(good_qty+reject_qty),0) into v_used from public.production_checks where order_item_id=p_order_item_id and status='AKTIF';
  if v_used+p_good_qty+p_reject_qty>v_item.assigned_qty then raise exception 'Qty melebihi sisa penugasan (%).',greatest(v_item.assigned_qty-v_used,0); end if;
  insert into public.production_checks(order_item_id,check_date,good_qty,reject_qty,notes,checker_user_id,checker_email)
  values(p_order_item_id,coalesce(p_check_date,current_date),p_good_qty,p_reject_qty,nullif(btrim(coalesce(p_notes,'')),''),auth.uid(),v_email) returning id into v_id;
  if v_used+p_good_qty+p_reject_qty=v_item.assigned_qty then update public.production_order_items set status='SELESAI' where id=p_order_item_id; end if;
  select count(*) into v_remaining from public.production_order_items where order_id=v_order.id and status='AKTIF';
  if v_remaining=0 then update public.production_orders set status='SELESAI',completed_at=now(),updated_by=auth.uid() where id=v_order.id; end if;
  return v_id;
end $$;
revoke all on function public.record_checker_result(bigint,date,numeric,numeric,text) from public;
grant execute on function public.record_checker_result(bigint,date,numeric,numeric,text) to authenticated;

create or replace function public.cancel_checker_result(p_check_id bigint) returns void
language plpgsql security definer set search_path=''
as $$
declare v public.production_checks%rowtype; v_order_id bigint;
begin
  select * into v from public.production_checks where id=p_check_id for update;
  if not found or v.status<>'AKTIF' then raise exception 'Hasil Checker tidak aktif.'; end if;
  if auth.uid()<>v.checker_user_id and upper(coalesce(public.current_user_role(),''))<>'ADMIN' then raise exception 'Hanya Checker pembuat atau ADMIN yang dapat membatalkan.' using errcode='42501'; end if;
  update public.production_checks set status='DIBATALKAN',cancelled_at=now(),cancelled_by=auth.uid() where id=p_check_id;
  update public.production_order_items set status='AKTIF' where id=v.order_item_id;
  select order_id into v_order_id from public.production_order_items where id=v.order_item_id;
  update public.production_orders set status='AKTIF',completed_at=null,updated_by=auth.uid() where id=v_order_id and status='SELESAI';
end $$;
revoke all on function public.cancel_checker_result(bigint) from public;
grant execute on function public.cancel_checker_result(bigint) to authenticated;

alter table public.user_worker_links enable row level security;
alter table public.production_orders enable row level security;
alter table public.production_order_items enable row level security;
alter table public.production_checks enable row level security;

drop policy if exists user_worker_links_select on public.user_worker_links;
create policy user_worker_links_select on public.user_worker_links for select to authenticated using(user_id=auth.uid() or upper(coalesce(public.current_user_role(),''))='ADMIN' or public.has_permission('spk.view'));
drop policy if exists production_orders_select on public.production_orders;
create policy production_orders_select on public.production_orders for select to authenticated using(
  public.has_permission('spk.view') or public.has_permission('produksi.view') or public.has_permission('hasil_produksi.view') or public.has_permission('qc.view')
  or (public.has_permission('borongan.view') and lower(checker_email)=lower(coalesce(auth.jwt()->>'email','')))
  or (public.has_permission('pekerjaan_saya.view') and operator_worker_id=public.smpt_current_worker_id())
);
drop policy if exists production_order_items_select on public.production_order_items;
create policy production_order_items_select on public.production_order_items for select to authenticated using(exists(
  select 1 from public.production_orders o where o.id=order_id and (
    public.has_permission('spk.view') or public.has_permission('produksi.view') or public.has_permission('hasil_produksi.view') or public.has_permission('qc.view')
    or (public.has_permission('borongan.view') and lower(o.checker_email)=lower(coalesce(auth.jwt()->>'email','')))
    or (public.has_permission('pekerjaan_saya.view') and o.operator_worker_id=public.smpt_current_worker_id())
  )
));
drop policy if exists production_checks_select on public.production_checks;
create policy production_checks_select on public.production_checks for select to authenticated using(
  public.has_permission('hasil_produksi.view') or public.has_permission('spk.view') or public.has_permission('produksi.view') or public.has_permission('qc.view')
  or (public.has_permission('borongan.view') and lower(checker_email)=lower(coalesce(auth.jwt()->>'email','')))
  or exists(select 1 from public.production_order_items i join public.production_orders o on o.id=i.order_id where i.id=order_item_id and public.has_permission('pekerjaan_saya.view') and o.operator_worker_id=public.smpt_current_worker_id())
);

grant select on public.user_worker_links,public.production_orders,public.production_order_items,public.production_checks to authenticated;
grant usage,select on sequence public.smpt_spk_code_seq,public.smpt_check_code_seq to authenticated;
