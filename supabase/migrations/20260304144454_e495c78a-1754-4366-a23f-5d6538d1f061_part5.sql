-- Company admins can view their queue
DROP POLICY IF EXISTS "Company users can view own queue" ON public.automation_queue;
CREATE POLICY "Company users can view own queue"
  ON public.automation_queue
  FOR SELECT
  TO authenticated
  USING (company_id IN (
    SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
  ));
