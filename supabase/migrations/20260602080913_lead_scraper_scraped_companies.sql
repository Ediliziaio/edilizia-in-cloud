-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.scraped_companies (
  id              uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dedupe_key      text NOT NULL UNIQUE,
  business_name   text NOT NULL,
  phone           text,
  email           text,
  website         text,
  address         text,
  city            text,
  region          text,
  country         text NOT NULL DEFAULT 'IT',
  partita_iva     text,
  source          text,
  place_id        text,
  rating          numeric(2,1),
  reviews_count   integer,
  lat             numeric(9,6),
  lng             numeric(9,6),
  categories      text[] NOT NULL DEFAULT '{}',
  raw             jsonb,
  first_scraped_at timestamptz NOT NULL DEFAULT now(),
  last_scraped_at  timestamptz NOT NULL DEFAULT now(),
  scrape_count     integer NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.scraped_companies IS
  'Database proprietario di aziende scrapate (asset che cresce). Riuso a costo zero.';

CREATE INDEX IF NOT EXISTS idx_scraped_city        ON public.scraped_companies (lower(city));
CREATE INDEX IF NOT EXISTS idx_scraped_categories  ON public.scraped_companies USING gin (categories);
CREATE INDEX IF NOT EXISTS idx_scraped_name_trgm   ON public.scraped_companies (lower(business_name));
CREATE INDEX IF NOT EXISTS idx_scraped_last        ON public.scraped_companies (last_scraped_at DESC);

ALTER TABLE public.scraped_companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "super_admin manage scraped_companies" ON public.scraped_companies;
CREATE POLICY "super_admin manage scraped_companies"
  ON public.scraped_companies FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.scraped_companies_upsert(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  n integer := 0;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    INSERT INTO public.scraped_companies (
      dedupe_key, business_name, phone, email, website, address, city, region,
      country, partita_iva, source, place_id, rating, reviews_count, lat, lng, categories, raw
    ) VALUES (
      r->>'dedupe_key',
      COALESCE(NULLIF(r->>'business_name',''), 'Lead'),
      NULLIF(r->>'phone',''), NULLIF(r->>'email',''), NULLIF(r->>'website',''),
      NULLIF(r->>'address',''), NULLIF(r->>'city',''), NULLIF(r->>'region',''),
      COALESCE(NULLIF(r->>'country',''),'IT'), NULLIF(r->>'partita_iva',''),
      NULLIF(r->>'source',''), NULLIF(r->>'place_id',''),
      NULLIF(r->>'rating','')::numeric, NULLIF(r->>'reviews_count','')::int,
      NULLIF(r->>'lat','')::numeric, NULLIF(r->>'lng','')::numeric,
      COALESCE((SELECT array_agg(lower(x)) FROM jsonb_array_elements_text(r->'categories') x), '{}'),
      r->'raw'
    )
    ON CONFLICT (dedupe_key) DO UPDATE SET
      business_name   = COALESCE(public.scraped_companies.business_name, EXCLUDED.business_name),
      phone           = COALESCE(public.scraped_companies.phone, EXCLUDED.phone),
      email           = COALESCE(public.scraped_companies.email, EXCLUDED.email),
      website         = COALESCE(public.scraped_companies.website, EXCLUDED.website),
      address         = COALESCE(public.scraped_companies.address, EXCLUDED.address),
      partita_iva     = COALESCE(public.scraped_companies.partita_iva, EXCLUDED.partita_iva),
      rating          = COALESCE(public.scraped_companies.rating, EXCLUDED.rating),
      reviews_count   = COALESCE(public.scraped_companies.reviews_count, EXCLUDED.reviews_count),
      categories      = (SELECT array(SELECT DISTINCT unnest(public.scraped_companies.categories || EXCLUDED.categories))),
      last_scraped_at = now(),
      scrape_count    = public.scraped_companies.scrape_count + 1;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.scraped_companies_upsert(jsonb) FROM PUBLIC, anon, authenticated;
