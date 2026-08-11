-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.lead_scraper_results
  ADD COLUMN IF NOT EXISTS buying_score        smallint CHECK (buying_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS buying_signals      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_sequence         jsonb,
  ADD COLUMN IF NOT EXISTS is_existing_customer boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lead_scraper_results.buying_score IS
  'Probabilità che il lead sia pronto a comprare ORA (0-100): assunzioni, gare ANAC, segnali sito.';

CREATE INDEX IF NOT EXISTS idx_lss_results_buying
  ON public.lead_scraper_results(search_id, buying_score DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.lead_scraper_autopilot (
  id           uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled      boolean NOT NULL DEFAULT false,
  engine       text NOT NULL DEFAULT 'paginegialle' CHECK (engine IN ('paginegialle','gmaps')),
  cities       text[] NOT NULL DEFAULT '{}',
  sectors      text[] NOT NULL DEFAULT '{}',
  per_run      integer NOT NULL DEFAULT 40,
  cursor       integer NOT NULL DEFAULT 0,
  last_run_at  timestamptz,
  last_result  jsonb,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lead_scraper_autopilot IS
  'Config dell''autopilot: ogni notte scrapa la prossima città×settore nel DB proprietario.';

ALTER TABLE public.lead_scraper_autopilot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "super_admin manage autopilot" ON public.lead_scraper_autopilot;
CREATE POLICY "super_admin manage autopilot"
  ON public.lead_scraper_autopilot FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE VIEW public.lead_scraper_funnel_source AS
SELECT
  source,
  count(*)                                                  AS total,
  count(*) FILTER (WHERE email IS NOT NULL)                 AS with_email,
  count(*) FILTER (WHERE phone IS NOT NULL)                 AS with_phone,
  count(*) FILTER (WHERE ai_score IS NOT NULL)              AS qualified,
  count(*) FILTER (WHERE ai_label = 'hot')                  AS hot,
  count(*) FILTER (WHERE pushed_to_crm)                     AS in_crm,
  count(*) FILTER (WHERE crm_opportunity_id IS NOT NULL)    AS opportunities,
  count(*) FILTER (WHERE is_existing_customer)              AS existing_customers
FROM public.lead_scraper_results
GROUP BY source;

COMMENT ON VIEW public.lead_scraper_funnel_source IS
  'Imbuto per fonte: trovati → con contatti → qualificati → CRM → opportunità.';

DROP TRIGGER IF EXISTS trg_lss_autopilot_updated_at ON public.lead_scraper_autopilot;
CREATE TRIGGER trg_lss_autopilot_updated_at
  BEFORE UPDATE ON public.lead_scraper_autopilot
  FOR EACH ROW EXECUTE FUNCTION public.tg_lss_searches_updated_at();
