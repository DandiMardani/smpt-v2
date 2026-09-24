-- Procurement validation hardening.
-- New migration only: do not edit previously pushed procurement migrations.

create or replace function public.smpt_update_purchase_plan_line(
  p_line_id bigint,
  p_confirmed_incoming numeric,
  p_planned_quantity numeric,
  p_supplier_id bigint,
  p_unit_price numeric,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_line public.purchase_plan_lines%rowtype;
  v_net numeric(18,4);
  v_planned numeric(18,4);
begin
  if not public.has_permission('procurement.edit_draft') then
    raise exception 'Tidak memiliki izin mengubah Purchase Planning.' using errcode='42501';
  end if;

  select l.* into v_line
  from public.purchase_plan_lines l
  join public.purchase_plans p on p.id=l.purchase_plan_id
  where l.id=p_line_id and p.status='DRAFT'
  for update of l;

  if not found then
    raise exception 'Baris Purchase Planning DRAFT tidak ditemukan.';
  end if;

  if coalesce(p_confirmed_incoming,0)<0
     or coalesce(p_planned_quantity,0)<0
     or coalesce(p_unit_price,0)<0 then
    raise exception 'Qty/harga tidak boleh negatif.';
  end if;

  v_planned := round(coalesce(p_planned_quantity,0)::numeric,4);

  -- A line with quantity to purchase is not actionable without a supplier.
  -- Keep the database rule aligned with the inline UI validation so direct
  -- RPC calls cannot bypass the business rule.
  if v_planned > 0 and p_supplier_id is null then
    raise exception 'Supplier wajib dipilih karena Qty Direncanakan lebih dari 0.';
  end if;

  if p_supplier_id is not null then
    perform 1
    from public.vendors
    where id=p_supplier_id and status='AKTIF';
    if not found then
      raise exception 'Supplier tidak ditemukan/aktif.';
    end if;
  end if;

  v_net:=greatest(
    round((v_line.final_requirement-v_line.usable_stock-coalesce(p_confirmed_incoming,0)-v_line.open_po_quantity)::numeric,4),
    0
  );

  update public.purchase_plan_lines set
    confirmed_incoming=round(coalesce(p_confirmed_incoming,0)::numeric,4),
    net_procurement_need=v_net,
    planned_quantity=v_planned,
    supplier_id=p_supplier_id,
    unit_price=p_unit_price,
    notes=nullif(btrim(coalesce(p_notes,'')),''),
    updated_by=auth.uid(),
    updated_at=now()
  where id=p_line_id;
end;
$$;

revoke all on function public.smpt_update_purchase_plan_line(bigint,numeric,numeric,bigint,numeric,text) from public;
grant execute on function public.smpt_update_purchase_plan_line(bigint,numeric,numeric,bigint,numeric,text) to authenticated;

notify pgrst, 'reload schema';
