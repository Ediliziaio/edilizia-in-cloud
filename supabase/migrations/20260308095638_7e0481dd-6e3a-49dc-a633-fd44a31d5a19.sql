-- Add delivery receipt columns to messaging_messages
ALTER TABLE messaging_messages 
  ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS meta_message_id TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Index for fast lookup by meta_message_id (used by webhook status updates)
CREATE INDEX IF NOT EXISTS idx_messaging_messages_meta_message_id 
  ON messaging_messages(meta_message_id) WHERE meta_message_id IS NOT NULL;