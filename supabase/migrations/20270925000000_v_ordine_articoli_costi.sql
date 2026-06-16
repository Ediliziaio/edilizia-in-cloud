-- ============================================================================
-- v_ordine_articoli_costi — costo per riga commessa: STANDARD (listino) vs REALE
-- ============================================================================
-- Una riga per ogni order_item, con:
--   • costo_standard = baseline da listino (order_items.standard_cost × qty)
--   • costo_reale    = righe-ODA collegate se presenti, ALTRIMENTI purchase_price
--                      manuale/magazzino × qty  → gestisce ODA OPZIONALE + stock
--                      senza doppi conteggi (è per-riga, usa il costo della riga).
--   • fonte_costo    = 'oda' | 'magazzino' | 'manuale' (trasparenza del dato)
--   • scostamento    = reale − standard (quando esiste una baseline da listino)
--
-- Abilita l'analisi prodotto/categoria nel Controllo di Gestione (dove spendo
-- più del listino, quali prodotti/categorie mi costano di più).
-- security_invoker=true → eredita RLS di order_items/orders (isolamento azienda).
-- NB: NON tocca v_ordine_marginalita (consuntivo a livello ordine): qui il dato
--     è per-riga e non somma gli ODA-testata, quindi nessun doppio conteggio.
-- ============================================================================

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
  -- baseline listino (snapshot). 0 se la riga non viene dal listino.
  ROUND(COALESCE(oi.standard_cost, 0)::numeric * oi.quantity, 2) AS costo_standard,
  -- reale: somma righe-ODA collegate se presenti, altrimenti costo manuale/magazzino.
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
