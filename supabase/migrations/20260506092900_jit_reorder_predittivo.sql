-- MP-OPS-05 — Materiale Just-In-Time + Reorder Predittivo
-- ════════════════════════════════════════════════════════════════════════════
-- Sistema predittivo: traccia consumi, prevede fabbisogno, suggerisce ordini
-- ottimali (fornitore + qty + timing), automatizza ordini ricorrenti.
--
-- Defensive: materials_catalog NON esiste → uso text/jsonb per descrizione
-- materiale (no FK rigida).
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) material_consumption_daily (DDT entrata + rapportini uscita)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.material_consumption_daily (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  -- Material reference (defensive: text+sku invece di FK materials_catalog mancante)
  material_sku    text,
  material_name   text NOT NULL,
  unita_misura    text NOT NULL DEFAULT 'pz',

  consumption_date date NOT NULL,
  qty_in          numeric(12,3) NOT NULL DEFAULT 0,
  qty_out         numeric(12,3) NOT NULL DEFAULT 0,
  qty_balance     numeric(12,3) GENERATED ALWAYS AS (qty_in - qty_out) STORED,

  source_ddt_ids        uuid[],
  source_rapportini_ids uuid[],

  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_consumption UNIQUE (order_id, material_sku, consumption_date)
);

CREATE INDEX IF NOT EXISTS idx_consumption_company_date
  ON public.material_consumption_daily(company_id, consumption_date DESC);
CREATE INDEX IF NOT EXISTS idx_consumption_order_material
  ON public.material_consumption_daily(order_id, material_sku, consumption_date DESC);

ALTER TABLE public.material_consumption_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consumption_company_read ON public.material_consumption_daily;
CREATE POLICY consumption_company_read ON public.material_consumption_daily FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS consumption_admin ON public.material_consumption_daily;
CREATE POLICY consumption_admin ON public.material_consumption_daily FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS consumption_super_admin ON public.material_consumption_daily;
CREATE POLICY consumption_super_admin ON public.material_consumption_daily FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ────────────────────────────────────────────────────────────────────────────
-- 2) material_predictions (output ML)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.material_predictions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  material_sku    text,
  material_name   text NOT NULL,
  unita_misura    text NOT NULL DEFAULT 'pz',

  prediction_date date NOT NULL,
  horizon_days    int NOT NULL CHECK (horizon_days IN (7, 14, 30)),

  qty_predicted   numeric(12,3) NOT NULL,
  confidence      numeric(3,2),
  basis           jsonb,  -- ragionamento AI: trend + piano + stagionalità

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_predictions_order_date
  ON public.material_predictions(order_id, prediction_date DESC, horizon_days);
CREATE INDEX IF NOT EXISTS idx_predictions_company
  ON public.material_predictions(company_id, prediction_date DESC);

ALTER TABLE public.material_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS predictions_company_read ON public.material_predictions;
CREATE POLICY predictions_company_read ON public.material_predictions FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS predictions_super_admin ON public.material_predictions;
CREATE POLICY predictions_super_admin ON public.material_predictions FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ────────────────────────────────────────────────────────────────────────────
-- 3) proposed_purchase_orders (AI suggested PO)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.proposed_purchase_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- AI proposal
  ai_persona_used text NOT NULL DEFAULT 'acquisti',
  proposal_reason text,
  proposed_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  alternative_suppliers jsonb,

  items           jsonb NOT NULL,  -- [{material_sku, name, qty, unit, price_estimate, note}]
  total_amount_eur numeric(12,2),

  -- Timing
  optimal_send_date     date,
  expected_delivery_date date,
  for_cantiere_id       uuid REFERENCES public.orders(id) ON DELETE SET NULL,

  -- HITL state machine
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','approved','sent_to_supplier','confirmed','delivered','rejected','cancelled'
  )),
  reviewed_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at   timestamptz,

  -- Outcome
  external_po_id  uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  actual_cost_eur numeric(12,2),
  delivered_at    timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppo_company_status
  ON public.proposed_purchase_orders(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ppo_pending_review
  ON public.proposed_purchase_orders(created_at DESC) WHERE status = 'draft';
CREATE INDEX IF NOT EXISTS idx_ppo_cantiere
  ON public.proposed_purchase_orders(for_cantiere_id) WHERE for_cantiere_id IS NOT NULL;

ALTER TABLE public.proposed_purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ppo_company_read ON public.proposed_purchase_orders;
CREATE POLICY ppo_company_read ON public.proposed_purchase_orders FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS ppo_admin ON public.proposed_purchase_orders;
CREATE POLICY ppo_admin ON public.proposed_purchase_orders FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS ppo_super_admin ON public.proposed_purchase_orders;
CREATE POLICY ppo_super_admin ON public.proposed_purchase_orders FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_ppo_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_ppo_updated_at ON public.proposed_purchase_orders;
CREATE TRIGGER trg_ppo_updated_at
  BEFORE UPDATE ON public.proposed_purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_ppo_updated_at();

-- Settings company
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS jit_reorder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS jit_auto_send_threshold_eur numeric(12,2) NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS jit_safety_buffer_pct numeric(5,2) NOT NULL DEFAULT 10;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) RPC: silvio_tool_predici_consumo_materiali
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_predici_consumo_materiali(
  p_company_id uuid,
  p_user_id uuid,
  p_order_id uuid,
  p_horizon_days int DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_horizon int;
BEGIN
  v_horizon := CASE WHEN p_horizon_days IN (7, 14, 30) THEN p_horizon_days ELSE 14 END;

  -- Aggrega consumi storici ultimi 30 giorni → base per predizione semplice (linear)
  SELECT jsonb_build_object(
    'order_id', p_order_id,
    'horizon_days', v_horizon,
    'predictions', COALESCE(jsonb_agg(
      jsonb_build_object(
        'material_sku', material_sku,
        'material_name', material_name,
        'unita_misura', unita_misura,
        'qty_predicted', ROUND((avg_daily_out * v_horizon)::numeric, 3),
        'avg_daily_out', ROUND(avg_daily_out::numeric, 3),
        'samples_used', samples_count,
        'confidence', LEAST(0.9, samples_count::numeric / 10),
        'method', 'linear_avg_daily'
      ) ORDER BY avg_daily_out DESC
    ) FILTER (WHERE material_sku IS NOT NULL OR material_name IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM (
    SELECT
      material_sku,
      material_name,
      unita_misura,
      AVG(qty_out) AS avg_daily_out,
      COUNT(*) AS samples_count
    FROM public.material_consumption_daily
    WHERE order_id = p_order_id
      AND consumption_date >= CURRENT_DATE - 30
      AND qty_out > 0
    GROUP BY material_sku, material_name, unita_misura
    HAVING AVG(qty_out) > 0
  ) sub;

  RETURN COALESCE(v_result, jsonb_build_object(
    'order_id', p_order_id,
    'horizon_days', v_horizon,
    'predictions', '[]'::jsonb,
    'note', 'Nessun storico consumo (>0) negli ultimi 30gg per questo cantiere.'
  ));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_predici_consumo_materiali(uuid, uuid, uuid, int)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_predici_consumo_materiali(uuid, uuid, uuid, int)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) RPC: silvio_tool_lista_stockout_imminenti
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_stockout_imminenti(
  p_company_id uuid,
  p_user_id uuid,
  p_days_ahead int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Per ogni (cantiere, materiale): saldo cumulato vs consumo medio giornaliero
  -- Stockout imminente = saldo / (consumo_medio + 0.001) < days_ahead
  WITH balances AS (
    SELECT
      mcd.order_id,
      mcd.material_sku,
      mcd.material_name,
      mcd.unita_misura,
      SUM(qty_balance) AS saldo,
      AVG(qty_out) FILTER (WHERE qty_out > 0) AS avg_daily_out
    FROM public.material_consumption_daily mcd
    WHERE mcd.company_id = p_company_id
      AND mcd.consumption_date >= CURRENT_DATE - 30
    GROUP BY mcd.order_id, mcd.material_sku, mcd.material_name, mcd.unita_misura
  )
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'stockouts', COALESCE(jsonb_agg(
      jsonb_build_object(
        'order_id', b.order_id,
        'order_code', o.order_code,
        'material_sku', b.material_sku,
        'material_name', b.material_name,
        'unita', b.unita_misura,
        'saldo_attuale', ROUND(b.saldo::numeric, 3),
        'consumo_medio_gg', ROUND(b.avg_daily_out::numeric, 3),
        'giorni_residui_stimati', CASE
          WHEN b.avg_daily_out > 0 THEN ROUND((b.saldo / b.avg_daily_out)::numeric, 1)
          ELSE NULL
        END
      ) ORDER BY (b.saldo / NULLIF(b.avg_daily_out, 0)) ASC
    ) FILTER (WHERE b.material_name IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM balances b
  JOIN public.orders o ON o.id = b.order_id
  WHERE b.avg_daily_out > 0
    AND b.saldo / b.avg_daily_out < p_days_ahead
    AND o.status IN ('in_corso','programmato');

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'stockouts', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_stockout_imminenti(uuid, uuid, int)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_stockout_imminenti(uuid, uuid, int)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 6) RPC: silvio_tool_crea_proposta_ordine_fornitore (yellow)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_crea_proposta_ordine_fornitore(
  p_company_id uuid,
  p_user_id uuid,
  p_supplier_id uuid,
  p_for_cantiere_id uuid,
  p_items jsonb,
  p_proposal_reason text,
  p_total_amount_eur numeric,
  p_optimal_send_date date DEFAULT NULL,
  p_expected_delivery_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.proposed_purchase_orders (
    company_id, proposed_supplier_id, for_cantiere_id,
    items, proposal_reason, total_amount_eur,
    optimal_send_date, expected_delivery_date,
    status
  ) VALUES (
    p_company_id, p_supplier_id, p_for_cantiere_id,
    p_items, p_proposal_reason, p_total_amount_eur,
    p_optimal_send_date, p_expected_delivery_date,
    'draft'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'proposed_po_id', v_id,
    'total_amount_eur', p_total_amount_eur,
    'message', format('Proposta ordine creata (%s items, €%.2f)', jsonb_array_length(p_items), p_total_amount_eur)
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_crea_proposta_ordine_fornitore(uuid, uuid, uuid, uuid, jsonb, text, numeric, date, date)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_crea_proposta_ordine_fornitore(uuid, uuid, uuid, uuid, jsonb, text, numeric, date, date)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 7) RPC: silvio_tool_lista_proposte_ordini_pending
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_proposte_ordini_pending(
  p_company_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'proposals', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', ppo.id,
        'proposal_reason', ppo.proposal_reason,
        'supplier_id', ppo.proposed_supplier_id,
        'supplier_name', s.name,
        'cantiere_id', ppo.for_cantiere_id,
        'cantiere_code', o.order_code,
        'items_count', jsonb_array_length(ppo.items),
        'total_amount_eur', ppo.total_amount_eur,
        'optimal_send_date', ppo.optimal_send_date,
        'expected_delivery_date', ppo.expected_delivery_date,
        'created_at', ppo.created_at
      ) ORDER BY ppo.optimal_send_date ASC NULLS LAST, ppo.created_at DESC
    ) FILTER (WHERE ppo.id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM public.proposed_purchase_orders ppo
  LEFT JOIN public.suppliers s ON s.id = ppo.proposed_supplier_id
  LEFT JOIN public.orders o ON o.id = ppo.for_cantiere_id
  WHERE ppo.company_id = p_company_id AND ppo.status = 'draft';

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'proposals', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_proposte_ordini_pending(uuid, uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_proposte_ordini_pending(uuid, uuid)
  TO service_role;
