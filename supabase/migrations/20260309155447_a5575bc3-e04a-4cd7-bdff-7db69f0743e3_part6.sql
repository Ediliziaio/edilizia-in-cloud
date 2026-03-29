-- ════════════════════════════════════════════════════════════════
-- FUNZIONE: Genera numero fattura senza race conditions
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION generate_invoice_number(
  p_company_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER
)
RETURNS TABLE(invoice_number TEXT, progressive_number INTEGER) AS $$
DECLARE
  v_next INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext(p_company_id::TEXT || p_year::TEXT)
  );
  SELECT COALESCE(MAX(i.progressive_number), 0) + 1
  INTO v_next
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.invoice_year = p_year
    AND i.document_type = 'invoice';
  RETURN QUERY SELECT
    ('FT-' || p_year || '-' || LPAD(v_next::TEXT, 4, '0'))::TEXT,
    v_next;
END;
$$ LANGUAGE plpgsql;
