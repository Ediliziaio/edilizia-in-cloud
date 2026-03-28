-- 5. ai_chat_messages
CREATE TABLE public.ai_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
  ruolo text NOT NULL DEFAULT 'user',
  contenuto text NOT NULL,
  metadata jsonb,
  creato_il timestamptz NOT NULL DEFAULT now()
);
