-- Al minuto :00 di ogni quarto d'ora collassavano fino a 10 job insieme
-- (*/15, */5, */3, */2 e * * * * cadono tutti sullo stesso istante). Ognuno
-- apre connessioni edge→DB, il pool si esaurisce e i ritardatari muoiono con
-- "connection failed": 23 fallimenti nelle 24h, TUTTI al minuto 0.
--
-- Non e' un bug dei job: e' un ingorgo di partenze. Si sfalsano gli avvii
-- senza cambiare la frequenza — un job */15 che parte al minuto 2 gira sempre
-- ogni 15 minuti, solo su 2/17/32/47 invece di 0/15/30/45. Cosi' il picco si
-- distribuisce su piu' minuti e il pool respira.

DO $$
DECLARE
  v record;
  -- job → nuovo minuto di sfasamento (mantiene lo STEP originale)
  v_sfasa jsonb := '{
    "ai-conversations-sweeper":        "2-59/15",
    "email-sequenze-tick-15min":       "3-59/15",
    "google-calendar-sync-every-15min":"4-59/15",
    "outreach-imap-poll":              "6-59/15",
    "process-campaign-retries":        "7-59/15",
    "whatsapp-operational-reminders":  "8-59/15",
    "silvio-promote-reminders-15min":  "9-59/15",
    "ai-voice-outbound-leads":         "1-59/5",
    "automation-bulk-scheduler-runner":"2-59/5",
    "meta-leads-backfill-5min":        "3-59/5",
    "sweep-stuck-render-sessions":     "4-59/5"
  }'::jsonb;
  v_key text;
BEGIN
  FOR v_key IN SELECT jsonb_object_keys(v_sfasa) LOOP
    SELECT jobid, schedule INTO v FROM cron.job WHERE jobname = v_key;
    IF NOT FOUND THEN
      RAISE NOTICE 'job % non trovato, salto', v_key;
      CONTINUE;
    END IF;
    -- sostituisce solo il campo minuti (primo token dello schedule)
    PERFORM cron.alter_job(
      v.jobid,
      schedule => (v_sfasa->>v_key) || ' * * * *'
    );
    RAISE NOTICE 'sfalsato %: % → % * * * *', v_key, v.schedule, v_sfasa->>v_key;
  END LOOP;
END $$;
