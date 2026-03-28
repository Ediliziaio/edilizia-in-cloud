CREATE INDEX idx_tickets_last_message ON public.tickets (company_id, last_message_at DESC);
