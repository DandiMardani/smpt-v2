-- Migration: 20260926083000_grant_payroll_service_role.sql
grant select, insert, update on public.payroll_runs to service_role;
grant select, insert, update on public.payroll_run_items to service_role;
