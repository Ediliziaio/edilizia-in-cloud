-- ============================================================================
-- company_renders_recent v2 — unified render stream with creator and new modules
-- ============================================================================
-- Adds:
-- - created_by / user_id normalized as created_by
-- - pergole and piscine modules
-- This keeps the CRM render lists and the Render AI hub on one cheap query.
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
  COALESCE(result_urls[1], NULL)           AS result_url,
  result_urls                              AS result_urls,
  created_at,
  'infissi'::text                          AS render_type,
  'render_sessions'::text                  AS source_table
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
  render_result_url                        AS result_url,
  CASE WHEN render_result_url IS NOT NULL
       THEN ARRAY[render_result_url]
       ELSE NULL::text[]
  END                                      AS result_urls,
  created_at,
  'bagno'::text                            AS render_type,
  'render_bagno_sessions'::text            AS source_table
FROM public.render_bagno_sessions

UNION ALL

SELECT
  id, company_id, created_by, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL)           AS result_url,
  result_urls,
  created_at,
  'facciata'::text                         AS render_type,
  'render_facciata_sessions'::text         AS source_table
FROM public.render_facciata_sessions

UNION ALL

SELECT
  id, company_id, created_by, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL)           AS result_url,
  result_urls,
  created_at,
  'pavimento'::text                        AS render_type,
  'render_pavimento_sessions'::text        AS source_table
FROM public.render_pavimento_sessions

UNION ALL

SELECT
  id, company_id, created_by, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL)           AS result_url,
  result_urls,
  created_at,
  'persiane'::text                         AS render_type,
  'render_persiane_sessions'::text         AS source_table
FROM public.render_persiane_sessions

UNION ALL

SELECT
  id, company_id, created_by, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL)           AS result_url,
  result_urls,
  created_at,
  'tetto'::text                            AS render_type,
  'render_tetto_sessions'::text            AS source_table
FROM public.render_tetto_sessions

UNION ALL

SELECT
  id, company_id, created_by, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL)           AS result_url,
  result_urls,
  created_at,
  'stanza'::text                           AS render_type,
  'render_stanza_sessions'::text           AS source_table
FROM public.render_stanza_sessions

UNION ALL

SELECT
  id, company_id, created_by, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL)           AS result_url,
  result_urls,
  created_at,
  'pergole'::text                          AS render_type,
  'render_pergole_sessions'::text          AS source_table
FROM public.render_pergole_sessions

UNION ALL

SELECT
  id, company_id, created_by, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL)           AS result_url,
  result_urls,
  created_at,
  'piscine'::text                          AS render_type,
  'render_piscine_sessions'::text          AS source_table
FROM public.render_piscine_sessions;

GRANT SELECT ON public.company_renders_recent TO authenticated;

COMMENT ON VIEW public.company_renders_recent IS
'Unified recent renders view v2: aggregates render modules into one normalized stream for galleries, CRM links and Render AI hub. Columns: id, company_id, created_by, contact_id, opportunity_id, status, result_url, result_urls, created_at, render_type, source_table.';

NOTIFY pgrst, 'reload schema';
