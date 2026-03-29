-- FIX 2: Add call_direction to ai_agent_conversations
ALTER TABLE public.ai_agent_conversations
  ADD COLUMN IF NOT EXISTS call_direction text NOT NULL DEFAULT 'inbound';
