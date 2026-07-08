-- Il super_admin gestisce le spese marketing della company piattaforma da
-- /admin/marketing/dashboard: le policy esistenti coprono solo la PROPRIA
-- company (get_user_company_id) → per la platform company nessuno poteva
-- inserire/leggere (tabella vuota da sempre nonostante le card la usino).
CREATE POLICY campaign_costs_super_admin ON public.campaign_costs
  FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'super_admin'::app_role));
