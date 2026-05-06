-- ════════════════════════════════════════════════════════════════════════════
-- SESSIONE 1 — Metadata AI sui messaggi della chat
-- ════════════════════════════════════════════════════════════════════════════
-- Aggiunge a internal_chat_messages le colonne per:
--   • MP-01: rag_sources, rag_min_similarity (citation marker [S1] cliccabili)
--   • MP-04: ai_confidence, ai_requires_human_review, followup_suggestions
--   • MP-09: council_data jsonb (sub_outputs delle personas + synthesis)
--
-- Tutte additive, idempotenti. Mai usate per messaggi human → restano NULL
-- per i messaggi non-AI.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.internal_chat_messages
  ADD COLUMN IF NOT EXISTS rag_sources jsonb,
  ADD COLUMN IF NOT EXISTS rag_min_similarity numeric(4,3),
  ADD COLUMN IF NOT EXISTS ai_confidence text
    CHECK (ai_confidence IS NULL OR ai_confidence IN ('high', 'medium', 'low')),
  ADD COLUMN IF NOT EXISTS ai_requires_human_review boolean,
  ADD COLUMN IF NOT EXISTS followup_suggestions text[],
  ADD COLUMN IF NOT EXISTS council_data jsonb;

COMMENT ON COLUMN public.internal_chat_messages.rag_sources IS
  'Sessione 1 / MP-01: array delle source RAG iniettate ([S1], [S2]...) per il rendering tooltip frontend.';
COMMENT ON COLUMN public.internal_chat_messages.ai_confidence IS
  'Sessione 1 / MP-04: confidence self-reported (high/medium/low) dal structured output.';
COMMENT ON COLUMN public.internal_chat_messages.ai_requires_human_review IS
  'Sessione 1 / MP-04: true se la decisione richiede revisione umana (HR, importi grossi, contratti).';
COMMENT ON COLUMN public.internal_chat_messages.followup_suggestions IS
  'Sessione 1 / MP-04: max 3 chip cliccabili "domande successive consigliate".';
COMMENT ON COLUMN public.internal_chat_messages.council_data IS
  'Sessione 1 / MP-09: { is_multi_area, involved_personas, sub_outputs[], synthesis } se council_orchestrator triggerato.';

-- Indice parziale per query "messaggi che hanno usato RAG"
CREATE INDEX IF NOT EXISTS idx_chat_msg_with_rag
  ON public.internal_chat_messages (channel_id, created_at DESC)
  WHERE rag_sources IS NOT NULL;
