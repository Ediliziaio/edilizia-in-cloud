ALTER TABLE public.marketing_contacts DROP CONSTRAINT IF EXISTS marketing_contacts_call_center_id_fkey,
  ADD CONSTRAINT marketing_contacts_call_center_id_fkey FOREIGN KEY (call_center_id) REFERENCES auth.users(id) ON DELETE SET NULL;
