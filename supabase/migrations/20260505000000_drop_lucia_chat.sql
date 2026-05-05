-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-14 — Drop Lucia AI legacy (sostituita da Silvio)
-- ════════════════════════════════════════════════════════════════════════════
-- Lucia era il chatbot legacy. Silvio (15 tool, RAG, memory, multimodal)
-- la sostituisce completamente. Rimuoviamo:
--   1. Canali "lucia-ai" esistenti (CASCADE su messages/members)
--   2. Sezione lucia-ai nella funzione create_default_chat_channels
--   3. Eventuali references altrove
--
-- NOTA: l'edge function `lucia-chat` viene eliminata via CLI separatamente.
-- I messaggi storici nelle DM con LUCIA_SENDER_ID restano per backward-compat.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Drop canali lucia-ai esistenti
DELETE FROM public.internal_chat_channels WHERE name = 'lucia-ai';

-- 2) Aggiorna create_default_chat_channels — rimuovi blocco lucia-ai
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

  -- silvio-ai NON creato qui (per-user, vedi ensure_user_silvio_channel)
END;
$$;

-- 3) Verifica
DO $$
DECLARE v_remaining int;
BEGIN
  SELECT count(*) INTO v_remaining FROM internal_chat_channels WHERE name = 'lucia-ai';
  RAISE NOTICE 'Lucia drop: % canali rimasti (atteso 0)', v_remaining;
END $$;
