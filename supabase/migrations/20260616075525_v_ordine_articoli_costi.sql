-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE VIEW public.v_ordine_articoli_costi
WITH (security_invoker = true) AS
SELECT
  oi.id                                   AS order_item_id,
  oi.order_id,
  o.company_id,
  o.order_code,
  oi.article_template_id,
  COALESCE(NULLIF(BTRIM(oi.categoria), ''), at.category, 'Senza categoria') AS categoria,
  oi.name,
  oi.quantity,
  ROUND(COALESCE(oi.standard_cost, 0)::numeric * oi.quantity, 2) AS costo_standard,
  ROUND(
    COALESCE(
      NULLIF((SELECT SUM(poi.line_total)
                FROM public.purchase_order_items poi
               WHERE poi.order_item_id = oi.id), 0),
      COALESCE(oi.purchase_price, 0)::numeric * oi.quantity
    ), 2
  ) AS costo_reale,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.purchase_order_items poi WHERE poi.order_item_id = oi.id) THEN 'oda'
    WHEN oi.stock_item_id IS NOT NULL THEN 'magazzino'
    ELSE 'manuale'
  END AS fonte_costo,
  oi.standard_cost IS NOT NULL AND oi.standard_cost > 0 AS ha_baseline_listino,
  o.created_at
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
LEFT JOIN public.article_templates at ON at.id = oi.article_template_id;

COMMENT ON VIEW public.v_ordine_articoli_costi IS
  'Costo per riga commessa: standard (listino) vs reale (ODA se presente, altrimenti purchase_price manuale/magazzino). Base per analisi prodotto/categoria nel Controllo di Gestione. security_invoker=true.';

GRANT SELECT ON public.v_ordine_articoli_costi TO authenticated;
