-- Migration: Sprint C — Catalogo Esteso — Custom Fields Extension
-- Aggiunge: custom_field_values JSONB su tariffe_aziendali (article_templates
-- e article_families lo hanno già), supplier_id su article_families (FK debole
-- verso suppliers), tabella ai_usage_logs per cost tracking AI.
-- Idempotente: usa IF NOT EXISTS ovunque.

-- ═══════════════════════════════════════════════════════════════
-- 1. tariffe_aziendali.custom_field_values
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.tariffe_aziendali
  ADD COLUMN IF NOT EXISTS custom_field_values JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tariffe_aziendali.custom_field_values IS
  'Valori custom fields tipizzati come JSON. Struttura: { field_id: value } '
  'popolata da UI settings + wizard import.';

-- ═══════════════════════════════════════════════════════════════
-- 2. article_families.supplier_id (FK debole: suppliers è il canonical
--    supplier module, ma manteniamo il pattern FK con ON DELETE SET NULL)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_article_families_supplier
  ON public.article_families(supplier_id)
  WHERE supplier_id IS NOT NULL;

COMMENT ON COLUMN public.article_families.supplier_id IS
  'Fornitore di origine del listino (tracciabilità per import listini PDF/Excel).';

-- Assicura che l'indice esista anche per article_templates (potrebbe già esserci)
CREATE INDEX IF NOT EXISTS idx_article_templates_supplier
  ON public.article_templates(supplier_id)
  WHERE supplier_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- 3. ai_usage_logs: tracking chiamate AI per cost control e billing
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES public.profiles(id),
  function_name   TEXT NOT NULL,
  tokens_input    INT NOT NULL DEFAULT 0,
  tokens_output   INT NOT NULL DEFAULT 0,
  cost_cents      NUMERIC(10,4) NOT NULL DEFAULT 0,
  storage_path    TEXT,
  result_preview  JSONB,
  status          TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'error', 'timeout', 'quota_exceeded')),
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_company
  ON public.ai_usage_logs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_function
  ON public.ai_usage_logs(function_name, created_at DESC);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_usage_logs' AND policyname='ai_usage_select'
  ) THEN
    CREATE POLICY ai_usage_select ON public.ai_usage_logs
      FOR SELECT USING (
        company_id = public.get_my_company_id()
        AND public.has_role(auth.uid(), 'company_admin'::app_role)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_usage_logs' AND policyname='ai_usage_super_admin'
  ) THEN
    CREATE POLICY ai_usage_super_admin ON public.ai_usage_logs
      FOR SELECT USING (public.has_role(auth.uid(), 'super_admin'::app_role));
  END IF;
END $$;

-- NOTA: Le INSERT in ai_usage_logs avvengono solo da Edge Functions con
-- SERVICE_ROLE_KEY, che bypassa RLS. Nessuna INSERT policy necessaria per gli
-- utenti end-user (nessuno scrive direttamente da client).

COMMENT ON TABLE public.ai_usage_logs IS
  'Log di ogni chiamata AI (edge functions: ai-listino-extract, '
  'computo-ai-extract, etc.). Usato per cost tracking, quota enforcement, '
  'debugging. Scritto esclusivamente da Edge Functions via service role.';

-- ═══════════════════════════════════════════════════════════════
-- 4. Storage bucket: listini-tmp (con lifecycle 24h gestito lato app)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'listini-tmp',
  'listini-tmp',
  false,
  52428800,  -- 50MB
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Policy: user autenticato può caricare/leggere solo i file nel proprio scope
-- (prefisso = user_id per upload, controllato dalla path convention).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='listini_tmp_insert'
  ) THEN
    CREATE POLICY listini_tmp_insert ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'listini-tmp'
        AND auth.uid()::text = split_part(name, '/', 1)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='listini_tmp_select'
  ) THEN
    CREATE POLICY listini_tmp_select ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'listini-tmp'
        AND auth.uid()::text = split_part(name, '/', 1)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname='listini_tmp_delete'
  ) THEN
    CREATE POLICY listini_tmp_delete ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'listini-tmp'
        AND auth.uid()::text = split_part(name, '/', 1)
      );
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 5. (opzionale) Indici ausiliari su custom_field_values per query GIN
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_article_templates_cf_gin
  ON public.article_templates USING GIN (custom_field_values);

CREATE INDEX IF NOT EXISTS idx_article_families_cf_gin
  ON public.article_families USING GIN (custom_field_values);

CREATE INDEX IF NOT EXISTS idx_tariffe_aziendali_cf_gin
  ON public.tariffe_aziendali USING GIN (custom_field_values);

-- ═══════════════════════════════════════════════════════════════
-- Fine migration Sprint C — Catalogo Esteso
-- ═══════════════════════════════════════════════════════════════
