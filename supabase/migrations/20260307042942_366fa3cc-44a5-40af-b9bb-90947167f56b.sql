
-- Add missing table: ai_agent_phone_numbers
CREATE TABLE public.ai_agent_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  elevenlabs_phone_id TEXT,
  phone_number TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'twilio',
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_agent_phone_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company phone numbers"
  ON public.ai_agent_phone_numbers FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "Users can insert own company phone numbers"
  ON public.ai_agent_phone_numbers FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_my_company_id());

CREATE POLICY "Users can update own company phone numbers"
  ON public.ai_agent_phone_numbers FOR UPDATE TO authenticated
  USING (company_id = public.get_my_company_id());

CREATE POLICY "Users can delete own company phone numbers"
  ON public.ai_agent_phone_numbers FOR DELETE TO authenticated
  USING (company_id = public.get_my_company_id());

-- Add missing columns to ai_agent_credits
ALTER TABLE public.ai_agent_credits
  ADD COLUMN IF NOT EXISTS cost_per_minute_platform NUMERIC NOT NULL DEFAULT 0.08,
  ADD COLUMN IF NOT EXISTS cost_per_minute_billed NUMERIC NOT NULL DEFAULT 0.16;
