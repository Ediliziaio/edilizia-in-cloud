-- IMP09: Sconti quantità + Bundle prodotti
-- Migration: 20260708000000_sconti_quantita_bundle.sql

-- ─── Sconti quantità ─────────────────────────────────────────────────────────

CREATE TABLE public.sconti_quantita (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  prodotto_id  UUID REFERENCES public.article_templates(id) ON DELETE CASCADE,
  -- NULL prodotto_id = sconto globale su tutti i prodotti
  da_quantita  NUMERIC(10,2) NOT NULL,
  sconto_pct   NUMERIC(5,2) NOT NULL CHECK (sconto_pct > 0 AND sconto_pct <= 100),
  descrizione  TEXT,
  attivo       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.sconti_quantita ENABLE ROW LEVEL SECURITY;

CREATE POLICY sq_company ON public.sconti_quantita
  USING (company_id = public.get_my_company_id());

CREATE INDEX idx_sq_company ON public.sconti_quantita(company_id, prodotto_id);

-- ─── Bundle prodotti ──────────────────────────────────────────────────────────

CREATE TABLE public.bundle_prodotti (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome         TEXT NOT NULL,
  descrizione  TEXT,
  sconto_bundle_pct NUMERIC(5,2) DEFAULT 0 CHECK (sconto_bundle_pct >= 0 AND sconto_bundle_pct <= 100),
  attivo       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.bundle_voci (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id    UUID NOT NULL REFERENCES public.bundle_prodotti(id) ON DELETE CASCADE,
  prodotto_id  UUID REFERENCES public.article_templates(id) ON DELETE SET NULL,
  tariffa_id   UUID REFERENCES public.tariffe_aziendali(id) ON DELETE SET NULL,
  -- nullable: can be product OR tariff
  quantita     NUMERIC(10,2) NOT NULL DEFAULT 1,
  sort_order   INTEGER DEFAULT 0,
  CONSTRAINT bundle_voci_ha_item CHECK (prodotto_id IS NOT NULL OR tariffa_id IS NOT NULL)
);

ALTER TABLE public.bundle_prodotti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_voci ENABLE ROW LEVEL SECURITY;

CREATE POLICY bp_company ON public.bundle_prodotti
  USING (company_id = public.get_my_company_id());

CREATE POLICY bv_bundle ON public.bundle_voci
  USING (
    bundle_id IN (SELECT id FROM public.bundle_prodotti WHERE company_id = public.get_my_company_id())
  );

CREATE INDEX idx_bundle_company ON public.bundle_prodotti(company_id);
CREATE INDEX idx_bundle_voci_bundle ON public.bundle_voci(bundle_id);
