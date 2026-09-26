-- Preferenze di notifica: ognuno le sue (26/09/2026).
--
-- La policy company_access_notif_prefs (FOR ALL, senza WITH CHECK) lasciava a
-- chiunque della stessa azienda leggere e riscrivere le preferenze di notifica
-- di chiunque altro: un collega poteva spegnere gli avvisi di un altro. Da oggi
-- quelle preferenze contano davvero (avvisa_messaggi_conversazioni, promemoria
-- delle attività), quindi la porta va chiusa.
--
-- - Le proprie: lettura e scrittura, e solo in un'azienda a cui si appartiene.
-- - Quelle dei colleghi: chi ha «Modifica» su Impostazioni → Persone (la scheda
--   utente → Notifiche, SettingsUserDetail); chi ha solo «Vedi» le legge.
--   has_permission_for_company dà già il via a super admin e amministratori.
-- - Resta la RESTRICTIVE blocco_utente_bloccato; restano fuori i clienti esterni.

SET LOCAL lock_timeout = '3s';

DROP POLICY IF EXISTS company_access_notif_prefs ON public.user_notification_preferences;
DROP POLICY IF EXISTS notif_prefs_le_proprie ON public.user_notification_preferences;
DROP POLICY IF EXISTS notif_prefs_chi_gestisce_le_persone ON public.user_notification_preferences;
DROP POLICY IF EXISTS notif_prefs_chi_vede_le_persone ON public.user_notification_preferences;

CREATE POLICY notif_prefs_le_proprie ON public.user_notification_preferences
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) AND NOT public.utente_e_cliente_esterno())
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND NOT public.utente_e_cliente_esterno()
    AND (company_id IS NULL OR public.user_can_access_company(company_id))
  );

CREATE POLICY notif_prefs_chi_gestisce_le_persone ON public.user_notification_preferences
  FOR ALL TO authenticated
  USING (public.has_permission_for_company((SELECT auth.uid()), 'can_edit_settings_people', company_id))
  WITH CHECK (public.has_permission_for_company((SELECT auth.uid()), 'can_edit_settings_people', company_id));

CREATE POLICY notif_prefs_chi_vede_le_persone ON public.user_notification_preferences
  FOR SELECT TO authenticated
  USING (public.has_permission_for_company((SELECT auth.uid()), 'can_view_settings_people', company_id));
