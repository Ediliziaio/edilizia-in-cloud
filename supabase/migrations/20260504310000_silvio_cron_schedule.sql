-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-10 — pg_cron schedule per Silvio proattività
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Detection ogni 30 minuti (scansiona dati tutte le aziende → genera alert)
-- 2. Daily briefing alle 5:30 UTC = 7:30 Europe/Rome (estate 6:30 UTC)
-- 3. Cleanup: auto-expire alert + cancella alert risolti > 30 giorni
-- ════════════════════════════════════════════════════════════════════════════

-- pg_cron + pg_net already enabled by Supabase platform

-- ───────────────────────────────────────────────────────────────────────────
-- Helper: chiama edge function con service_role
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_invoke_edge(
  p_function_name text,
  p_body jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_anon_key text;
  v_request_id bigint;
BEGIN
  -- supabase_url + anon_key dal vault o settings (assumiamo siano in app.settings)
  -- In alternativa hardcode (rsbrguhkodgnqfomrevo)
  v_url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/' || p_function_name;
  v_anon_key := current_setting('app.settings.anon_key', true);

  -- Se non c'è anon_key in settings, prova a recuperarlo dal vault Supabase
  IF v_anon_key IS NULL OR v_anon_key = '' THEN
    BEGIN
      SELECT decrypted_secret INTO v_anon_key
      FROM vault.decrypted_secrets WHERE name = 'supabase_anon_key' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- Fallback: usa Authorization service_role direttamente
  v_request_id := net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_anon_key, current_setting('app.settings.service_role_key', true))
    ),
    body := p_body
  );
  RETURN v_request_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[silvio_invoke_edge] error invoking %: %', p_function_name, SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_invoke_edge(text, jsonb) FROM public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Detection batch: scan tutte le aziende ogni 30 min
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_detect_alerts_all_companies()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_total int := 0;
  v_failed int := 0;
BEGIN
  FOR v_company_id IN
    SELECT id FROM public.companies
    WHERE COALESCE(is_archived, false) = false
  LOOP
    BEGIN
      PERFORM public.silvio_detect_alerts(v_company_id);
      v_total := v_total + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE WARNING '[silvio detect cron] company % failed: %', v_company_id, SQLERRM;
    END;
  END LOOP;

  -- Auto-expire scaduti
  PERFORM public.silvio_expire_alerts();

  RETURN jsonb_build_object('success', true, 'companies_processed', v_total, 'failures', v_failed);
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_detect_alerts_all_companies() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_detect_alerts_all_companies() TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Cleanup: rimuove alert risolti/dismissed da > 30 giorni
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_cleanup_old_alerts()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  DELETE FROM public.silvio_alerts
  WHERE status IN ('resolved', 'dismissed', 'expired')
    AND COALESCE(resolved_at, updated_at) < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_cleanup_old_alerts() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_cleanup_old_alerts() TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- pg_cron schedules
-- ───────────────────────────────────────────────────────────────────────────

-- Drop existing scheduled jobs (idempotent)
DO $$
DECLARE v_jobid int;
BEGIN
  FOR v_jobid IN SELECT jobid FROM cron.job WHERE jobname IN ('silvio_detect_30min', 'silvio_briefing_morning', 'silvio_cleanup_daily')
  LOOP
    PERFORM cron.unschedule(v_jobid);
  END LOOP;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Detection ogni 30 min: scansiona tutte le aziende, genera alert
SELECT cron.schedule(
  'silvio_detect_30min',
  '*/30 * * * *',
  $$ SELECT public.silvio_detect_alerts_all_companies(); $$
);

-- Daily briefing alle 5:30 UTC (= 7:30 ora estiva Italia, 6:30 ora invernale)
-- Calling the edge function via pg_net to leverage LLM composition
SELECT cron.schedule(
  'silvio_briefing_morning',
  '30 5 * * *',
  $$ SELECT public.silvio_invoke_edge('silvio-daily-briefing', '{"mode":"all_companies"}'::jsonb); $$
);

-- Cleanup notturno: rimuovi alert vecchi
SELECT cron.schedule(
  'silvio_cleanup_daily',
  '15 3 * * *',
  $$ SELECT public.silvio_cleanup_old_alerts(); $$
);

-- ───────────────────────────────────────────────────────────────────────────
-- Bootstrap: crea preferences default per tutti gli utenti esistenti
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.silvio_user_preferences (user_id, company_id)
SELECT p.id, p.company_id
FROM public.profiles p
WHERE p.company_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.silvio_user_preferences sp WHERE sp.user_id = p.id)
ON CONFLICT (user_id) DO NOTHING;
