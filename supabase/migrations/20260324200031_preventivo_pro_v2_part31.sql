-- ━━━ BLOCCO H: VISTA PER ANALISI AI ━━━
-- Usata dal modulo AI analisi preventivi (Prompt 04).
-- security_invoker = true: la RLS delle tabelle sottostanti si applica
-- al chiamante, non al proprietario della vista.
DROP VIEW IF EXISTS public.v_preventivo_analisi CASCADE;
CREATE OR REPLACE VIEW public.v_preventivo_analisi
  WITH (security_invoker = true) AS
SELECT
  q.id                            AS quote_id,
  q.company_id,
  q.quote_number,
  q.status,
  q.tipo_lavoro,
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
-- WHERE ridondante con RLS (security_invoker), ma utile come defense-in-depth
WHERE q.company_id = public.get_my_company_id()
-- GROUP BY su PK: PostgreSQL consente di omettere le altre colonne di q
-- ma le elenchiamo esplicitamente per chiarezza e portabilità
GROUP BY
  q.id,
  q.company_id,
  q.quote_number,
  q.status,
  q.tipo_lavoro,
  q.total,
  q.totale_costo_interno,
  q.totale_overhead,
  q.margine_totale_percentuale,
  q.created_at,
  q.signed_at;
