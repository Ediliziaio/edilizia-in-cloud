-- ════════════════════════════════════════════════════════════════════════════
-- Silvio · Catena fatture-PDF — estrazione automatica documenti fornitore
-- ────────────────────────────────────────────────────────────────────────────
-- Le email classificate 'fattura'/'fornitore' CON allegato PDF vengono passate a
-- email-ai-estrai-allegato (Sonnet via OpenRouter, visione PDF) che estrae i
-- campi (P.IVA, numero, imponibile/IVA/totale, IBAN) + validazioni (check P.IVA,
-- quadratura, IBAN anti-frode) + match fornitore + dedup SDI → BOZZA in
-- email_documento_estratto (conferma umana in app). Due pezzi:
--   1) silvio_tool_fatture_da_registrare: RPC company-scoped per il tool Silvio.
--   2) silvio_email_dispatch_fatture(secret, limit): dispatcher idempotente,
--      cron */7 (Sonnet costa → cadenza più bassa). Secret come PARAMETRO
--      (niente segreti nel repo; il cron in prod passa il literal).
-- NB1: estrai-allegato accetta ora x-cron-secret (oltre al Bearer UI).
-- NB2: prerequisito = allegati salvati nel bucket email-attachments (vedi F2 poller).
-- NB3: scadenza/ddt (deterministici, su documento_estratto) = follow-up.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.silvio_tool_fatture_da_registrare(p_company_id uuid, p_user_id uuid, p_limit int DEFAULT 20)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH d AS (
    SELECT id, tipo, note, stato, iban_alert, fornitore_match_id, created_at,
           campi->'fornitore_ragione_sociale'->>'valore' AS fornitore,
           campi->'numero'->>'valore' AS numero,
           campi->'totale'->>'valore' AS totale,
           campi->'data'->>'valore' AS data_doc
    FROM public.email_documento_estratto
    WHERE company_id = p_company_id AND stato IN ('da_confermare','duplicato')
    ORDER BY created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit,20), 50))
  )
  SELECT jsonb_build_object(
    'count', (SELECT count(*) FROM d),
    'documenti', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'tipo', d.tipo, 'fornitore', d.fornitore, 'numero', d.numero, 'totale', d.totale,
      'data', d.data_doc, 'stato', d.stato, 'fornitore_gia_noto', d.fornitore_match_id IS NOT NULL,
      'alert_iban', d.iban_alert, 'note', d.note) ORDER BY d.created_at DESC) FROM d), '[]'::jsonb));
$fn$;
REVOKE EXECUTE ON FUNCTION public.silvio_tool_fatture_da_registrare(uuid,uuid,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_tool_fatture_da_registrare(uuid,uuid,int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.silvio_email_dispatch_fatture(p_cron_secret text, p_limit int DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE rec record; v_n int := 0;
BEGIN
  FOR rec IN
    SELECT e.id FROM public.email_inbox e
    WHERE (e.categoria::text IN ('fattura','fornitore') OR e.ai_category IN ('fattura','fornitore'))
      AND COALESCE(e.is_trashed,false) = false
      AND jsonb_typeof(e.attachments) = 'array' AND jsonb_array_length(e.attachments) > 0
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.attachments) a
                  WHERE lower(coalesce(a->>'filename','')) LIKE '%.pdf' OR lower(coalesce(a->>'mime','')) LIKE '%pdf%')
      AND NOT EXISTS (SELECT 1 FROM public.email_documento_estratto d WHERE d.email_id = e.id)
    ORDER BY e.received_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit,5), 15))
  LOOP
    PERFORM net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/email-ai-estrai-allegato',
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', p_cron_secret),
      body := jsonb_build_object('email_id', rec.id, 'attachment_index', 0),
      timeout_milliseconds := 120000);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('dispatched', v_n);
END $fn$;
REVOKE EXECUTE ON FUNCTION public.silvio_email_dispatch_fatture(text,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_email_dispatch_fatture(text,int) TO service_role;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('email-ai-dispatch-fatture-7min');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_net') THEN
    PERFORM cron.schedule('email-ai-dispatch-fatture-7min','*/7 * * * *',
      $cron$ SELECT public.silvio_email_dispatch_fatture(current_setting('app.proactive_cron_secret', true), 5); $cron$);
  END IF;
END $$;
