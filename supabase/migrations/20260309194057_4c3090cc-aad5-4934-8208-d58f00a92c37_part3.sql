-- 2. Trigger: Quando fattura viene segnata come paid, aggiorna scadenza collegata
DROP FUNCTION IF EXISTS public.auto_reconcile_invoice_payment() CASCADE;
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
