-- No direct access from client - only via edge function
DROP POLICY IF EXISTS "No direct access" ON public.password_history;
CREATE POLICY "No direct access" ON public.password_history FOR ALL TO authenticated USING (false);
