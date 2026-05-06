-- ════════════════════════════════════════════════════════════════════════════
-- MP-04 — Chain-of-Thought + Confidence audit columns
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.silvio_decision_log
  ADD COLUMN IF NOT EXISTS ai_thinking text,
  ADD COLUMN IF NOT EXISTS ai_confidence text CHECK (ai_confidence IS NULL OR ai_confidence IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS ai_uncertainty_reasons text[],
  ADD COLUMN IF NOT EXISTS followup_suggestions text[],
  ADD COLUMN IF NOT EXISTS requires_human_review boolean DEFAULT false;

COMMENT ON COLUMN public.silvio_decision_log.ai_thinking IS
  'MP-04: ragionamento interno del modello (non mostrato all''utente, audit-only).';
COMMENT ON COLUMN public.silvio_decision_log.ai_confidence IS
  'MP-04: stima certezza self-reported (high/medium/low).';
COMMENT ON COLUMN public.silvio_decision_log.requires_human_review IS
  'MP-04: true se il modello marca la sua decisione come richiedente review umana.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'ai_persona_messages') THEN
    ALTER TABLE public.ai_persona_messages
      ADD COLUMN IF NOT EXISTS ai_thinking text,
      ADD COLUMN IF NOT EXISTS confidence text CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low')),
      ADD COLUMN IF NOT EXISTS uncertainty_reasons text[],
      ADD COLUMN IF NOT EXISTS followup_suggestions text[],
      ADD COLUMN IF NOT EXISTS requires_human_review boolean DEFAULT false;
  END IF;
END $$;

-- View KPI: distribuzione confidence per persona
CREATE OR REPLACE VIEW public.v_ai_confidence_distribution AS
SELECT
  date_trunc('day', created_at)::date AS day,
  persona_key,
  count(*) FILTER (WHERE ai_confidence = 'high') AS high,
  count(*) FILTER (WHERE ai_confidence = 'medium') AS medium,
  count(*) FILTER (WHERE ai_confidence = 'low') AS low,
  count(*) FILTER (WHERE ai_confidence IS NULL) AS unstructured,
  count(*) FILTER (WHERE requires_human_review = true) AS requires_review,
  count(*) AS total
FROM public.silvio_decision_log
WHERE created_at >= now() - interval '30 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

GRANT SELECT ON public.v_ai_confidence_distribution TO authenticated;
