-- ============================================================================
-- Lead Scraper (super_admin) — multi-source B2B lead generation
-- ============================================================================
-- Strumento interno super_admin per generare liste di lead B2B (imprese edili,
-- studi tecnici, ecc.) da più fonti e spingerle nel CRM marketing.
--
-- Ispirato a pattern open-source consolidati:
--  • Google Maps Lead Scraper Pro  → fonte "google_maps" (keyword + città →
--    business con telefono/sito/email). Unica fonte attivabile SUBITO perché
--    riusa google_maps_api_key già in platform_settings.
--  • 50k-lead-generation-system     → qualificazione AI 0-100 vs ICP + pipeline
--    multi-source + enrichment.
--  • linkedin-leads-discover        → fonte "linkedin" (seed → profili simili),
--    predisposta ma gated dietro API key dedicata.
--  • Explorium / vibe-prospecting   → fonte "explorium" (150M+ aziende), gated.
--
-- Sicurezza: tutte le tabelle sono RLS super_admin-only (has_role).
-- ============================================================================

-- ── 1. Ricerche salvate ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_scraper_searches (
  id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source        text NOT NULL DEFAULT 'google_maps'
                  CHECK (source IN ('google_maps', 'explorium', 'linkedin')),
  label         text,
  -- criteri di ricerca normalizzati (keyword, city, region, max_results, role…)
  query         jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        text NOT NULL DEFAULT 'completed'
                  CHECK (status IN ('running', 'completed', 'error')),
  results_count integer NOT NULL DEFAULT 0,
  credits_used  integer NOT NULL DEFAULT 0,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lead_scraper_searches IS
  'Ricerche del Lead Scraper super_admin (multi-source). RLS super_admin-only.';

-- ── 2. Risultati (lead) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_scraper_results (
  id             uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  search_id      uuid NOT NULL REFERENCES public.lead_scraper_searches(id) ON DELETE CASCADE,
  source         text NOT NULL DEFAULT 'google_maps',

  -- anagrafica business
  business_name  text NOT NULL,
  contact_name   text,
  role           text,                       -- "Titolare", "CEO", "Geometra"…
  phone          text,
  email          text,
  website        text,
  address        text,
  city           text,
  region         text,
  country        text NOT NULL DEFAULT 'IT',

  -- metadati fonte
  place_id       text,                        -- Google Place ID
  linkedin_url   text,
  rating         numeric(2,1),                -- Google rating 0.0-5.0
  reviews_count  integer,

  -- qualificazione AI (0-100, ispirato a 50k-lead-generation ICP scoring)
  ai_score       smallint CHECK (ai_score BETWEEN 0 AND 100),
  ai_label       text CHECK (ai_label IN ('hot', 'warm', 'cold')),
  ai_reason      text,

  enriched       boolean NOT NULL DEFAULT false,
  raw            jsonb,                        -- payload grezzo della fonte

  -- push verso CRM
  pushed_to_crm  boolean NOT NULL DEFAULT false,
  crm_contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,

  -- deduplica (normalized: place_id, oppure phone, oppure lower(business_name))
  dedupe_key     text,

  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.lead_scraper_results IS
  'Lead generati dal Lead Scraper. dedupe_key evita duplicati nella stessa ricerca.';

-- ── 3. Indici ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lss_searches_created_by
  ON public.lead_scraper_searches(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lss_searches_source
  ON public.lead_scraper_searches(source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lss_results_search
  ON public.lead_scraper_results(search_id);
CREATE INDEX IF NOT EXISTS idx_lss_results_score
  ON public.lead_scraper_results(search_id, ai_score DESC NULLS LAST);
-- deduplica intra-ricerca: stesso business non inserito due volte.
-- NON-parziale apposta: un indice parziale (WHERE dedupe_key IS NOT NULL) NON
-- è inferibile da `ON CONFLICT (search_id, dedupe_key)` di supabase-js upsert.
-- dedupe_key è sempre valorizzata in pratica; i NULL (rari) restano distinti.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lss_results_dedupe
  ON public.lead_scraper_results(search_id, dedupe_key);

-- ── 4. RLS — super_admin only ────────────────────────────────────────────────
ALTER TABLE public.lead_scraper_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_scraper_results  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin manage lss_searches" ON public.lead_scraper_searches;
CREATE POLICY "super_admin manage lss_searches"
  ON public.lead_scraper_searches
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "super_admin manage lss_results" ON public.lead_scraper_results;
CREATE POLICY "super_admin manage lss_results"
  ON public.lead_scraper_results
  FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ── 5. updated_at trigger su searches ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_lss_searches_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lss_searches_updated_at ON public.lead_scraper_searches;
CREATE TRIGGER trg_lss_searches_updated_at
  BEFORE UPDATE ON public.lead_scraper_searches
  FOR EACH ROW EXECUTE FUNCTION public.tg_lss_searches_updated_at();
