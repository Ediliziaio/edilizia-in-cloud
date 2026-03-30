-- ════════════════════════════════════════════════════════════════
-- FUNZIONE RPC: Scadenzario
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.get_scadenzario(UUID, DATE, DATE) CASCADE;
CREATE OR REPLACE FUNCTION get_scadenzario(
  p_company_id UUID,
  p_from_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_to_date   DATE DEFAULT CURRENT_DATE + INTERVAL '90 days'
)
RETURNS TABLE (
  invoice_id       UUID,
  invoice_number   TEXT,
  client_name      TEXT,
  due_date         DATE,
  total            NUMERIC,
  paid_amount      NUMERIC,
  remaining        NUMERIC,
  status           TEXT,
  days_until_due   INTEGER,
  urgency          TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.invoice_number,
    i.client_company_name,
    i.due_date,
    i.total,
    i.paid_amount,
    (i.total - i.paid_amount) AS remaining,
    i.status,
    (i.due_date - CURRENT_DATE)::INTEGER,
    CASE
      WHEN i.due_date < CURRENT_DATE           THEN 'overdue'
      WHEN i.due_date <= CURRENT_DATE + 7      THEN 'critical'
      WHEN i.due_date <= CURRENT_DATE + 30     THEN 'warning'
      ELSE 'ok'
    END
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.status NOT IN ('paid', 'cancelled', 'draft')
    AND i.due_date BETWEEN p_from_date AND p_to_date
  ORDER BY i.due_date ASC;
END;
$$ LANGUAGE plpgsql;
