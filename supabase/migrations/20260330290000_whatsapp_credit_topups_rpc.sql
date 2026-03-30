-- S2.3 — whatsapp_credit_topups + RPC atomiche WA

CREATE TABLE IF NOT EXISTS public.whatsapp_credit_topups (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  amount_eur               NUMERIC(10,4) NOT NULL,
  type                     TEXT NOT NULL DEFAULT 'manual'
                           CHECK (type IN ('manual','auto','bonus','refund')),
  status                   TEXT NOT NULL DEFAULT 'completed'
                           CHECK (status IN ('pending','completed','failed','refunded')),
  payment_method           TEXT,
  invoice_number           TEXT,
  stripe_payment_intent_id TEXT,
  notes                    TEXT,
  triggered_by             UUID REFERENCES auth.users(id),
  processed_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_topups_company ON public.whatsapp_credit_topups(company_id);
ALTER TABLE public.whatsapp_credit_topups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_wa_topups" ON public.whatsapp_credit_topups FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE OR REPLACE FUNCTION public.deduct_whatsapp_credits_with_log(
  p_company_id UUID, p_cost NUMERIC, p_description TEXT DEFAULT NULL,
  p_campaign_id UUID DEFAULT NULL, p_metadata JSONB DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_before NUMERIC; v_after NUMERIC;
BEGIN
  SELECT balance_eur INTO v_before FROM public.whatsapp_credits
  WHERE company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet WA non trovato'; END IF;
  IF v_before < p_cost THEN RAISE EXCEPTION 'Crediti WA insufficienti: % < %', v_before, p_cost; END IF;
  v_after := ROUND(v_before - p_cost, 4);
  UPDATE public.whatsapp_credits SET
    balance_eur = v_after, total_spent_eur = total_spent_eur + p_cost,
    sends_blocked = CASE WHEN v_after <= 0 THEN true ELSE sends_blocked END,
    updated_at = now()
  WHERE company_id = p_company_id;
  INSERT INTO public.whatsapp_credits_log
    (company_id, amount_eur, balance_before, balance_after, type, description, campaign_id, metadata)
  VALUES (p_company_id, -p_cost, v_before, v_after, 'deduct', p_description, p_campaign_id, p_metadata);
  RETURN json_build_object('balance_before', v_before, 'balance_after', v_after);
END; $$;

CREATE OR REPLACE FUNCTION public.add_whatsapp_credits_with_log(
  p_company_id UUID, p_amount NUMERIC, p_type TEXT DEFAULT 'topup',
  p_description TEXT DEFAULT NULL, p_metadata JSONB DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_before NUMERIC := 0; v_after NUMERIC;
BEGIN
  INSERT INTO public.whatsapp_credits (company_id, balance_eur) VALUES (p_company_id, 0)
  ON CONFLICT (company_id) DO NOTHING;
  SELECT balance_eur INTO v_before FROM public.whatsapp_credits
  WHERE company_id = p_company_id FOR UPDATE;
  v_after := ROUND(v_before + p_amount, 4);
  UPDATE public.whatsapp_credits SET
    balance_eur = v_after, total_recharged_eur = total_recharged_eur + p_amount,
    sends_blocked = false, updated_at = now()
  WHERE company_id = p_company_id;
  INSERT INTO public.whatsapp_credits_log
    (company_id, amount_eur, balance_before, balance_after, type, description, metadata)
  VALUES (p_company_id, p_amount, v_before, v_after, p_type, p_description, p_metadata);
  RETURN json_build_object('balance_before', v_before, 'balance_after', v_after);
END; $$;
