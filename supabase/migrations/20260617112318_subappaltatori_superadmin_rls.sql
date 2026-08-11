-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

DROP POLICY IF EXISTS subappaltatori_sicurezza_superadmin ON public.subappaltatori_sicurezza;
CREATE POLICY subappaltatori_sicurezza_superadmin ON public.subappaltatori_sicurezza
  FOR ALL USING (has_role((SELECT auth.uid()), 'super_admin'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'super_admin'::app_role));

DROP POLICY IF EXISTS contratti_subappalto_superadmin ON public.contratti_subappalto;
CREATE POLICY contratti_subappalto_superadmin ON public.contratti_subappalto
  FOR ALL USING (has_role((SELECT auth.uid()), 'super_admin'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'super_admin'::app_role));

DROP POLICY IF EXISTS sal_subappaltatori_superadmin ON public.sal_subappaltatori;
CREATE POLICY sal_subappaltatori_superadmin ON public.sal_subappaltatori
  FOR ALL USING (has_role((SELECT auth.uid()), 'super_admin'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'super_admin'::app_role));

DROP POLICY IF EXISTS ritenute_garanzia_superadmin ON public.ritenute_garanzia;
CREATE POLICY ritenute_garanzia_superadmin ON public.ritenute_garanzia
  FOR ALL USING (has_role((SELECT auth.uid()), 'super_admin'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'super_admin'::app_role));

DROP POLICY IF EXISTS documenti_subappaltatore_superadmin ON public.documenti_subappaltatore;
CREATE POLICY documenti_subappaltatore_superadmin ON public.documenti_subappaltatore
  FOR ALL USING (has_role((SELECT auth.uid()), 'super_admin'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'super_admin'::app_role));
