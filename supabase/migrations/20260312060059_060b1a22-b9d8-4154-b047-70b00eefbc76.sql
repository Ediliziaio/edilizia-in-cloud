
-- Table: virtual_phone_numbers
CREATE TABLE public.virtual_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL UNIQUE,
  friendly_name TEXT,
  telnyx_phone_id TEXT,
  country_code TEXT DEFAULT 'IT',
  number_type TEXT DEFAULT 'local',
  capabilities JSONB DEFAULT '{"sms": true, "voice": false}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  monthly_cost_eur NUMERIC(10,4) DEFAULT 0,
  purchased_at TIMESTAMPTZ DEFAULT now(),
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_virtual_phone_numbers_company ON public.virtual_phone_numbers(company_id);
CREATE INDEX idx_virtual_phone_numbers_telnyx_id ON public.virtual_phone_numbers(telnyx_phone_id);

ALTER TABLE public.virtual_phone_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company phone numbers"
  ON public.virtual_phone_numbers FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "Admins can insert company phone numbers"
  ON public.virtual_phone_numbers FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "Admins can update company phone numbers"
  ON public.virtual_phone_numbers FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "Admins can delete company phone numbers"
  ON public.virtual_phone_numbers FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "Super admins full access virtual_phone_numbers"
  ON public.virtual_phone_numbers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Table: phone_number_sms_usage
CREATE TABLE public.phone_number_sms_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id UUID NOT NULL REFERENCES public.virtual_phone_numbers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  sms_sent INTEGER DEFAULT 0,
  sms_received INTEGER DEFAULT 0,
  cost_eur NUMERIC(10,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_phone_sms_usage_number ON public.phone_number_sms_usage(phone_number_id);
CREATE INDEX idx_phone_sms_usage_company ON public.phone_number_sms_usage(company_id);
CREATE INDEX idx_phone_sms_usage_period ON public.phone_number_sms_usage(period_start);

ALTER TABLE public.phone_number_sms_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company sms usage"
  ON public.phone_number_sms_usage FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "Super admins full access phone_number_sms_usage"
  ON public.phone_number_sms_usage FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
