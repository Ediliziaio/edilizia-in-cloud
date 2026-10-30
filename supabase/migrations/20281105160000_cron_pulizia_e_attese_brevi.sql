-- Pulizia dei cron (lotto 2 delle lentezze, 31/10/2026).
--
-- 1. Dodici job spenti che non partono da settimane: doppioni estate/inverno
--    sostituiti da mattino-email-unica, un SELECT 1 che non fa niente, il
--    warmup del pool, e render-economics-monitor (la funzione esce dal
--    repository in questo stesso lotto).
-- 2. Sei job aspettavano fino a 150 secondi funzioni che ormai rispondono
--    entro 5 (serveConMetricheRapida): l'attesa scende a 15 secondi, la regola
--    di CLAUDE.md. Era il passo «da fare dopo il deploy» dell'audit del 28/10.
-- 3. silvio_invoke_edge chiamava net.http_post senza timeout_milliseconds,
--    quindi valeva il default di 5 secondi: silvio-admin-briefing e
--    silvio-chief-of-staff (circa 10 s) e silvio-memory-extract (fino a 18 s)
--    venivano chiusi a metà. I job frequenti che passano di qui rispondono
--    sotto 1,3 s: 15 secondi non pesano sulla coda.
--
-- Idempotente: si può rilanciare.

do $$
declare
  n text;
begin
  foreach n in array array[
    'process-campaign-retries',
    'render-economics-monitor-hourly',
    'customer-os-drift-check-weekly',
    'postgres-warmup-3min',
    'ops-canarino-daily',
    'ops-canarino-daily-inverno',
    'clienti-marketing-mattino',
    'clienti-marketing-mattino-inverno',
    'outreach-riepilogo',
    'outreach-riepilogo-inverno',
    'task-riepilogo-email-daily',
    'automation-appointment-triggers'
  ] loop
    -- Solo se è ancora spento: un job riacceso nel frattempo resta.
    if exists (select 1 from cron.job where jobname = n and not active) then
      perform cron.unschedule(n);
    end if;
  end loop;
end $$;

do $$
declare
  j record;
begin
  for j in
    select jobid, command from cron.job
     where jobname in (
       'auto-genera-giornale-daily',
       'check-scheduled-triggers-daily',
       'customer-os-elena-health-daily',
       'hr-check-scadenze-daily',
       'meta-ads-sync-insights-4h',
       'process-automation-queue'
     )
       and command ~ 'timeout_milliseconds\s*:=\s*\d+'
  loop
    perform cron.alter_job(
      j.jobid,
      command := regexp_replace(j.command, 'timeout_milliseconds\s*:=\s*\d+', 'timeout_milliseconds := 15000', 'g')
    );
  end loop;
end $$;

create or replace function public.silvio_invoke_edge(p_function_name text, p_body jsonb default '{}'::jsonb)
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_url text;
  v_cron_secret text;
  v_bearer text;
  v_headers jsonb;
  v_request_id bigint;
BEGIN
  v_url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/' || p_function_name;

  v_cron_secret := NULLIF(current_setting('app.settings.internal_cron_secret', true), '');
  IF v_cron_secret IS NULL THEN
    BEGIN
      SELECT decrypted_secret INTO v_cron_secret
      FROM vault.decrypted_secrets
      WHERE name IN ('silvio_internal_cron_secret', 'internal_cron_secret')
      ORDER BY (name = 'silvio_internal_cron_secret') DESC
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_cron_secret := NULL;
    END;
  END IF;
  IF v_cron_secret IS NULL OR v_cron_secret = '' THEN
    RAISE WARNING '[silvio_invoke_edge] cron secret mancante (app.settings/vault) per %', p_function_name;
    RETURN NULL;
  END IF;

  v_bearer := NULLIF(current_setting('app.settings.service_role_key', true), '');
  IF v_bearer IS NULL THEN
    BEGIN
      SELECT decrypted_secret INTO v_bearer
      FROM vault.decrypted_secrets
      WHERE name IN ('service_role_key', 'supabase_service_role_key')
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_bearer := NULL;
    END;
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-internal-cron-secret', v_cron_secret
  );
  -- Bearer SOLO se abbiamo una chiave vera: un segreto qualsiasi al suo posto
  -- non autentica niente e fa scattare il gateway.
  IF v_bearer IS NOT NULL AND v_bearer <> '' THEN
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_bearer);
  END IF;

  -- 15 secondi, non il default di 5: i lavori notturni di Silvio durano di più.
  v_request_id := net.http_post(url := v_url, headers := v_headers, body := p_body, timeout_milliseconds := 15000);
  RETURN v_request_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[silvio_invoke_edge] invocazione % fallita: %', p_function_name, SQLERRM;
  RETURN NULL;
END;
$function$;
