-- Vista Marginalità Cantieri
-- Calcola preventivo vs consuntivo (acquisti + errori) per ogni ordine
-- Incorpora le variazioni approvate (OdV) nel preventivo totale
-- security_invoker = true: RLS delle tabelle sottostanti viene applicato correttamente

CREATE OR REPLACE VIEW public.v_ordine_marginalita
  WITH (security_invoker = true) AS
SELECT
  o.id,
  o.company_id,
  o.order_code,
  o.description,
  o.total_amount                                             AS preventivo_contratto,
  COALESCE(odv.variazioni_approvate, 0)                     AS variazioni_approvate,
  o.total_amount + COALESCE(odv.variazioni_approvate, 0)    AS preventivo_totale,
  o.work_start_date,
  o.work_end_date,
  o.created_at,
  -- Cliente
  COALESCE(c.first_name || ' ' || c.last_name, '')          AS cliente_nome,
  -- Costi disaggregati
  COALESCE(po.costo_acquisti, 0)                            AS costo_acquisti,
  COALESCE(err.costo_errori, 0)                             AS costo_errori,
  -- Consuntivo totale
  COALESCE(po.costo_acquisti, 0) + COALESCE(err.costo_errori, 0) AS consuntivo,
  -- Margine assoluto
  (o.total_amount + COALESCE(odv.variazioni_approvate, 0))
    - (COALESCE(po.costo_acquisti, 0) + COALESCE(err.costo_errori, 0)) AS margine,
  -- Margine percentuale (0 se preventivo_totale = 0)
  CASE
    WHEN (o.total_amount + COALESCE(odv.variazioni_approvate, 0)) > 0
    THEN ROUND(
           (
             (o.total_amount + COALESCE(odv.variazioni_approvate, 0))
             - (COALESCE(po.costo_acquisti, 0) + COALESCE(err.costo_errori, 0))
           )
           / (o.total_amount + COALESCE(odv.variazioni_approvate, 0))
           * 100,
           1
         )
    ELSE 0
  END AS margine_perc
FROM public.orders o
-- Cliente
LEFT JOIN public.profiles c ON c.id = o.customer_id
-- Variazioni approvate (OdV)
LEFT JOIN (
  SELECT order_id, SUM(impatto_economico) AS variazioni_approvate
  FROM public.ordini_variazione
  WHERE status = 'approvato' AND order_id IS NOT NULL
  GROUP BY order_id
) odv ON odv.order_id = o.id
-- Ordini di acquisto (costo materiali / subappalti)
LEFT JOIN (
  SELECT order_id, SUM(subtotal) AS costo_acquisti
  FROM public.purchase_orders
  WHERE order_id IS NOT NULL
  GROUP BY order_id
) po ON po.order_id = o.id
-- Errori cantiere (non-conformità, rilavorazioni)
LEFT JOIN (
  SELECT order_id, SUM(amount) AS costo_errori
  FROM public.order_errors
  GROUP BY order_id
) err ON err.order_id = o.id;

-- Commento descrittivo
COMMENT ON VIEW public.v_ordine_marginalita IS
  'Vista di marginalità real-time per cantiere: preventivo contratto + variazioni approvate (OdV) vs acquisti + errori cantiere.';
