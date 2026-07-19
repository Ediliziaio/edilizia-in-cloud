-- ============================================================================
-- FIX — supplier_procurement_report: bug di FAN-OUT (doppio conteggio)
-- ----------------------------------------------------------------------------
-- La vista faceva LEFT JOIN purchase_orders E LEFT JOIN scadenze sullo stesso
-- fornitore (due relazioni 1:N indipendenti) e poi aggregava: il prodotto
-- cartesiano moltiplicava sum(po.total) per il n° di scadenze e sum(scadenze)
-- per il n° di ordini. Su dati reali: Aluplast €103.960 → €935.639 (×9),
-- Edilmateriali €100.064 → €900.580, ecc. → la pagina Analisi Acquisti
-- (spesa fornitori, "da pagare", concentrazione, valore medio ordine, benchmark)
-- risultava gonfiata di 3-9 volte.
--
-- Fix: aggregare purchase_orders e scadenze in subquery SEPARATE prima del join
-- → nessun prodotto cartesiano. Colonne di output invariate (i consumer non
-- cambiano). Verificato: la vista coincide col calcolo reale (diff €0). Applicato
-- live via execute_sql; questo file = source of truth.
-- ============================================================================
CREATE OR REPLACE VIEW public.supplier_procurement_report AS
SELECT
  s.company_id,
  s.id AS supplier_id,
  s.name,
  s.product_category,
  s.is_active,
  s.is_foreign,
  COALESCE(po_agg.purchase_order_count, 0) AS purchase_order_count,
  COALESCE(po_agg.purchase_order_total, 0::numeric) AS purchase_order_total,
  COALESCE(sc_agg.open_due_count, 0) AS open_due_count,
  COALESCE(sc_agg.open_due_amount, 0::numeric) AS open_due_amount,
  po_agg.last_purchase_order_date
FROM suppliers s
LEFT JOIN (
  SELECT company_id, supplier_id,
    count(*) FILTER (WHERE status IS DISTINCT FROM 'annullato') AS purchase_order_count,
    COALESCE(sum(total) FILTER (WHERE status IS DISTINCT FROM 'annullato'), 0::numeric) AS purchase_order_total,
    max(issue_date) AS last_purchase_order_date
  FROM purchase_orders
  GROUP BY company_id, supplier_id
) po_agg ON po_agg.company_id = s.company_id AND po_agg.supplier_id = s.id
LEFT JOIN (
  SELECT company_id, supplier_id,
    count(*) FILTER (WHERE status = ANY (ARRAY['da_pagare','parziale'])) AS open_due_count,
    COALESCE(sum(COALESCE(amount,0::numeric) - COALESCE(paid_amount,0::numeric))
             FILTER (WHERE status = ANY (ARRAY['da_pagare','parziale'])), 0::numeric) AS open_due_amount
  FROM scadenze
  WHERE tipo = 'pagamento_fornitore'
  GROUP BY company_id, supplier_id
) sc_agg ON sc_agg.company_id = s.company_id AND sc_agg.supplier_id = s.id;
