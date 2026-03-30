-- 1. telnyx_settings table
CREATE TABLE IF NOT EXISTS public.telnyx_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_encrypted text NOT NULL,
  messaging_profile_id text,
  connection_id text,
  webhook_signing_secret_encrypted text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
