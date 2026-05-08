-- ═══════════════════════════════════════════════════════════════════════════
-- MARKUP COST FROM OPENROUTER — Fix approccio costi
-- -----------------------------------------------------------------------
-- Il costo per chiamata è SEMPRE fornito da OpenRouter (header x-or-cost).
-- Non lo definiamo noi: ogni provider/piano/modello ha prezzi propri e
-- variano nel tempo. Questo file:
--   1. Pulisce i pricing_rationale fuorvianti con stime hardcoded
--   2. Aggiunge view v_ai_real_cost_per_model — costi REALI da OpenRouter
--   3. Aggiunge fn_suggest_markup — suggerisce markup dato target_margin_%
--   4. Aggiorna v_markup_simulator — mostra costi reali osservati accanto
--      al markup configurato
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Pulisci pricing_rationale — rimuovi stime costo inventate
--    Il costo viene da OpenRouter, non possiamo saperlo in anticipo
-- ───────────────────────────────────────────────────────────────────────────

UPDATE public.ai_pricing_markup
SET pricing_rationale = NULL
WHERE pricing_rationale IS NOT NULL;

-- Aggiorna anche le descrizioni per essere chiare sul fatto che il costo
-- è quello reale di OpenRouter, il markup è una scelta di business
UPDATE public.ai_pricing_markup SET
  description = 'Catch-all: si applica quando non c''è una riga più specifica per questo task × modello. Il costo reale viene da OpenRouter ad ogni chiamata.'
WHERE task_kind = 'default' AND model_pattern IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. VIEW v_ai_real_cost_per_model
--    Costi REALI osservati da OpenRouter nelle chiamate effettive.
--    Si popola automaticamente man mano che arrivano chiamate reali.
--    Questa è la fonte di verità per decidere i markup.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_ai_real_cost_per_model AS
SELECT
  model_used,
  split_part(model_used, '/', 1)              AS provider,
  COUNT(*)                                    AS n_calls,
  -- Costi reali da OpenRouter in USD
  ROUND(AVG(cost_usd)::numeric, 8)            AS avg_cost_usd,
  ROUND(MIN(cost_usd)::numeric, 8)            AS min_cost_usd,
  ROUND(MAX(cost_usd)::numeric, 8)            AS max_cost_usd,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cost_usd)::numeric, 8)
                                              AS median_cost_usd,
  -- Converti in EUR al tasso configurato (live)
  ROUND((AVG(cost_usd) * COALESCE(
    (SELECT NULLIF(value,'')::numeric FROM public.platform_settings WHERE key='usd_eur_rate'),
    0.92
  ))::numeric, 8)                             AS avg_cost_eur,
  -- Token stats (utile per calibrare le stime pre-call)
  ROUND(AVG(tokens_total))                    AS avg_tokens,
  ROUND(AVG(tokens_prompt))                   AS avg_tokens_prompt,
  ROUND(AVG(tokens_completion))               AS avg_tokens_completion,
  -- Per task_kind (qual è l'uso principale di questo modello)
  MODE() WITHIN GROUP (ORDER BY task_kind)    AS task_kind_principale,
  -- Data prima e ultima chiamata
  MIN(ts)::date                               AS prima_chiamata,
  MAX(ts)::date                               AS ultima_chiamata
FROM public.ai_model_usage_log
WHERE ok = true
  AND cost_usd IS NOT NULL
  AND cost_usd > 0
GROUP BY model_used
ORDER BY avg_cost_usd DESC;

GRANT SELECT ON public.v_ai_real_cost_per_model TO service_role;

COMMENT ON VIEW public.v_ai_real_cost_per_model IS
  'Costi REALI per modello da OpenRouter (header x-or-cost). '
  'Usa questa view per decidere i markup — non stimare i costi a mano.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. FUNCTION fn_suggest_markup
--    Dato un modello e un target_margin_pct, calcola il markup multiplier
--    necessario basandosi sui costi REALI osservati da OpenRouter.
--    Se non ci sono dati storici → NULL (non può suggerire senza dati).
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_suggest_markup(
  p_model_pattern    TEXT,        -- es. 'anthropic/claude-haiku%'
  p_target_margin_pct NUMERIC,   -- es. 300 per +300% (×4)
  p_min_calls        INT DEFAULT 10  -- minimo chiamate per suggerimento affidabile
)
RETURNS TABLE (
  model_used          TEXT,
  n_calls             BIGINT,
  avg_cost_usd        NUMERIC,
  avg_cost_eur        NUMERIC,
  suggested_markup    NUMERIC,   -- markup_multiplier da impostare
  current_markup      NUMERIC,   -- markup attualmente configurato
  diff_pct            NUMERIC    -- differenza % tra suggerito e attuale
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate NUMERIC;
BEGIN
  SELECT COALESCE(NULLIF(value,'')::numeric, 0.92) INTO v_rate
  FROM public.platform_settings WHERE key = 'usd_eur_rate';
  IF v_rate IS NULL THEN v_rate := 0.92; END IF;

  RETURN QUERY
  SELECT
    l.model_used,
    COUNT(*)                                    AS n_calls,
    ROUND(AVG(l.cost_usd)::numeric, 8)          AS avg_cost_usd,
    ROUND((AVG(l.cost_usd) * v_rate)::numeric, 8) AS avg_cost_eur,
    -- markup = 1 + (target_margin_pct / 100)
    ROUND((1 + p_target_margin_pct / 100.0)::numeric, 2) AS suggested_markup,
    -- markup attuale configurato (cerca il più specifico)
    COALESCE(
      (SELECT pm.markup_multiplier FROM public.ai_pricing_markup pm
       WHERE pm.model_pattern IS NOT NULL
         AND l.model_used ILIKE pm.model_pattern
         AND pm.enabled = true
       ORDER BY LENGTH(pm.model_pattern) DESC LIMIT 1),
      (SELECT pm.markup_multiplier FROM public.ai_pricing_markup pm
       WHERE pm.task_kind = 'default'
         AND pm.model_pattern IS NULL
         AND pm.enabled = true LIMIT 1),
      3.0
    )                                           AS current_markup,
    -- differenza %
    ROUND(
      ((1 + p_target_margin_pct / 100.0) -
       COALESCE(
         (SELECT pm.markup_multiplier FROM public.ai_pricing_markup pm
          WHERE pm.model_pattern IS NOT NULL
            AND l.model_used ILIKE pm.model_pattern
            AND pm.enabled = true
          ORDER BY LENGTH(pm.model_pattern) DESC LIMIT 1),
         3.0
       )
      ) /
      COALESCE(
        (SELECT pm.markup_multiplier FROM public.ai_pricing_markup pm
         WHERE pm.model_pattern IS NOT NULL
           AND l.model_used ILIKE pm.model_pattern
           AND pm.enabled = true
         ORDER BY LENGTH(pm.model_pattern) DESC LIMIT 1),
        3.0
      ) * 100, 1
    )                                           AS diff_pct
  FROM public.ai_model_usage_log l
  WHERE l.ok = true
    AND l.cost_usd > 0
    AND (p_model_pattern IS NULL OR l.model_used ILIKE p_model_pattern)
  GROUP BY l.model_used
  HAVING COUNT(*) >= p_min_calls
  ORDER BY AVG(l.cost_usd) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_suggest_markup(TEXT, NUMERIC, INT) TO service_role;

COMMENT ON FUNCTION public.fn_suggest_markup IS
  'Suggerisce markup_multiplier basato su costi REALI da OpenRouter. '
  'Parametri: modello (pattern ILIKE), target_margin_pct (es. 300 = ×4), '
  'min_calls (minimo chiamate per suggerimento affidabile, default 10). '
  'Ritorna NULL se non ci sono abbastanza dati storici.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Aggiorna v_markup_simulator — unisce markup configurato + costo reale
--    Una volta che arrivano chiamate reali, mostra il costo medio osservato
-- ───────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_markup_simulator;
CREATE OR REPLACE VIEW public.v_markup_simulator AS
WITH rate AS (
  SELECT COALESCE(NULLIF(value,'')::numeric, 0.92) AS v
  FROM public.platform_settings WHERE key = 'usd_eur_rate'
),
real_costs AS (
  SELECT
    model_used,
    COUNT(*) AS n_calls,
    AVG(cost_usd) AS avg_cost_usd
  FROM public.ai_model_usage_log
  WHERE ok = true AND cost_usd > 0
  GROUP BY model_used
)
SELECT
  m.task_kind,
  COALESCE(m.model_pattern, '(tutti i modelli)')  AS model_pattern,
  m.markup_multiplier,
  m.markup_max,
  m.display_label,
  m.enabled,
  -- Costo REALE medio osservato per modelli che matchano questo pattern
  -- (NULL finché non ci sono chiamate reali)
  ROUND((
    SELECT AVG(rc.avg_cost_usd * r.v)
    FROM real_costs rc, rate r
    WHERE m.model_pattern IS NOT NULL
      AND rc.model_used ILIKE m.model_pattern
  )::numeric, 6)                                  AS avg_real_cost_eur_observed,
  -- N. chiamate reali osservate per questo pattern
  (
    SELECT SUM(rc.n_calls)
    FROM real_costs rc
    WHERE m.model_pattern IS NOT NULL
      AND rc.model_used ILIKE m.model_pattern
  )                                               AS n_calls_observed,
  -- Cosa addebitiamo se il costo reale è X
  -- (utile solo DOPO che ci sono dati storici)
  ROUND((
    SELECT AVG(rc.avg_cost_usd * r.v) * m.markup_multiplier
    FROM real_costs rc, rate r
    WHERE m.model_pattern IS NOT NULL
      AND rc.model_used ILIKE m.model_pattern
  )::numeric, 6)                                  AS avg_billed_eur_observed,
  -- Margine stimato in % (solo con dati reali)
  ROUND((m.markup_multiplier - 1) * 100, 0)       AS margine_pct_configurato
FROM public.ai_pricing_markup m
ORDER BY m.task_kind, m.model_pattern NULLS FIRST;

GRANT SELECT ON public.v_markup_simulator TO authenticated;
GRANT SELECT ON public.v_markup_simulator TO service_role;

COMMENT ON VIEW public.v_markup_simulator IS
  'Markup configurati con costi REALI osservati da OpenRouter. '
  'Le colonne avg_real_cost_eur_observed e avg_billed_eur_observed sono NULL '
  'finché non ci sono chiamate reali — NON usa stime hardcoded.';

-- ───────────────────────────────────────────────────────────────────────────
-- 5. NOTA nel log tecnico: aggiungi flag se il costo è stato stimato vs reale
--    (x-or-cost header presente = reale; assente = stimato da token count)
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_model_usage_log
  ADD COLUMN IF NOT EXISTS cost_is_estimated BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.ai_model_usage_log.cost_is_estimated IS
  'true = costo stimato localmente (header x-or-cost assente). '
  'false = costo reale fornito da OpenRouter via x-or-cost.';

COMMIT;
