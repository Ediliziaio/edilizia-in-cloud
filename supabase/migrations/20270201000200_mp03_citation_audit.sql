-- ════════════════════════════════════════════════════════════════════════════
-- MP-03 — Citation enforcement audit columns + KPI view
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Colonne audit citation in silvio_decision_log
ALTER TABLE public.silvio_decision_log
  ADD COLUMN IF NOT EXISTS citations_used text[],
  ADD COLUMN IF NOT EXISTS citations_missing boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS invalid_citations text[],
  ADD COLUMN IF NOT EXISTS no_rag_prefix boolean DEFAULT false;

COMMENT ON COLUMN public.silvio_decision_log.citations_used IS
  'MP-03: array degli ID Sx effettivamente citati nella risposta finale.';
COMMENT ON COLUMN public.silvio_decision_log.citations_missing IS
  'MP-03: true se ci erano sources RAG ma il modello non ha citato nessuna.';
COMMENT ON COLUMN public.silvio_decision_log.invalid_citations IS
  'MP-03: marker [Sx] citati ma NON presenti nelle sources (hallucination).';

-- 2. Colonne equivalenti su ai_persona_messages (se la tabella esiste)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'ai_persona_messages') THEN
    ALTER TABLE public.ai_persona_messages
      ADD COLUMN IF NOT EXISTS citations_used text[],
      ADD COLUMN IF NOT EXISTS citations_missing boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS invalid_citations text[],
      ADD COLUMN IF NOT EXISTS no_rag_prefix boolean DEFAULT false;
  END IF;
END $$;

-- 3. View aggregata KPI citation per persona × giorno
CREATE OR REPLACE VIEW public.v_citation_quality_kpis AS
SELECT
  date_trunc('day', created_at)::date AS day,
  persona_key,
  count(*) AS total_messages,
  count(*) FILTER (WHERE rag_source_count > 0) AS messages_with_rag,
  count(*) FILTER (WHERE citations_missing = true) AS missing_citations,
  count(*) FILTER (WHERE invalid_citations IS NOT NULL AND array_length(invalid_citations, 1) > 0) AS invalid_citations_count,
  count(*) FILTER (WHERE no_rag_prefix = true) AS no_rag_responses,
  ROUND(
    (count(*) FILTER (WHERE citations_used IS NOT NULL AND array_length(citations_used, 1) > 0))::numeric * 100
    / NULLIF(count(*) FILTER (WHERE rag_source_count > 0), 0),
    1
  ) AS citation_rate_pct
FROM public.silvio_decision_log
WHERE created_at >= now() - interval '30 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

COMMENT ON VIEW public.v_citation_quality_kpis IS
  'MP-03: KPI di qualità citation per persona × giorno (ultimi 30 giorni).';

GRANT SELECT ON public.v_citation_quality_kpis TO authenticated;
