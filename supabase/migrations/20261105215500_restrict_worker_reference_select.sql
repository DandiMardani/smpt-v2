-- Remove the broad worker-reference policy; existing permission-scoped policies
-- continue to control which authenticated users can read worker records.
DROP POLICY IF EXISTS "authenticated_select_workers" ON public.workers;
