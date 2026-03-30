DROP FUNCTION IF EXISTS public.trg_recalculate_invoice() CASCADE;
CREATE OR REPLACE FUNCTION trg_recalculate_invoice()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalculate_invoice_totals(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
