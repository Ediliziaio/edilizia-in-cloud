-- 4. ai_agent_credits
CREATE TABLE IF NOT EXISTS public.ai_agent_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  total_minutes_purchased numeric NOT NULL DEFAULT 0,
  minutes_used numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
