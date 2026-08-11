-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Lead Scraper (super_admin) — multi-source B2B lead generation
CREATE TABLE IF NOT EXISTS public.lead_scraper_searches (
  id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source        text NOT NULL DEFAULT 'google_maps'
                  CHECK (source IN ('google_maps', 'explorium', 'linkedin')),
  label         text,
  query         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        text NOT NULL DEFAULT 'completed'
                  CHECK (status IN ('running', 'completed', 'error')),
  results_count integer NOT NULL DEFAULT 0,
  credits_used  integer NOT NULL DEFAULT 0,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_scraper_results (
  id             uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  search_id      uuid NOT NULL REFERENCES public.lead_scraper_searches(id) ON DELETE CASCADE,
  source         text NOT NULL DEFAULT 'google_maps',
  business_name  text NOT NULL,
  contact_name   text,
  role           text,
  phone          text,
  email          text,
  website        text,
  address        text,
  city           text,
  region         text,
  country        text NOT NULL DEFAULT 'IT',
  place_id       text,
  linkedin_url   text,
  rating         numeric(2,1),
  reviews_count  integer,
  ai_score       smallint CHECK (ai_score BETWEEN 0 AND 100),
  ai_label       text CHECK (ai_label IN ('hot', 'warm', 'cold')),
  ai_reason      text,
  enriched       boolean NOT NULL DEFAULT false,
  raw            jsonb,
  pushed_to_crm  boolean NOT NULL DEFAULT false,
  crm_contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  dedupe_key     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lss_searches_created_by
  ON public.lead_scraper_searches(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lss_searches_source
  ON public.lead_scraper_searches(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lss_results_search
  ON public.lead_scraper_results(search_id);
CREATE INDEX IF NOT EXISTS idx_lss_results_score
  ON public.lead_scraper_results(search_id, ai_score DESC NULLS LAST);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lss_results_dedupe
  ON public.lead_scraper_results(search_id, dedupe_key);

ALTER TABLE public.lead_scraper_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_scraper_results  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin manage lss_searches" ON public.lead_scraper_searches;
CREATE POLICY "super_admin manage lss_searches"
  ON public.lead_scraper_searches FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "super_admin manage lss_results" ON public.lead_scraper_results;
CREATE POLICY "super_admin manage lss_results"
  ON public.lead_scraper_results FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.tg_lss_searches_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lss_searches_updated_at ON public.lead_scraper_searches;
CREATE TRIGGER trg_lss_searches_updated_at
  BEFORE UPDATE ON public.lead_scraper_searches
  FOR EACH ROW EXECUTE FUNCTION public.tg_lss_searches_updated_at();
