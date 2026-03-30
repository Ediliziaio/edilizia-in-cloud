
-- Fix BUG REALE 1: fn_prima_nota_on_incasso references non-existent 'prima_nota' table
-- Must use 'prima_nota_entries' with correct column names

CREATE OR REPLACE FUNCTION public.fn_prima_nota_on_incasso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only create Prima Nota entry for cash movements linked to a document
    IF NEW.documento_id IS NOT NULL AND NEW.tipo = 'entrata' THEN
      INSERT INTO prima_nota_entries (
        company_id, entry_date, description, amount, direction,
        category, invoice_id, is_auto, auto_source
      ) VALUES (
        NEW.company_id, NEW.data_movimento,
        COALESCE('Incasso fattura: ' || NEW.descrizione, 'Incasso fattura'),
        NEW.importo, 'entrata',
        'incasso_fattura', NEW.documento_id,
        true, 'incasso_fattura'
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Remove corresponding Prima Nota entry when cash movement is deleted
    DELETE FROM prima_nota_entries
    WHERE is_auto = true
      AND auto_source = 'incasso_fattura'
      AND invoice_id = OLD.documento_id
      AND company_id = OLD.company_id
      AND amount = OLD.importo;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
