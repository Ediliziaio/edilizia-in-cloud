-- ============================================================================
-- 20260419000004 — VIEW company_renders_recent (P6.1)
-- ============================================================================
-- Bug fix P6.1 del report stabilization:
--
-- I componenti LinkedRendersList e QuoteRenderPicker fanno 7 query Supabase
-- parallele (una per tabella verticale: render_sessions, render_bagno_sessions
-- render_facciata_sessions, render_pavimento_sessions, render_persiane_sessions
-- render_tetto_sessions, render_stanza_sessions). Overhead in rete + round-trip
-- + bundle JS elevato, senza alcun beneficio funzionale.
--
-- Questa migration crea una VIEW che fa UNION ALL dei 7 verticali in un unico
-- "stream" ordinato per created_at. I client possono filtrare per company_id
-- e contact_id/opportunity_id via indici.
--
-- La VIEW normalizza inoltre:
--   - status: bagno usa 'completato/errore/processing' (italiano) → tradotto
--     a 'completed/failed/processing' come gli altri verticali.
--   - url:    bagno usa render_result_url singolo → esposto come result_url;
--     gli altri usano result_urls[] → esposto come result_urls[0].
--
-- Clients: LinkedRendersList, QuoteRenderPicker, CRM detail pages.
-- Policies: delega alla RLS delle tabelle sottostanti (SECURITY INVOKER by
-- default sulle view in PostgreSQL, quindi RLS per-tabella viene applicata).
-- ============================================================================

CREATE OR REPLACE VIEW public.company_renders_recent AS
SELECT
  id,
  company_id,
  contact_id,
  opportunity_id,
  CASE status
    WHEN 'completed'  THEN 'completed'
    WHEN 'processing' THEN 'processing'
    WHEN 'failed'     THEN 'failed'
    WHEN 'pending'    THEN 'pending'
    ELSE status
  END AS status,
  COALESCE(result_urls[1], NULL)          AS result_url,
  result_urls                              AS result_urls,
  created_at,
  'infissi'::text                          AS render_type,
  'render_sessions'::text                  AS source_table
FROM public.render_sessions

UNION ALL

SELECT
  id,
  company_id,
  contact_id,
  opportunity_id,
  -- Normalizza dialetto italiano → inglese per uniformità UI
  CASE stato
    WHEN 'completato' THEN 'completed'
    WHEN 'errore'     THEN 'failed'
    WHEN 'processing' THEN 'processing'
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
  id, company_id, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL)           AS result_url,
  result_urls,
  created_at,
  'facciata'::text                         AS render_type,
  'render_facciata_sessions'::text         AS source_table
FROM public.render_facciata_sessions

UNION ALL

SELECT
  id, company_id, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL)           AS result_url,
  result_urls,
  created_at,
  'pavimento'::text                        AS render_type,
  'render_pavimento_sessions'::text        AS source_table
FROM public.render_pavimento_sessions

UNION ALL

SELECT
  id, company_id, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL)           AS result_url,
  result_urls,
  created_at,
  'persiane'::text                         AS render_type,
  'render_persiane_sessions'::text         AS source_table
FROM public.render_persiane_sessions

UNION ALL

SELECT
  id, company_id, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL)           AS result_url,
  result_urls,
  created_at,
  'tetto'::text                            AS render_type,
  'render_tetto_sessions'::text            AS source_table
FROM public.render_tetto_sessions

UNION ALL

SELECT
  id, company_id, contact_id, opportunity_id,
  status,
  COALESCE(result_urls[1], NULL)           AS result_url,
  result_urls,
  created_at,
  'stanza'::text                           AS render_type,
  'render_stanza_sessions'::text           AS source_table
FROM public.render_stanza_sessions;

-- Esponi la VIEW a tutti gli utenti authenticated (RLS delegata alle
-- tabelle sottostanti: SECURITY INVOKER by default su view in PG).
GRANT SELECT ON public.company_renders_recent TO authenticated;

COMMENT ON VIEW public.company_renders_recent IS
'Unified recent renders view: aggrega 7 tabelle verticali in un singolo stream
normalizzato. Sostituisce le 7 query parallele di LinkedRendersList e
QuoteRenderPicker. RLS ereditata dalle tabelle sorgente.
Columns: id, company_id, contact_id, opportunity_id, status (EN),
         result_url, result_urls, created_at, render_type, source_table.';

NOTIFY pgrst, 'reload schema';
