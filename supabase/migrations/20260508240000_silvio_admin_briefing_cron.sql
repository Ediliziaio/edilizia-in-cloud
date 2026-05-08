-- ═══════════════════════════════════════════════════════════════════════════
-- SILVIO ADMIN — Cron giornaliero briefing (8:00 IT = 6:00 UTC standard / 7:00 DST)
-- -----------------------------------------------------------------------
-- pg_cron usa UTC. Schedulo alle 06:00 UTC per coprire il periodo invernale
-- (CET = UTC+1, quindi 06:00 UTC = 07:00 IT).
-- In estate (CEST = UTC+2) sarà alle 08:00 IT — perfetto.
-- Trade-off accettabile: in inverno arriva 1h prima.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Rimuovi job esistente se presente (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('silvio-admin-briefing-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'silvio-admin-briefing-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedula: 06:00 UTC = 07:00 CET (inverno) / 08:00 CEST (estate)
SELECT cron.schedule(
  'silvio-admin-briefing-daily',
  '0 6 * * *',
  $$ SELECT public.silvio_invoke_edge('silvio-admin-briefing', '{}'::jsonb); $$
);

COMMIT;
