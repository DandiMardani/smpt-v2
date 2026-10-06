-- Clean up test/dummy transactional data for live production launch
-- Preserves all master data: workers, locations, materials, finished_goods, product_sets,
-- projects, work_items, embarkations, embarkation_targets, users, profiles, roles, permissions.

do $$
begin
  -- 1. Clean Embarkation issues & shipments test records
  delete from public.embarkation_issues;
  delete from public.embarkation_shipments;

  -- 2. Clean Attendance test records & import batches
  delete from public.attendance_records;
  delete from public.attendance_import_rows;
  delete from public.attendance_import_batches;

  -- 3. Clean Production test records (checks, spk items, spk, manual results, operator payroll)
  delete from public.production_checks;
  delete from public.production_order_items;
  delete from public.production_orders;
  delete from public.production_manual_results;
  delete from public.operator_payroll_items;
  delete from public.operator_payroll_runs;

  -- 4. Clean finished goods transfers, bundling, and packing test records
  delete from public.finished_goods_bundling_items;
  delete from public.finished_goods_bundling;
  delete from public.finished_goods_transfers;
  delete from public.packing_runs;

  -- 5. Clean cash advances, petty cash, & payroll runs
  delete from public.cash_advance_payments;
  delete from public.cash_advances;
  delete from public.petty_cash_transactions;
  delete from public.payroll_payout_adjustments;
  delete from public.payroll_payout_deductions;
  delete from public.payroll_payout_details;
  delete from public.payroll_payouts;
  delete from public.payroll_run_details;
  delete from public.payroll_run_items;
  delete from public.payroll_runs;

  -- 6. Reset test runs
  delete from public.system_test_run_entities;
  delete from public.system_test_runs;
end;
$$;
