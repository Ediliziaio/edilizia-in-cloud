ALTER TABLE public.tasks ADD COLUMN ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL;
