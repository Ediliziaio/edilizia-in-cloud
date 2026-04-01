-- Auto-create system channels (generale, operativo, lucia-ai) for all existing companies
-- and trigger for new companies

-- Function: create default channels for a company
CREATE OR REPLACE FUNCTION create_default_chat_channels(p_company_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_channel_id UUID;
  v_creator_id UUID;
  v_user_ids UUID[];
BEGIN
  -- Get first user for this company (creator)
  SELECT id INTO v_creator_id FROM profiles WHERE company_id = p_company_id LIMIT 1;
  IF v_creator_id IS NULL THEN RETURN; END IF;

  -- Get all users for this company
  SELECT ARRAY_AGG(id) INTO v_user_ids FROM profiles WHERE company_id = p_company_id;

  -- Create #generale if not exists
  IF NOT EXISTS (
    SELECT 1 FROM internal_chat_channels
    WHERE company_id = p_company_id AND name = 'generale'
  ) THEN
    INSERT INTO internal_chat_channels (company_id, name, description, type, is_system, channel_emoji, created_by)
    VALUES (p_company_id, 'generale', 'Canale generale per tutta l''azienda', 'group', true, '🏢', v_creator_id)
    RETURNING id INTO v_channel_id;

    -- Add all company members
    INSERT INTO internal_chat_members (channel_id, user_id, company_id, role)
    SELECT v_channel_id, unnest(v_user_ids), p_company_id, 'member'
    ON CONFLICT DO NOTHING;
  END IF;

  -- Create #operativo if not exists
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

  -- Create #lucia-ai if not exists
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
END;
$$;

-- Trigger function: auto-create channels when a new company is created
CREATE OR REPLACE FUNCTION auto_create_chat_channels()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM create_default_chat_channels(NEW.id);
  RETURN NEW;
END;
$$;

-- Drop old trigger if exists, then create
DROP TRIGGER IF EXISTS on_company_created_chat_channels ON companies;
CREATE TRIGGER on_company_created_chat_channels
  AFTER INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION auto_create_chat_channels();

-- Bootstrap: create default channels for ALL existing companies that don't have them yet
DO $$
DECLARE
  v_company_id UUID;
BEGIN
  FOR v_company_id IN SELECT id FROM companies LOOP
    PERFORM create_default_chat_channels(v_company_id);
  END LOOP;
END;
$$;
