-- =============================================
-- 1C. FUNZIONI RPC
-- =============================================

-- Segna scadenza come pagata (totale o parziale)
DROP FUNCTION IF EXISTS public.mark_scadenza_paid(UUID, NUMERIC, TEXT, DATE, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.mark_scadenza_paid(
  p_scadenza_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'bonifico',
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scadenza RECORD;
  v_new_paid NUMERIC;
  v_new_status TEXT;
  v_company_id UUID;
BEGIN
  -- Fetch scadenza
  SELECT * INTO v_scadenza FROM scadenze WHERE id = p_scadenza_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Scadenza non trovata');
  END IF;
  
  v_company_id := v_scadenza.company_id;
  
  -- Verify tenant access
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND company_id = v_company_id)
     AND NOT has_role(auth.uid(), 'super_admin') THEN
    RETURN json_build_object('error', 'Accesso negato');
  END IF;
  
  -- Calculate new paid amount
  v_new_paid := LEAST(v_scadenza.paid_amount + p_amount, v_scadenza.amount);
  
  -- Determine new status
  IF v_new_paid >= v_scadenza.amount THEN
    v_new_status := 'pagata';
  ELSIF v_new_paid > 0 THEN
    v_new_status := 'parziale';
  ELSE
    v_new_status := 'da_pagare';
  END IF;
  
  -- Update scadenza
  UPDATE scadenze SET
    paid_amount = v_new_paid,
    status = v_new_status,
    paid_date = CASE WHEN v_new_status = 'pagata' THEN p_payment_date ELSE paid_date END,
    payment_method = p_payment_method,
    updated_at = now()
  WHERE id = p_scadenza_id;
  
  -- Create prima nota entry automatically
  INSERT INTO prima_nota_entries (
    company_id, direction, category, description, amount, entry_date,
    payment_method, scadenza_id, is_auto, auto_source, notes, created_by
  ) VALUES (
    v_company_id,
    v_scadenza.direction,
    CASE v_scadenza.tipo
      WHEN 'incasso_cliente' THEN 'incasso'
      WHEN 'pagamento_fornitore' THEN 'fornitore'
      WHEN 'costo_aziendale' THEN 'costo'
      WHEN 'scadenza_fiscale' THEN 'fiscale'
      ELSE 'altro'
    END,
    'Pagamento: ' || v_scadenza.description,
    p_amount,
    p_payment_date,
    p_payment_method,
    p_scadenza_id,
    true,
    'scadenza_payment',
    p_notes,
    auth.uid()
  );
  
  RETURN json_build_object(
    'success', true,
    'new_status', v_new_status,
    'paid_amount', v_new_paid,
    'remaining', v_scadenza.amount - v_new_paid
  );
END;
$$;
