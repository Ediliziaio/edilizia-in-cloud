-- ============================================================================
-- Lead Scraper v2 — colonne di arricchimento "vita morte e miracoli"
-- ============================================================================
-- Aggiunge i campi popolati dal deep-enrichment (gratuito) e dalle fonti
-- aggiuntive: P.IVA, social, LinkedIn decisore, segnali d'intento, stato email.
-- Tutto opzionale → nessun impatto sui record esistenti.
-- ============================================================================

ALTER TABLE public.lead_scraper_results
  ADD COLUMN IF NOT EXISTS partita_iva    text,
  ADD COLUMN IF NOT EXISTS facebook_url   text,
  ADD COLUMN IF NOT EXISTS instagram_url  text,
  -- segnali d'intento dedotti dal sito (es. {"no_https":true,"outdated":true})
  ADD COLUMN IF NOT EXISTS intent_signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- stato dell'email: none | guessed | verified_mx | found
  ADD COLUMN IF NOT EXISTS email_status   text,
  -- punteggio caldo dedotto dai segnali (0-100, separato dall'ai_score)
  ADD COLUMN IF NOT EXISTS intent_score   smallint CHECK (intent_score BETWEEN 0 AND 100),
  -- catch-all per dati extra di enrichment (telefoni multipli, tech, ecc.)
  ADD COLUMN IF NOT EXISTS enrichment     jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.lead_scraper_results.intent_signals IS
  'Segnali dedotti dal sito: no_https, outdated_copyright, not_mobile, no_website, has_form…';
COMMENT ON COLUMN public.lead_scraper_results.email_status IS
  'none | guessed (pattern) | verified_mx (dominio ha MX) | found (estratta dal sito)';

-- indice per filtrare i lead "caldi" per intento
CREATE INDEX IF NOT EXISTS idx_lss_results_intent
  ON public.lead_scraper_results(search_id, intent_score DESC NULLS LAST);
