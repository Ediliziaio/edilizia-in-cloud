-- === FKs referencing marketing_contacts that block contact deletion ===

-- internal_call_logs.contact_id
ALTER TABLE public.internal_call_logs DROP CONSTRAINT IF EXISTS internal_call_logs_contact_id_fkey;
