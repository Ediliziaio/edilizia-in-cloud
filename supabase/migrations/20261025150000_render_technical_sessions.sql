-- ============================================================================
-- Render Technical Sessions
-- Generic backend for the new production render modules:
-- ristrutturazioni, pavimenti-esterni, giardini, porte-blindate, porte-interne.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.render_technical_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.marketing_opportunities(id) ON DELETE SET NULL,
  module_type text NOT NULL CHECK (
    module_type IN (
      'ristrutturazioni',
      'pavimenti-esterni',
      'giardini',
      'porte-blindate',
      'porte-interne'
    )
  ),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  original_photo_url text,
  result_urls text[],
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  config_snapshot jsonb,
  scene_analysis jsonb,
  target_map jsonb,
  replacement_manifest jsonb,
  validation_result jsonb,
  prompt_used text,
  prompt_version text,
  prompt_char_count integer,
  provider_key text,
  cost_real numeric(10,4),
  cost_billed numeric(10,4),
  error_message text,
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.render_technical_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "co_render_technical_sessions" ON public.render_technical_sessions;
CREATE POLICY "co_render_technical_sessions" ON public.render_technical_sessions
  FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id())
  WITH CHECK (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS "sa_render_technical_sessions" ON public.render_technical_sessions;
CREATE POLICY "sa_render_technical_sessions" ON public.render_technical_sessions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_render_technical_sessions_company
  ON public.render_technical_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_render_technical_sessions_module
  ON public.render_technical_sessions(module_type);
CREATE INDEX IF NOT EXISTS idx_render_technical_sessions_status
  ON public.render_technical_sessions(status);
CREATE INDEX IF NOT EXISTS idx_render_technical_sessions_created
  ON public.render_technical_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_render_technical_sessions_gallery
  ON public.render_technical_sessions(company_id, module_type, status, created_at DESC)
  WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_render_technical_sessions_contact
  ON public.render_technical_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_render_technical_sessions_opportunity
  ON public.render_technical_sessions(opportunity_id);

CREATE OR REPLACE FUNCTION public.update_render_technical_sessions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_render_technical_sessions_updated_at
  ON public.render_technical_sessions;

CREATE TRIGGER trg_render_technical_sessions_updated_at
  BEFORE UPDATE ON public.render_technical_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_render_technical_sessions_updated_at();

-- Keep the generic buckets usable with effective-company switching.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('render-originals', 'render-originals', false, 20971520, ARRAY['image/jpeg','image/png','image/webp']),
  ('render-results', 'render-results', true, 20971520, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "render_originals_effective_company_insert" ON storage.objects;
CREATE POLICY "render_originals_effective_company_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'render-originals'
    AND (
      (storage.foldername(name))[1] = public.get_effective_company_id()::text
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

DROP POLICY IF EXISTS "render_originals_effective_company_select" ON storage.objects;
CREATE POLICY "render_originals_effective_company_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'render-originals'
    AND (
      (storage.foldername(name))[1] = public.get_effective_company_id()::text
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

DROP POLICY IF EXISTS "render_results_public_read_v2" ON storage.objects;
CREATE POLICY "render_results_public_read_v2" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'render-results');

DROP POLICY IF EXISTS "render_results_effective_company_insert" ON storage.objects;
CREATE POLICY "render_results_effective_company_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'render-results'
    AND (
      (storage.foldername(name))[1] = public.get_effective_company_id()::text
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

-- ============================================================================
-- company_renders_recent v3 — include technical modules.
-- ============================================================================

DROP VIEW IF EXISTS public.company_renders_recent;

CREATE VIEW public.company_renders_recent AS
SELECT
  id,
  company_id,
  created_by,
  contact_id,
  opportunity_id,
  CASE status
    WHEN 'completed'  THEN 'completed'
    WHEN 'processing' THEN 'processing'
    WHEN 'failed'     THEN 'failed'
    WHEN 'pending'    THEN 'pending'
    ELSE status
  END AS status,
  COALESCE(result_urls[1], NULL) AS result_url,
  result_urls AS result_urls,
  created_at,
  'infissi'::text AS render_type,
  'render_sessions'::text AS source_table
FROM public.render_sessions

UNION ALL

SELECT
  id,
  company_id,
  user_id AS created_by,
  contact_id,
  opportunity_id,
  CASE stato
    WHEN 'completato' THEN 'completed'
    WHEN 'errore'     THEN 'failed'
    WHEN 'processing' THEN 'processing'
    WHEN 'analyzing'  THEN 'processing'
    WHEN 'pending'    THEN 'pending'
    ELSE stato
  END AS status,
  render_result_url AS result_url,
  CASE WHEN render_result_url IS NOT NULL
       THEN ARRAY[render_result_url]
       ELSE NULL::text[]
  END AS result_urls,
  created_at,
  'bagno'::text AS render_type,
  'render_bagno_sessions'::text AS source_table
FROM public.render_bagno_sessions

UNION ALL

SELECT
  id, company_id, created_by, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL) AS result_url,
  result_urls,
  created_at,
  'facciata'::text AS render_type,
  'render_facciata_sessions'::text AS source_table
FROM public.render_facciata_sessions

UNION ALL

SELECT
  id, company_id, created_by, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL) AS result_url,
  result_urls,
  created_at,
  'pavimento'::text AS render_type,
  'render_pavimento_sessions'::text AS source_table
FROM public.render_pavimento_sessions

UNION ALL

SELECT
  id, company_id, created_by, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL) AS result_url,
  result_urls,
  created_at,
  'persiane'::text AS render_type,
  'render_persiane_sessions'::text AS source_table
FROM public.render_persiane_sessions

UNION ALL

SELECT
  id, company_id, created_by, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL) AS result_url,
  result_urls,
  created_at,
  'tetto'::text AS render_type,
  'render_tetto_sessions'::text AS source_table
FROM public.render_tetto_sessions

UNION ALL

SELECT
  id, company_id, created_by, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL) AS result_url,
  result_urls,
  created_at,
  'stanza'::text AS render_type,
  'render_stanza_sessions'::text AS source_table
FROM public.render_stanza_sessions

UNION ALL

SELECT
  id, company_id, created_by, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL) AS result_url,
  result_urls,
  created_at,
  'pergole'::text AS render_type,
  'render_pergole_sessions'::text AS source_table
FROM public.render_pergole_sessions

UNION ALL

SELECT
  id, company_id, created_by, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL) AS result_url,
  result_urls,
  created_at,
  'piscine'::text AS render_type,
  'render_piscine_sessions'::text AS source_table
FROM public.render_piscine_sessions

UNION ALL

SELECT
  id,
  company_id,
  created_by,
  contact_id,
  opportunity_id,
  status,
  COALESCE(result_urls[1], NULL) AS result_url,
  result_urls,
  created_at,
  module_type AS render_type,
  'render_technical_sessions'::text AS source_table
FROM public.render_technical_sessions;

GRANT SELECT ON public.company_renders_recent TO authenticated;

COMMENT ON VIEW public.company_renders_recent IS
'Unified recent renders view v3: aggregates render modules including technical render sessions. Columns: id, company_id, created_by, contact_id, opportunity_id, status, result_url, result_urls, created_at, render_type, source_table.';

NOTIFY pgrst, 'reload schema';
