
-- =============================================
-- FASE 1: Migrazione DB Correttiva
-- =============================================

-- 1. ALTER TABLE scadenze - campi mancanti
ALTER TABLE public.scadenze 
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prima_nota_entry_id UUID REFERENCES public.prima_nota_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alert_days_before INT DEFAULT 7,
  ADD COLUMN IF NOT EXISTS alert_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_source TEXT;

-- 2. ALTER TABLE prima_nota_entries - campi mancanti
ALTER TABLE public.prima_nota_entries 
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_label TEXT DEFAULT 'banca';

-- 3. ALTER TABLE purchase_order_items - link a order_items
ALTER TABLE public.purchase_order_items 
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL;

-- 4. ALTER TABLE purchase_orders - campi aggiuntivi
ALTER TABLE public.purchase_orders 
  ADD COLUMN IF NOT EXISTS supplier_reference TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- 5. Indici per le nuove FK
CREATE INDEX IF NOT EXISTS idx_scadenze_order_item_id ON public.scadenze(order_item_id);
CREATE INDEX IF NOT EXISTS idx_scadenze_prima_nota_entry_id ON public.scadenze(prima_nota_entry_id);
CREATE INDEX IF NOT EXISTS idx_prima_nota_entries_order_item_id ON public.prima_nota_entries(order_item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order_item_id ON public.purchase_order_items(order_item_id);

-- 6. Trigger auto-assign oda_number
CREATE OR REPLACE FUNCTION public.auto_assign_oda_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num TEXT;
BEGIN
  IF NEW.oda_number IS NULL OR NEW.oda_number = '' THEN
    SELECT public.generate_oda_number(NEW.company_id) INTO v_num;
    NEW.oda_number := v_num;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_oda_number ON public.purchase_orders;
CREATE TRIGGER trg_auto_oda_number
  BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_oda_number();

-- 7. mark_scadenza_paid - Riscrittura completa
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

-- 8. get_prima_nota_saldo - Fix con entry_count
CREATE OR REPLACE FUNCTION public.get_prima_nota_saldo(
  p_company_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entrate NUMERIC := 0;
  v_uscite NUMERIC := 0;
  v_count BIGINT := 0;
BEGIN
  SELECT 
    COALESCE(SUM(CASE WHEN direction = 'entrata' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'uscita' THEN amount ELSE 0 END), 0),
    COUNT(*)
  INTO v_entrate, v_uscite, v_count
  FROM prima_nota_entries
  WHERE company_id = p_company_id
    AND (p_from_date IS NULL OR entry_date >= p_from_date)
    AND (p_to_date IS NULL OR entry_date <= p_to_date);

  RETURN json_build_object(
    'entrate', v_entrate,
    'uscite', v_uscite,
    'saldo', v_entrate - v_uscite,
    'entry_count', v_count
  );
END;
$$;

-- 9. get_scadenzario_summary - Fix con campi aggiuntivi
CREATE OR REPLACE FUNCTION public.get_scadenzario_summary(p_company_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'scadute_count', COALESCE(SUM(CASE WHEN status = 'da_pagare' AND due_date < CURRENT_DATE THEN 1 ELSE 0 END), 0),
    'scadute_amount', COALESCE(SUM(CASE WHEN status = 'da_pagare' AND due_date < CURRENT_DATE THEN amount - paid_amount ELSE 0 END), 0),
    'questa_settimana_count', COALESCE(SUM(CASE WHEN status IN ('da_pagare','parziale') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 THEN 1 ELSE 0 END), 0),
    'questa_settimana_amount', COALESCE(SUM(CASE WHEN status IN ('da_pagare','parziale') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 THEN amount - paid_amount ELSE 0 END), 0),
    'prossimi_30gg_count', COALESCE(SUM(CASE WHEN status IN ('da_pagare','parziale') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30 THEN 1 ELSE 0 END), 0),
    'prossimi_30gg_amount', COALESCE(SUM(CASE WHEN status IN ('da_pagare','parziale') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30 THEN amount - paid_amount ELSE 0 END), 0),
    'questo_mese_count', COALESCE(SUM(CASE WHEN status IN ('da_pagare','parziale') AND date_trunc('month', due_date) = date_trunc('month', CURRENT_DATE) THEN 1 ELSE 0 END), 0),
    'questo_mese_amount', COALESCE(SUM(CASE WHEN status IN ('da_pagare','parziale') AND date_trunc('month', due_date) = date_trunc('month', CURRENT_DATE) THEN amount - paid_amount ELSE 0 END), 0),
    'entrate_previste', COALESCE(SUM(CASE WHEN direction = 'entrata' AND status IN ('da_pagare','parziale') THEN amount - paid_amount ELSE 0 END), 0),
    'uscite_previste', COALESCE(SUM(CASE WHEN direction = 'uscita' AND status IN ('da_pagare','parziale') THEN amount - paid_amount ELSE 0 END), 0)
  ) INTO v_result
  FROM scadenze
  WHERE company_id = p_company_id
    AND status NOT IN ('annullata');

  RETURN v_result;
END;
$$;

-- 10. check_overdue_scadenze - Fix per usare status corretto
CREATE OR REPLACE FUNCTION public.check_overdue_scadenze(p_company_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM scadenze
  WHERE company_id = p_company_id
    AND status = 'da_pagare'
    AND due_date < CURRENT_DATE;

  RETURN json_build_object('overdue_count', v_count);
END;
$$;

-- 11. create_oda_from_order - Riscrittura con p_item_ids
CREATE OR REPLACE FUNCTION public.create_oda_from_order(
  p_company_id UUID,
  p_order_id UUID,
  p_supplier_id UUID,
  p_item_ids UUID[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po_id UUID;
  v_item RECORD;
BEGIN
  -- Create the purchase order (oda_number auto-assigned by trigger)
  INSERT INTO purchase_orders (company_id, supplier_id, order_id, created_by)
  VALUES (p_company_id, p_supplier_id, p_order_id, auth.uid())
  RETURNING id INTO v_po_id;

  -- Copy items (all or selected)
  FOR v_item IN
    SELECT * FROM order_items
    WHERE order_id = p_order_id
      AND (p_item_ids IS NULL OR id = ANY(p_item_ids))
  LOOP
    INSERT INTO purchase_order_items (
      company_id, purchase_order_id, order_item_id,
      description, quantity, unit_price, vat_rate, 
      discount_percent, unit_of_measure, sort_order
    ) VALUES (
      p_company_id, v_po_id, v_item.id,
      v_item.description, v_item.quantity, v_item.unit_price, 
      COALESCE(v_item.vat_rate, 22), 0, 
      COALESCE(v_item.unit_of_measure, 'pz'), v_item.sort_order
    );
    
    -- Mark order item as ordered
    UPDATE order_items SET status = 'ordinato' WHERE id = v_item.id;
  END LOOP;

  RETURN v_po_id;
END;
$$;
