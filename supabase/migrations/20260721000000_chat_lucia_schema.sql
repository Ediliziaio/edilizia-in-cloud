-- Chat Team 2.0 + Lucia AI schema migrations

-- ─── Extend internal_chat_channels ───────────────────────────────────────────
ALTER TABLE internal_chat_channels
  ADD COLUMN IF NOT EXISTS is_dm        BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_private   BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_system    BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS channel_emoji TEXT,
  ADD COLUMN IF NOT EXISTS dm_user_ids  UUID[]    DEFAULT '{}';

-- ─── Extend internal_chat_messages ───────────────────────────────────────────
ALTER TABLE internal_chat_messages
  ADD COLUMN IF NOT EXISTS reactions     JSONB  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_pinned     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS message_type  TEXT    DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS mentions      UUID[]  DEFAULT '{}';

-- ─── Extend internal_chat_members ────────────────────────────────────────────
ALTER TABLE internal_chat_members
  ADD COLUMN IF NOT EXISTS is_muted           BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notification_pref  TEXT    DEFAULT 'all';

-- ─── Lucia AI conversations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lucia_conversations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  messages    JSONB       NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS lucia_conversations_company_user_idx
  ON lucia_conversations(company_id, user_id);

ALTER TABLE lucia_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lucia_conversations_own" ON lucia_conversations
  FOR ALL USING (
    auth.uid() = user_id
    AND company_id = (
      SELECT company_id FROM profiles WHERE id = auth.uid() LIMIT 1
    )
  );

-- ─── Chat notifications ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id  UUID        NOT NULL REFERENCES internal_chat_channels(id) ON DELETE CASCADE,
  message_id  UUID        REFERENCES internal_chat_messages(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL DEFAULT 'mention', -- 'mention' | 'dm' | 'keyword'
  is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_notifications_user_idx
  ON chat_notifications(user_id, is_read, created_at DESC);

ALTER TABLE chat_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_notifications_own" ON chat_notifications
  FOR ALL USING (auth.uid() = user_id);

-- ─── Updated_at trigger for lucia_conversations ───────────────────────────────
CREATE OR REPLACE FUNCTION update_lucia_conversations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lucia_conversations_updated_at ON lucia_conversations;
CREATE TRIGGER lucia_conversations_updated_at
  BEFORE UPDATE ON lucia_conversations
  FOR EACH ROW EXECUTE FUNCTION update_lucia_conversations_updated_at();
