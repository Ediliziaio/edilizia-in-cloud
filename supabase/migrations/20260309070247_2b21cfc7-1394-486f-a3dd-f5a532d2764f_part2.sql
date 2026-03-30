-- Gli utenti possono leggere solo il proprio
DROP POLICY IF EXISTS "Users can read own totp" ON public.totp_secrets;
CREATE POLICY "Users can read own totp" ON public.totp_secrets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
