CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created ON public.ticket_messages (ticket_id, created_at);
