-- Fatturazione: l'integrazione si vede davvero, e i token non si leggono più dal browser.
--
-- 1) VISIBILITÀ. Le policy su billing_integrations usavano get_user_company_id()
--    (= profiles.company_id) mentre TUTTO il resto del prodotto usa
--    get_my_company_id() (= azienda EFFETTIVA, quindi impersonation e
--    multi-azienda). Conseguenza concreta: a un utente multi-azienda o in
--    impersonation la pagina Fatturazione diceva "Connetti il tuo gestionale"
--    e teneva "Sincronizza" DISABILITATO su un'azienda che il gestionale ce
--    l'ha collegato e sincronizzato.
--
-- 2) TOKEN. access_token/refresh_token/api_key stavano in chiaro con SELECT
--    concesso: qualunque company_admin poteva leggersi le credenziali OAuth
--    di Fatture in Cloud dal browser. La UI non le usa (legge solo id,
--    provider, last_sync_*) e le edge function girano in service_role, che
--    ignora i privilegi di colonna: toglierle non rompe niente.
--
-- 3) Colonna per dire in FACCIA all'utente che al collegamento manca il
--    permesso sulle fatture ricevute (vedi billing-import).

-- ── 1) Policy sull'azienda effettiva ──────────────────────────────────────
drop policy if exists billing_integrations_admin_select on public.billing_integrations;
create policy billing_integrations_admin_select
  on public.billing_integrations for select
  using (
    (company_id = public.get_my_company_id() and public.has_role((select auth.uid()), 'company_admin'::app_role))
    or public.has_role((select auth.uid()), 'super_admin'::app_role)
  );

drop policy if exists billing_integrations_admin_modify on public.billing_integrations;
create policy billing_integrations_admin_modify
  on public.billing_integrations for all
  using (
    (company_id = public.get_my_company_id() and public.has_role((select auth.uid()), 'company_admin'::app_role))
    or public.has_role((select auth.uid()), 'super_admin'::app_role)
  )
  with check (
    (company_id = public.get_my_company_id() and public.has_role((select auth.uid()), 'company_admin'::app_role))
    or public.has_role((select auth.uid()), 'super_admin'::app_role)
  );

-- ── 2) I segreti restano al servizio, non al browser ──────────────────────
revoke select (access_token, refresh_token, api_key) on public.billing_integrations from authenticated;
revoke select (access_token, refresh_token, api_key) on public.billing_integrations from anon;

-- ── 3) "Manca il permesso": un fatto, non un silenzio ─────────────────────
alter table public.billing_integrations
  add column if not exists received_scope_missing boolean not null default false;

comment on column public.billing_integrations.received_scope_missing is
  'true = il provider ha risposto 403 sulle fatture RICEVUTE: al collegamento manca il permesso (FIC: received_documents:r) e l''account va ricollegato. Scritta da billing-import, letta dalla pagina Fatture Ricevute.';
