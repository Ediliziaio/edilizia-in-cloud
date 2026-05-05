-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-21 — AI Knowledge Worker (FASE H)
-- ════════════════════════════════════════════════════════════════════════════
-- 1. AI Router config: biz_card_ocr, text_summarize
-- 2. RPC silvio_universal_search (cerca su orders, contacts, fatture, contratti)
-- ════════════════════════════════════════════════════════════════════════════

-- AI Router config
INSERT INTO public.ai_router_config (
  task_key, task_label, task_description, primary_model, fallback_models,
  default_params, tier_key, category, enabled
) VALUES
  (
    'biz_card_ocr',
    'Biz Card OCR',
    'Estrae contatti da biglietto da visita (vision)',
    'openai/gpt-4o-mini',
    '["anthropic/claude-haiku-4.5"]'::jsonb,
    '{"temperature":0.05,"max_tokens":600}'::jsonb,
    't2_vision',
    'knowledge',
    true
  ),
  (
    'text_summarize',
    'Text Summarize',
    'Riassume testi lunghi in formato strutturato',
    'deepseek/deepseek-chat-v3.1',
    '["openai/gpt-4o-mini"]'::jsonb,
    '{"temperature":0.2,"max_tokens":1000}'::jsonb,
    't1_economic',
    'knowledge',
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

-- RPC: silvio_universal_search — keyword search su entita principali
CREATE OR REPLACE FUNCTION public.silvio_universal_search(
  p_company_id uuid, p_query text, p_limit int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pattern text := '%' || lower(p_query) || '%';
  v_orders jsonb;
  v_contacts jsonb;
  v_fatture jsonb;
  v_contratti jsonb;
BEGIN
  -- Orders
  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.created_at DESC), '[]'::jsonb) INTO v_orders
  FROM (
    SELECT id, order_code, client_name, client_company, COALESCE(description,'') AS descrizione,
           total_amount, status, COALESCE(work_address, client_address, indirizzo_lavori) AS indirizzo, created_at
    FROM public.orders
    WHERE company_id = p_company_id
      AND (lower(COALESCE(client_name,'')) LIKE v_pattern
        OR lower(COALESCE(client_company,'')) LIKE v_pattern
        OR lower(COALESCE(description,'')) LIKE v_pattern
        OR lower(COALESCE(work_address,'')) LIKE v_pattern
        OR lower(COALESCE(client_address,'')) LIKE v_pattern
        OR lower(COALESCE(indirizzo_lavori,'')) LIKE v_pattern
        OR lower(COALESCE(order_code,'')) LIKE v_pattern)
    LIMIT p_limit
  ) s;

  -- Marketing contacts
  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO v_contacts
  FROM (
    SELECT id, first_name, last_name, company_name, email, phone, city, source, ai_score, ai_score_tier
    FROM public.marketing_contacts
    WHERE company_id = p_company_id
      AND (lower(COALESCE(first_name,'')) LIKE v_pattern
        OR lower(COALESCE(last_name,'')) LIKE v_pattern
        OR lower(COALESCE(company_name,'')) LIKE v_pattern
        OR lower(COALESCE(email,'')) LIKE v_pattern
        OR lower(COALESCE(phone,'')) LIKE v_pattern)
    LIMIT p_limit
  ) s;

  -- Fatture ricevute
  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO v_fatture
  FROM (
    SELECT id, numero_fattura, data_fattura, cedente_ragione_sociale, totale_documento, categoria_ai
    FROM public.fatture_ricevute
    WHERE company_id = p_company_id
      AND (lower(COALESCE(cedente_ragione_sociale,'')) LIKE v_pattern
        OR lower(COALESCE(numero_fattura,'')) LIKE v_pattern
        OR lower(COALESCE(cedente_piva,'')) LIKE v_pattern)
    LIMIT p_limit
  ) s;

  -- Contratti
  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb) INTO v_contratti
  FROM (
    SELECT id, numero_contratto, oggetto_lavori, importo_totale_eur, status, created_at
    FROM public.contratti_documents
    WHERE company_id = p_company_id
      AND (lower(COALESCE(numero_contratto,'')) LIKE v_pattern
        OR lower(COALESCE(oggetto_lavori,'')) LIKE v_pattern
        OR lower(COALESCE(committente_nome,'')) LIKE v_pattern)
    LIMIT p_limit
  ) s;

  RETURN jsonb_build_object(
    'query', p_query,
    'orders', v_orders,
    'contacts', v_contacts,
    'fatture', v_fatture,
    'contratti', v_contratti,
    'totali', jsonb_build_object(
      'orders', jsonb_array_length(v_orders),
      'contacts', jsonb_array_length(v_contacts),
      'fatture', jsonb_array_length(v_fatture),
      'contratti', jsonb_array_length(v_contratti)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_universal_search(uuid, text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_universal_search(uuid, text, int) TO authenticated, service_role;

DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM public.ai_router_config WHERE task_key IN ('biz_card_ocr','text_summarize');
  RAISE NOTICE 'AI Router knowledge: % task registrati (atteso 2)', v_cnt;
END $$;
