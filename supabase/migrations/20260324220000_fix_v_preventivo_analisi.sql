-- ═══════════════════════════════════════════════════════════════
-- FIX: v_preventivo_analisi
-- 1. Aggiunge client_name (→ cliente_nome) alla vista
-- 2. Rimuove WHERE get_my_company_id() che rende la vista
--    inutilizzabile con il service role (auth.uid() = NULL)
--    La filtrazione per company_id è delegata al chiamante
--    (edge function o RLS sul client anonimo).
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_preventivo_analisi
  WITH (security_invoker = true) AS
SELECT
  q.id                            AS quote_id,
  q.company_id,
  q.quote_number,
  q.status,
  q.tipo_lavoro,
  q.client_name                   AS cliente_nome,
  q.total                         AS ricavo_totale,
  q.totale_costo_interno          AS costo_totale,
  q.totale_overhead               AS overhead,
  q.margine_totale_percentuale    AS margine_pct,
  q.created_at,
  q.signed_at,
  -- Breakdown ricavi per categoria
  SUM(CASE WHEN qi.item_category = 'prodotto' THEN qi.line_total ELSE 0 END) AS ricavo_prodotti,
  SUM(CASE WHEN qi.item_category = 'posa'     THEN qi.line_total ELSE 0 END) AS ricavo_posa,
  -- Breakdown costi per categoria
  SUM(CASE WHEN qi.item_category = 'prodotto'
    THEN COALESCE(qi.prezzo_acquisto, 0) * COALESCE(qi.quantity, 0) ELSE 0 END) AS costo_prodotti,
  SUM(CASE WHEN qi.item_category = 'posa'
    THEN COALESCE(qi.prezzo_acquisto, 0) * COALESCE(qi.quantity, 0) ELSE 0 END) AS costo_posa,
  COUNT(DISTINCT qi.article_template_id)
    FILTER (WHERE qi.article_template_id IS NOT NULL)                          AS num_prodotti_distinti
FROM public.quotes q
LEFT JOIN public.quote_items qi ON qi.quote_id = q.id
-- Rimossa la WHERE con get_my_company_id(): incompatibile con service role
-- (auth.uid() = NULL → company_id = NULL → zero righe).
-- La sicurezza è garantita da:
--   - RLS sulla tabella quotes per accessi client-side
--   - Validazione company_id nell'edge function per accessi server-side
GROUP BY
  q.id,
  q.company_id,
  q.quote_number,
  q.status,
  q.tipo_lavoro,
  q.client_name,
  q.total,
  q.totale_costo_interno,
  q.totale_overhead,
  q.margine_totale_percentuale,
  q.created_at,
  q.signed_at;

COMMENT ON VIEW public.v_preventivo_analisi IS
  'Vista aggregata preventivi per analisi AI: ricavi, costi e margini disaggregati per categoria item. Sicurezza via RLS (client) o validazione company_id (edge functions).';
