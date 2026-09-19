-- Gli avvisi di Silvio ripartono: dal 9 agosto 2026 non ne nasceva più nessuno.
--
-- Trovato nell'audit del 19/09/2026. Il cron silvio_detect_30min chiama
-- silvio_detect_alerts_all_companies(), che per ogni azienda chiama
-- silvio_detect_alerts() e silvio_detect_cashflow_alerts(): dentro c'è
-- assert_company_access, e dentro pg_cron non c'è nessun utente né claim.
-- Risultato: «Accesso non autorizzato a questa azienda» su tutte le 13 aziende,
-- ogni mezz'ora, per 41 giorni, scritto solo come WARNING nei log.
--
-- user_can_access_company accetta già il ruolo service_role nei claim: qui si
-- impostano per la sola transazione del cron e si rimettono com'erano alla
-- fine. La funzione la esegue solo il cron (nessun EXECUTE ad anon né ad
-- authenticated), quindi non diventa una scorciatoia per nessuno.
--
-- Primo giro dopo la correzione: 13 aziende, 0 errori, 93 avvisi.

create or replace function public.silvio_detect_alerts_all_companies()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id uuid;
  v_total int := 0;
  v_failed int := 0;
  v_cashflow_alerts int := 0;
  v_claims_prima text := current_setting('request.jwt.claims', true);
begin
  -- Dentro pg_cron non c'è nessun utente: senza questo, assert_company_access
  -- rifiutava ogni azienda e dal 9 agosto non è più nato un avviso. La
  -- funzione la esegue solo il cron (nessun EXECUTE a anon/authenticated).
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  for v_company_id in
    select id from public.companies
    where status in ('active', 'trial')
  loop
    begin
      perform public.silvio_detect_alerts(v_company_id);
      v_cashflow_alerts := v_cashflow_alerts + coalesce(public.silvio_detect_cashflow_alerts(v_company_id), 0);
      v_total := v_total + 1;
    exception when others then
      v_failed := v_failed + 1;
      raise warning '[silvio detect cron] company % failed: %', v_company_id, sqlerrm;
    end;
  end loop;
  perform public.silvio_expire_alerts();

  perform set_config('request.jwt.claims', coalesce(v_claims_prima, ''), true);

  return jsonb_build_object(
    'success', true, 'companies_processed', v_total,
    'failures', v_failed, 'cashflow_alerts_created', v_cashflow_alerts
  );
end;
$function$;

revoke all on function public.silvio_detect_alerts_all_companies() from public, anon, authenticated;
