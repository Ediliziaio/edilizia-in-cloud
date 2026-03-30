-- 3. ai_agent_conversations
CREATE TABLE IF NOT EXISTS public.ai_agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  elevenlabs_conversation_id text,
  duration_seconds integer NOT NULL DEFAULT 0,
  messages_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  started_at timestamptz NOT NULL DEFAULT now(),
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  appointment_created boolean NOT NULL DEFAULT false
);
