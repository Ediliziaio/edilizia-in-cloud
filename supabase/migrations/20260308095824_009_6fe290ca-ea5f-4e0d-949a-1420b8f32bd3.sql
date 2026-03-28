CREATE INDEX IF NOT EXISTS idx_whatsapp_broadcast_recipients_meta_msg ON whatsapp_broadcast_recipients(meta_message_id) WHERE meta_message_id IS NOT NULL;
