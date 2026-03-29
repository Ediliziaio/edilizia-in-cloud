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
