-- Il grafico MRR del dashboard fatturato admin (AdminFatturatoHub) leggeva
-- mrr_snapshots, tabella che NON esiste: la query dava errore e il grafico
-- restava vuoto da sempre. La edge sync-stripe-mrr era gia' scritta per
-- popolarla (upsert su 'data'), ma senza tabella e senza cron non ha mai
-- scritto niente. Qui: tabella + cron giornaliero.

CREATE TABLE IF NOT EXISTS public.mrr_snapshots (
  data date PRIMARY KEY,
  mrr_stripe_cents bigint NOT NULL DEFAULT 0,
  mrr_interno_cents bigint NOT NULL DEFAULT 0,
  aziende_attive_stripe integer NOT NULL DEFAULT 0,
  aziende_attive_interno integer NOT NULL DEFAULT 0,
  breakdown_per_piano jsonb NOT NULL DEFAULT '{}'::jsonb,
  dettaglio_discrepanze jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mrr_snapshots ENABLE ROW LEVEL SECURITY;

-- Lo scrive la edge in service_role (bypassa RLS). In lettura: solo lo staff
-- di piattaforma — il dashboard fatturato e' gia' dietro ProtectedRoute
-- platform, questa e' la difesa in profondita' a livello dato.
DROP POLICY IF EXISTS mrr_snapshots_read_platform ON public.mrr_snapshots;
CREATE POLICY mrr_snapshots_read_platform ON public.mrr_snapshots
  FOR SELECT TO authenticated
  USING (public.is_platform_staff());

-- Snapshot giornaliero alle 04:20 UTC (prima dei refresh delle viste P&L).
DO $$
DECLARE v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'sync-stripe-mrr-daily';
  IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF;
  PERFORM cron.schedule(
    'sync-stripe-mrr-daily',
    '20 4 * * *',
    $cmd$
      SELECT net.http_post(
        url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/sync-stripe-mrr',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $cmd$
  );
END $$;

NOTIFY pgrst, 'reload schema';
