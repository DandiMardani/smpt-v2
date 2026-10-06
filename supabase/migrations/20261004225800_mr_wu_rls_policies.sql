-- Allow mr_wu.view permission in RLS policies for logistics_stock_balances and finished_goods_transfers

drop policy if exists logistics_balance_select on public.logistics_stock_balances;
create policy logistics_balance_select on public.logistics_stock_balances for select to authenticated
using (
  public.has_permission('stok_barang_jadi.view') or
  public.has_permission('stok_set.view') or
  public.has_permission('transfer_barang_jadi.view') or
  public.has_permission('packing_set.view') or
  public.has_permission('pengiriman_embarkasi.view') or
  public.has_permission('mr_wu.view')
);

drop policy if exists transfers_select on public.finished_goods_transfers;
create policy transfers_select on public.finished_goods_transfers for select to authenticated
using (
  public.has_permission('transfer_barang_jadi.view') or
  public.has_permission('stok_barang_jadi.view') or
  public.has_permission('mr_wu.view')
);
