-- Token del portale e dei SAL, visite mediche, token di opt-in e avvisi di
-- cassa: solo a chi serve.
--
-- Trovato il 25/09/2026 nell'audit dei permessi. Le regole guardavano solo
-- l'azienda (get_my_company_id): chiunque fosse interno, anche senza nessun
-- permesso, leggeva e scriveva i token del portale (cioè poteva entrare al
-- posto di un cliente), i token di firma dei SAL e le visite mediche dei
-- dipendenti. L'azienda ce l'hanno anche i clienti del portale: oggi li
-- ferma solo il blocco del portale spento, riacceso li avrebbe fatti entrare.
-- Le tabelle erano vuote: nessun dato uscito.
--   - portale_clienti_tokens li legge valida_portale_token (SECURITY
--     DEFINER), sal_signature_tokens sal_view_by_token / sal_sign_with_token
--     e generate-sal-pdf (service role): nell'app nessuna pagina li legge o
--     li scrive direttamente. Restano all'amministratore dell'azienda
--     (can_manage_company_people: anche con un accesso multi-azienda attivo).
--   - employee_visite_mediche: dati sanitari, nessuna pagina li usa ancora.
--     Solo l'amministratore dell'azienda.
--   - email_optin_tokens: la policy «company_admin access», nonostante il
--     nome, apriva a chiunque avesse il profilo nell'azienda. Restano le due
--     per amministratore e super admin.
--   - lifecycle_notifications: gli allarmi di cassa (cash_flow_alert) li
--     vedeva e li chiudeva per tutti chiunque fosse interno, venditori
--     compresi. Ora: promemoria degli appuntamenti a tutti gli interni,
--     allarmi di cassa all'amministratore e a chi ha Tesoreria o Previsionale,
--     il resto (prova in scadenza, inattività) all'amministratore.

set local lock_timeout = '3s';

-- 1. portale_clienti_tokens -----------------------------------------------------
drop policy if exists portale_tokens_company on public.portale_clienti_tokens;
drop policy if exists portale_tokens_amministratore on public.portale_clienti_tokens;
create policy portale_tokens_amministratore on public.portale_clienti_tokens
  for all to authenticated
  using (
    public.can_manage_company_people(company_id)
  )
  with check (
    public.can_manage_company_people(company_id)
  );

-- 2. sal_signature_tokens --------------------------------------------------------
drop policy if exists sal_signature_tokens_tenant on public.sal_signature_tokens;
drop policy if exists sal_signature_tokens_amministratore on public.sal_signature_tokens;
create policy sal_signature_tokens_amministratore on public.sal_signature_tokens
  for all to authenticated
  using (
    public.can_manage_company_people(company_id)
  )
  with check (
    public.can_manage_company_people(company_id)
  );

-- 3. employee_visite_mediche -------------------------------------------------------
drop policy if exists visite_company on public.employee_visite_mediche;
drop policy if exists visite_mediche_amministratore on public.employee_visite_mediche;
create policy visite_mediche_amministratore on public.employee_visite_mediche
  for all to authenticated
  using (
    public.can_manage_company_people(company_id)
  )
  with check (
    public.can_manage_company_people(company_id)
  );

-- 4. email_optin_tokens -------------------------------------------------------------
drop policy if exists "company_admin access" on public.email_optin_tokens;

-- 5. lifecycle_notifications ----------------------------------------------------------
drop policy if exists "Company users view own notifications" on public.lifecycle_notifications;
create policy "Company users view own notifications" on public.lifecycle_notifications
  for select to authenticated
  using (
    company_id = public.get_user_company_id((select auth.uid()))
    and not (select public.utente_e_cliente_esterno())
    and (
      notification_type = 'appointment_reminder'
      or public.can_manage_company_people(company_id)
      or (notification_type = 'cash_flow_alert'
          and (company_id in (select unnest(public.aziende_con_permesso('can_view_tesoreria')))
               or company_id in (select unnest(public.aziende_con_permesso('can_view_forecast')))))
    )
  );

drop policy if exists "Company users update own notifications" on public.lifecycle_notifications;
create policy "Company users update own notifications" on public.lifecycle_notifications
  for update to authenticated
  using (
    company_id = public.get_user_company_id((select auth.uid()))
    and not (select public.utente_e_cliente_esterno())
    and (
      notification_type = 'appointment_reminder'
      or public.can_manage_company_people(company_id)
      or (notification_type = 'cash_flow_alert'
          and (company_id in (select unnest(public.aziende_con_permesso('can_view_tesoreria')))
               or company_id in (select unnest(public.aziende_con_permesso('can_view_forecast')))))
    )
  )
  with check (company_id = public.get_user_company_id((select auth.uid())));
