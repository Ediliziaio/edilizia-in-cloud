-- 5. ALTER ai_agent_phone_numbers for Smart Routing
ALTER TABLE public.ai_agent_phone_numbers
  ADD COLUMN IF NOT EXISTS routing_mode TEXT NOT NULL DEFAULT 'marketing',
  ADD COLUMN IF NOT EXISTS internal_agent_id UUID REFERENCES public.internal_ai_agents(id);
