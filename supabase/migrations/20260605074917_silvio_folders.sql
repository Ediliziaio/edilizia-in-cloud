-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Silvio AI — Cartelle/Progetti per le conversazioni (stile ChatGPT Projects).
CREATE TABLE IF NOT EXISTS public.silvio_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT 'orange',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_silvio_folders_user ON public.silvio_folders(user_id, position);

ALTER TABLE public.silvio_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS silvio_folders_owner ON public.silvio_folders;
CREATE POLICY silvio_folders_owner ON public.silvio_folders FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()) AND company_id = get_my_company_id());

ALTER TABLE public.internal_chat_channels
  ADD COLUMN IF NOT EXISTS silvio_folder_id uuid REFERENCES public.silvio_folders(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.silvio_lista_cartelle()
RETURNS TABLE (id uuid, nome text, colore text, posizione integer, n_conversazioni integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.id, f.name, f.color, f.position,
         COALESCE((SELECT COUNT(*) FROM public.internal_chat_channels c
                    WHERE c.silvio_folder_id = f.id), 0)::int
    FROM public.silvio_folders f
   WHERE f.user_id = auth.uid()
   ORDER BY f.position ASC, f.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION public.silvio_crea_cartella(p_nome text, p_colore text DEFAULT 'orange')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); v_company uuid; v_id uuid; v_pos int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
  SELECT company_id INTO v_company FROM public.profiles WHERE id = v_user;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Profilo senza azienda'; END IF;
  SELECT COALESCE(MAX(position), -1) + 1 INTO v_pos FROM public.silvio_folders WHERE user_id = v_user;
  INSERT INTO public.silvio_folders(company_id, user_id, name, color, position)
  VALUES (v_company, v_user, left(COALESCE(NULLIF(trim(p_nome), ''), 'Nuova cartella'), 80),
          COALESCE(NULLIF(trim(p_colore), ''), 'orange'), v_pos)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.silvio_rinomina_cartella(p_id uuid, p_nome text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.silvio_folders
     SET name = left(COALESCE(NULLIF(trim(p_nome), ''), 'Cartella'), 80)
   WHERE id = p_id AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.silvio_elimina_cartella(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.silvio_folders WHERE id = p_id AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.silvio_sposta_conversazione(p_channel_id uuid, p_folder_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_folder_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.silvio_folders WHERE id = p_folder_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Cartella non trovata o non autorizzata';
  END IF;
  UPDATE public.internal_chat_channels
     SET silvio_folder_id = p_folder_id
   WHERE id = p_channel_id
     AND name = 'silvio-ai'
     AND dm_user_ids @> ARRAY[auth.uid(), '00000000-0000-0000-0000-000000000002'::uuid];
END;
$$;

DROP FUNCTION IF EXISTS public.silvio_lista_conversazioni();
CREATE FUNCTION public.silvio_lista_conversazioni()
RETURNS TABLE (id uuid, titolo text, ultimo_messaggio_at timestamptz, n_messaggi integer, pinned boolean, folder_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id,
         COALESCE(NULLIF(c.description, ''), 'Conversazione') AS titolo,
         COALESCE(MAX(m.created_at), c.created_at) AS ultimo_messaggio_at,
         COALESCE(COUNT(m.id), 0)::int AS n_messaggi,
         COALESCE(c.silvio_pinned, false) AS pinned,
         c.silvio_folder_id AS folder_id
    FROM public.internal_chat_channels c
    LEFT JOIN public.internal_chat_messages m ON m.channel_id = c.id
   WHERE c.name = 'silvio-ai'
     AND c.is_dm = true
     AND c.dm_user_ids @> ARRAY[auth.uid(), '00000000-0000-0000-0000-000000000002'::uuid]
     AND COALESCE(c.description, '') NOT LIKE 'Silvio —%'
   GROUP BY c.id, c.description, c.created_at, c.silvio_pinned, c.silvio_folder_id
   ORDER BY c.silvio_pinned DESC, ultimo_messaggio_at DESC;
$$;

REVOKE ALL ON FUNCTION public.silvio_lista_cartelle()                 FROM public, anon;
REVOKE ALL ON FUNCTION public.silvio_crea_cartella(text, text)        FROM public, anon;
REVOKE ALL ON FUNCTION public.silvio_rinomina_cartella(uuid, text)    FROM public, anon;
REVOKE ALL ON FUNCTION public.silvio_elimina_cartella(uuid)           FROM public, anon;
REVOKE ALL ON FUNCTION public.silvio_sposta_conversazione(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.silvio_lista_conversazioni()            FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_lista_cartelle()                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_crea_cartella(text, text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_rinomina_cartella(uuid, text)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_elimina_cartella(uuid)           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_sposta_conversazione(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_lista_conversazioni()            TO authenticated, service_role;
