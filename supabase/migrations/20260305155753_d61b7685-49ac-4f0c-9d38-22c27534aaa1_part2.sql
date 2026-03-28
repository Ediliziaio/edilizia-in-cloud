-- Indici
CREATE INDEX idx_tickets_company_status ON public.tickets (company_id, status);
