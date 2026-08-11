-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Silvio AI — multi-conversazione (stile ChatGPT/Claude).
-- Ogni conversazione = 1 canale internal_chat_channels con name='silvio-ai'
-- (vincolo dell'edge silvio-chat, che accetta SOLO name='silvio-ai'); il TITOLO
-- della conversazione vive in `description`. Cronologia + memoria restano
-- per-channel (gestite server-side da silvio-chat) → riuso totale del motore.

-- ── Lista conversazioni dell'utente corrente ────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_lista_conversazioni()
RETURNS TABLE (id uuid, titolo text, ultimo_messaggio_at timestamptz, n_messaggi integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id,
         COALESCE(NULLIF(c.description, ''), 'Conversazione') AS titolo,
         COALESCE(MAX(m.created_at), c.created_at) AS ultimo_messaggio_at,
         COALESCE(COUNT(m.id), 0)::int AS n_messaggi
    FROM public.internal_chat_channels c
    LEFT JOIN public.internal_chat_messages m ON m.channel_id = c.id
   WHERE c.name = 'silvio-ai'
     AND c.is_dm = true
     AND c.dm_user_ids @> ARRAY[auth.uid(), '00000000-0000-0000-0000-000000000002'::uuid]
     AND COALESCE(c.description, '') NOT LIKE 'Silvio —%'
   GROUP BY c.id, c.description, c.created_at
   ORDER BY ultimo_messaggio_at DESC;
$$;

-- ── Crea una nuova conversazione (nuovo canale silvio-ai) ────────────────────
CREATE OR REPLACE FUNCTION public.silvio_crea_conversazione(p_titolo text DEFAULT 'Nuova conversazione')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_company_id uuid;
  v_silvio_id  uuid := '00000000-0000-0000-0000-000000000002';
  v_channel_id uuid;
  v_titolo     text := COALESCE(NULLIF(trim(p_titolo), ''), 'Nuova conversazione');
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Non autenticato'; END IF;
  SELECT company_id INTO v_company_id FROM public.profiles WHERE id = v_user_id;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Profilo senza azienda'; END IF;

  INSERT INTO public.internal_chat_channels (
    company_id, name, description, type, is_system, is_dm, channel_emoji,
    dm_user_ids, created_by
  ) VALUES (
    v_company_id, 'silvio-ai', left(v_titolo, 120), 'dm', true, true, '✨',
    ARRAY[v_user_id, v_silvio_id], v_user_id
  )
  RETURNING id INTO v_channel_id;

  INSERT INTO public.internal_chat_members (channel_id, user_id, company_id, role)
  VALUES (v_channel_id, v_user_id, v_company_id, 'admin')
  ON CONFLICT DO NOTHING;

  RETURN v_channel_id;
END;
$$;

-- ── Rinomina una conversazione ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_rinomina_conversazione(p_channel_id uuid, p_titolo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.internal_chat_channels
     SET description = left(COALESCE(NULLIF(trim(p_titolo), ''), 'Conversazione'), 120)
   WHERE id = p_channel_id
     AND name = 'silvio-ai'
     AND dm_user_ids @> ARRAY[auth.uid(), '00000000-0000-0000-0000-000000000002'::uuid];
END;
$$;

-- ── Elimina una conversazione (con i suoi messaggi) ──────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_elimina_conversazione(p_channel_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_owner boolean;
BEGIN
  SELECT true INTO v_owner
    FROM public.internal_chat_channels
   WHERE id = p_channel_id
     AND name = 'silvio-ai'
     AND dm_user_ids @> ARRAY[auth.uid(), '00000000-0000-0000-0000-000000000002'::uuid];
  IF NOT COALESCE(v_owner, false) THEN
    RAISE EXCEPTION 'Conversazione non trovata o non autorizzata';
  END IF;
  DELETE FROM public.internal_chat_messages WHERE channel_id = p_channel_id;
  DELETE FROM public.internal_chat_members  WHERE channel_id = p_channel_id;
  DELETE FROM public.internal_chat_channels WHERE id = p_channel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_lista_conversazioni()                       FROM public, anon;
REVOKE ALL ON FUNCTION public.silvio_crea_conversazione(text)                    FROM public, anon;
REVOKE ALL ON FUNCTION public.silvio_rinomina_conversazione(uuid, text)          FROM public, anon;
REVOKE ALL ON FUNCTION public.silvio_elimina_conversazione(uuid)                 FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_lista_conversazioni()                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_crea_conversazione(text)                 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_rinomina_conversazione(uuid, text)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_elimina_conversazione(uuid)              TO authenticated, service_role;
