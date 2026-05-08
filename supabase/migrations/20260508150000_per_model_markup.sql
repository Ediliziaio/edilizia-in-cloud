-- ═══════════════════════════════════════════════════════════════════════════
-- PER-MODEL MARKUP — Markup differenziato per modello AI
-- -----------------------------------------------------------------------
-- Il costo reale arriva da OpenRouter (header x-or-cost) insieme al modello
-- effettivamente usato (json.model). Ora il markup non è solo per task_kind
-- ma anche per modello: un modello economico (Mistral small €0.001) può
-- avere markup ×10, uno costoso (GPT-4o €0.30) solo ×1.5.
--
-- LOOKUP PRIORITY nel RPC deduct_ai_credits_with_markup:
--   1. task_kind + model_pattern (ILIKE match)   ← più specifico
--   2. task_kind + model_pattern IS NULL          ← catch-all per quel task
--   3. 'default' + model_pattern IS NULL          ← fallback assoluto
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. SCHEMA — aggiungi model_pattern + ridefinisci vincoli unicità
-- ───────────────────────────────────────────────────────────────────────────

-- 1a. Aggiungi colonna (nullable: NULL = si applica a tutti i modelli)
ALTER TABLE public.ai_pricing_markup
  ADD COLUMN IF NOT EXISTS model_pattern TEXT DEFAULT NULL;

COMMENT ON COLUMN public.ai_pricing_markup.model_pattern IS
  'Pattern ILIKE sul model_id OpenRouter (es. "mistralai/%"). NULL = catch-all per il task_kind.';

-- 1b. Aggiungi colonna per il markup max (opzionale — usata per cap-markup automatico)
ALTER TABLE public.ai_pricing_markup
  ADD COLUMN IF NOT EXISTS markup_max NUMERIC(5,2) DEFAULT NULL
    CHECK (markup_max IS NULL OR markup_max >= markup_multiplier);

COMMENT ON COLUMN public.ai_pricing_markup.markup_max IS
  'Markup massimo: se impostato, limita il markup applicato anche quando il modello è economicissimo.';

-- 1c. Aggiungi descrizione del motivo del markup (per il SuperAdmin dashboard)
ALTER TABLE public.ai_pricing_markup
  ADD COLUMN IF NOT EXISTS pricing_rationale TEXT DEFAULT NULL;

-- 1d. Rimuovi il vecchio UNIQUE su task_kind (ora permettiamo più righe per task)
ALTER TABLE public.ai_pricing_markup
  DROP CONSTRAINT IF EXISTS ai_pricing_markup_task_kind_key;

-- 1e. Crea i nuovi indici di unicità:
--   • Un solo catch-all (model_pattern IS NULL) per task_kind
--   • Unicità su (task_kind, model_pattern) per le righe specifiche
DROP INDEX IF EXISTS public.ux_markup_task_catchall;
CREATE UNIQUE INDEX ux_markup_task_catchall
  ON public.ai_pricing_markup (task_kind)
  WHERE model_pattern IS NULL;

DROP INDEX IF EXISTS public.ux_markup_task_model;
CREATE UNIQUE INDEX ux_markup_task_model
  ON public.ai_pricing_markup (task_kind, model_pattern)
  WHERE model_pattern IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. SEED — Markup per modello
--    Pattern ILIKE: "provider/model%" cattura varianti (es. claude-haiku-3, -3-5, etc.)
--    Logica: modelli economici → markup alto; modelli costosi → markup basso
-- ───────────────────────────────────────────────────────────────────────────

-- Rimuovi eventuali dati orfani dai test
DELETE FROM public.ai_pricing_markup WHERE model_pattern IS NOT NULL;

INSERT INTO public.ai_pricing_markup
  (task_kind, model_pattern, markup_multiplier, markup_max, display_label, description, pricing_rationale)
VALUES

-- ── OPENAI ────────────────────────────────────────────────────────────────
-- gpt-4o-mini: ~$0.15/1M input, $0.60/1M output → costo medio ~$0.001/call
('default', 'openai/gpt-4o-mini%',   5.00, 10.00, 'GPT-4o-mini',
  'Modello OpenAI leggero, alto volume',
  'Costo ~€0.001/call → margine buono con ×5'),

-- gpt-4o: ~$2.50/1M input, $10/1M output → costo medio ~$0.008/call
('default', 'openai/gpt-4o%',        2.00, 4.00,  'GPT-4o',
  'Modello OpenAI vision-class',
  'Costo ~€0.008/call → margine ridotto ma alto valore percepito'),

-- gpt-4.1-mini: simile a 4o-mini
('default', 'openai/gpt-4.1-mini%',  5.00, 10.00, 'GPT-4.1-mini',
  'Modello OpenAI 4.1 mini',
  'Costo simile a 4o-mini'),

-- gpt-4.1: simile a 4o
('default', 'openai/gpt-4.1%',       2.00, 4.00,  'GPT-4.1',
  'Modello OpenAI 4.1 standard',
  'Costo simile a 4o'),

-- gpt-image-1: rendering immagini ~$0.08/img
('default', 'openai/gpt-image%',     1.80, 3.00,  'GPT Image',
  'Generazione immagini AI render',
  'Costo fisso per immagine, margine calcolato sul prezzo credito render'),

-- ── ANTHROPIC ─────────────────────────────────────────────────────────────
-- Claude Haiku 3: ~$0.25/1M input, $1.25/1M output → ~$0.002/call
('default', 'anthropic/claude-haiku-3%', 4.00, 8.00, 'Claude Haiku',
  'Anthropic Claude Haiku — veloce ed economico',
  'Costo ~€0.002/call → markup ×4 per buon margine'),

-- Claude Sonnet 3.5/4: ~$3/1M input, $15/1M output → ~$0.018/call
('default', 'anthropic/claude-sonnet%',  1.80, 3.00, 'Claude Sonnet',
  'Anthropic Claude Sonnet — bilanciato',
  'Costo ~€0.018/call → markup ridotto per non sfondare il prezzo'),

-- Claude Opus: ~$15/1M input, $75/1M output → ~$0.09/call
('default', 'anthropic/claude-opus%',    1.30, 2.00, 'Claude Opus',
  'Anthropic Claude Opus — massima qualità',
  'Costo elevato ~€0.09/call → margine ridotto, usato solo per task critici'),

-- ── GOOGLE GEMINI ─────────────────────────────────────────────────────────
-- Gemini Flash 1.5/2.0/2.5: ~$0.075/1M input, $0.30/1M output → ~$0.0005/call
('default', 'google/gemini-flash%',      8.00, 15.00, 'Gemini Flash',
  'Google Gemini Flash — ultra economico',
  'Costo ~€0.0005/call → alto markup sostenibile'),

('default', 'google/gemini-2%flash%',    7.00, 12.00, 'Gemini 2.x Flash',
  'Google Gemini 2.x Flash series',
  'Leggermente più caro di 1.5 Flash ma ancora economico'),

-- Gemini Pro/2.5 Pro: ~$1.25/1M input, $5/1M output → ~$0.006/call
('default', 'google/gemini%pro%',        2.50, 5.00,  'Gemini Pro',
  'Google Gemini Pro — bilanciato',
  'Costo ~€0.006/call → markup moderato'),

-- ── MISTRAL ───────────────────────────────────────────────────────────────
-- Mistral 7B/Small: ~$0.10-0.20/1M → ~$0.0003/call
('default', 'mistralai/mistral-small%',  10.00, 20.00, 'Mistral Small',
  'Mistral AI Small — molto economico',
  'Costo ~€0.0003/call → markup ×10 per buon margine assoluto'),

-- Mistral Medium: ~$2.75/1M → ~$0.004/call
('default', 'mistralai/mistral-medium%', 5.00, 10.00, 'Mistral Medium',
  'Mistral AI Medium',
  'Costo ~€0.004/call'),

-- Mistral Large: ~$8/1M → ~$0.012/call
('default', 'mistralai/mistral-large%',  3.00, 6.00,  'Mistral Large',
  'Mistral AI Large',
  'Costo ~€0.012/call'),

-- ── META LLAMA ────────────────────────────────────────────────────────────
-- Llama 3.1 8B: gratis o quasi su OpenRouter → ~$0.00005/call
('default', 'meta-llama/llama-3%8b%',   15.00, 25.00, 'Llama 3 8B',
  'Meta Llama 8B — open source quasi gratuito',
  'Costo trascurabile → markup elevato, margine assoluto ancora basso'),

-- Llama 3 70B: ~$0.40/1M → ~$0.0006/call
('default', 'meta-llama/llama-3%70b%',  8.00, 15.00, 'Llama 3 70B',
  'Meta Llama 70B — economico per la qualità',
  'Costo ~€0.0006/call → buon markup'),

-- ── DEEPSEEK ──────────────────────────────────────────────────────────────
-- DeepSeek V3: ~$0.27/1M → ~$0.0004/call
('default', 'deepseek/%',               9.00, 18.00, 'DeepSeek',
  'DeepSeek — economico, alta qualità ragionamento',
  'Costo ~€0.0004/call → markup alto')

ON CONFLICT DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RPC deduct_ai_credits_with_markup — aggiorna lookup per model_pattern
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.deduct_ai_credits_with_markup(
  p_company_id        UUID,
  p_task_kind         TEXT,
  p_model_used        TEXT,
  p_cost_usd_real     NUMERIC,
  p_tokens_prompt     INT,
  p_tokens_completion INT,
  p_wa_message_id     UUID DEFAULT NULL,
  p_metadata          JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  ok                  BOOLEAN,
  reason              TEXT,
  cost_real_eur       NUMERIC,
  cost_billed_eur     NUMERIC,
  margin_eur          NUMERIC,
  balance_before      NUMERIC,
  balance_after       NUMERIC,
  markup_used         NUMERIC,
  usage_log_id        UUID,
  tx_id               UUID
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate          NUMERIC;
  v_markup        NUMERIC;
  v_markup_source TEXT;
  v_cost_real     NUMERIC;
  v_cost_billed   NUMERIC;
  v_margin        NUMERIC;
  v_balance       NUMERIC;
  v_blocked       BOOLEAN;
  v_new_balance   NUMERIC;
  v_log_id        UUID;
  v_tx_id         UUID;
  v_label         TEXT;
BEGIN
  -- 1. Tasso USD→EUR da platform_settings
  SELECT COALESCE(NULLIF(value, '')::NUMERIC, 0.92) INTO v_rate
  FROM public.platform_settings WHERE key = 'usd_eur_rate';
  IF v_rate IS NULL THEN v_rate := 0.92; END IF;

  -- 2. LOOKUP MARKUP — priorità: task+model > task+catchall > default
  --    Priority 1: task_kind + model_pattern match (più specifico)
  SELECT markup_multiplier INTO v_markup
  FROM public.ai_pricing_markup
  WHERE task_kind = p_task_kind
    AND model_pattern IS NOT NULL
    AND p_model_used ILIKE model_pattern
    AND enabled = true
  ORDER BY LENGTH(model_pattern) DESC   -- pattern più lungo = più specifico
  LIMIT 1;

  IF v_markup IS NOT NULL THEN
    v_markup_source := 'task+model';
  END IF;

  --    Priority 2: task_kind catch-all (model_pattern IS NULL)
  IF v_markup IS NULL THEN
    SELECT markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup
    WHERE task_kind = p_task_kind AND model_pattern IS NULL AND enabled = true;
    IF v_markup IS NOT NULL THEN v_markup_source := 'task_catchall'; END IF;
  END IF;

  --    Priority 3: default catch-all per modello
  IF v_markup IS NULL THEN
    SELECT markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup
    WHERE task_kind = 'default'
      AND model_pattern IS NOT NULL
      AND p_model_used ILIKE model_pattern
      AND enabled = true
    ORDER BY LENGTH(model_pattern) DESC
    LIMIT 1;
    IF v_markup IS NOT NULL THEN v_markup_source := 'default+model'; END IF;
  END IF;

  --    Priority 4: default assoluto
  IF v_markup IS NULL THEN
    SELECT markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup
    WHERE task_kind = 'default' AND model_pattern IS NULL AND enabled = true;
    v_markup_source := 'default_catchall';
  END IF;

  IF v_markup IS NULL THEN
    RETURN QUERY SELECT false, 'markup_missing'::TEXT,
      NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC,
      NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC,
      NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- 3. Calcoli
  v_cost_real   := COALESCE(p_cost_usd_real, 0) * v_rate;
  v_cost_billed := v_cost_real * v_markup;
  v_margin      := v_cost_billed - v_cost_real;

  -- 4. Lock wallet
  SELECT balance_eur, calls_blocked INTO v_balance, v_blocked
  FROM public.ai_credits
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO public.ai_credits (company_id, balance_eur)
    VALUES (p_company_id, 0)
    ON CONFLICT (company_id) DO NOTHING;
    v_balance := 0;
    v_blocked := false;
  END IF;

  IF v_blocked THEN
    RETURN QUERY SELECT false, 'blocked'::TEXT,
      v_cost_real, v_cost_billed, v_margin,
      v_balance, v_balance, v_markup,
      NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  IF v_balance < v_cost_billed THEN
    RETURN QUERY SELECT false, 'insufficient_credits'::TEXT,
      v_cost_real, v_cost_billed, v_margin,
      v_balance, v_balance, v_markup,
      NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- 5. Scala saldo
  v_new_balance := v_balance - v_cost_billed;
  UPDATE public.ai_credits
  SET balance_eur      = v_new_balance,
      total_spent_eur  = COALESCE(total_spent_eur, 0) + v_cost_billed,
      updated_at       = now()
  WHERE company_id = p_company_id;

  -- 6. Label human-readable
  SELECT COALESCE(apm.display_label, p_task_kind) INTO v_label
  FROM public.ai_pricing_markup apm
  WHERE apm.task_kind = p_task_kind AND apm.model_pattern IS NULL
  LIMIT 1;
  IF v_label IS NULL THEN v_label := p_task_kind; END IF;

  -- 7. Log transazione crediti azienda
  INSERT INTO public.ai_credit_transactions (
    company_id, tipo, crediti, saldo_prima, saldo_dopo,
    descrizione, metadata
  ) VALUES (
    p_company_id, 'consumo_ai', v_cost_billed, v_balance, v_new_balance,
    format('AI — %s [%s]', v_label, split_part(p_model_used, '/', 2)),
    jsonb_build_object(
      'task_kind',     p_task_kind,
      'model_used',    p_model_used,
      'markup_source', v_markup_source,
      'tokens_total',  p_tokens_prompt + p_tokens_completion,
      'wa_message_id', p_wa_message_id,
      'source',        'ai_provider'
    ) || p_metadata
  )
  RETURNING id INTO v_tx_id;

  -- 8. Log tecnico (ai_model_usage_log)
  INSERT INTO public.ai_model_usage_log (
    ts, company_id, task_kind,
    model_requested, model_used, provider_used, fallback_hops,
    tokens_prompt, tokens_completion, tokens_total,
    cost_usd, ok,
    usd_eur_rate, cost_real_eur, markup_applied_pct,
    cost_billed_eur, margin_eur,
    credits_deducted, credit_tx_id,
    wa_message_id, metadata
  ) VALUES (
    now(), p_company_id, p_task_kind,
    p_model_used, p_model_used,
    split_part(p_model_used, '/', 1), 0,
    p_tokens_prompt, p_tokens_completion,
    p_tokens_prompt + p_tokens_completion,
    p_cost_usd_real, true,
    v_rate, v_cost_real, (v_markup - 1) * 100,
    v_cost_billed, v_margin,
    true, v_tx_id,
    p_wa_message_id,
    p_metadata || jsonb_build_object('markup_source', v_markup_source)
  )
  RETURNING id INTO v_log_id;

  -- 9. Alert se sotto soglia
  UPDATE public.ai_credits
  SET alert_email_sent_at = now()
  WHERE company_id = p_company_id
    AND v_new_balance < COALESCE(alert_threshold_eur, 0)
    AND (alert_email_sent_at IS NULL
         OR alert_email_sent_at < now() - interval '24 hours');

  RETURN QUERY SELECT true, 'success'::TEXT,
    v_cost_real, v_cost_billed, v_margin,
    v_balance, v_new_balance, v_markup,
    v_log_id, v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_ai_credits_with_markup(UUID, TEXT, TEXT, NUMERIC, INT, INT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_ai_credits_with_markup(UUID, TEXT, TEXT, NUMERIC, INT, INT, UUID, JSONB) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. RPC check_ai_credits_available — aggiunge p_model_hint opzionale
--    Usato nel precallCheck: se conosce già il modello, stima markup reale
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_ai_credits_available(
  p_company_id    UUID,
  p_est_cost_usd  NUMERIC DEFAULT 0.001,
  p_task_kind     TEXT DEFAULT 'default',
  p_model_hint    TEXT DEFAULT NULL   -- ← NUOVO: modello previsto (opzionale)
)
RETURNS TABLE (
  o_ok              BOOLEAN,
  o_reason          TEXT,
  o_balance_eur     NUMERIC,
  o_est_cost_eur    NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate      NUMERIC;
  v_markup    NUMERIC;
  v_min       NUMERIC;
  v_balance   NUMERIC;
  v_blocked   BOOLEAN;
  v_est_eur   NUMERIC;
BEGIN
  SELECT COALESCE(NULLIF(ps.value, '')::NUMERIC, 0.92) INTO v_rate
  FROM public.platform_settings ps WHERE ps.key = 'usd_eur_rate';
  IF v_rate IS NULL THEN v_rate := 0.92; END IF;

  SELECT COALESCE(NULLIF(ps.value, '')::NUMERIC, 0.05) INTO v_min
  FROM public.platform_settings ps WHERE ps.key = 'ai_min_balance_eur_to_call';
  IF v_min IS NULL THEN v_min := 0.05; END IF;

  -- Lookup markup con model_hint (stessa priority del deduct)
  IF p_model_hint IS NOT NULL THEN
    SELECT pm.markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup pm
    WHERE pm.task_kind = p_task_kind
      AND pm.model_pattern IS NOT NULL
      AND p_model_hint ILIKE pm.model_pattern
      AND pm.enabled = true
    ORDER BY LENGTH(pm.model_pattern) DESC
    LIMIT 1;
  END IF;

  IF v_markup IS NULL THEN
    SELECT pm.markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup pm
    WHERE pm.task_kind = p_task_kind AND pm.model_pattern IS NULL AND pm.enabled = true;
  END IF;

  IF v_markup IS NULL AND p_model_hint IS NOT NULL THEN
    SELECT pm.markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup pm
    WHERE pm.task_kind = 'default'
      AND pm.model_pattern IS NOT NULL
      AND p_model_hint ILIKE pm.model_pattern
      AND pm.enabled = true
    ORDER BY LENGTH(pm.model_pattern) DESC
    LIMIT 1;
  END IF;

  IF v_markup IS NULL THEN
    SELECT pm.markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup pm
    WHERE pm.task_kind = 'default' AND pm.model_pattern IS NULL AND pm.enabled = true;
  END IF;

  IF v_markup IS NULL THEN v_markup := 3.00; END IF;

  SELECT ac.balance_eur, ac.calls_blocked INTO v_balance, v_blocked
  FROM public.ai_credits ac WHERE ac.company_id = p_company_id;

  IF v_balance IS NULL THEN v_balance := 0; v_blocked := false; END IF;

  v_est_eur := COALESCE(p_est_cost_usd, 0) * v_rate * v_markup;

  IF v_blocked THEN
    RETURN QUERY SELECT false, 'blocked'::TEXT, v_balance, v_est_eur;
  ELSIF v_balance < v_min THEN
    RETURN QUERY SELECT false, 'below_minimum'::TEXT, v_balance, v_est_eur;
  ELSIF v_balance < v_est_eur THEN
    RETURN QUERY SELECT false, 'insufficient'::TEXT, v_balance, v_est_eur;
  ELSE
    RETURN QUERY SELECT true, 'ok'::TEXT, v_balance, v_est_eur;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_ai_credits_available(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_ai_credits_available(UUID, NUMERIC, TEXT, TEXT) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. VIEW — markup_simulator: vedi costo reale + markup per ogni modello
--    Utile per il SuperAdmin per decidere i markup senza fare calcoli
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_markup_simulator AS
SELECT
  m.task_kind,
  COALESCE(m.model_pattern, '(tutti i modelli)') AS model_pattern,
  m.markup_multiplier,
  m.markup_max,
  m.display_label,
  m.pricing_rationale,
  -- Esempio: costo reale €0.001 → quanto addebitiamo
  ROUND(0.001 * m.markup_multiplier, 4)   AS esempio_0_001eur_billed,
  ROUND(0.010 * m.markup_multiplier, 4)   AS esempio_0_01eur_billed,
  ROUND(0.050 * m.markup_multiplier, 4)   AS esempio_0_05eur_billed,
  -- Margine %
  ROUND((m.markup_multiplier - 1) * 100, 0) AS margine_pct,
  m.enabled
FROM public.ai_pricing_markup m
ORDER BY m.task_kind, m.model_pattern NULLS FIRST;

GRANT SELECT ON public.v_markup_simulator TO authenticated;
GRANT SELECT ON public.v_markup_simulator TO service_role;

COMMENT ON VIEW public.v_markup_simulator IS
  'Simulatore markup per modello — permette al SuperAdmin di visualizzare il margine effettivo per ogni combinazione task × modello.';

-- ───────────────────────────────────────────────────────────────────────────
-- 6. VIEW analytics — costo reale vs addebitato per modello
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_ai_margin_by_model AS
SELECT
  DATE_TRUNC('day', ts)::date            AS day,
  task_kind,
  model_used,
  COUNT(*)                               AS n_calls,
  ROUND(SUM(cost_real_eur)::NUMERIC, 4)  AS cost_real_eur,
  ROUND(SUM(cost_billed_eur)::NUMERIC, 4) AS cost_billed_eur,
  ROUND(SUM(margin_eur)::NUMERIC, 4)     AS margin_eur,
  ROUND(
    CASE WHEN SUM(cost_real_eur) > 0
      THEN (SUM(cost_billed_eur) / SUM(cost_real_eur) - 1) * 100
      ELSE NULL END, 1
  )                                      AS markup_effettivo_pct,
  ROUND(AVG(markup_applied_pct), 1)      AS markup_medio_applicato_pct,
  SUM(tokens_total)                      AS tokens_totali
FROM public.ai_model_usage_log
WHERE ok = true AND credits_deducted = true
GROUP BY DATE_TRUNC('day', ts), task_kind, model_used;

GRANT SELECT ON public.v_ai_margin_by_model TO service_role;
-- Solo service_role: contiene dati di margine sensibili

COMMENT ON VIEW public.v_ai_margin_by_model IS
  'Margine per modello AI per giorno — costo reale vs addebitato. Solo service_role (dati finanziari sensibili).';

COMMIT;
