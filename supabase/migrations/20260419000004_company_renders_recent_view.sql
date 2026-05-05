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

-- Le tabelle verticali bagno/facciata/pavimento/persiane/tetto/stanza vengono
-- create più avanti nella storia migration. La prima versione della view deve
-- quindi restare compatibile con un database pulito e verrà ampliata dalla v2.
CREATE OR REPLACE VIEW public.company_renders_recent AS
SELECT
  id,
  company_id,
  NULL::uuid                               AS contact_id,
  NULL::uuid                               AS opportunity_id,
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
FROM public.render_sessions;

-- Esponi la VIEW a tutti gli utenti authenticated (RLS delegata alle
-- tabelle sottostanti: SECURITY INVOKER by default su view in PG).
GRANT SELECT ON public.company_renders_recent TO authenticated;

COMMENT ON VIEW public.company_renders_recent IS
'Unified recent renders view: versione compatibile iniziale su render_sessions.
La v2 successiva aggrega tutte le tabelle verticali quando esistono.
Columns: id, company_id, contact_id, opportunity_id, status (EN),
         result_url, result_urls, created_at, render_type, source_table.';

NOTIFY pgrst, 'reload schema';
