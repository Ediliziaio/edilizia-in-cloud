-- Referral e passi del flusso di lavoro: solo a chi li deve toccare.
--
-- Trovato il 26/09/2026 nel censimento delle funzioni SECURITY DEFINER senza
-- controllo eseguibili da ogni utente autenticato (seguito di
-- funzioni_interne_solo_al_servizio):
--   - ensure_referral_link riscriveva il link di qualsiasi segnalatore con un
--     indirizzo base a scelta (anche un sito esterno);
--   - record_referral_conversion registrava conversioni e provvigioni per
--     qualsiasi codice;
--   - chiudi_passi_su_evento chiudeva i passi del flusso di lavoro di commesse
--     e ticket di qualsiasi azienda;
--   - recompute_order_progress ricalcolava l'avanzamento di qualsiasi commessa.
-- Le prime due le chiamano le pagine del super admin (referral, nuova azienda)
-- e stripe-webhook con la chiave di servizio: ora chiedono is_platform_staff(),
-- come update_referrer_tier e calculate_monthly_commissions. Le altre due le
-- chiamano solo trigger SECURITY DEFINER (incassi, fasi della commessa):
-- l'esecuzione resta al servizio.

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

select pg_temp.aggiungi_controllo(
  'public.ensure_referral_link(uuid,text)', 'is_platform_staff',
  E'  v_link text;\nBEGIN\n',
  E'  IF NOT public.is_platform_staff() THEN\n'
  || E'    RAISE EXCEPTION ''Accesso riservato allo staff di piattaforma'' USING ERRCODE = ''42501'';\n'
  || E'  END IF;\n\n');

select pg_temp.aggiungi_controllo(
  'public.record_referral_conversion(text,uuid,uuid,uuid,numeric,text)', 'is_platform_staff',
  E'  v_fraud_status text := ''clear'';\nBEGIN\n',
  E'  IF NOT public.is_platform_staff() THEN\n'
  || E'    RAISE EXCEPTION ''Accesso riservato allo staff di piattaforma'' USING ERRCODE = ''42501'';\n'
  || E'  END IF;\n\n');

revoke all on function public.chiudi_passi_su_evento(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.chiudi_passi_su_evento(text, uuid, uuid) to service_role;
revoke all on function public.recompute_order_progress(uuid) from public, anon, authenticated;
grant execute on function public.recompute_order_progress(uuid) to service_role;
