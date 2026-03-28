-- 4. ai_chat_sessions
CREATE TABLE public.ai_chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents_v2(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  canale text NOT NULL DEFAULT 'web',
  stato text NOT NULL DEFAULT 'attiva',
  metadata jsonb,
  iniziata_il timestamptz NOT NULL DEFAULT now(),
  terminata_il timestamptz,
  messaggi_totali integer NOT NULL DEFAULT 0,
  durata_secondi integer NOT NULL DEFAULT 0
);
