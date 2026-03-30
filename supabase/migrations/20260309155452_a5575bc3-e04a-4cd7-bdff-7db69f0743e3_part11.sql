-- ════════════════════════════════════════════════════════════════
-- FUNZIONE: Aggiorna paid_amount e segna come pagata
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.trg_update_paid_amount() CASCADE;
CREATE OR REPLACE FUNCTION trg_update_paid_amount()
RETURNS TRIGGER AS $$
DECLARE v_invoice_id UUID;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  UPDATE invoices SET
    paid_amount = COALESCE(
      (SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = v_invoice_id), 0
    ),
    status = CASE
      WHEN COALESCE(
        (SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = v_invoice_id), 0
      ) >= total THEN 'paid'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = v_invoice_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
