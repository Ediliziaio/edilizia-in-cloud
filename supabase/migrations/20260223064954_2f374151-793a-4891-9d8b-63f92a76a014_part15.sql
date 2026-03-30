-- Email Billing
CREATE TABLE IF NOT EXISTS public.email_billing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  emails_sent INTEGER NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  month_reference DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
