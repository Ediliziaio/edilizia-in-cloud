-- Lacune outreach (02/09/2026, sera): nome e firma per casella, finestra di
-- invio per brand, cooldown "non interessato", registro dei giri del motore.
ALTER TABLE public.outreach_sender_accounts
  ADD COLUMN IF NOT EXISTS signature text,
  ADD COLUMN IF NOT EXISTS alert_at timestamptz;
COMMENT ON COLUMN public.outreach_sender_accounts.signature IS 'Firma della casella: ha la precedenza su quella del brand.';
ALTER TABLE public.outreach_brands ADD COLUMN IF NOT EXISTS send_window jsonb;
COMMENT ON COLUMN public.outreach_brands.send_window IS 'Finestra di invio del brand {days:[1..5], startHour, endHour, timeZone}; NULL = finestra globale.';
ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS ricontatta_dopo timestamptz;
CREATE INDEX IF NOT EXISTS marketing_contacts_ricontatta_idx ON public.marketing_contacts (ricontatta_dopo) WHERE ricontatta_dopo IS NOT NULL;
COMMENT ON COLUMN public.marketing_contacts.ricontatta_dopo IS 'Cooldown outreach: fino a questa data il contatto non viene arruolato (non interessato).';

CREATE TABLE IF NOT EXISTS public.outreach_runs (
  id bigserial PRIMARY KEY,
  funzione text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  esito jsonb,
  errore text
);
CREATE INDEX IF NOT EXISTS outreach_runs_fn_idx ON public.outreach_runs (funzione, started_at DESC);
ALTER TABLE public.outreach_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outreach_runs_staff ON public.outreach_runs;
CREATE POLICY outreach_runs_staff ON public.outreach_runs FOR SELECT TO authenticated USING (public.is_platform_staff());
DROP POLICY IF EXISTS outreach_runs_service ON public.outreach_runs;
CREATE POLICY outreach_runs_service ON public.outreach_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
-- pulizia: teniamo 30 giorni
CREATE OR REPLACE FUNCTION public.outreach_runs_pulisci() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$
  DELETE FROM public.outreach_runs WHERE started_at < now() - interval '30 days';
$f$;
