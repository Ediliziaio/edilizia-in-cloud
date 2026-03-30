-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_contact_messages_contact_id ON public.contact_messages(contact_id);
