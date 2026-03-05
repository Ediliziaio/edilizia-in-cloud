ALTER TABLE public.tasks ADD COLUMN ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL;
CREATE INDEX idx_tasks_ticket_id ON public.tasks (ticket_id);