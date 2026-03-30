CREATE INDEX IF NOT EXISTS idx_totp_backup_user ON public.totp_backup_codes(user_id);
