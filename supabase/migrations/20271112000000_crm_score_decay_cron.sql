-- Decadimento automatico del punteggio lead: i contatti senza interazioni
-- recenti perdono punti col tempo, così lo score riflette il calore ATTUALE.
--
-- SCOPED alla sola company marketing admin (PLATFORM_ADMIN_COMPANY_ID
-- 00000000-0000-0000-0000-000000000001): NON tocca i CRM dei clienti.
-- Gentile: -2 punti/giorno, floor 0, solo per contatti fermi da 14+ giorni.

CREATE OR REPLACE FUNCTION public.decay_marketing_lead_scores()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  UPDATE public.marketing_contacts
  SET lead_score = GREATEST(0, COALESCE(lead_score, 0) - 2),
      ai_score   = GREATEST(0, COALESCE(ai_score, 0) - 2)
  WHERE company_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND (last_activity_at IS NULL OR last_activity_at < now() - interval '14 days')
    AND (COALESCE(lead_score, 0) > 0 OR COALESCE(ai_score, 0) > 0);
$$;

-- Schedula il decadimento ogni notte alle 03:00 (idempotente: prima rimuove un
-- eventuale job omonimo, così ri-applicare la migration non duplica il cron).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-score-decay-daily') THEN
    PERFORM cron.unschedule('crm-score-decay-daily');
  END IF;
  PERFORM cron.schedule('crm-score-decay-daily', '0 3 * * *', 'SELECT public.decay_marketing_lead_scores();');
EXCEPTION WHEN OTHERS THEN
  -- pg_cron non disponibile in questo ambiente: la funzione resta comunque
  -- invocabile manualmente. Non blocchiamo la migration.
  RAISE NOTICE 'cron non schedulato: %', SQLERRM;
END $$;
