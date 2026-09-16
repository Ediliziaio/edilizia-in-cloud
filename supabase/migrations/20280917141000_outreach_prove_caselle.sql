-- Prove di invio delle caselle outreach (16/09/2026).
--
-- Prima di accendere un pool nuovo il titolare vuole ricevere un'email vera
-- da ogni casella. Il bottone «Testa» controlla solo che la password entri, e
-- il dispatcher spedisce solo da caselle attive su domini attivi: le prove
-- stanno in questa coda e le spedisce outreach-prova-caselle, una ogni 5 minuti.

CREATE TABLE IF NOT EXISTS public.outreach_prove_caselle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_account_id uuid NOT NULL REFERENCES public.outreach_sender_accounts(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'queued',
  sent_at timestamptz,
  errore text,
  message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outreach_prove_caselle_status_check CHECK (status IN ('queued', 'sending', 'sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS outreach_prove_caselle_da_spedire
  ON public.outreach_prove_caselle (scheduled_for) WHERE status = 'queued';

ALTER TABLE public.outreach_prove_caselle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outreach_prove_caselle_super_admin ON public.outreach_prove_caselle;
CREATE POLICY outreach_prove_caselle_super_admin ON public.outreach_prove_caselle
  FOR ALL TO authenticated
  USING ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)))
  WITH CHECK ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)));

-- Il cron gira ogni 5 minuti: con la coda vuota la funzione risponde subito.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'outreach-prova-caselle') THEN
    PERFORM cron.unschedule('outreach-prova-caselle');
  END IF;
  PERFORM cron.schedule(
    'outreach-prova-caselle',
    '*/5 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/outreach-prova-caselle',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'proactive_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
    $cron$
  );
END $$;
