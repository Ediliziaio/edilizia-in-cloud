-- FIX 4: Add send_confirmation_after_booking to ai_agents
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS send_confirmation_after_booking boolean NOT NULL DEFAULT true;
