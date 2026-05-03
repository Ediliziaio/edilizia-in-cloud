-- MP-CG audit P1.3 — estende v_cg_ricavi_classificati per coprire anche
-- i tenant che NON usano la fatturazione su EiC: i ricavi commerciali
-- vengono letti dagli ordini (orders.total_amount). Manteniamo le invoices
-- come fonte primaria; orders aggiunti via UNION ALL con un marker per
-- evitare doppi conteggi quando una company ha BOTH invoices e orders.
--
-- Strategia: includiamo orders SOLO per company che hanno 0 fatture
-- nell'anno; se ha emesso fatture, prevalgono quelle.

CREATE OR REPLACE VIEW public.v_cg_ricavi_classificati AS
WITH ricavi_invoices AS (
  SELECT i.company_id,
         i.issue_date::date AS data,
         (COALESCE(i.total, 0) - COALESCE(i.tax_amount, 0)) AS importo_imponibile,
         COALESCE(i.tax_amount, 0) AS iva_amount,
         i.document_type AS invoice_type,
         extract(year  FROM i.issue_date)::int AS anno,
         extract(month FROM i.issue_date)::int AS mese,
         i.client_id   AS cliente_id,
         i.order_id,
         'invoice'::text AS source
  FROM public.invoices i
  WHERE i.status NOT IN ('cancelled','draft','annullata','bozza')
    AND i.issue_date IS NOT NULL
),
companies_with_invoices AS (
  -- Set di (company, anno) che hanno almeno una fattura.
  SELECT DISTINCT company_id, anno FROM ricavi_invoices
),
ricavi_orders AS (
  -- Fallback: ricavi da orders.total_amount per (company, anno) SENZA fatture.
  -- VAT rate ipotizzata 22% se mancante; importo_imponibile = total_amount
  -- (assumiamo già al netto perché orders.total_amount è il commerciale ordine).
  SELECT o.company_id,
         o.created_at::date AS data,
         COALESCE(o.total_amount, 0) AS importo_imponibile,
         COALESCE(o.total_amount, 0) * (COALESCE(o.vat_rate, 22) / 100.0) AS iva_amount,
         'order'::text AS invoice_type,
         extract(year  FROM o.created_at)::int AS anno,
         extract(month FROM o.created_at)::int AS mese,
         o.customer_id AS cliente_id,
         o.id          AS order_id,
         'order'::text AS source
  FROM public.orders o
  WHERE o.created_at IS NOT NULL
    AND COALESCE(o.total_amount, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM companies_with_invoices c
      WHERE c.company_id = o.company_id
        AND c.anno = extract(year FROM o.created_at)::int
    )
)
SELECT * FROM ricavi_invoices
UNION ALL
SELECT * FROM ricavi_orders;

GRANT SELECT ON public.v_cg_ricavi_classificati TO authenticated;
COMMENT ON VIEW public.v_cg_ricavi_classificati IS
  'Ricavi unificati: invoices se presenti, altrimenti orders.total_amount come fallback per company senza fatturazione su EiC. Colonna source = invoice|order.';
