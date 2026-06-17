-- Fix: scheda subappaltatore "non trovata" quando un super_admin la apre in
-- "Visualizza come". La lista usa la vista v_subappaltatori_dashboard (gira come
-- owner → bypassa RLS), ma SubappaltatoreDetail legge le tabelle dirette: senza
-- bypass super_admin la RLS nasconde le righe e `.single()` fallisce.
--
-- `subappaltatori` e `subappaltatori_documenti` hanno GIÀ il bypass super_admin;
-- qui lo allineiamo sulle altre tabelle del fascicolo. Policy ADDITIVA (permissive
-- in OR): non allenta l'accesso degli utenti normali, abilita solo il super_admin
-- (stesso pattern di has_role già usato altrove).

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
