-- FASE 3: Tabelle per Verifica AI Ordini d'Acquisto
-- Masterprompt OdA 2.0

-- 3.1 purchase_order_verifications
CREATE TABLE IF NOT EXISTS public.purchase_order_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,

  -- Stato verifica
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','error','needs_review')),

  -- Risultato globale
  result TEXT CHECK (result IN ('match','mismatch','partial_match')),
  confidence_score NUMERIC(5,2),
  overall_summary TEXT,

  -- Documenti input
  client_document_url TEXT,
  client_document_type TEXT,
  supplier_document_url TEXT NOT NULL,
  supplier_document_type TEXT NOT NULL,

  -- Contatori
  total_items_checked INTEGER DEFAULT 0,
  items_matched INTEGER DEFAULT 0,
  items_mismatched INTEGER DEFAULT 0,
  items_missing INTEGER DEFAULT 0,
  items_extra INTEGER DEFAULT 0,

  -- AI metadata
  ai_model TEXT DEFAULT 'claude-sonnet-4-20250514',
  ai_tokens_used INTEGER,
  ai_raw_response JSONB,
  processing_time_ms INTEGER,

  -- Audit
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.2 verification_discrepancies
CREATE TABLE IF NOT EXISTS public.verification_discrepancies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id UUID NOT NULL REFERENCES public.purchase_order_verifications(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Tipo di discrepanza
  discrepancy_type TEXT NOT NULL CHECK (discrepancy_type IN (
    'quantity_mismatch',
    'measurement_mismatch',
    'material_mismatch',
    'color_mismatch',
    'model_mismatch',
    'accessory_missing',
    'accessory_extra',
    'price_mismatch',
    'item_missing',
    'item_extra',
    'specification_mismatch',
    'delivery_mismatch',
    'other'
  )),

  -- Severita
  severity TEXT NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('critical','warning','info')),

  -- Dettaglio articolo
  item_reference TEXT,
  field_name TEXT,

  -- Valori confronto
  expected_value TEXT,
  actual_value TEXT,
  expected_source TEXT,
  actual_source TEXT,

  -- AI explanation
  ai_explanation TEXT,
  ai_suggestion TEXT,
  ai_confidence NUMERIC(5,2),

  -- Risoluzione
  resolution_status TEXT DEFAULT 'open'
    CHECK (resolution_status IN ('open','accepted','rejected','resolved')),
  resolution_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.3 Colonna aggiuntiva su purchase_orders
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS last_verification_id UUID
    REFERENCES public.purchase_order_verifications(id) ON DELETE SET NULL;

-- 3.4 RLS
ALTER TABLE public.purchase_order_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_discrepancies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pov_tenant_select" ON public.purchase_order_verifications
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "pov_tenant_insert" ON public.purchase_order_verifications
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "pov_tenant_update" ON public.purchase_order_verifications
  FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "vd_tenant_select" ON public.verification_discrepancies
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "vd_tenant_insert" ON public.verification_discrepancies
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "vd_tenant_update" ON public.verification_discrepancies
  FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

-- 3.5 Indici
CREATE INDEX idx_pov_po ON purchase_order_verifications(purchase_order_id);
CREATE INDEX idx_pov_order ON purchase_order_verifications(order_id);
CREATE INDEX idx_pov_status ON purchase_order_verifications(company_id, status);
CREATE INDEX idx_vd_verification ON verification_discrepancies(verification_id);
CREATE INDEX idx_vd_type ON verification_discrepancies(discrepancy_type);
CREATE INDEX idx_vd_severity ON verification_discrepancies(severity);

-- company_ai_usage
CREATE TABLE IF NOT EXISTS public.company_ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  month TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  usage_limit INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_cost_eur NUMERIC(8,4) DEFAULT 0,
  UNIQUE(company_id, feature, month)
);

ALTER TABLE public.company_ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cau_tenant_select" ON public.company_ai_usage
  FOR SELECT USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "cau_tenant_insert" ON public.company_ai_usage
  FOR INSERT WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "cau_tenant_update" ON public.company_ai_usage
  FOR UPDATE USING (company_id = get_user_company_id(auth.uid()));

-- updated_at trigger for purchase_order_verifications
CREATE OR REPLACE FUNCTION public.handle_pov_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_pov_updated_at
  BEFORE UPDATE ON public.purchase_order_verifications
  FOR EACH ROW EXECUTE FUNCTION public.handle_pov_updated_at();
