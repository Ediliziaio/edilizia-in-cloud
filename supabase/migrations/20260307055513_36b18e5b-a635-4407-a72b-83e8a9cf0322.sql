-- Block B: Add security/advanced columns to ai_agents
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS domain_whitelist text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS require_auth boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rate_limit_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS conversation_timeout integer DEFAULT 300,
  ADD COLUMN IF NOT EXISTS max_duration integer DEFAULT 1800,
  ADD COLUMN IF NOT EXISTS error_message text DEFAULT 'Mi scusi, si è verificato un errore. Riproviamo.',
  ADD COLUMN IF NOT EXISTS auto_end_on_silence boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS silence_timeout integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS tools_config jsonb DEFAULT '{}';
