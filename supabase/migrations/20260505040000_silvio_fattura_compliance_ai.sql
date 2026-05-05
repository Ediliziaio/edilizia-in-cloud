-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-18 — AI Fattura Compliance & Auto-Classify (FASE E)
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Campi AI su fatture_ricevute (categoria suggerita, anomalie, order_id match)
-- 2. AI Router config: fattura_classify (deepseek economic)
-- 3. RPC silvio_fatture_anomalie_detect (duplicati / importi anomali)
-- 4. RPC silvio_fattura_categorie_summary (KPI per dashboard)
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Estendi fatture_ricevute con campi AI
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.fatture_ricevute
  ADD COLUMN IF NOT EXISTS categoria_ai text,            -- es. "materiali_edili", "manodopera", "trasporti"
  ADD COLUMN IF NOT EXISTS sottocategoria_ai text,       -- es. "ferro", "calcestruzzo", "noleggio_mezzi"
  ADD COLUMN IF NOT EXISTS categoria_confidenza numeric(4,2), -- 0..1
  ADD COLUMN IF NOT EXISTS order_id_suggerito uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_match_confidenza numeric(4,2), -- 0..1
  ADD COLUMN IF NOT EXISTS anomalie_rilevate jsonb DEFAULT '[]'::jsonb, -- ["importo_anomalo", "duplicato_sospetto"]
  ADD COLUMN IF NOT EXISTS ai_riassunto text,            -- 1-2 frasi per LLM context
  ADD COLUMN IF NOT EXISTS ai_classificata_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_classify_model text;

CREATE INDEX IF NOT EXISTS idx_fatture_categoria_ai
  ON public.fatture_ricevute(company_id, categoria_ai)
  WHERE categoria_ai IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fatture_anomalie
  ON public.fatture_ricevute(company_id)
  WHERE jsonb_array_length(COALESCE(anomalie_rilevate, '[]'::jsonb)) > 0;

CREATE INDEX IF NOT EXISTS idx_fatture_order_suggerito
  ON public.fatture_ricevute(order_id_suggerito)
  WHERE order_id_suggerito IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) RPC: detect duplicati e importi anomali
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_fatture_anomalie_detect(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duplicati int := 0;
  v_anomali int := 0;
  v_processed int := 0;
BEGIN
  -- Reset anomalie
  UPDATE public.fatture_ricevute
    SET anomalie_rilevate = '[]'::jsonb
    WHERE company_id = p_company_id;

  -- 1) Duplicati: stesso cedente_piva + numero_fattura + data_fattura
  WITH dups AS (
    SELECT array_agg(id) AS ids
    FROM public.fatture_ricevute
    WHERE company_id = p_company_id
      AND cedente_piva IS NOT NULL
      AND numero_fattura IS NOT NULL
    GROUP BY cedente_piva, numero_fattura, data_fattura
    HAVING COUNT(*) > 1
  )
  UPDATE public.fatture_ricevute f
    SET anomalie_rilevate = COALESCE(anomalie_rilevate, '[]'::jsonb) ||
        jsonb_build_array('duplicato_sospetto')
    WHERE f.id = ANY(SELECT unnest(ids) FROM dups);
  GET DIAGNOSTICS v_duplicati = ROW_COUNT;

  -- 2) Importi anomali: > 3x media cedente storica
  WITH stats AS (
    SELECT cedente_piva,
           AVG(totale_documento) AS media,
           STDDEV(totale_documento) AS sd
    FROM public.fatture_ricevute
    WHERE company_id = p_company_id
      AND cedente_piva IS NOT NULL
      AND totale_documento > 0
    GROUP BY cedente_piva
    HAVING COUNT(*) >= 3
  )
  UPDATE public.fatture_ricevute f
    SET anomalie_rilevate = COALESCE(anomalie_rilevate, '[]'::jsonb) ||
        jsonb_build_array('importo_anomalo')
    FROM stats s
    WHERE f.company_id = p_company_id
      AND f.cedente_piva = s.cedente_piva
      AND f.totale_documento > (s.media + COALESCE(s.sd, 0) * 3)
      AND f.totale_documento > s.media * 2;
  GET DIAGNOSTICS v_anomali = ROW_COUNT;

  SELECT count(*) INTO v_processed
    FROM public.fatture_ricevute
    WHERE company_id = p_company_id;

  RETURN jsonb_build_object(
    'success', true,
    'fatture_processate', v_processed,
    'duplicati_sospetti', v_duplicati,
    'importi_anomali', v_anomali
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_fatture_anomalie_detect(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_fatture_anomalie_detect(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) RPC: summary categorie (per dashboard)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_fattura_categorie_summary(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categorie jsonb;
  v_anomalie int;
  v_da_classificare int;
  v_totale_classificate int;
  v_ultimo_anno_eur numeric;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.totale_eur DESC), '[]'::jsonb) INTO v_categorie
  FROM (
    SELECT categoria_ai AS categoria,
           count(*) AS fatture_count,
           ROUND(SUM(COALESCE(totale_documento, 0))::numeric, 2) AS totale_eur,
           ROUND(AVG(COALESCE(totale_documento, 0))::numeric, 2) AS media_eur
    FROM public.fatture_ricevute
    WHERE company_id = p_company_id
      AND categoria_ai IS NOT NULL
      AND data_fattura > CURRENT_DATE - INTERVAL '12 months'
    GROUP BY categoria_ai
  ) s;

  SELECT count(*) INTO v_anomalie
    FROM public.fatture_ricevute
    WHERE company_id = p_company_id
      AND jsonb_array_length(COALESCE(anomalie_rilevate, '[]'::jsonb)) > 0;

  SELECT count(*) INTO v_da_classificare
    FROM public.fatture_ricevute
    WHERE company_id = p_company_id AND categoria_ai IS NULL;

  SELECT count(*) INTO v_totale_classificate
    FROM public.fatture_ricevute
    WHERE company_id = p_company_id AND categoria_ai IS NOT NULL;

  SELECT ROUND(SUM(COALESCE(totale_documento, 0))::numeric, 2) INTO v_ultimo_anno_eur
    FROM public.fatture_ricevute
    WHERE company_id = p_company_id
      AND data_fattura > CURRENT_DATE - INTERVAL '12 months';

  RETURN jsonb_build_object(
    'categorie', v_categorie,
    'anomalie_count', v_anomalie,
    'da_classificare', v_da_classificare,
    'classificate_count', v_totale_classificate,
    'totale_12m_eur', COALESCE(v_ultimo_anno_eur, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_fattura_categorie_summary(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_fattura_categorie_summary(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) AI Router config: fattura_classify
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.ai_router_config (
  task_key, task_label, task_description, primary_model, fallback_models,
  default_params, tier_key, category, enabled
) VALUES
  (
    'fattura_classify',
    'Fattura Auto-Classify',
    'Classifica fattura passiva in categoria edilizia + suggerisce match ordine',
    'deepseek/deepseek-chat-v3.1',
    '["openai/gpt-4o-mini"]'::jsonb,
    '{"temperature":0.1,"max_tokens":500}'::jsonb,
    't1_economic',
    'compliance',
    true
  ),
  (
    'contratto_compliance_review',
    'Contratto Compliance Review',
    'Confronta contratto con computo/capitolato e segnala incongruenze',
    'anthropic/claude-haiku-4.5',
    '["openai/gpt-4o-mini"]'::jsonb,
    '{"temperature":0.1,"max_tokens":2000}'::jsonb,
    't3_balanced',
    'compliance',
    true
  )
ON CONFLICT (task_key) DO UPDATE
  SET task_label = EXCLUDED.task_label,
      task_description = EXCLUDED.task_description,
      primary_model = EXCLUDED.primary_model,
      fallback_models = EXCLUDED.fallback_models,
      default_params = EXCLUDED.default_params,
      tier_key = EXCLUDED.tier_key,
      category = EXCLUDED.category;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Verifica
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM public.ai_router_config
    WHERE task_key IN ('fattura_classify','contratto_compliance_review');
  RAISE NOTICE 'AI Router compliance: % task registrati (atteso 2)', v_cnt;
END $$;
