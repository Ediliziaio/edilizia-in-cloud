-- 7. mark_scadenza_paid - Riscrittura completa
DROP FUNCTION IF EXISTS public.mark_scadenza_paid(UUID, NUMERIC, TEXT, DATE, TEXT, TEXT) CASCADE;
CREATE OR REPLACE FUNCTION public.mark_scadenza_paid(
  p_scadenza_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'bonifico',
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL,
  p_account_label TEXT DEFAULT 'banca'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scadenza RECORD;
  v_remaining NUMERIC;
  v_new_paid NUMERIC;
  v_new_status TEXT;
  v_pn_id UUID;
  v_direction TEXT;
  v_category TEXT;
BEGIN
  SELECT * INTO v_scadenza FROM scadenze WHERE id = p_scadenza_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Scadenza non trovata');
  END IF;
  
  v_remaining := v_scadenza.amount - v_scadenza.paid_amount;
  IF p_amount <= 0 OR p_amount > v_remaining THEN
    RETURN json_build_object('error', 'Importo non valido. Residuo: ' || v_remaining);
  END IF;
  
  v_new_paid := v_scadenza.paid_amount + p_amount;
  IF v_new_paid >= v_scadenza.amount THEN
    v_new_status := 'pagata';
  ELSE
    v_new_status := 'parziale';
  END IF;
  
  -- Determine prima nota direction and category
  IF v_scadenza.direction = 'entrata' THEN
    v_direction := 'entrata';
    v_category := 'incasso';
  ELSE
    v_direction := 'uscita';
    v_category := CASE v_scadenza.tipo
      WHEN 'pagamento_fornitore' THEN 'fornitore'
      WHEN 'costo_aziendale' THEN 'costo'
      WHEN 'scadenza_fiscale' THEN 'fiscale'
      ELSE 'altro'
    END;
  END IF;
  
  -- Create prima nota entry
  INSERT INTO prima_nota_entries (
    company_id, direction, category, description, amount, entry_date,
    payment_method, supplier_id, invoice_id, order_id, scadenza_id,
    order_item_id, account_label, is_auto, auto_source, notes, created_by
  ) VALUES (
    v_scadenza.company_id, v_direction, v_category,
    'Pagamento: ' || v_scadenza.description,
    p_amount, p_payment_date, p_payment_method,
    v_scadenza.supplier_id, v_scadenza.invoice_id, v_scadenza.order_id,
    p_scadenza_id, v_scadenza.order_item_id, p_account_label,
    true, 'scadenzario', p_notes,
    (SELECT auth.uid())
  )
  RETURNING id INTO v_pn_id;
  
  -- Update scadenza
  UPDATE scadenze SET
    paid_amount = v_new_paid,
    status = v_new_status,
    paid_date = p_payment_date,
    payment_method = p_payment_method,
    prima_nota_entry_id = v_pn_id,
    updated_at = NOW()
  WHERE id = p_scadenza_id;
  
  RETURN json_build_object(
    'success', true,
    'new_status', v_new_status,
    'paid_amount', v_new_paid,
    'prima_nota_entry_id', v_pn_id
  );
END;
$$;
