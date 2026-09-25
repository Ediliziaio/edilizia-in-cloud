-- Gli sconti dei preventivi li approva chi ha il permesso di approvarli.
--
-- Trovato il 26/09/2026 nell'audit dei permessi:
--   - decide_quote_approval (SECURITY DEFINER) non controllava nulla: ogni
--     utente autenticato, anche di un'altra azienda, approvava o rifiutava la
--     richiesta di sconto di qualsiasi preventivo, e lo sconto finiva sul
--     preventivo. Il venditore che chiedeva lo sconto se lo approvava da solo;
--   - request_quote_approval (SECURITY DEFINER) lasciava a chiunque cambiare
--     lo stato di approvazione e lo sconto richiesto dei preventivi di
--     qualsiasi azienda;
--   - quote_approvals aveva una sola policy FOR ALL per ogni membro
--     dell'azienda: la decisione si poteva anche scrivere a mano (il wizard
--     dei serramenti legge proprio decision = 'approved');
--   - seed_quote_templates creava i modelli di preventivo in qualsiasi
--     azienda: la chiama solo il trigger trg_seed_quote_templates su
--     companies (SECURITY DEFINER), che non ha bisogno del GRANT.
--
-- Ora:
--   - decidere: l'amministratore o chi ha «Approva sconti»
--     (can_approve_discounts), nell'azienda della richiesta;
--   - chiedere: chi può modificare i preventivi di quell'azienda;
--   - quote_approvals: la leggono i membri dell'azienda; si inserisce solo la
--     propria richiesta, senza decisione; decisioni e cancellazioni solo a chi
--     approva gli sconti.
-- Senza utente (auth.uid() nullo: la chiave di servizio) le due funzioni
-- lavorano come prima: anon non le può eseguire.

set local lock_timeout = '3s';

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

-- 1. Decidere: dopo aver letto la richiesta (serve l'azienda).
select pg_temp.aggiungi_controllo(
  'public.decide_quote_approval(uuid,text,numeric,text)', 'can_approve_discounts',
  E'  IF v_quote_id IS NULL THEN\n    RAISE EXCEPTION ''approval_not_found_or_already_decided'';\n  END IF;\n',
  E'\n  IF auth.uid() IS NOT NULL AND NOT (\n'
  || E'       public.has_role(auth.uid(), ''super_admin''::app_role)\n'
  || E'       OR v_company_id = ANY (public.aziende_con_permesso(''can_approve_discounts''))) THEN\n'
  || E'    RAISE EXCEPTION ''Non hai il permesso di approvare gli sconti.'' USING ERRCODE = ''42501'';\n'
  || E'  END IF;\n');

-- 2. Chiedere: dopo aver letto il preventivo.
select pg_temp.aggiungi_controllo(
  'public.request_quote_approval(uuid,numeric,text)', 'can_edit_preventivi',
  E'  IF v_company_id IS NULL THEN\n    RAISE EXCEPTION ''quote_not_found'';\n  END IF;\n',
  E'\n  IF auth.uid() IS NOT NULL AND NOT (\n'
  || E'       public.has_role(auth.uid(), ''super_admin''::app_role)\n'
  || E'       OR v_company_id = ANY (public.aziende_con_permesso(''can_edit_preventivi''))) THEN\n'
  || E'    RAISE EXCEPTION ''Non hai il permesso di modificare questo preventivo.'' USING ERRCODE = ''42501'';\n'
  || E'  END IF;\n');

-- 3. quote_approvals --------------------------------------------------------------
drop policy if exists quote_approvals_company_access on public.quote_approvals;

drop policy if exists quote_approvals_lettura on public.quote_approvals;
create policy quote_approvals_lettura on public.quote_approvals
  for select to authenticated
  using (public.user_can_access_company(company_id) and not (select public.utente_e_cliente_esterno()));

drop policy if exists quote_approvals_richiesta on public.quote_approvals;
create policy quote_approvals_richiesta on public.quote_approvals
  for insert to authenticated
  with check (public.user_can_access_company(company_id) and not (select public.utente_e_cliente_esterno())
              and requested_by = (select auth.uid())
              and decision is null and decided_by is null and decided_at is null
              and sconto_autorizzato_pct is null and note_decisione is null);

drop policy if exists quote_approvals_decisione on public.quote_approvals;
create policy quote_approvals_decisione on public.quote_approvals
  for update to authenticated
  using ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
         or company_id in (select unnest(public.aziende_con_permesso('can_approve_discounts'))))
  with check ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
         or company_id in (select unnest(public.aziende_con_permesso('can_approve_discounts'))));

drop policy if exists quote_approvals_cancellazione on public.quote_approvals;
create policy quote_approvals_cancellazione on public.quote_approvals
  for delete to authenticated
  using ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
         or company_id in (select unnest(public.aziende_con_permesso('can_approve_discounts'))));

-- 4. seed_quote_templates: solo dal trigger sulle aziende nuove --------------------
revoke all on function public.seed_quote_templates(uuid) from public, anon, authenticated;
grant execute on function public.seed_quote_templates(uuid) to service_role;
