-- Nuove colonne su tickets
ALTER TABLE public.tickets 
  ADD COLUMN priority public.ticket_priority NOT NULL DEFAULT 'normale',
  ADD COLUMN assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN category TEXT DEFAULT NULL,
  ADD COLUMN last_message_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN internal_notes TEXT DEFAULT NULL;
