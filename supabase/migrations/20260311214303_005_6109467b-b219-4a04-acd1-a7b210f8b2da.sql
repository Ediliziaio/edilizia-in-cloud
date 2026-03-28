ALTER TABLE public.marketing_opportunities ADD CONSTRAINT marketing_opportunities_call_center_id_fkey FOREIGN KEY (call_center_id) REFERENCES auth.users(id) ON DELETE SET NULL;
