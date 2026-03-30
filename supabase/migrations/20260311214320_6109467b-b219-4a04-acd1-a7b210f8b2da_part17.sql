ALTER TABLE public.marketing_contact_notes DROP CONSTRAINT IF EXISTS marketing_contact_notes_created_by_fkey,
  ADD CONSTRAINT marketing_contact_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
