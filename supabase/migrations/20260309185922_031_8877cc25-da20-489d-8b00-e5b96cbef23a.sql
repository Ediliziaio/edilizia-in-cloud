-- Fix Step 1 RLS: use get_my_company_id() instead of subquery for consistency
DROP POLICY IF EXISTS "scadenze_tenant_select" ON public.scadenze;
