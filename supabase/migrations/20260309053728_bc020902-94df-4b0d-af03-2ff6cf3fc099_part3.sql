-- No direct access from client - only via edge function
CREATE POLICY "No direct access" ON public.password_history FOR ALL TO authenticated USING (false);
