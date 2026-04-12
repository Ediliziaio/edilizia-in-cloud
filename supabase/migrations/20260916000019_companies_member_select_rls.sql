-- Allow any authenticated user to SELECT their own company
-- Needed for operai/subappaltatori who are not company_admin
-- Without this, effectiveCompany is null and chat/profiles queries fail
-- Usa get_user_company_id() (SECURITY DEFINER) per evitare ricorsione
DROP POLICY IF EXISTS "Members can view their own company" ON public.companies;
CREATE POLICY "Members can view their own company"
  ON public.companies FOR SELECT
  TO authenticated
  USING (id = public.get_user_company_id(auth.uid()));
