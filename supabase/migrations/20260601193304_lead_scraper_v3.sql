-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.lead_scraper_results
  ADD COLUMN IF NOT EXISTS seen_before       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_summary        text,
  ADD COLUMN IF NOT EXISTS ai_icebreaker     text,
  ADD COLUMN IF NOT EXISTS ateco             text,
  ADD COLUMN IF NOT EXISTS ateco_desc        text,
  ADD COLUMN IF NOT EXISTS company_size      text,
  ADD COLUMN IF NOT EXISTS crm_opportunity_id uuid;

CREATE TABLE IF NOT EXISTS public.lead_scraper_place_cache (
  place_id   text PRIMARY KEY,
  data       jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_scraper_api_usage (
  provider text NOT NULL,
  day      date NOT NULL DEFAULT CURRENT_DATE,
  count    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (provider, day)
);

ALTER TABLE public.lead_scraper_place_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_scraper_api_usage  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin read place_cache" ON public.lead_scraper_place_cache;
CREATE POLICY "super_admin read place_cache"
  ON public.lead_scraper_place_cache
  FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "super_admin read api_usage" ON public.lead_scraper_api_usage;
CREATE POLICY "super_admin read api_usage"
  ON public.lead_scraper_api_usage
  FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_lss_results_seen
  ON public.lead_scraper_results(search_id, seen_before);

CREATE OR REPLACE FUNCTION public.lead_scraper_bump_usage(p_provider text, p_n integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.lead_scraper_api_usage (provider, day, count)
  VALUES (p_provider, CURRENT_DATE, p_n)
  ON CONFLICT (provider, day)
  DO UPDATE SET count = public.lead_scraper_api_usage.count + p_n
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.lead_scraper_bump_usage(text, integer) FROM PUBLIC, anon, authenticated;
