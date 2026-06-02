-- ============================================================================
-- Lead Scraper v6 — SCALA: coda job asincrona per scrapare MIGLIAIA alla volta
-- ============================================================================
-- Problema: l'edge function va in timeout (~150s) su grandi volumi. Soluzione:
-- l'edge function ENQUEUE un job e ritorna subito; lo scraper-worker (senza
-- timeout) pesca i job dalla coda, scrapa a pagine, fa bulk-upsert a batch e
-- aggiorna l'avanzamento. L'UI fa polling del progresso.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_scraper_jobs (
  id            uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type          text NOT NULL DEFAULT 'scrape',
  status        text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','done','error','canceled')),
  -- parametri: { engine, keyword, city, region, target, perEmails }
  params        jsonb NOT NULL DEFAULT '{}'::jsonb,
  total         integer NOT NULL DEFAULT 0,     -- target stimato
  processed     integer NOT NULL DEFAULT 0,     -- avanzamento
  results_count integer NOT NULL DEFAULT 0,     -- aziende salvate
  search_id     uuid REFERENCES public.lead_scraper_searches(id) ON DELETE SET NULL,
  error         text,
  worker_id     text,                            -- chi l'ha preso in carico
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

COMMENT ON TABLE public.lead_scraper_jobs IS
  'Coda di job di scraping asincroni (per migliaia di contatti). Il worker li processa.';

CREATE INDEX IF NOT EXISTS idx_lss_jobs_queue ON public.lead_scraper_jobs (status, created_at)
  WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS idx_lss_jobs_creator ON public.lead_scraper_jobs (created_by, created_at DESC);

ALTER TABLE public.lead_scraper_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "super_admin manage lss_jobs" ON public.lead_scraper_jobs;
CREATE POLICY "super_admin manage lss_jobs"
  ON public.lead_scraper_jobs FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- updated/finished trigger non necessario; usiamo update espliciti dal worker.

-- ── Claim atomico di un job (SKIP LOCKED → più worker in parallelo, niente doppioni) ──
CREATE OR REPLACE FUNCTION public.lead_scraper_claim_job(p_worker text)
RETURNS public.lead_scraper_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.lead_scraper_jobs;
BEGIN
  UPDATE public.lead_scraper_jobs
     SET status = 'running', started_at = now(), worker_id = p_worker
   WHERE id = (
     SELECT id FROM public.lead_scraper_jobs
      WHERE status = 'queued'
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
   )
  RETURNING * INTO v_job;
  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.lead_scraper_claim_job(text) FROM PUBLIC, anon, authenticated;

-- ── Riscrittura UPSERT in SET-BASED (veloce su migliaia di righe) ────────────
-- Sostituisce il loop riga-per-riga: un solo INSERT ... SELECT ... ON CONFLICT.
CREATE OR REPLACE FUNCTION public.scraped_companies_upsert(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  WITH src AS (
    SELECT * FROM jsonb_to_recordset(p_rows) AS x(
      dedupe_key text, business_name text, phone text, email text, website text,
      address text, city text, region text, country text, partita_iva text,
      source text, place_id text, rating numeric, reviews_count integer,
      lat numeric, lng numeric, categories text[], raw jsonb
    )
    WHERE NULLIF(x.dedupe_key,'') IS NOT NULL
  ),
  dedup AS (   -- elimina i duplicati interni al batch (ultimo vince)
    SELECT DISTINCT ON (dedupe_key) * FROM src ORDER BY dedupe_key
  ),
  ins AS (
    INSERT INTO public.scraped_companies (
      dedupe_key, business_name, phone, email, website, address, city, region,
      country, partita_iva, source, place_id, rating, reviews_count, lat, lng, categories, raw
    )
    SELECT
      dedupe_key, COALESCE(NULLIF(business_name,''),'Lead'), NULLIF(phone,''),
      NULLIF(email,''), NULLIF(website,''), NULLIF(address,''), NULLIF(city,''),
      NULLIF(region,''), COALESCE(NULLIF(country,''),'IT'), NULLIF(partita_iva,''),
      NULLIF(source,''), NULLIF(place_id,''), rating, reviews_count, lat, lng,
      COALESCE(categories,'{}'), raw
    FROM dedup
    ON CONFLICT (dedupe_key) DO UPDATE SET
      business_name = COALESCE(public.scraped_companies.business_name, EXCLUDED.business_name),
      phone         = COALESCE(public.scraped_companies.phone, EXCLUDED.phone),
      email         = COALESCE(public.scraped_companies.email, EXCLUDED.email),
      website       = COALESCE(public.scraped_companies.website, EXCLUDED.website),
      address       = COALESCE(public.scraped_companies.address, EXCLUDED.address),
      partita_iva   = COALESCE(public.scraped_companies.partita_iva, EXCLUDED.partita_iva),
      rating        = COALESCE(public.scraped_companies.rating, EXCLUDED.rating),
      reviews_count = COALESCE(public.scraped_companies.reviews_count, EXCLUDED.reviews_count),
      categories    = (SELECT array(SELECT DISTINCT unnest(public.scraped_companies.categories || EXCLUDED.categories))),
      last_scraped_at = now(),
      scrape_count  = public.scraped_companies.scrape_count + 1
    RETURNING 1
  )
  SELECT count(*) INTO n FROM ins;
  RETURN COALESCE(n,0);
END;
$$;

REVOKE ALL ON FUNCTION public.scraped_companies_upsert(jsonb) FROM PUBLIC, anon, authenticated;
