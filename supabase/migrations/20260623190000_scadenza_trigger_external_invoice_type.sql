-- Integrazione fatture ESTERNE (Fatture in Cloud/Aruba/...) con Scadenzario + flussi di cassa.
-- Le fatture importate in `invoices` usano document_type='invoice'/'credit_note', mentre il
-- trigger auto_create_scadenza_from_invoice accettava solo 'fattura'/'parcella'/'nota_credito'
-- → le fatture importate NON generavano alcuna `scadenze` → assenti da Scadenzario e dalle
-- uscite/entrate previste del cash flow (che leggono `scadenze`). Estendiamo la whitelist:
-- 'invoice' = come 'fattura' (entrata/incasso cliente), 'credit_note' = come 'nota_credito'.
-- Modifica PURAMENTE ADDITIVA: nessun cambiamento per i document_type nativi esistenti.
CREATE OR REPLACE FUNCTION public.auto_create_scadenza_from_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo TEXT;
  v_direction TEXT;
  v_description TEXT;
BEGIN
  IF NEW.due_date IS NULL OR COALESCE(NEW.total, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM scadenze
    WHERE invoice_id = NEW.id
    AND status IN ('da_pagare', 'parziale')
  ) THEN
    IF TG_OP = 'UPDATE' AND (
      OLD.total IS DISTINCT FROM NEW.total OR
      OLD.due_date IS DISTINCT FROM NEW.due_date
    ) THEN
      UPDATE scadenze SET
        amount = COALESCE(NEW.total, 0),
        due_date = NEW.due_date,
        description = CASE
          WHEN NEW.document_type IN ('nota_credito', 'credit_note') THEN 'Nota credito ' || COALESCE(NEW.invoice_number, '')
          ELSE 'Fattura ' || COALESCE(NEW.invoice_number, '') || ' - ' || COALESCE(NEW.client_company_name, '')
        END,
        updated_at = now()
      WHERE invoice_id = NEW.id AND status IN ('da_pagare', 'parziale');
    END IF;
    RETURN NEW;
  END IF;

  -- 'invoice' = fattura emessa importata da provider esterno; 'credit_note' = nota di credito importata.
  IF NEW.document_type IN ('fattura', 'fattura_accompagnatoria', 'parcella', 'invoice') THEN
    v_tipo := 'incasso_cliente';
    v_direction := 'entrata';
    v_description := 'Fattura ' || COALESCE(NEW.invoice_number, '') || ' - ' || COALESCE(NEW.client_company_name, '');
  ELSIF NEW.document_type IN ('nota_credito', 'credit_note') THEN
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
$function$;
