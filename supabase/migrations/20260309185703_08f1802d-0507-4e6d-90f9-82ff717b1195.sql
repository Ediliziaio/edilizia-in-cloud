
-- =============================================
-- STEP 1: Scadenzario Unificato + Prima Nota
-- =============================================

-- 1A. Tabella SCADENZE (scadenzario unificato)
CREATE TABLE public.scadenze (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  
  -- Tipo scadenza
  tipo TEXT NOT NULL CHECK (tipo IN ('incasso_cliente', 'pagamento_fornitore', 'costo_aziendale', 'scadenza_fiscale')),
  
  -- Direzione generata automaticamente
  direction TEXT GENERATED ALWAYS AS (
    CASE 
      WHEN tipo = 'incasso_cliente' THEN 'entrata'
      ELSE 'uscita'
    END
  ) STORED,
  
  -- Dati principali
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  
  -- Status workflow
  status TEXT NOT NULL DEFAULT 'da_pagare' CHECK (status IN ('da_pagare', 'pagata', 'parziale', 'annullata')),
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_date DATE,
  payment_method TEXT,
  
  -- Collegamenti opzionali
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  cost_id UUID REFERENCES public.company_costs(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  
  -- Metadati
  notes TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_rule TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indici scadenze
CREATE INDEX idx_scadenze_company_id ON public.scadenze(company_id);
CREATE INDEX idx_scadenze_due_date ON public.scadenze(company_id, due_date);
CREATE INDEX idx_scadenze_status ON public.scadenze(company_id, status);
CREATE INDEX idx_scadenze_tipo ON public.scadenze(company_id, tipo);
CREATE INDEX idx_scadenze_invoice ON public.scadenze(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_scadenze_supplier ON public.scadenze(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX idx_scadenze_cost ON public.scadenze(cost_id) WHERE cost_id IS NOT NULL;

-- RLS scadenze
ALTER TABLE public.scadenze ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scadenze_tenant_select" ON public.scadenze
  FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "scadenze_tenant_insert" ON public.scadenze
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "scadenze_tenant_update" ON public.scadenze
  FOR UPDATE TO authenticated
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "scadenze_tenant_delete" ON public.scadenze
  FOR DELETE TO authenticated
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

-- Super admin access
CREATE POLICY "scadenze_super_admin" ON public.scadenze
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- 1B. Tabella PRIMA_NOTA_ENTRIES
CREATE TABLE public.prima_nota_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  
  -- Dati movimento
  direction TEXT NOT NULL CHECK (direction IN ('entrata', 'uscita')),
  category TEXT NOT NULL DEFAULT 'altro',
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Metodo e riferimenti
  payment_method TEXT,
  reference_number TEXT,
  
  -- Collegamenti opzionali
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  cost_id UUID REFERENCES public.company_costs(id) ON DELETE SET NULL,
  scadenza_id UUID REFERENCES public.scadenze(id) ON DELETE SET NULL,
  
  -- Auto-generated vs manual
  is_auto BOOLEAN NOT NULL DEFAULT false,
  auto_source TEXT, -- 'invoice_payment', 'cost_payment', 'scadenza_payment'
  
  -- Allegato
  attachment_url TEXT,
  attachment_name TEXT,
  
  -- Metadati
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indici prima_nota
CREATE INDEX idx_prima_nota_company_id ON public.prima_nota_entries(company_id);
CREATE INDEX idx_prima_nota_date ON public.prima_nota_entries(company_id, entry_date);
CREATE INDEX idx_prima_nota_direction ON public.prima_nota_entries(company_id, direction);
CREATE INDEX idx_prima_nota_category ON public.prima_nota_entries(company_id, category);
CREATE INDEX idx_prima_nota_scadenza ON public.prima_nota_entries(scadenza_id) WHERE scadenza_id IS NOT NULL;

-- RLS prima_nota
ALTER TABLE public.prima_nota_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prima_nota_tenant_select" ON public.prima_nota_entries
  FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "prima_nota_tenant_insert" ON public.prima_nota_entries
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "prima_nota_tenant_update" ON public.prima_nota_entries
  FOR UPDATE TO authenticated
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "prima_nota_tenant_delete" ON public.prima_nota_entries
  FOR DELETE TO authenticated
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "prima_nota_super_admin" ON public.prima_nota_entries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- =============================================
-- 1C. FUNZIONI RPC
-- =============================================

-- Segna scadenza come pagata (totale o parziale)
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

-- Saldo Prima Nota (entrate, uscite, netto) con filtro date opzionale
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
  v_entrate NUMERIC;
  v_uscite NUMERIC;
BEGIN
  -- Verify access
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND company_id = p_company_id)
     AND NOT has_role(auth.uid(), 'super_admin') THEN
    RETURN json_build_object('error', 'Accesso negato');
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'entrata' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'uscita' THEN amount ELSE 0 END), 0)
  INTO v_entrate, v_uscite
  FROM prima_nota_entries
  WHERE company_id = p_company_id
    AND (p_from_date IS NULL OR entry_date >= p_from_date)
    AND (p_to_date IS NULL OR entry_date <= p_to_date);

  RETURN json_build_object(
    'entrate', v_entrate,
    'uscite', v_uscite,
    'saldo', v_entrate - v_uscite
  );
END;
$$;

-- Summary scadenzario per KPI cards
CREATE OR REPLACE FUNCTION public.get_scadenzario_summary(
  p_company_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Verify access
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND company_id = p_company_id)
     AND NOT has_role(auth.uid(), 'super_admin') THEN
    RETURN json_build_object('error', 'Accesso negato');
  END IF;

  SELECT json_build_object(
    'scadute_count', COUNT(*) FILTER (WHERE status IN ('da_pagare','parziale') AND due_date < CURRENT_DATE),
    'scadute_amount', COALESCE(SUM(amount - paid_amount) FILTER (WHERE status IN ('da_pagare','parziale') AND due_date < CURRENT_DATE), 0),
    'questa_settimana_count', COUNT(*) FILTER (WHERE status IN ('da_pagare','parziale') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7),
    'questa_settimana_amount', COALESCE(SUM(amount - paid_amount) FILTER (WHERE status IN ('da_pagare','parziale') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7), 0),
    'prossimi_30gg_count', COUNT(*) FILTER (WHERE status IN ('da_pagare','parziale') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30),
    'prossimi_30gg_amount', COALESCE(SUM(amount - paid_amount) FILTER (WHERE status IN ('da_pagare','parziale') AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30), 0),
    'entrate_attese', COALESCE(SUM(amount - paid_amount) FILTER (WHERE status IN ('da_pagare','parziale') AND direction = 'entrata'), 0),
    'uscite_attese', COALESCE(SUM(amount - paid_amount) FILTER (WHERE status IN ('da_pagare','parziale') AND direction = 'uscita'), 0)
  ) INTO v_result
  FROM scadenze
  WHERE company_id = p_company_id;

  RETURN v_result;
END;
$$;

-- Check e aggiorna scadenze scadute (per cron o trigger)
CREATE OR REPLACE FUNCTION public.check_overdue_scadenze()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Nessun aggiornamento di status necessario: lo stato resta 'da_pagare'
  -- Questa funzione conta le scadenze scadute non pagate per monitoring
  SELECT COUNT(*) INTO v_count
  FROM scadenze
  WHERE status IN ('da_pagare', 'parziale')
    AND due_date < CURRENT_DATE;
  
  RETURN v_count;
END;
$$;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_scadenze_updated_at
  BEFORE UPDATE ON public.scadenze
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();

CREATE TRIGGER trg_prima_nota_updated_at
  BEFORE UPDATE ON public.prima_nota_entries
  FOR EACH ROW EXECUTE FUNCTION public.trigger_set_updated_at();
