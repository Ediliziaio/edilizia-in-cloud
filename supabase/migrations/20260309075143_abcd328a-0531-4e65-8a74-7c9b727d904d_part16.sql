CREATE INDEX IF NOT EXISTS idx_icmsg_ch ON public.internal_chat_messages(channel_id, created_at);
