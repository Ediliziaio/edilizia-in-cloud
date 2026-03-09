
-- Tabella per i secret TOTP degli utenti
CREATE TABLE public.totp_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  encrypted_secret text NOT NULL,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);

ALTER TABLE public.totp_secrets ENABLE ROW LEVEL SECURITY;

-- Gli utenti possono leggere solo il proprio
CREATE POLICY "Users can read own totp" ON public.totp_secrets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Tabella per i backup codes
CREATE TABLE public.totp_backup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  is_used boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_totp_backup_user ON public.totp_backup_codes(user_id);
ALTER TABLE public.totp_backup_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own backup codes" ON public.totp_backup_codes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
