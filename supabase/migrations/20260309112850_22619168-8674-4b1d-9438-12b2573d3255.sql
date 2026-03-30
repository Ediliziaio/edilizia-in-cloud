ALTER TABLE public.gdpr_data_requests
DROP CONSTRAINT IF EXISTS gdpr_data_requests_user_id_fkey,
  ADD CONSTRAINT gdpr_data_requests_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;