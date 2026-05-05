-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-20 — AI Quality Vision per foto cantiere (FASE G)
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Estende foto_cantiere con campi AI (qualita_score, problemi_rilevati, ai_riassunto)
-- 2. RPC silvio_foto_cantiere_summary (KPI per ordine: foto totali / analizzate / problemi)
-- 3. AI Router config: foto_cantiere_quality (riusa vision_cantiere ma con prompt dedicato)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.foto_cantiere
  ADD COLUMN IF NOT EXISTS ai_qualita_score int,                    -- 0-100
  ADD COLUMN IF NOT EXISTS ai_qualita_livello text CHECK (ai_qualita_livello IN ('eccellente','buona','sufficiente','problematica','grave')),
  ADD COLUMN IF NOT EXISTS ai_problemi_rilevati jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_dpi_compliance jsonb DEFAULT '{}'::jsonb,  -- {"presente": ["casco","scarpe"], "mancante": [...]}
  ADD COLUMN IF NOT EXISTS ai_fase_lavoro text,                     -- es. "scavi", "fondazioni", "muratura", "finiture"
  ADD COLUMN IF NOT EXISTS ai_riassunto text,
  ADD COLUMN IF NOT EXISTS ai_analizzata_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_model_used text;

CREATE INDEX IF NOT EXISTS idx_foto_ai_qualita
  ON public.foto_cantiere(company_id, ai_qualita_livello)
  WHERE ai_qualita_livello IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_foto_problemi
  ON public.foto_cantiere(company_id)
  WHERE jsonb_array_length(COALESCE(ai_problemi_rilevati, '[]'::jsonb)) > 0;

-- RPC: summary foto cantiere per ordine
CREATE OR REPLACE FUNCTION public.silvio_foto_cantiere_summary(
  p_company_id uuid, p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'foto_totali', COUNT(*),
    'analizzate', COUNT(*) FILTER (WHERE ai_analizzata_at IS NOT NULL),
    'da_analizzare', COUNT(*) FILTER (WHERE ai_analizzata_at IS NULL),
    'qualita_eccellente', COUNT(*) FILTER (WHERE ai_qualita_livello = 'eccellente'),
    'qualita_buona', COUNT(*) FILTER (WHERE ai_qualita_livello = 'buona'),
    'qualita_sufficiente', COUNT(*) FILTER (WHERE ai_qualita_livello = 'sufficiente'),
    'qualita_problematica', COUNT(*) FILTER (WHERE ai_qualita_livello = 'problematica'),
    'qualita_grave', COUNT(*) FILTER (WHERE ai_qualita_livello = 'grave'),
    'foto_con_problemi', COUNT(*) FILTER (
      WHERE jsonb_array_length(COALESCE(ai_problemi_rilevati, '[]'::jsonb)) > 0
    ),
    'qualita_score_medio', ROUND(AVG(ai_qualita_score)::numeric, 1)
  ) INTO v_result
  FROM public.foto_cantiere
  WHERE company_id = p_company_id
    AND (p_order_id IS NULL OR order_id = p_order_id);

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_foto_cantiere_summary(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_foto_cantiere_summary(uuid, uuid) TO authenticated, service_role;

-- AI Router config
INSERT INTO public.ai_router_config (
  task_key, task_label, task_description, primary_model, fallback_models,
  default_params, tier_key, category, enabled
) VALUES
  (
    'foto_cantiere_quality',
    'Foto Cantiere Quality Check',
    'Analisi vision foto cantiere: qualita lavori, sicurezza DPI, fase, problemi',
    'openai/gpt-4o-mini',
    '["anthropic/claude-haiku-4.5"]'::jsonb,
    '{"temperature":0.1,"max_tokens":1000}'::jsonb,
    't2_vision',
    'quality',
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

DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM public.ai_router_config WHERE task_key = 'foto_cantiere_quality';
  RAISE NOTICE 'AI Router foto cantiere: % task registrati (atteso 1)', v_cnt;
END $$;
