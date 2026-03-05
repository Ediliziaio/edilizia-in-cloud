-- Performance indices for frequent queries
CREATE INDEX IF NOT EXISTS idx_tickets_company_status ON public.tickets (company_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_company_created ON public.tickets (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_company_created ON public.orders (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_company_source ON public.marketing_contacts (company_id, source);
CREATE INDEX IF NOT EXISTS idx_automation_trigger_events_company_processed ON public.automation_trigger_events (company_id, processed);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created ON public.ticket_messages (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_appointments_company_date ON public.appointments (company_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_integration_webhook_events_status ON public.integration_webhook_events (status, company_id);