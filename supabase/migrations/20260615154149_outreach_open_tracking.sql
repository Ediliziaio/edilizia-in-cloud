-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.outreach_send_queue
  ADD COLUMN IF NOT EXISTS opened_at  timestamptz,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.outreach_sequences
  ADD COLUMN IF NOT EXISTS track_opens boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.outreach_register_open(p_queue_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.outreach_send_queue
     SET open_count = open_count + 1,
         opened_at  = COALESCE(opened_at, now())
   WHERE id = p_queue_id;
$$;

REVOKE ALL ON FUNCTION public.outreach_register_open(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.outreach_register_open(uuid) TO service_role;
