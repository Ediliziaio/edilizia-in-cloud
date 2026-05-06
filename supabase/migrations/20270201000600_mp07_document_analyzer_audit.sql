-- ════════════════════════════════════════════════════════════════════════════
-- MP-07 — Document Analyzer audit + idempotency
-- ════════════════════════════════════════════════════════════════════════════
-- Foundation: edge function document-ai-router già esistente in questa repo
-- (creata da feat track Cervello Supremo). Esegue classify + dispatch ai
-- parser verticali (computo-ai-extract, ddt-ai-extract, ai-fattura-ricevuta-ocr,
-- ai-listino-extract, ai-biz-card-ocr, generic-doc-ai-extract).
--
-- Questa migration aggiunge:
--   - document_analysis_results: storage unificato dell'esito analisi
--     (sha256 idempotency, classification, parsing, cross-reference, brain_doc_id)
--   - View v_document_analyzer_kpis per dashboard qualità classificazione
--
-- NOTE: edge function ai-document-analyzer come orchestratore "ricco"
-- (con validation strutturata P.IVA + totali = somma righe) DEMANDATA a
-- sessione successiva — l'ecosistema attuale già copre i flussi principali
-- via document-ai-router + parser verticali.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.document_analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Storage reference
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  file_name text,
  mime_type text,
  file_size_bytes bigint,
  pages_count int,
  sha256_hash text,

  -- Classification (output di document-ai-router)
  doc_type text NOT NULL CHECK (doc_type IN (
    'computo_metrico', 'preventivo', 'ddt', 'fattura', 'ricevuta',
    'contratto', 'listino_prezzi', 'biglietto_visita',
    'foto_cantiere', 'foto_generale', 'tabella_finanziamento',
    'documento_identita', 'verbale_collaudo', 'polizza_assicurativa',
    'documento_pa', 'scheda_tecnica', 'documento_generico',
    'fattura_attiva', 'fattura_passiva', 'ddt_in', 'ddt_out',
    'pos_sicurezza', 'duvri', 'durc', 'soa', 'cedolino',
    'modulo_f24', 'estratto_conto', 'visura_camerale',
    'altro', 'generico'
  )),
  doc_subtype text,
  classification_confidence numeric CHECK (classification_confidence IS NULL OR (classification_confidence BETWEEN 0 AND 1)),

  -- Parsing
  parser_used text NOT NULL,
  raw_text text,
  structured_fields jsonb,
  validation_warnings jsonb DEFAULT '[]'::jsonb,

  -- Cross-reference (popolato da document-ai-linker)
  related_entities jsonb DEFAULT '[]'::jsonb,

  -- Embedding ref (popolato dal worker ingestion successivo)
  brain_doc_id uuid REFERENCES public.ai_brain_documents(id) ON DELETE SET NULL,

  -- Lifecycle
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'success', 'failed', 'review_required'
  )),
  error_message text,
  processing_time_ms int,
  cost_eur numeric,

  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Idempotency: stesso file (per company) caricato due volte → stesso record
  UNIQUE (company_id, sha256_hash)
);

CREATE INDEX IF NOT EXISTS idx_doc_analysis_company_type
  ON public.document_analysis_results (company_id, doc_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_analysis_status
  ON public.document_analysis_results (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_analysis_uploader
  ON public.document_analysis_results (uploaded_by, created_at DESC)
  WHERE uploaded_by IS NOT NULL;

ALTER TABLE public.document_analysis_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_analysis_company_read ON public.document_analysis_results;
CREATE POLICY doc_analysis_company_read ON public.document_analysis_results
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
      UNION
      SELECT m.company_id FROM public.multi_company_access m WHERE m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS doc_analysis_company_modify ON public.document_analysis_results;
CREATE POLICY doc_analysis_company_modify ON public.document_analysis_results
  FOR ALL TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

GRANT SELECT ON public.document_analysis_results TO authenticated;
GRANT INSERT, UPDATE ON public.document_analysis_results TO service_role, authenticated;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_doc_analysis_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_doc_analysis_updated_at ON public.document_analysis_results;
CREATE TRIGGER trg_doc_analysis_updated_at
  BEFORE UPDATE ON public.document_analysis_results
  FOR EACH ROW EXECUTE FUNCTION public.touch_doc_analysis_updated_at();

-- View KPI: classification per tipo × giorno
CREATE OR REPLACE VIEW public.v_document_analyzer_kpis AS
SELECT
  date_trunc('day', created_at)::date AS day,
  company_id,
  doc_type,
  count(*) AS total_docs,
  ROUND(avg(classification_confidence), 3) AS avg_confidence,
  count(*) FILTER (WHERE status = 'success') AS ok,
  count(*) FILTER (WHERE status = 'review_required') AS review_required,
  count(*) FILTER (WHERE status = 'failed') AS failed,
  ROUND(avg(processing_time_ms), 0) AS avg_processing_ms,
  ROUND(sum(cost_eur)::numeric, 4) AS total_cost_eur
FROM public.document_analysis_results
WHERE created_at >= now() - interval '60 days'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 4 DESC;

GRANT SELECT ON public.v_document_analyzer_kpis TO authenticated;

COMMENT ON TABLE public.document_analysis_results IS
  'MP-07: storage unificato esito analisi documenti AI (sha256 idempotency, classification, parsing, cross-ref).';
