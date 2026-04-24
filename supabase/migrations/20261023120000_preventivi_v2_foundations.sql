-- ============================================================================
-- PREVENTIVI V2 — Foundations
-- Scontistica parametrica + approvazioni + provvigioni su preventivi
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Estensione tabella `quotes`
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS salesperson_id UUID REFERENCES public.salespeople(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sconto_richiesto_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS sconto_autorizzato_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS margine_pct_snapshot NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS commission_amount_snapshot NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required','pending','approved','rejected','counter_proposed'));

CREATE INDEX IF NOT EXISTS idx_quotes_salesperson ON public.quotes(salesperson_id) WHERE salesperson_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_approval_status ON public.quotes(company_id, approval_status) WHERE approval_status <> 'not_required';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Estensione tabella `salespeople` — modalita compenso
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.salespeople
  ADD COLUMN IF NOT EXISTS compensation_mode TEXT NOT NULL DEFAULT 'only_commission'
    CHECK (compensation_mode IN ('only_commission','fixed_plus_commission','fixed_only')),
  ADD COLUMN IF NOT EXISTS fixed_monthly_eur NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN public.salespeople.compensation_mode IS
  'only_commission: solo provvigioni | fixed_plus_commission: fisso + provvigioni | fixed_only: solo fisso (nessuna provvigione)';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Tabella `discount_rules` — regole scontistica parametrica
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.discount_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  scope            TEXT NOT NULL DEFAULT 'globale'
                     CHECK (scope IN ('globale','per_commerciale','per_cliente_cat')),
  salesperson_id   UUID REFERENCES public.salespeople(id) ON DELETE CASCADE,
  client_category  TEXT,
  tipo_lavoro      TEXT,
  importo_min      NUMERIC(12,2) DEFAULT 0,
  importo_max      NUMERIC(12,2),
  margine_min_pct  NUMERIC(5,2) NOT NULL DEFAULT 15,
  sconto_max_pct   NUMERIC(5,2) NOT NULL DEFAULT 5,
  approva_oltre_pct NUMERIC(5,2),
  priority         INTEGER NOT NULL DEFAULT 100,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discount_rules_company ON public.discount_rules(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_discount_rules_salesperson ON public.discount_rules(salesperson_id) WHERE salesperson_id IS NOT NULL;

COMMENT ON TABLE public.discount_rules IS
  'Regole scontistica: applicate live in QuoteBuilder per calcolare max sconto consentito';
COMMENT ON COLUMN public.discount_rules.scope IS
  'globale | per_commerciale (richiede salesperson_id) | per_cliente_cat (richiede client_category)';
COMMENT ON COLUMN public.discount_rules.margine_min_pct IS
  'Il margine POST-sconto non puo scendere sotto questa soglia';
COMMENT ON COLUMN public.discount_rules.sconto_max_pct IS
  'Tetto massimo sconto; se NULL = illimitato ma rispettando margine_min_pct';
COMMENT ON COLUMN public.discount_rules.approva_oltre_pct IS
  'Se sconto richiesto > questa soglia, serve approvazione admin';
COMMENT ON COLUMN public.discount_rules.priority IS
  'Ordine applicazione: la regola piu restrittiva matchante vince (usa MIN di sconto_max_pct)';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Tabella `quote_approvals` — audit trail approvazioni
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.quote_approvals (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quote_id               UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  requested_by           UUID NOT NULL,
  requested_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  sconto_richiesto_pct   NUMERIC(5,2) NOT NULL,
  importo_preventivo     NUMERIC(12,2) NOT NULL,
  margine_stimato_pct    NUMERIC(6,3),
  note_richiesta         TEXT,
  decision               TEXT CHECK (decision IN ('approved','rejected','counter_proposed')),
  decided_by             UUID,
  decided_at             TIMESTAMPTZ,
  sconto_autorizzato_pct NUMERIC(5,2),
  note_decisione         TEXT
);

CREATE INDEX IF NOT EXISTS idx_quote_approvals_quote ON public.quote_approvals(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_approvals_pending ON public.quote_approvals(company_id, requested_at) WHERE decision IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Tabella `quote_salespeople` — come order_salespeople ma per preventivi
--    Snapshot provvigione teorica al momento del salvataggio.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.quote_salespeople (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quote_id           UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  salesperson_id     UUID NOT NULL REFERENCES public.salespeople(id) ON DELETE CASCADE,
  commission_type    TEXT NOT NULL,
  commission_value   NUMERIC NOT NULL DEFAULT 0,
  commission_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  compensation_mode  TEXT,
  fixed_monthly_eur  NUMERIC(12,2),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(quote_id, salesperson_id)
);

CREATE INDEX IF NOT EXISTS idx_quote_salespeople_salesperson ON public.quote_salespeople(salesperson_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) RPC `compute_max_discount` — engine regole sconto
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_max_discount(
  p_quote_id UUID,
  p_user_id  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_total NUMERIC;
  v_salesperson_id UUID;
  v_tipo_lavoro TEXT;
  v_client_tags TEXT[];
  v_margine_pct NUMERIC;
  v_rule RECORD;
  v_max_sconto NUMERIC := 100;
  v_approva_oltre NUMERIC := NULL;
  v_applied_rules JSONB := '[]'::jsonb;
BEGIN
  SELECT q.company_id, q.subtotal, q.salesperson_id,
         q.description,
         COALESCE(mc.tags, ARRAY[]::text[])
    INTO v_company_id, v_total, v_salesperson_id, v_tipo_lavoro, v_client_tags
  FROM public.quotes q
  LEFT JOIN public.marketing_contacts mc ON mc.id = q.contact_id
  WHERE q.id = p_quote_id;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('error', 'quote_not_found');
  END IF;

  -- margine pct pre-sconto (da snapshot se presente; altrimenti stima prudente 20%)
  SELECT COALESCE(margine_pct_snapshot, 20) INTO v_margine_pct
    FROM public.quotes WHERE id = p_quote_id;

  FOR v_rule IN
    SELECT dr.*
      FROM public.discount_rules dr
     WHERE dr.company_id = v_company_id
       AND dr.is_active = true
       AND (dr.importo_min IS NULL OR COALESCE(v_total,0) >= dr.importo_min)
       AND (dr.importo_max IS NULL OR COALESCE(v_total,0) <= dr.importo_max)
       AND (dr.tipo_lavoro IS NULL OR dr.tipo_lavoro = v_tipo_lavoro)
       AND (
         dr.scope = 'globale'
         OR (dr.scope = 'per_commerciale' AND dr.salesperson_id = v_salesperson_id)
         OR (dr.scope = 'per_cliente_cat' AND dr.client_category = ANY(v_client_tags))
       )
     ORDER BY dr.priority ASC
  LOOP
    -- margine_min_pct: se il margine pre-sconto e' vicino a questa soglia,
    -- lo sconto max effettivo e' (margine_pct - margine_min_pct), mai oltre
    v_max_sconto := LEAST(
      v_max_sconto,
      v_rule.sconto_max_pct,
      GREATEST(0, v_margine_pct - v_rule.margine_min_pct)
    );
    IF v_rule.approva_oltre_pct IS NOT NULL THEN
      v_approva_oltre := LEAST(COALESCE(v_approva_oltre, v_rule.approva_oltre_pct), v_rule.approva_oltre_pct);
    END IF;
    v_applied_rules := v_applied_rules || jsonb_build_object(
      'id', v_rule.id, 'name', v_rule.name, 'sconto_max_pct', v_rule.sconto_max_pct,
      'margine_min_pct', v_rule.margine_min_pct, 'scope', v_rule.scope
    );
  END LOOP;

  IF v_max_sconto = 100 AND jsonb_array_length(v_applied_rules) = 0 THEN
    v_max_sconto := 10;
  END IF;

  RETURN jsonb_build_object(
    'max_sconto_pct', ROUND(v_max_sconto::numeric, 2),
    'approva_oltre_pct', v_approva_oltre,
    'margine_pct_pre', v_margine_pct,
    'applied_rules', v_applied_rules,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_max_discount(UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) RPC `compute_quote_commission` — calcola provvigione teorica sul preventivo
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_quote_commission(
  p_quote_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_total NUMERIC;
  v_sp_id UUID;
  v_sp RECORD;
  v_commission NUMERIC := 0;
BEGIN
  SELECT q.company_id, q.total, q.salesperson_id
    INTO v_company_id, v_total, v_sp_id
  FROM public.quotes q
  WHERE q.id = p_quote_id;

  IF v_sp_id IS NULL THEN
    RETURN jsonb_build_object('commission_amount', 0, 'skipped', true);
  END IF;

  SELECT * INTO v_sp FROM public.salespeople WHERE id = v_sp_id;

  IF v_sp IS NULL THEN
    RETURN jsonb_build_object('error', 'salesperson_not_found');
  END IF;

  IF v_sp.compensation_mode = 'fixed_only' THEN
    v_commission := 0;
  ELSE
    v_commission := CASE v_sp.commission_type
      WHEN 'fixed' THEN COALESCE(v_sp.commission_value, 0)
      WHEN 'percentage_sold' THEN COALESCE(v_total,0) * COALESCE(v_sp.commission_value,0) / 100
      WHEN 'percentage_collected' THEN 0  -- noto solo a incasso (ordine)
      ELSE 0
    END;
  END IF;

  -- snapshot sul preventivo
  UPDATE public.quotes SET commission_amount_snapshot = v_commission WHERE id = p_quote_id;

  -- upsert quote_salespeople
  INSERT INTO public.quote_salespeople (
    company_id, quote_id, salesperson_id, commission_type, commission_value,
    commission_amount, compensation_mode, fixed_monthly_eur
  ) VALUES (
    v_company_id, p_quote_id, v_sp_id, v_sp.commission_type, v_sp.commission_value,
    v_commission, v_sp.compensation_mode, v_sp.fixed_monthly_eur
  )
  ON CONFLICT (quote_id, salesperson_id) DO UPDATE SET
    commission_type = EXCLUDED.commission_type,
    commission_value = EXCLUDED.commission_value,
    commission_amount = EXCLUDED.commission_amount,
    compensation_mode = EXCLUDED.compensation_mode,
    fixed_monthly_eur = EXCLUDED.fixed_monthly_eur,
    updated_at = now();

  RETURN jsonb_build_object(
    'commission_amount', v_commission,
    'commission_type', v_sp.commission_type,
    'commission_value', v_sp.commission_value,
    'compensation_mode', v_sp.compensation_mode
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_quote_commission(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) RPC workflow approvazione
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.request_quote_approval(
  p_quote_id UUID,
  p_sconto_richiesto_pct NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_total NUMERIC;
  v_margine NUMERIC;
  v_approval_id UUID;
BEGIN
  SELECT company_id, total, margine_pct_snapshot
    INTO v_company_id, v_total, v_margine
  FROM public.quotes WHERE id = p_quote_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'quote_not_found';
  END IF;

  INSERT INTO public.quote_approvals (
    company_id, quote_id, requested_by, sconto_richiesto_pct,
    importo_preventivo, margine_stimato_pct, note_richiesta
  ) VALUES (
    v_company_id, p_quote_id, auth.uid(), p_sconto_richiesto_pct,
    COALESCE(v_total,0), v_margine, p_note
  )
  RETURNING id INTO v_approval_id;

  UPDATE public.quotes
     SET approval_status = 'pending',
         sconto_richiesto_pct = p_sconto_richiesto_pct,
         status = CASE WHEN status = 'bozza' THEN 'bozza' ELSE status END
   WHERE id = p_quote_id;

  -- Notifica a tutti gli admin della company
  INSERT INTO public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  SELECT v_company_id, ur.user_id, 'quote_approval_requested',
         'Richiesta autorizzazione sconto preventivo',
         'Nuova richiesta di sconto ' || p_sconto_richiesto_pct || '% da autorizzare',
         'quote', p_quote_id,
         '/azienda/marketing/preventivi/approvazioni'
  FROM public.user_roles ur
  WHERE ur.company_id = v_company_id
    AND ur.role IN ('company_admin','super_admin');

  RETURN v_approval_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_quote_approval(UUID, NUMERIC, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_quote_approval(
  p_approval_id UUID,
  p_decision TEXT,
  p_sconto_autorizzato_pct NUMERIC DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote_id UUID;
  v_company_id UUID;
  v_requested_by UUID;
  v_sconto_final NUMERIC;
  v_new_approval_status TEXT;
BEGIN
  IF p_decision NOT IN ('approved','rejected','counter_proposed') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  SELECT quote_id, company_id, requested_by
    INTO v_quote_id, v_company_id, v_requested_by
  FROM public.quote_approvals WHERE id = p_approval_id AND decision IS NULL;

  IF v_quote_id IS NULL THEN
    RAISE EXCEPTION 'approval_not_found_or_already_decided';
  END IF;

  UPDATE public.quote_approvals
     SET decision = p_decision,
         decided_by = auth.uid(),
         decided_at = now(),
         sconto_autorizzato_pct = p_sconto_autorizzato_pct,
         note_decisione = p_note
   WHERE id = p_approval_id;

  v_new_approval_status := CASE p_decision
    WHEN 'approved' THEN 'approved'
    WHEN 'rejected' THEN 'rejected'
    WHEN 'counter_proposed' THEN 'counter_proposed'
  END;

  v_sconto_final := CASE
    WHEN p_decision = 'approved' THEN (SELECT sconto_richiesto_pct FROM public.quote_approvals WHERE id = p_approval_id)
    WHEN p_decision = 'counter_proposed' THEN p_sconto_autorizzato_pct
    ELSE NULL
  END;

  UPDATE public.quotes
     SET approval_status = v_new_approval_status,
         sconto_autorizzato_pct = v_sconto_final,
         discount_percent = COALESCE(v_sconto_final, discount_percent)
   WHERE id = v_quote_id;

  -- Notifica commerciale
  INSERT INTO public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  VALUES (
    v_company_id, v_requested_by,
    'quote_approval_' || p_decision,
    CASE p_decision
      WHEN 'approved' THEN 'Sconto preventivo approvato'
      WHEN 'rejected' THEN 'Sconto preventivo rifiutato'
      ELSE 'Contro-proposta sconto preventivo'
    END,
    COALESCE(p_note, 'Decisione admin registrata'),
    'quote', v_quote_id,
    '/azienda/marketing/preventivi/' || v_quote_id::text
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.decide_quote_approval(UUID, TEXT, NUMERIC, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) RLS policies
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.discount_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_salespeople ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discount_rules_company_access ON public.discount_rules;
CREATE POLICY discount_rules_company_access ON public.discount_rules
  FOR ALL USING (
    company_id IN (SELECT company_id FROM public.user_roles WHERE user_id = auth.uid())
  ) WITH CHECK (
    company_id IN (SELECT company_id FROM public.user_roles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS quote_approvals_company_access ON public.quote_approvals;
CREATE POLICY quote_approvals_company_access ON public.quote_approvals
  FOR ALL USING (
    company_id IN (SELECT company_id FROM public.user_roles WHERE user_id = auth.uid())
  ) WITH CHECK (
    company_id IN (SELECT company_id FROM public.user_roles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS quote_salespeople_company_access ON public.quote_salespeople;
CREATE POLICY quote_salespeople_company_access ON public.quote_salespeople
  FOR ALL USING (
    company_id IN (SELECT company_id FROM public.user_roles WHERE user_id = auth.uid())
  ) WITH CHECK (
    company_id IN (SELECT company_id FROM public.user_roles WHERE user_id = auth.uid())
  );

COMMIT;
