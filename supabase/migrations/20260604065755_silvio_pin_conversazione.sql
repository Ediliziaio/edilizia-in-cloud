-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- #12 Pin conversazioni (sincronizzato server-side). Ogni canale silvio-ai è un
-- DM utente↔Silvio → il flag è di fatto per-utente. Additivo.
ALTER TABLE public.internal_chat_channels
  ADD COLUMN IF NOT EXISTS silvio_pinned boolean NOT NULL DEFAULT false;

-- Ricreo la lista (aggiunge colonna `pinned` + ordina i fissati in cima).
DROP FUNCTION IF EXISTS public.silvio_lista_conversazioni();
CREATE FUNCTION public.silvio_lista_conversazioni()
RETURNS TABLE (id uuid, titolo text, ultimo_messaggio_at timestamptz, n_messaggi integer, pinned boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id,
         COALESCE(NULLIF(c.description, ''), 'Conversazione') AS titolo,
         COALESCE(MAX(m.created_at), c.created_at) AS ultimo_messaggio_at,
         COALESCE(COUNT(m.id), 0)::int AS n_messaggi,
         COALESCE(c.silvio_pinned, false) AS pinned
    FROM public.internal_chat_channels c
    LEFT JOIN public.internal_chat_messages m ON m.channel_id = c.id
   WHERE c.name = 'silvio-ai'
     AND c.is_dm = true
     AND c.dm_user_ids @> ARRAY[auth.uid(), '00000000-0000-0000-0000-000000000002'::uuid]
     AND COALESCE(c.description, '') NOT LIKE 'Silvio —%'
   GROUP BY c.id, c.description, c.created_at, c.silvio_pinned
   ORDER BY c.silvio_pinned DESC, ultimo_messaggio_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.silvio_pin_conversazione(p_channel_id uuid, p_pinned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.internal_chat_channels
     SET silvio_pinned = COALESCE(p_pinned, false)
   WHERE id = p_channel_id
     AND name = 'silvio-ai'
     AND dm_user_ids @> ARRAY[auth.uid(), '00000000-0000-0000-0000-000000000002'::uuid];
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_lista_conversazioni()              FROM public, anon;
REVOKE ALL ON FUNCTION public.silvio_pin_conversazione(uuid, boolean)   FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_lista_conversazioni()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_pin_conversazione(uuid, boolean) TO authenticated, service_role;
