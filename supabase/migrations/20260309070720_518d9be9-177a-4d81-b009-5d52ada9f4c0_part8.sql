-- =============================================
-- 4. SLA tracking on support_conversations
-- =============================================
ALTER TABLE public.support_conversations
  ADD COLUMN IF NOT EXISTS sla_response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_resolution_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_response_breached boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_resolution_breached boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id);
