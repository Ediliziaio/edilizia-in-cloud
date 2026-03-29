CREATE POLICY "Users can read own backup codes" ON public.totp_backup_codes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
