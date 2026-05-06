-- ════════════════════════════════════════════════════════════════════════════
-- MP-08 — Preventivi Engine: Quote Intelligence Layer
-- ════════════════════════════════════════════════════════════════════════════
-- Foundation: ai-genera-preventivo-v2 + ai-quote-from-capture esistono già.
-- Questa migration aggiunge il "layer intelligente" sopra:
--   1. client_margin_history: margini storici per cliente (cache via RPC)
--   2. quote_clause_templates: clausole standard riutilizzabili
--   3. quote_generation_audit: trace completo del processo di build preventivo
--   4. RPC compute_client_margin_history: ricalcolo (chiamabile da cron)
--
-- NOTE: edge function ai-quote-supreme + UI Quote Composer Wizard
-- DEMANDATE a sessione successiva (richiedono LLM call orchestrate
-- complesse + React UI dedicata).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Storico margini per cliente (cache via cron giornaliero)
CREATE TABLE IF NOT EXISTS public.client_margin_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_name text,                  -- denormalize per clienti senza profilo

  total_quotes int DEFAULT 0,
  accepted_quotes int DEFAULT 0,
  avg_acceptance_margin_pct numeric,   -- media margini sui preventivi accettati
  avg_negotiation_discount_pct numeric, -- media sconti applicati durante trattativa
  preferred_payment_terms text,
  typical_project_size_eur numeric,
  loyalty_score int DEFAULT 0 CHECK (loyalty_score BETWEEN 0 AND 100),

  last_quote_at timestamptz,
  last_accepted_at timestamptz,
  computed_at timestamptz DEFAULT now()
);

-- Vincoli: o customer_id o customer_name (per clienti unstructured)
CREATE UNIQUE INDEX IF NOT EXISTS uq_margin_hist_customer_id
  ON public.client_margin_history (company_id, customer_id)
  WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_margin_hist_customer_name
  ON public.client_margin_history (company_id, customer_name)
  WHERE customer_id IS NULL AND customer_name IS NOT NULL;

ALTER TABLE public.client_margin_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS margin_hist_company_read ON public.client_margin_history;
CREATE POLICY margin_hist_company_read ON public.client_margin_history
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
      UNION
      SELECT m.company_id FROM public.multi_company_access m WHERE m.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.client_margin_history TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.client_margin_history TO service_role;

-- 2) Template clausole standard
CREATE TABLE IF NOT EXISTS public.quote_clause_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'payment_terms', 'penalties', 'exclusions', 'warranty',
    'cancellation', 'force_majeure', 'price_revision', 'custom'
  )),
  title text NOT NULL,
  content text NOT NULL,
  is_default boolean DEFAULT false,
  applicable_to jsonb DEFAULT '{}'::jsonb,   -- es. { project_min_eur: 10000, project_types: ['ristrutturazione'] }
  sort_order int DEFAULT 100,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clause_templates_company_active
  ON public.quote_clause_templates (company_id, active, category)
  WHERE active = true;

ALTER TABLE public.quote_clause_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clauses_company_admin ON public.quote_clause_templates;
CREATE POLICY clauses_company_admin ON public.quote_clause_templates
  FOR ALL TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.has_role(auth.uid(), 'company_admin')
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.has_role(auth.uid(), 'company_admin')
  );

DROP POLICY IF EXISTS clauses_company_read ON public.quote_clause_templates;
CREATE POLICY clauses_company_read ON public.quote_clause_templates
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
      UNION
      SELECT m.company_id FROM public.multi_company_access m WHERE m.user_id = auth.uid()
    )
  );

GRANT SELECT ON public.quote_clause_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.quote_clause_templates TO service_role;

-- 3) Audit completo del processo di build preventivo
CREATE TABLE IF NOT EXISTS public.quote_generation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quote_id uuid,                       -- popolato dopo creazione quote ufficiale
  user_id uuid REFERENCES auth.users(id),

  brief_input text NOT NULL,
  parsed_brief jsonb,                  -- { project_type, scope, sqm, customer_hint, ... }

  listino_items_used jsonb,            -- [{ item_id, code, qty, unit_price, total }]
  margin_strategy jsonb,               -- { base_margin, customer_history_adjustment, market_benchmark, final_margin }
  clauses_included uuid[],             -- IDs di quote_clause_templates
  upsell_suggestions jsonb,
  benchmark_comparison jsonb,
  feasibility_warnings jsonb,
  cashflow_impact jsonb,

  ai_thinking text,                    -- da MP-04 structured output
  ai_confidence text CHECK (ai_confidence IS NULL OR ai_confidence IN ('high', 'medium', 'low')),
  ai_cost_eur numeric,
  ai_duration_ms int,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_audit_company_user
  ON public.quote_generation_audit (company_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_audit_quote
  ON public.quote_generation_audit (quote_id) WHERE quote_id IS NOT NULL;

ALTER TABLE public.quote_generation_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_audit_company_read ON public.quote_generation_audit;
CREATE POLICY quote_audit_company_read ON public.quote_generation_audit
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
      UNION
      SELECT m.company_id FROM public.multi_company_access m WHERE m.user_id = auth.uid()
    )
    AND public.has_role(auth.uid(), 'company_admin')
  );

GRANT SELECT ON public.quote_generation_audit TO authenticated;
GRANT INSERT, UPDATE ON public.quote_generation_audit TO service_role;

-- 4) RPC compute_client_margin_history (chiamabile da cron giornaliero)
-- Best-effort: usa colonne quotes esistenti (status, total, customer_id, created_at).
CREATE OR REPLACE FUNCTION public.compute_client_margin_history(p_company_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0;
BEGIN
  -- Best-effort: assume colonne quotes (status, total, customer_id, created_at, accepted_at)
  -- Se la colonna manca, l'INSERT fallisce → catch + skip
  BEGIN
    INSERT INTO public.client_margin_history (
      company_id, customer_id, customer_name,
      total_quotes, accepted_quotes,
      typical_project_size_eur, loyalty_score,
      last_quote_at, last_accepted_at, computed_at
    )
    SELECT
      q.company_id,
      q.customer_id,
      coalesce(q.customer_id::text, q.client_name, '?'),
      count(*),
      count(*) FILTER (WHERE q.status IN ('accepted', 'firmata', 'accettata')),
      avg(q.total) FILTER (WHERE q.status IN ('accepted', 'firmata', 'accettata')),
      LEAST(100,
        round(
          (count(*) FILTER (WHERE q.status IN ('accepted', 'firmata', 'accettata'))::numeric * 100
           / NULLIF(count(*), 0))
          * (1.0 - LEAST(1.0, EXTRACT(epoch FROM now() - max(q.created_at)) / (365 * 86400)::numeric))
        )::int
      ),
      max(q.created_at),
      max(coalesce(q.accepted_at, q.signed_at, q.created_at)) FILTER (WHERE q.status IN ('accepted', 'firmata', 'accettata')),
      now()
    FROM public.quotes q
    WHERE q.company_id = p_company_id
    GROUP BY q.company_id, q.customer_id, q.client_name
    ON CONFLICT (company_id, customer_id) WHERE customer_id IS NOT NULL DO UPDATE SET
      total_quotes = EXCLUDED.total_quotes,
      accepted_quotes = EXCLUDED.accepted_quotes,
      typical_project_size_eur = EXCLUDED.typical_project_size_eur,
      loyalty_score = EXCLUDED.loyalty_score,
      last_quote_at = EXCLUDED.last_quote_at,
      last_accepted_at = EXCLUDED.last_accepted_at,
      computed_at = now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'compute_client_margin_history: skipped (schema mismatch?): %', SQLERRM;
    v_count := -1;
  END;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_client_margin_history(uuid) TO service_role, authenticated;

COMMENT ON FUNCTION public.compute_client_margin_history IS
  'MP-08: ricalcola la cache client_margin_history per una company. Da chiamare da cron giornaliero.';
