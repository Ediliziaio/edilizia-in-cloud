-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- #10 Streaming step agentici (additivo, isolato dalla generazione).
-- L'edge silvio-chat scrive qui (service_role) un passo per ogni tool eseguito;
-- il frontend li mostra live via realtime sotto "Silvio sta pensando".
CREATE TABLE IF NOT EXISTS public.silvio_tool_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL,
  company_id uuid,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS silvio_tool_steps_channel_idx
  ON public.silvio_tool_steps (channel_id, created_at);

ALTER TABLE public.silvio_tool_steps ENABLE ROW LEVEL SECURITY;

-- Lettura: solo i membri del canale DM (utente ↔ Silvio). Scrittura: solo edge (service_role, bypassa RLS).
DROP POLICY IF EXISTS silvio_tool_steps_read ON public.silvio_tool_steps;
CREATE POLICY silvio_tool_steps_read ON public.silvio_tool_steps
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.internal_chat_channels c
     WHERE c.id = silvio_tool_steps.channel_id
       AND c.dm_user_ids @> ARRAY[auth.uid()]
  ));

GRANT SELECT ON public.silvio_tool_steps TO authenticated, service_role;

-- Realtime (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'silvio_tool_steps'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.silvio_tool_steps;
  END IF;
END $$;
