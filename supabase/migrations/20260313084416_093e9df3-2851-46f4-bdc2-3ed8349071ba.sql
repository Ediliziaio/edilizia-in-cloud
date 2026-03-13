
-- Fix security definer view: use SECURITY INVOKER
DROP VIEW IF EXISTS performance_base_venditori;

CREATE OR REPLACE VIEW performance_base_venditori
WITH (security_invoker = true)
AS
SELECT
  sp.id AS salesperson_id,
  sp.company_id,
  sp.first_name || ' ' || sp.last_name AS nome_completo,
  sp.area_geografica,
  sp.is_active,
  COUNT(DISTINCT q.id) FILTER (
    WHERE EXTRACT(YEAR FROM q.created_at) = EXTRACT(YEAR FROM NOW())
  ) AS preventivi_anno,
  COUNT(DISTINCT q.id) FILTER (
    WHERE q.status IN ('accepted', 'signed')
    AND EXTRACT(YEAR FROM q.created_at) = EXTRACT(YEAR FROM NOW())
  ) AS preventivi_vinti_anno,
  ROUND(
    100.0 * COUNT(DISTINCT q.id) FILTER (
      WHERE q.status IN ('accepted', 'signed')
      AND EXTRACT(YEAR FROM q.created_at) = EXTRACT(YEAR FROM NOW())
    ) / NULLIF(COUNT(DISTINCT q.id) FILTER (
      WHERE q.status NOT IN ('draft')
      AND EXTRACT(YEAR FROM q.created_at) = EXTRACT(YEAR FROM NOW())
    ), 0),
  2) AS win_rate_anno,
  COALESCE(SUM(o.total_amount) FILTER (
    WHERE EXTRACT(YEAR FROM o.created_at) = EXTRACT(YEAR FROM NOW())
  ), 0) AS fatturato_anno,
  ROUND(AVG(o.total_amount) FILTER (
    WHERE EXTRACT(YEAR FROM o.created_at) = EXTRACT(YEAR FROM NOW())
  ), 2) AS valore_medio_ordine,
  COUNT(DISTINCT o.customer_id) FILTER (
    WHERE EXTRACT(YEAR FROM o.created_at) = EXTRACT(YEAR FROM NOW())
  ) AS clienti_attivi_anno,
  COALESCE(SUM(q.total) FILTER (
    WHERE q.status IN ('sent', 'viewed')
  ), 0) AS pipeline_valore,
  COUNT(DISTINCT q.id) FILTER (
    WHERE q.status IN ('sent', 'viewed')
  ) AS pipeline_count
FROM salespeople sp
LEFT JOIN quotes q ON q.salesperson_id = sp.id
LEFT JOIN order_salespeople osp ON osp.salesperson_id = sp.id
LEFT JOIN orders o ON o.id = osp.order_id
GROUP BY sp.id, sp.company_id, sp.first_name, sp.last_name, sp.area_geografica, sp.is_active;
