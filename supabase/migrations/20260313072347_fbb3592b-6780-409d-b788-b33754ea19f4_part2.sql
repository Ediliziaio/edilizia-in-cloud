-- Bug #8: Update incasso trigger to handle DELETE (storno)
DROP FUNCTION IF EXISTS public.fn_prima_nota_on_incasso() CASCADE;
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
      INSERT INTO prima_nota (
        company_id, data, descrizione, importo, direction,
        categoria, documento_id, source_table, source_id
      ) VALUES (
        NEW.company_id, NEW.data_movimento,
        COALESCE('Incasso fattura: ' || NEW.descrizione, 'Incasso fattura'),
        NEW.importo, 'entrata',
        'incasso_fattura', NEW.documento_id,
        'movimenti_cassa_native', NEW.id
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Remove corresponding Prima Nota entry when cash movement is deleted
    DELETE FROM prima_nota
    WHERE source_table = 'movimenti_cassa_native' AND source_id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
