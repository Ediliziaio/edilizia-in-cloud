CREATE INDEX IF NOT EXISTS idx_tickets_company_created ON public.tickets (company_id, created_at DESC);
