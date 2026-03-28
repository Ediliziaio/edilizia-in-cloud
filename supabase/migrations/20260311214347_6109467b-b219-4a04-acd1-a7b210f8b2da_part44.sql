-- inventory_audits.performed_by
ALTER TABLE public.inventory_audits DROP CONSTRAINT IF EXISTS inventory_audits_performed_by_fkey;
