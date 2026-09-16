-- Calendari: li gestisce anche lo staff che ha il permesso sulle impostazioni.
--
-- Creare, modificare, spegnere o eliminare un calendario (e i suoi orari e le
-- preferenze) era permesso solo a company_admin dell'azienda del profilo: la
-- pagina Impostazioni → Calendari si apriva allo staff con «Personalizzazione»
-- ma in sola lettura, e un admin multi-azienda veniva respinto dal database
-- nell'azienda secondaria. Stessa cosa per squadre e calendari lavori.
--
-- Regola nuova, la stessa dei permessi del resto delle impostazioni:
--   - calendari marketing, orari, preferenze → can_edit_settings_customization
--   - squadre (external_teams) e calendari lavori → can_edit_settings_orders
-- has_permission_for_company vale già per super_admin, company_admin
-- dell'azienda e admin multi-azienda; «Sola lettura» spegne i due permessi.
-- Le policy esistenti restano: queste si aggiungono in OR.

set local lock_timeout = '3s';

drop policy if exists calendari_gestione_staff on public.marketing_calendars;
create policy calendari_gestione_staff on public.marketing_calendars
  for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_customization', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_customization', company_id));

drop policy if exists calendari_orari_gestione_staff on public.marketing_calendar_availability;
create policy calendari_orari_gestione_staff on public.marketing_calendar_availability
  for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_customization', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_customization', company_id));

drop policy if exists calendari_preferenze_gestione_staff on public.marketing_calendar_preferences;
create policy calendari_preferenze_gestione_staff on public.marketing_calendar_preferences
  for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_customization', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_customization', company_id));

drop policy if exists calendari_lavori_gestione_staff on public.company_calendar_links;
create policy calendari_lavori_gestione_staff on public.company_calendar_links
  for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_orders', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_orders', company_id));

drop policy if exists squadre_gestione_staff on public.external_teams;
create policy squadre_gestione_staff on public.external_teams
  for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_orders', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_orders', company_id));
