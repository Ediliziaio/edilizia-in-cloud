-- 2. Add Telnyx columns to ai_agent_phone_numbers
ALTER TABLE public.ai_agent_phone_numbers
  ADD COLUMN IF NOT EXISTS telnyx_phone_id text,
  ADD COLUMN IF NOT EXISTS elevenlabs_phone_number_id text,
  ADD COLUMN IF NOT EXISTS monthly_cost_eur numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capabilities jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS telnyx_connection_id text,
  ADD COLUMN IF NOT EXISTS is_inbound_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_outbound_enabled boolean DEFAULT true;
