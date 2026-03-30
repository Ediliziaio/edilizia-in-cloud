-- ════════════════════════════════════════════════════════════════
-- FUNZIONE: Ricalcola totali fattura
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.recalculate_invoice_totals(UUID) CASCADE;
CREATE OR REPLACE FUNCTION recalculate_invoice_totals(p_invoice_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE invoices SET
    subtotal   = COALESCE((SELECT SUM(line_net)   FROM invoice_lines WHERE invoice_id = p_invoice_id), 0),
    tax_amount = COALESCE((SELECT SUM(line_tax)   FROM invoice_lines WHERE invoice_id = p_invoice_id), 0),
    total      = COALESCE((SELECT SUM(line_gross) FROM invoice_lines WHERE invoice_id = p_invoice_id), 0),
    updated_at = NOW()
  WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql;
