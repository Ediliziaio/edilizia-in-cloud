-- Scadenze e incassi: servono i permessi della finanza.
--
-- Trovato il 25/09/2026 nell'audit dei permessi:
--   - scadenze: le regole guardavano solo l'azienda (e l'esclusione dei
--     clienti del portale): chi era interno, venditori compresi, leggeva e
--     scriveva tutte le scadenze di incassi e pagamenti;
--   - get_scadenzario_summary, mark_scadenza_paid, registra_incasso_atomico,
--     storna_incasso_atomico ed email_scadenza_conferma (SECURITY DEFINER)
--     controllavano solo l'azienda: chiunque interno registrava o stornava
--     un incasso, segnava pagata una scadenza, creando anche la prima nota.
--
-- Chi le legge: le pagine che le mostrano, cioè Scadenzario, Fatturazione,
-- Tesoreria, Prima nota, Previsionale, Cruscotto, Controllo di gestione,
-- Pagamenti, Costi, Report finanziari, Ticket (il pagamento del ticket) e
-- Fornitori (i totali aperti per fornitore); il commercialista (policy a
-- parte, invariate).
-- Chi le scrive: Scadenzario, Fatturazione, Tesoreria, Pagamenti, e per i
-- loro casi Ticket (pagamento del ticket) e Impostazioni fornitori (unione
-- di due fornitori). Il servizio (senza utente) passa come prima.

set local lock_timeout = '3s';

-- 1. Chi può vedere e gestire le scadenze ------------------------------------------
create or replace function public.puo_vedere_scadenze(_company_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(
    auth.uid() is not null
    and _company_id is not null
    and not public.utente_bloccato()
    and not public.utente_e_cliente_esterno()
    and (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      or public.user_can_read_accountant_company(_company_id)
      or _company_id = any (public.aziende_con_uno_dei_permessi(array[
           'can_view_billing', 'can_view_scadenzario', 'can_view_tesoreria', 'can_view_prima_nota',
           'can_view_forecast', 'can_view_cruscotto', 'can_view_controllo_gestione', 'can_manage_payments',
           'can_view_costs', 'can_view_financial_reports', 'can_view_tickets', 'can_manage_suppliers',
           'can_edit_settings_suppliers']))
    ),
    false);
$function$;
revoke all on function public.puo_vedere_scadenze(uuid) from public, anon;
grant execute on function public.puo_vedere_scadenze(uuid) to authenticated, service_role;

create or replace function public.puo_gestire_scadenze(_company_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(
    auth.uid() is not null
    and _company_id is not null
    and not public.utente_bloccato()
    and not public.utente_e_cliente_esterno()
    and (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      or public.user_can_write_accountant_company(_company_id)
      or _company_id = any (public.aziende_con_uno_dei_permessi(array[
           'can_view_billing', 'can_view_scadenzario', 'can_view_tesoreria', 'can_manage_payments',
           'can_edit_tickets', 'can_edit_settings_suppliers']))
    ),
    false);
$function$;
revoke all on function public.puo_gestire_scadenze(uuid) from public, anon;
grant execute on function public.puo_gestire_scadenze(uuid) to authenticated, service_role;

-- 2. scadenze -------------------------------------------------------------------------
drop policy if exists scadenze_lettura_authenticated on public.scadenze;
drop policy if exists scadenze_tenant_insert on public.scadenze;
drop policy if exists scadenze_tenant_update on public.scadenze;
drop policy if exists scadenze_tenant_delete on public.scadenze;

drop policy if exists scadenze_lettura on public.scadenze;
create policy scadenze_lettura on public.scadenze
  for select to authenticated
  using (
    public.user_can_read_accountant_company(company_id)
    or (company_id = (select public.get_my_company_id())
        and not (select public.utente_e_cliente_esterno())
        and company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
          'can_view_billing', 'can_view_scadenzario', 'can_view_tesoreria', 'can_view_prima_nota',
          'can_view_forecast', 'can_view_cruscotto', 'can_view_controllo_gestione', 'can_manage_payments',
          'can_view_costs', 'can_view_financial_reports', 'can_view_tickets', 'can_manage_suppliers',
          'can_edit_settings_suppliers']))))
  );

drop policy if exists scadenze_inserimento on public.scadenze;
create policy scadenze_inserimento on public.scadenze
  for insert to authenticated
  with check (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
    and company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
      'can_view_billing', 'can_view_scadenzario', 'can_view_tesoreria', 'can_manage_payments',
      'can_edit_tickets', 'can_edit_settings_suppliers'])))
  );

drop policy if exists scadenze_modifica on public.scadenze;
create policy scadenze_modifica on public.scadenze
  for update to authenticated
  using (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
    and company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
      'can_view_billing', 'can_view_scadenzario', 'can_view_tesoreria', 'can_manage_payments',
      'can_edit_tickets', 'can_edit_settings_suppliers'])))
  )
  with check (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
    and company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
      'can_view_billing', 'can_view_scadenzario', 'can_view_tesoreria', 'can_manage_payments',
      'can_edit_tickets', 'can_edit_settings_suppliers'])))
  );

drop policy if exists scadenze_cancellazione on public.scadenze;
create policy scadenze_cancellazione on public.scadenze
  for delete to authenticated
  using (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
    and company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
      'can_view_billing', 'can_view_scadenzario', 'can_view_tesoreria', 'can_manage_payments'])))
  );

-- 3. Le funzioni di scadenze e incassi controllano il permesso -----------------------
create or replace function pg_temp.aggiungi_controllo(p_firma text, p_segno text, p_ancora text, p_aggiunta text)
 returns void
 language plpgsql
as $function$
declare
  v_def text := pg_catalog.pg_get_functiondef(p_firma::pg_catalog.regprocedure);
  v_volte integer;
begin
  if position(p_segno in v_def) > 0 then
    return;  -- già applicata
  end if;
  v_volte := (length(v_def) - length(replace(v_def, p_ancora, ''))) / length(p_ancora);
  if v_volte <> 1 then
    raise exception '%: punto di aggancio trovato % volte invece di una', p_firma, v_volte;
  end if;
  execute replace(v_def, p_ancora, p_ancora || p_aggiunta);
end;
$function$;

select pg_temp.aggiungi_controllo(
  'public.get_scadenzario_summary(uuid,date,date)', 'puo_vedere_scadenze(',
  E'  perform public.assert_company_access(p_company_id);\n',
  E'  if auth.uid() is not null and not public.puo_vedere_scadenze(p_company_id) then\n'
  || E'    raise exception ''Non hai il permesso di vedere le scadenze.'' using errcode = ''42501'';\n'
  || E'  end if;\n');

select pg_temp.aggiungi_controllo(
  'public.mark_scadenza_paid(uuid,numeric,text,date,text,text)', 'puo_gestire_scadenze(',
  E'  PERFORM public.assert_company_access(v_scadenza.company_id);\n',
  E'  IF auth.uid() IS NOT NULL AND NOT public.puo_gestire_scadenze(v_scadenza.company_id) THEN\n'
  || E'    RAISE EXCEPTION ''Non hai il permesso di registrare pagamenti.'' USING ERRCODE = ''42501'';\n'
  || E'  END IF;\n');

select pg_temp.aggiungi_controllo(
  'public.registra_incasso_atomico(uuid,uuid,numeric,text,date,text,text)', 'puo_gestire_scadenze(',
  E'      RAISE EXCEPTION ''Accesso negato: non autorizzato per questa azienda'';\n    END IF;\n  END IF;\n',
  E'  IF auth.uid() IS NOT NULL AND NOT public.puo_gestire_scadenze(p_company_id) THEN\n'
  || E'    RAISE EXCEPTION ''Non hai il permesso di registrare incassi.'' USING ERRCODE = ''42501'';\n'
  || E'  END IF;\n');

select pg_temp.aggiungi_controllo(
  'public.storna_incasso_atomico(uuid,uuid)', 'puo_gestire_scadenze(',
  E'      RAISE EXCEPTION ''Accesso negato: non autorizzato per questa azienda'';\n    END IF;\n  END IF;\n',
  E'  IF auth.uid() IS NOT NULL AND NOT public.puo_gestire_scadenze(p_company_id) THEN\n'
  || E'    RAISE EXCEPTION ''Non hai il permesso di stornare incassi.'' USING ERRCODE = ''42501'';\n'
  || E'  END IF;\n');

select pg_temp.aggiungi_controllo(
  'public.email_scadenza_conferma(uuid)', 'puo_gestire_scadenze(',
  E'  IF v_b.id IS NULL THEN RAISE EXCEPTION ''bozza_not_found''; END IF;\n',
  E'  IF auth.uid() IS NOT NULL AND NOT public.puo_gestire_scadenze(v_company) THEN\n'
  || E'    RAISE EXCEPTION ''Non hai il permesso di aggiungere scadenze.'' USING ERRCODE = ''42501'';\n'
  || E'  END IF;\n');
