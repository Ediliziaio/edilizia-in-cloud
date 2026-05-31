-- ════════════════════════════════════════════════════════════════════════════
-- Silvio · F3 — Estrazione automatica richieste preventivo (opportunità)
-- ────────────────────────────────────────────────────────────────────────────
-- Le email classificate 'preventivo'/'opportunita' vengono passate a
-- email-ai-opportunita (Haiku via OpenRouter) che estrae una BOZZA in
-- email_opportunita_bozza (conferma umana in app). Due pezzi:
--   1) silvio_tool_richieste_preventivo: RPC company-scoped per il tool Silvio.
--   2) silvio_email_dispatch_opportunita(secret, limit): dispatcher idempotente
--      che lancia l'estrattore sulle email non ancora estratte. Il secret è un
--      PARAMETRO (nessun segreto nel corpo). Cron */5: in prod passa il literal
--      PROACTIVE_CRON_SECRET (out-of-band, come gli altri cron email); qui la
--      forma current_setting è documentale.
-- NB: l'estrattore email-ai-opportunita accetta x-cron-secret (oltre al Bearer UI).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.silvio_tool_richieste_preventivo(p_company_id uuid, p_user_id uuid, p_limit int DEFAULT 20)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH r AS (
    SELECT b.id, b.tipo_lavoro, b.indirizzo, b.tempistiche, b.richiesta_sintesi,
           b.cliente_match_id, b.cliente_nuovo, e.from_name, e.from_email, e.received_at, b.created_at
    FROM public.email_opportunita_bozza b
    JOIN public.email_inbox e ON e.id = b.email_id
    WHERE b.company_id = p_company_id AND b.stato = 'bozza'
    ORDER BY b.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit,20), 50))
  )
  SELECT jsonb_build_object(
    'count', (SELECT count(*) FROM r),
    'richieste', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'da', COALESCE(NULLIF(r.cliente_nuovo->>'nome',''), r.from_name, r.from_email),
      'tipo_lavoro', r.tipo_lavoro, 'indirizzo', r.indirizzo, 'tempistiche', r.tempistiche,
      'sintesi', r.richiesta_sintesi, 'cliente_gia_noto', r.cliente_match_id IS NOT NULL,
      'ricevuta_il', r.received_at) ORDER BY r.received_at DESC) FROM r), '[]'::jsonb));
$fn$;
REVOKE EXECUTE ON FUNCTION public.silvio_tool_richieste_preventivo(uuid,uuid,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_tool_richieste_preventivo(uuid,uuid,int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.silvio_email_dispatch_opportunita(p_cron_secret text, p_limit int DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE rec record; v_n int := 0;
BEGIN
  FOR rec IN
    SELECT e.id FROM public.email_inbox e
    WHERE (e.categoria::text IN ('preventivo','opportunita') OR e.ai_category IN ('preventivo','opportunita'))
      AND COALESCE(e.is_trashed,false) = false
      AND NOT EXISTS (SELECT 1 FROM public.email_opportunita_bozza b WHERE b.email_id = e.id)
    ORDER BY e.received_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit,10), 25))
  LOOP
    PERFORM net.http_post(
      url := current_setting('app.supabase_url', true) || '/functions/v1/email-ai-opportunita',
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', p_cron_secret),
      body := jsonb_build_object('email_id', rec.id), timeout_milliseconds := 60000);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('dispatched', v_n);
END $fn$;
REVOKE EXECUTE ON FUNCTION public.silvio_email_dispatch_opportunita(text,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_email_dispatch_opportunita(text,int) TO service_role;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('email-ai-dispatch-opportunita-5min');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_net') THEN
    PERFORM cron.schedule('email-ai-dispatch-opportunita-5min','*/5 * * * *',
      $cron$ SELECT public.silvio_email_dispatch_opportunita(current_setting('app.proactive_cron_secret', true), 10); $cron$);
  END IF;
END $$;
