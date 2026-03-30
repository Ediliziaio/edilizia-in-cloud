-- Nuove colonne su tickets
ALTER TABLE public.tickets 
  ADD COLUMN IF NOT EXISTS priority public.ticket_priority NOT NULL DEFAULT 'normale',
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS internal_notes TEXT DEFAULT NULL;
