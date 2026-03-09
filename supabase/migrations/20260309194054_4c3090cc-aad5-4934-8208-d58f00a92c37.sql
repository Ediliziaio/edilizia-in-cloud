
-- ============================================
-- Fase 6: Automazioni Finanziarie
-- ============================================

-- 1. Trigger: Auto-genera scadenza quando una fattura viene creata con due_date
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

-- Attach trigger on invoices
DROP TRIGGER IF EXISTS trg_auto_scadenza_from_invoice ON invoices;
CREATE TRIGGER trg_auto_scadenza_from_invoice
  AFTER INSERT OR UPDATE OF total, due_date, status ON invoices
  FOR EACH ROW
  WHEN (NEW.status NOT IN ('cancelled', 'draft'))
  EXECUTE FUNCTION auto_create_scadenza_from_invoice();


-- 2. Trigger: Quando fattura viene segnata come paid, aggiorna scadenza collegata
CREATE OR REPLACE FUNCTION public.auto_reconcile_invoice_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se la fattura viene pagata completamente
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    UPDATE scadenze SET
      status = 'pagata',
      paid_amount = amount,
      paid_date = COALESCE(NEW.payment_date, now()::date),
      payment_method = NEW.payment_method,
      updated_at = now()
    WHERE invoice_id = NEW.id
    AND status IN ('da_pagare', 'parziale');
  END IF;
  
  -- Se pagamento parziale (paid_amount aumentato ma non ancora paid)
  IF NEW.paid_amount IS NOT NULL AND NEW.paid_amount > COALESCE(OLD.paid_amount, 0) 
     AND NEW.status <> 'paid' THEN
    UPDATE scadenze SET
      paid_amount = NEW.paid_amount,
      status = CASE 
        WHEN NEW.paid_amount >= amount THEN 'pagata'
        WHEN NEW.paid_amount > 0 THEN 'parziale'
        ELSE status
      END,
      updated_at = now()
    WHERE invoice_id = NEW.id
    AND status IN ('da_pagare', 'parziale');
  END IF;
  
  -- Se fattura annullata, annulla scadenza
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    UPDATE scadenze SET
      status = 'annullata',
      updated_at = now()
    WHERE invoice_id = NEW.id
    AND status IN ('da_pagare', 'parziale');
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_reconcile_invoice ON invoices;
CREATE TRIGGER trg_auto_reconcile_invoice
  AFTER UPDATE OF status, paid_amount ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION auto_reconcile_invoice_payment();


-- 3. Tabella per preferenze alert scadenze
CREATE TABLE IF NOT EXISTS public.scadenza_alert_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  alert_enabled BOOLEAN DEFAULT true,
  default_alert_days INTEGER DEFAULT 7,
  alert_email TEXT,
  alert_on_overdue BOOLEAN DEFAULT true,
  alert_on_upcoming BOOLEAN DEFAULT true,
  auto_generate_from_invoices BOOLEAN DEFAULT true,
  auto_reconcile_payments BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.scadenza_alert_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view alert prefs" ON public.scadenza_alert_prefs
  FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Company admins can manage alert prefs" ON public.scadenza_alert_prefs
  FOR ALL TO authenticated
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));


-- 4. Updated check_overdue_scadenze to also return alert-worthy scadenze
CREATE OR REPLACE FUNCTION public.check_overdue_and_upcoming_scadenze(p_company_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_overdue JSON;
  v_upcoming JSON;
  v_result JSON;
BEGIN
  -- Overdue scadenze
  SELECT COALESCE(json_agg(row_to_json(s)), '[]'::json)
  INTO v_overdue
  FROM (
    SELECT id, description, amount, paid_amount, due_date, tipo, direction,
           (amount - paid_amount) as remaining
    FROM scadenze
    WHERE company_id = p_company_id
    AND status IN ('da_pagare', 'parziale')
    AND due_date < CURRENT_DATE
    ORDER BY due_date ASC
    LIMIT 50
  ) s;
  
  -- Upcoming scadenze (next 7 days by default, uses alert_days_before)
  SELECT COALESCE(json_agg(row_to_json(s)), '[]'::json)
  INTO v_upcoming
  FROM (
    SELECT id, description, amount, paid_amount, due_date, tipo, direction,
           alert_days_before, alert_sent_at,
           (amount - paid_amount) as remaining,
           (due_date - CURRENT_DATE) as days_until
    FROM scadenze
    WHERE company_id = p_company_id
    AND status IN ('da_pagare', 'parziale')
    AND due_date >= CURRENT_DATE
    AND due_date <= CURRENT_DATE + alert_days_before
    AND (alert_sent_at IS NULL OR alert_sent_at < CURRENT_DATE - 1)
    ORDER BY due_date ASC
    LIMIT 50
  ) s;
  
  v_result := json_build_object(
    'overdue', v_overdue,
    'upcoming', v_upcoming,
    'overdue_count', (SELECT COUNT(*) FROM scadenze WHERE company_id = p_company_id AND status IN ('da_pagare', 'parziale') AND due_date < CURRENT_DATE),
    'upcoming_count', json_array_length(v_upcoming)
  );
  
  RETURN v_result;
END;
$$;
