-- ============================================
-- Fase 6: Automazioni Finanziarie
-- ============================================

-- 1. Trigger: Auto-genera scadenza quando una fattura viene creata con due_date
DROP FUNCTION IF EXISTS public.auto_create_scadenza_from_invoice() CASCADE;
CREATE OR REPLACE FUNCTION public.auto_create_scadenza_from_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo TEXT;
  v_direction TEXT;
  v_description TEXT;
BEGIN
  -- Solo se la fattura ha una due_date e un totale > 0
  IF NEW.due_date IS NULL OR COALESCE(NEW.total, 0) <= 0 THEN
    RETURN NEW;
  END IF;
  
  -- Non creare duplicati: check se esiste già una scadenza per questa fattura
  IF EXISTS (
    SELECT 1 FROM scadenze 
    WHERE invoice_id = NEW.id 
    AND status IN ('da_pagare', 'parziale')
  ) THEN
    -- Se la fattura è stata aggiornata, aggiorna la scadenza esistente
    IF TG_OP = 'UPDATE' AND (
      OLD.total IS DISTINCT FROM NEW.total OR 
      OLD.due_date IS DISTINCT FROM NEW.due_date
    ) THEN
      UPDATE scadenze SET
        amount = COALESCE(NEW.total, 0),
        due_date = NEW.due_date,
        description = CASE 
          WHEN NEW.document_type = 'nota_credito' THEN 'Nota credito ' || COALESCE(NEW.invoice_number, '')
          ELSE 'Fattura ' || COALESCE(NEW.invoice_number, '') || ' - ' || COALESCE(NEW.client_company_name, '')
        END,
        updated_at = now()
      WHERE invoice_id = NEW.id AND status IN ('da_pagare', 'parziale');
    END IF;
    RETURN NEW;
  END IF;
  
  -- Determina tipo e direzione in base al document_type
  IF NEW.document_type IN ('fattura', 'fattura_accompagnatoria', 'parcella') THEN
    v_tipo := 'incasso_cliente';
    v_direction := 'entrata';
    v_description := 'Fattura ' || COALESCE(NEW.invoice_number, '') || ' - ' || COALESCE(NEW.client_company_name, '');
  ELSIF NEW.document_type = 'nota_credito' THEN
    v_tipo := 'pagamento_fornitore';
    v_direction := 'uscita';
    v_description := 'Nota credito ' || COALESCE(NEW.invoice_number, '') || ' - ' || COALESCE(NEW.client_company_name, '');
  ELSE
    RETURN NEW; -- proforma, preventivo, ecc. non generano scadenze
  END IF;
  
  INSERT INTO scadenze (
    company_id, tipo, direction, description, amount, due_date,
    invoice_id, order_id, status, is_auto_generated, auto_source,
    alert_days_before, created_by
  ) VALUES (
    NEW.company_id, v_tipo, v_direction, v_description,
    COALESCE(NEW.total, 0), NEW.due_date,
    NEW.id, NEW.order_id, 'da_pagare', true, 'invoice',
    7, NEW.created_by
  );
  
  RETURN NEW;
END;
$$;
