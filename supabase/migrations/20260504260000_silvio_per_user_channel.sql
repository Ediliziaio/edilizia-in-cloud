-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-05 — Silvio: canale privato PER UTENTE (1:1 DM con AI)
-- ════════════════════════════════════════════════════════════════════════════
-- Refactor: invece di un canale gruppo "silvio-ai" con tutti i membri,
-- ogni utente ha il PROPRIO canale privato 1:1 con Silvio.
--
-- Caratteristiche:
--   • is_dm=true, is_system=true
--   • dm_user_ids = [user_id, SILVIO_SENDER_ID]
--   • UN solo membro umano (l'owner)
--   • Storia conversazioni privata: l'utente vede solo le SUE chat con Silvio
--   • Il SuperAdmin può comunque ispezionare via RLS admin policy
--
-- Migration steps:
--   1. Cancella i canali silvio-ai gruppo (con cascading messages/members)
--   2. RPC ensure_user_silvio_channel(user_id) che crea/ritorna il canale dell'utente
--   3. Bootstrap: un canale per ogni profilo esistente
--   4. Trigger: su profile INSERT → auto-create canale Silvio
-- ════════════════════════════════════════════════════════════════════════════

-- Le colonne DM vengono introdotte anche dalla migration Chat Team futura
-- (20260721000000_chat_lucia_schema), ma Silvio le usa gia' qui. Rendiamo
-- quindi questa migration auto-contenuta per database puliti.
ALTER TABLE public.internal_chat_channels
  ADD COLUMN IF NOT EXISTS is_dm         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_private    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_system     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS channel_emoji TEXT,
  ADD COLUMN IF NOT EXISTS dm_user_ids   UUID[] DEFAULT '{}';

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Cancella i canali silvio-ai gruppo precedenti
--    (CASCADE su messages/members tramite FK ON DELETE CASCADE)
-- ───────────────────────────────────────────────────────────────────────────

DELETE FROM public.internal_chat_channels
 WHERE name = 'silvio-ai'
   AND (is_dm IS NOT TRUE);

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Modifica create_default_chat_channels: NON crea più silvio-ai gruppo
--    (la creazione passa al trigger per-utente più sotto)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_default_chat_channels(p_company_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_channel_id UUID;
  v_creator_id UUID;
  v_user_ids UUID[];
BEGIN
  SELECT id INTO v_creator_id FROM profiles WHERE company_id = p_company_id LIMIT 1;
  IF v_creator_id IS NULL THEN RETURN; END IF;

  SELECT ARRAY_AGG(id) INTO v_user_ids FROM profiles WHERE company_id = p_company_id;

  -- generale (gruppo)
  IF NOT EXISTS (
    SELECT 1 FROM internal_chat_channels
    WHERE company_id = p_company_id AND name = 'generale'
  ) THEN
    INSERT INTO internal_chat_channels (company_id, name, description, type, is_system, channel_emoji, created_by)
    VALUES (p_company_id, 'generale', 'Canale generale per tutta l''azienda', 'group', true, '🏢', v_creator_id)
    RETURNING id INTO v_channel_id;
    INSERT INTO internal_chat_members (channel_id, user_id, company_id, role)
    SELECT v_channel_id, unnest(v_user_ids), p_company_id, 'member'
    ON CONFLICT DO NOTHING;
  END IF;

  -- operativo (gruppo)
  IF NOT EXISTS (
    SELECT 1 FROM internal_chat_channels
    WHERE company_id = p_company_id AND name = 'operativo'
  ) THEN
    INSERT INTO internal_chat_channels (company_id, name, description, type, is_system, channel_emoji, created_by)
    VALUES (p_company_id, 'operativo', 'Coordinamento operativo cantieri e lavori', 'group', true, '🏗️', v_creator_id)
    RETURNING id INTO v_channel_id;
    INSERT INTO internal_chat_members (channel_id, user_id, company_id, role)
    SELECT v_channel_id, unnest(v_user_ids), p_company_id, 'member'
    ON CONFLICT DO NOTHING;
  END IF;

  -- lucia-ai (legacy gruppo, mantenuto)
  IF NOT EXISTS (
    SELECT 1 FROM internal_chat_channels
    WHERE company_id = p_company_id AND name = 'lucia-ai'
  ) THEN
    INSERT INTO internal_chat_channels (company_id, name, description, type, is_system, channel_emoji, created_by)
    VALUES (p_company_id, 'lucia-ai', 'Chatta con Lucia, il tuo assistente AI aziendale', 'group', true, '🤖', v_creator_id)
    RETURNING id INTO v_channel_id;
    INSERT INTO internal_chat_members (channel_id, user_id, company_id, role)
    SELECT v_channel_id, unnest(v_user_ids), p_company_id, 'member'
    ON CONFLICT DO NOTHING;
  END IF;

  -- silvio-ai NON creato qui (per-user, vedi ensure_user_silvio_channel)
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) RPC: ensure_user_silvio_channel — crea (o ritorna) il canale 1:1 dell'utente
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ensure_user_silvio_channel(p_user_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := COALESCE(p_user_id, auth.uid());
  v_company_id uuid;
  v_channel_id uuid;
  v_silvio_id  uuid := '00000000-0000-0000-0000-000000000002';
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id obbligatorio' USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO v_company_id FROM public.profiles WHERE id = v_user_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Profilo senza azienda' USING ERRCODE = '42501';
  END IF;

  -- Cerca canale esistente per questo utente
  SELECT c.id INTO v_channel_id
    FROM public.internal_chat_channels c
   WHERE c.company_id = v_company_id
     AND c.name = 'silvio-ai'
     AND c.is_dm = true
     AND c.dm_user_ids @> ARRAY[v_user_id, v_silvio_id]
   LIMIT 1;

  IF v_channel_id IS NOT NULL THEN
    RETURN v_channel_id;
  END IF;

  -- Crea il canale DM personale
  INSERT INTO public.internal_chat_channels (
    company_id, name, description, type, is_system, is_dm, channel_emoji,
    dm_user_ids, created_by
  ) VALUES (
    v_company_id, 'silvio-ai',
    'Silvio — il tuo assistente AI personale. Conosce CFO, PM, Sales, Tecnico, HR e tutta l''azienda.',
    'dm', true, true, '✨',
    ARRAY[v_user_id, v_silvio_id], v_user_id
  )
  RETURNING id INTO v_channel_id;

  -- Aggiungi solo l'utente come membro (Silvio è virtuale, non in members)
  INSERT INTO public.internal_chat_members (channel_id, user_id, company_id, role)
  VALUES (v_channel_id, v_user_id, v_company_id, 'admin')
  ON CONFLICT DO NOTHING;

  RETURN v_channel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_silvio_channel(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ensure_user_silvio_channel(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.ensure_user_silvio_channel IS
  'Crea/ritorna il canale DM 1:1 tra utente e Silvio. Idempotente.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Bootstrap: un canale Silvio per ogni profilo esistente
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_profile_id uuid;
  v_count int := 0;
BEGIN
  FOR v_profile_id IN
    SELECT id FROM public.profiles
     WHERE company_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.ensure_user_silvio_channel(v_profile_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skip profile % (errore: %)', v_profile_id, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Silvio per-user bootstrap: % canali creati', v_count;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Trigger: auto-create Silvio channel quando un nuovo profile viene creato
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auto_create_silvio_channel_for_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NOT NULL THEN
    BEGIN
      PERFORM public.ensure_user_silvio_channel(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Errore creazione canale Silvio per %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_silvio_channel ON public.profiles;
CREATE TRIGGER trg_auto_silvio_channel
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_silvio_channel_for_profile();
