-- SMPT V2 - Stage C
-- Manager executive dashboard + query hardening.
-- Read-only dashboard. Existing migrations are not edited.

create index if not exists work_items_manager_progress_idx
  on public.work_items(product_id,status,output_final,id)
  where product_id is not null;

create index if not exists production_orders_manager_idx
  on public.production_orders(project_id,product_id,status,due_date,id);

create index if not exists production_order_items_work_item_idx
  on public.production_order_items(work_item_id,order_id,status,id);

create index if not exists warehouse_receipts_material_date_idx
  on public.warehouse_receipts(material_id,receipt_date desc,id desc)
  where status='AKTIF';

create index if not exists ready_usage_manager_idx
  on public.ready_production_usages(project_id,product_id,material_id,usage_date desc,id desc)
  where status='AKTIF' and item_kind='MATERIAL';

create index if not exists production_anomalies_manager_idx
  on public.production_anomalies(status,severity,detected_at desc,id desc);

create or replace function public.smpt_manager_dashboard_summary(
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_role text:=upper(coalesce(public.current_user_role(),''));
  v_from date:=coalesce(p_from,(now() at time zone 'Asia/Jakarta')::date);
  v_to date:=coalesce(p_to,(now() at time zone 'Asia/Jakarta')::date);
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
  v_result jsonb;
begin
  if v_role not in ('MANAGER','ADMIN') then
    raise exception 'Dashboard Manager hanya untuk MANAGER/ADMIN.' using errcode='42501';
  end if;
  if v_to<v_from then raise exception 'Periode dashboard tidak valid.'; end if;
  if v_to-v_from>366 then raise exception 'Periode dashboard maksimal 366 hari.'; end if;

  with final_output as (
    select
      pp.id product_id,
      pp.project_id,
      pp.name product_name,
      pp.target_production,
      pp.status product_status,
      p.name project_name,
      p.end_date project_end_date,
      w.id work_item_id,
      w.qty_per_product,
      coalesce(sum(c.good_qty) filter(where c.status='AKTIF' and o.status<>'DIBATALKAN'),0)::numeric as qty_sah
    from public.project_products pp
    join public.projects p on p.id=pp.project_id
    left join public.work_items w
      on w.product_id=pp.id and w.project_id=pp.project_id and w.output_final=true and w.status='AKTIF'
    left join public.production_order_items i
      on i.work_item_id=w.id and i.status<>'DIBATALKAN'
    left join public.production_orders o
      on o.id=i.order_id and o.status<>'DIBATALKAN'
    left join public.production_checks c
      on c.order_item_id=i.id and c.status='AKTIF'
    where pp.status='AKTIF'
    group by pp.id,pp.project_id,pp.name,pp.target_production,pp.status,p.name,p.end_date,w.id,w.qty_per_product
  ), product_progress as (
    select
      product_id,project_id,product_name,target_production,product_status,project_name,project_end_date,
      (work_item_id is not null) as output_final_configured,
      round(coalesce(qty_sah/nullif(qty_per_product,0),0)::numeric,4) actual,
      round(greatest(target_production-coalesce(qty_sah/nullif(qty_per_product,0),0),0)::numeric,4) remaining,
      round(case when target_production>0 then (coalesce(qty_sah/nullif(qty_per_product,0),0)/target_production)*100 else 0 end::numeric,2) progress_percent
    from final_output
  ), top_products as (
    select * from product_progress
    order by progress_percent asc,project_name,product_name
    limit 12
  ), workforce as (
    select
      count(*)::int total_workers,
      count(*) filter(where status='AKTIF')::int active_workers,
      count(*) filter(where status='AKTIF' and upper(coalesce(pay_system,''))='HARIAN')::int harian,
      count(*) filter(where status='AKTIF' and upper(coalesce(pay_system,''))='BULANAN')::int bulanan,
      count(*) filter(where status='AKTIF' and upper(coalesce(pay_system,''))='BORONGAN')::int borongan
    from public.workers
  ), attendance_today as (
    select count(distinct worker_id)::int hadir
    from public.attendance_records
    where attendance_date=v_today
      and attendance_status='HADIR'
      and verification_status='TERVERIFIKASI'
  ), prod_period as (
    select
      coalesce(sum(c.good_qty),0)::numeric qty_sah,
      coalesce(sum(c.good_qty*i.operator_price_snapshot),0)::numeric operator_value
    from public.production_checks c
    join public.production_order_items i on i.id=c.order_item_id
    join public.production_orders o on o.id=i.order_id
    where c.status='AKTIF' and o.status<>'DIBATALKAN' and c.check_date between v_from and v_to
  ), finance_period as (
    select
      coalesce(sum(amount) filter(where direction='MASUK' and status='AKTIF'),0)::numeric kas_masuk,
      coalesce(sum(amount) filter(where direction='KELUAR' and status='AKTIF'),0)::numeric kas_keluar,
      coalesce(sum(amount) filter(where direction='KELUAR' and status='AKTIF' and upper(category) like '%OPERAS%'),0)::numeric operational_expense
    from public.finance_transactions
    where transaction_date between v_from and v_to
  ), petty as (
    select coalesce(sum(case when direction='MASUK' then amount else -amount end) filter(where status='AKTIF'),0)::numeric saldo
    from public.petty_cash_transactions
  ), general_payroll as (
    select coalesce(sum(total_net),0)::numeric total_net
    from public.payroll_runs
    where status='FINAL' and period_start<=v_to and period_end>=v_from
  ), operator_payroll as (
    select coalesce(sum(total_operator_value),0)::numeric total_operator
    from public.operator_payroll_runs
    where status='FINAL' and period_start<=v_to and period_end>=v_from
  ), kasbon as (
    select coalesce(sum(greatest(amount-paid_amount,0)),0)::numeric outstanding
    from public.cash_advances where status='AKTIF'
  ), alerts as (
    select
      (select count(*) from public.production_anomalies where status='OPEN')::int open_anomalies,
      (select count(*) from public.production_orders where status='AKTIF' and due_date is not null and due_date<v_today)::int overdue_spk,
      (select count(*) from product_progress where project_end_date is not null and project_end_date<v_today and progress_percent<100)::int late_products,
      (select count(*) from product_progress where not output_final_configured)::int missing_output_final
  )
  select jsonb_build_object(
    'period',jsonb_build_object('from',v_from,'to',v_to),
    'production',jsonb_build_object(
      'active_projects',(select count(*) from public.projects where upper(coalesce(status,'')) not in ('SELESAI','BATAL','DIBATALKAN','NONAKTIF')),
      'active_products',(select count(*) from public.project_products where status='AKTIF'),
      'active_spk',(select count(*) from public.production_orders where status='AKTIF'),
      'qty_sah_period',(select qty_sah from prod_period),
      'top_products',coalesce((select jsonb_agg(to_jsonb(t)) from top_products t),'[]'::jsonb)
    ),
    'workforce',jsonb_build_object(
      'total',(select total_workers from workforce),
      'active',(select active_workers from workforce),
      'harian',(select harian from workforce),
      'bulanan',(select bulanan from workforce),
      'borongan',(select borongan from workforce),
      'hadir_today',(select hadir from attendance_today),
      'belum_hadir',greatest((select active_workers from workforce)-(select hadir from attendance_today),0),
      'operator_spk_active',(select count(distinct operator_worker_id) from public.production_orders where status='AKTIF'),
      'spk_active',(select count(*) from public.production_orders where status='AKTIF'),
      'qty_sah_period',(select qty_sah from prod_period),
      'upah_borongan_period',(select operator_value from prod_period)
    ),
    'finance',jsonb_build_object(
      'kas_masuk',(select kas_masuk from finance_period),
      'kas_keluar',(select kas_keluar from finance_period),
      'saldo',(select kas_masuk-kas_keluar from finance_period),
      'kas_kecil',(select saldo from petty),
      'payroll_harian_bulanan',(select total_net from general_payroll),
      'payroll_borongan',(select total_operator from operator_payroll),
      'kasbon_outstanding',(select outstanding from kasbon),
      'pengeluaran_operasional',(select operational_expense from finance_period)
    ),
    'attention',jsonb_build_object(
      'workflow_anomaly',(select open_anomalies from alerts),
      'spk_terlambat',(select overdue_spk from alerts),
      'produk_terlambat',(select late_products from alerts),
      'output_final_belum_diset',(select missing_output_final from alerts)
    ),
    'filters',jsonb_build_object(
      'projects',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name) from public.projects p where upper(coalesce(p.status,'')) not in ('BATAL','DIBATALKAN','NONAKTIF')),'[]'::jsonb),
      'products',coalesce((select jsonb_agg(jsonb_build_object('id',pp.id,'project_id',pp.project_id,'name',pp.name) order by pp.project_id,pp.name) from public.project_products pp where pp.status='AKTIF'),'[]'::jsonb)
    ),
    'generated_at',now()
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.smpt_manager_dashboard_summary(date,date) from public;
grant execute on function public.smpt_manager_dashboard_summary(date,date) to authenticated;

create or replace function public.smpt_manager_dashboard_detail(
  p_section text,
  p_from date default null,
  p_to date default null,
  p_project_id bigint default null,
  p_product_id bigint default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_role text:=upper(coalesce(public.current_user_role(),''));
  v_section text:=upper(btrim(coalesce(p_section,'')));
  v_from date:=coalesce(p_from,(now() at time zone 'Asia/Jakarta')::date);
  v_to date:=coalesce(p_to,(now() at time zone 'Asia/Jakarta')::date);
  v_today date:=(now() at time zone 'Asia/Jakarta')::date;
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),100);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_result jsonb;
begin
  if v_role not in ('MANAGER','ADMIN') then
    raise exception 'Dashboard Manager hanya untuk MANAGER/ADMIN.' using errcode='42501';
  end if;
  if v_to<v_from then raise exception 'Periode dashboard tidak valid.'; end if;
  if v_to-v_from>366 then raise exception 'Periode dashboard maksimal 366 hari.'; end if;

  if v_section='PRODUCTION' then
    with period_qty as (
      select i.work_item_id,coalesce(sum(c.good_qty),0)::numeric qty_period
      from public.production_checks c
      join public.production_order_items i on i.id=c.order_item_id
      join public.production_orders o on o.id=i.order_id
      where c.status='AKTIF' and o.status<>'DIBATALKAN' and c.check_date between v_from and v_to
      group by i.work_item_id
    ), q as (
      select
        pr.id project_id,pr.name project_name,pp.id product_id,pp.name product_name,pp.target_production,
        w.id work_item_id,w.name work_item_name,w.flow_mode,w.flow_order,w.qty_per_product,w.unit,
        coalesce(v.target_raw_qty,pp.target_production*w.qty_per_product) target_item_qty,
        coalesce(v.qty_sah,0) qty_sah,coalesce(v.equivalent_product,0) equivalent_product,
        coalesce(v.remaining_equivalent,pp.target_production) remaining_equivalent,
        coalesce(v.over_equivalent,0) over_equivalent,coalesce(v.progress_percent,0) progress_percent,
        coalesce(pq.qty_period,0) qty_sah_period
      from public.work_items w
      join public.project_products pp on pp.id=w.product_id and pp.project_id=w.project_id
      join public.projects pr on pr.id=w.project_id
      left join public.v_work_item_equivalent_progress v on v.work_item_id=w.id
      left join period_qty pq on pq.work_item_id=w.id
      where w.status='AKTIF'
        and (p_project_id is null or w.project_id=p_project_id)
        and (p_product_id is null or w.product_id=p_product_id)
      order by pr.name,pp.name,coalesce(w.flow_order,2147483647),w.name
      limit v_limit offset v_offset
    )
    select jsonb_build_object('section','PRODUCTION','items',coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb),'limit',v_limit,'offset',v_offset)
    into v_result from q;

  elsif v_section='MATERIAL' then
    with receipt as (
      select material_id,coalesce(sum(quantity),0)::numeric received_global
      from public.warehouse_receipts where status='AKTIF' group by material_id
    ), gudang as (
      select b.material_id,coalesce(sum(b.quantity),0)::numeric qty
      from public.stock_balances b join public.stock_locations l on l.id=b.location_id
      where b.item_kind='MATERIAL' and l.code='GUDANG_BAHAN'
      group by b.material_id
    ), issued as (
      select project_id,product_id,material_id,coalesce(sum(quantity),0)::numeric qty
      from public.warehouse_issues
      where purpose='PRODUKSI' and material_id is not null
      group by project_id,product_id,material_id
    ), consumed as (
      select project_id,product_id,material_id,coalesce(sum(normalized_quantity),0)::numeric qty
      from public.v_material_actual_consumption
      where process='PRODUKSI' and consumption_date<=v_to
      group by project_id,product_id,material_id
    ), area as (
      select b.project_id,b.product_id,b.material_id,coalesce(sum(b.quantity),0)::numeric qty
      from public.stock_balances b join public.stock_locations l on l.id=b.location_id
      where b.item_kind='MATERIAL' and l.code='SIAP_PRODUKSI'
      group by b.project_id,b.product_id,b.material_id
    ), q as (
      select
        br.project_id,pr.name project_name,br.product_id,pp.name product_name,br.material_id,m.name material_name,m.standard_unit unit,
        round((pp.target_production*br.qty_per_unit)::numeric,4) total_requirement,
        coalesce(r.received_global,0) received_global,
        greatest(round((pp.target_production*br.qty_per_unit)::numeric,4)-coalesce(r.received_global,0),0) shortfall_vs_global_receipt,
        coalesce(g.qty,0) warehouse_stock_global,
        coalesce(i.qty,0) issued_to_production,
        coalesce(c.qty,0) actual_consumed,
        coalesce(a.qty,0) production_area_stock,
        coalesce(g.qty,0)+coalesce(a.qty,0) total_visible_stock,
        'Barang Masuk dan stok Gudang bahan masih global per material; angka global tidak dialokasikan eksklusif ke satu Produk/Tas.'::text scope_note
      from public.bom_requirements br
      join public.projects pr on pr.id=br.project_id
      join public.project_products pp on pp.id=br.product_id
      join public.materials m on m.id=br.material_id
      left join receipt r on r.material_id=br.material_id
      left join gudang g on g.material_id=br.material_id
      left join issued i on i.project_id=br.project_id and i.product_id=br.product_id and i.material_id=br.material_id
      left join consumed c on c.project_id=br.project_id and c.product_id=br.product_id and c.material_id=br.material_id
      left join area a on a.project_id=br.project_id and a.product_id=br.product_id and a.material_id=br.material_id
      where br.status='AKTIF' and br.component_type='BAHAN' and br.product_id is not null
        and (p_project_id is null or br.project_id=p_project_id)
        and (p_product_id is null or br.product_id=p_product_id)
      order by pr.name,pp.name,m.name
      limit v_limit offset v_offset
    )
    select jsonb_build_object('section','MATERIAL','items',coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb),'limit',v_limit,'offset',v_offset)
    into v_result from q;

  elsif v_section='WORKFORCE' then
    with att as (
      select worker_id,max(attendance_status) filter(where attendance_date=v_today and verification_status='TERVERIFIKASI') attendance_today
      from public.attendance_records group by worker_id
    ), spk as (
      select operator_worker_id,count(*) filter(where status='AKTIF')::int active_spk
      from public.production_orders group by operator_worker_id
    ), prod as (
      select o.operator_worker_id,coalesce(sum(c.good_qty),0)::numeric qty_sah,
             coalesce(sum(c.good_qty*i.operator_price_snapshot),0)::numeric operator_value
      from public.production_checks c
      join public.production_order_items i on i.id=c.order_item_id
      join public.production_orders o on o.id=i.order_id
      where c.status='AKTIF' and o.status<>'DIBATALKAN' and c.check_date between v_from and v_to
      group by o.operator_worker_id
    ), q as (
      select w.id worker_id,w.worker_code,w.name,w.department,w.position,w.pay_system,w.status,
             coalesce(a.attendance_today,'BELUM ADA DATA') attendance_today,
             coalesce(s.active_spk,0) active_spk,coalesce(p.qty_sah,0) qty_sah_period,coalesce(p.operator_value,0) upah_borongan_period
      from public.workers w
      left join att a on a.worker_id=w.id
      left join spk s on s.operator_worker_id=w.id
      left join prod p on p.operator_worker_id=w.id
      where w.status='AKTIF'
      order by w.name
      limit v_limit offset v_offset
    )
    select jsonb_build_object('section','WORKFORCE','items',coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb),'limit',v_limit,'offset',v_offset)
    into v_result from q;

  elsif v_section='FINANCE' then
    with q as (
      select * from (
        select 'KEUANGAN'::text source,transaction_date,transaction_code code,direction,category,amount,description,status
        from public.finance_transactions
        where transaction_date between v_from and v_to
        union all
        select 'KAS_KECIL',transaction_date,transaction_code,direction,category,amount,description,status
        from public.petty_cash_transactions
        where transaction_date between v_from and v_to
      ) x
      order by transaction_date desc,code desc
      limit v_limit offset v_offset
    )
    select jsonb_build_object('section','FINANCE','items',coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb),'limit',v_limit,'offset',v_offset)
    into v_result from q;

  elsif v_section='ATTENTION' then
    with product_progress as (
      select
        pp.id product_id,pp.project_id,pp.name product_name,p.name project_name,p.end_date,
        coalesce(sum(c.good_qty) filter(where c.status='AKTIF' and o.status<>'DIBATALKAN'),0)::numeric/nullif(max(w.qty_per_product),0) actual,
        pp.target_production
      from public.project_products pp
      join public.projects p on p.id=pp.project_id
      left join public.work_items w on w.product_id=pp.id and w.output_final=true and w.status='AKTIF'
      left join public.production_order_items i on i.work_item_id=w.id and i.status<>'DIBATALKAN'
      left join public.production_orders o on o.id=i.order_id
      left join public.production_checks c on c.order_item_id=i.id and c.status='AKTIF'
      where pp.status='AKTIF'
      group by pp.id,pp.project_id,pp.name,p.name,p.end_date,pp.target_production
    ), q as (
      select * from (
        select a.detected_at event_at,a.severity,a.anomaly_type attention_type,
               coalesce(pr.name,'-') project_name,coalesce(pp.name,'-') product_name,
               coalesce(w.name,'-') source_name,
               concat('Anomaly ',a.anomaly_code,' · excess ',coalesce(a.excess_equivalent,0)) detail
        from public.production_anomalies a
        left join public.projects pr on pr.id=a.project_id
        left join public.project_products pp on pp.id=a.product_id
        left join public.work_items w on w.id=a.work_item_id
        where a.status='OPEN'
          and (p_project_id is null or a.project_id=p_project_id)
          and (p_product_id is null or a.product_id=p_product_id)
        union all
        select o.created_at,'WARNING','SPK_TERLAMBAT',pr.name,pp.name,o.spk_code,
               concat('Due ',o.due_date,' · operator ',coalesce(w.name,'-'))
        from public.production_orders o
        join public.projects pr on pr.id=o.project_id
        join public.project_products pp on pp.id=o.product_id
        join public.workers w on w.id=o.operator_worker_id
        where o.status='AKTIF' and o.due_date is not null and o.due_date<v_today
          and (p_project_id is null or o.project_id=p_project_id)
          and (p_product_id is null or o.product_id=p_product_id)
        union all
        select now(),'WARNING','PRODUK_TERLAMBAT',project_name,product_name,product_name,
               concat('Target ',target_production,' · actual ',round(coalesce(actual,0)::numeric,4),' · deadline ',end_date)
        from product_progress
        where end_date is not null and end_date<v_today and coalesce(actual,0)<target_production
          and (p_project_id is null or project_id=p_project_id)
          and (p_product_id is null or product_id=p_product_id)
      ) a
      order by event_at desc
      limit v_limit offset v_offset
    )
    select jsonb_build_object('section','ATTENTION','items',coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb),'limit',v_limit,'offset',v_offset)
    into v_result from q;

  elsif v_section='HISTORY' then
    with q as (
      select * from (
        select c.created_at event_at,'CHECKER'::text event_type,c.check_code code,o.project_id,o.product_id,
               pr.name project_name,pp.name product_name,
               concat(i.work_item_name_snapshot,' · Sah ',c.good_qty,' · Reject ',c.reject_qty) detail,c.status
        from public.production_checks c
        join public.production_order_items i on i.id=c.order_item_id
        join public.production_orders o on o.id=i.order_id
        join public.projects pr on pr.id=o.project_id
        join public.project_products pp on pp.id=o.product_id
        where c.check_date between v_from and v_to
        union all
        select o.created_at,'SPK',o.spk_code,o.project_id,o.product_id,pr.name,pp.name,
               concat('Operator ',w.name,' · status ',o.status),o.status
        from public.production_orders o
        join public.projects pr on pr.id=o.project_id
        join public.project_products pp on pp.id=o.product_id
        join public.workers w on w.id=o.operator_worker_id
        where o.order_date between v_from and v_to
        union all
        select e.created_at,'STOK/WIP',e.event_code,e.project_id,e.product_id,coalesce(pr.name,'-'),coalesce(pp.name,'-'),
               concat(e.event_type,' · ',coalesce(e.reference_type,'-'),' ',coalesce(e.reference_code,'')),case when e.reversal_of_event_id is null then 'AKTIF' else 'REVERSAL' end
        from public.stock_events e
        left join public.projects pr on pr.id=e.project_id
        left join public.project_products pp on pp.id=e.product_id
        where e.event_date between v_from and v_to
        union all
        select qci.created_at,'QC',qci.qc_code,o.project_id,o.product_id,pr.name,pp.name,
               concat('Good ',qci.good_qty,' · Reject ',qci.reject_qty,' · Rework ',qci.rework_qty),qci.status
        from public.qc_inspections qci
        join public.production_checks pc on pc.id=qci.production_check_id
        join public.production_order_items poi on poi.id=pc.order_item_id
        join public.production_orders o on o.id=poi.order_id
        join public.projects pr on pr.id=o.project_id
        join public.project_products pp on pp.id=o.product_id
        where qci.inspection_date between v_from and v_to
        union all
        select f.created_at,'KEUANGAN',f.transaction_code,null::bigint,null::bigint,'-'::text,'-'::text,
               concat(f.direction,' · ',f.category,' · ',f.description),f.status
        from public.finance_transactions f
        where f.transaction_date between v_from and v_to
      ) x
      where (p_project_id is null or x.project_id=p_project_id)
        and (p_product_id is null or x.product_id=p_product_id)
      order by event_at desc
      limit v_limit offset v_offset
    )
    select jsonb_build_object('section','HISTORY','items',coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb),'limit',v_limit,'offset',v_offset)
    into v_result from q;

  else
    raise exception 'Section dashboard tidak valid.';
  end if;

  return coalesce(v_result,jsonb_build_object('section',v_section,'items','[]'::jsonb,'limit',v_limit,'offset',v_offset));
end;
$$;

revoke all on function public.smpt_manager_dashboard_detail(text,date,date,bigint,bigint,integer,integer) from public;
grant execute on function public.smpt_manager_dashboard_detail(text,date,date,bigint,bigint,integer,integer) to authenticated;

comment on function public.smpt_manager_dashboard_summary(date,date) is
  'Read-only executive summary for MANAGER/ADMIN. Initial dashboard uses one aggregate RPC.';
comment on function public.smpt_manager_dashboard_detail(text,date,date,bigint,bigint,integer,integer) is
  'Lazy manager dashboard detail endpoint with bounded pagination.';
