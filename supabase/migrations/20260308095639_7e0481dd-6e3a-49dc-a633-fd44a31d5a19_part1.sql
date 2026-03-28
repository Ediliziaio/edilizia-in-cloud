-- Index for fast lookup by meta_message_id (used by webhook status updates)
CREATE INDEX IF NOT EXISTS idx_messaging_messages_meta_message_id 
  ON messaging_messages(meta_message_id) WHERE meta_message_id IS NOT NULL;
