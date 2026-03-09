
-- Password history table
CREATE TABLE IF NOT EXISTS public.password_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_history_user_id ON public.password_history(user_id);

ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;

-- No direct access from client - only via edge function
CREATE POLICY "No direct access" ON public.password_history FOR ALL TO authenticated USING (false);

-- Password complexity columns on companies
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS password_min_length integer NOT NULL DEFAULT 8,
ADD COLUMN IF NOT EXISTS password_require_uppercase boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS password_require_numbers boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS password_require_special boolean NOT NULL DEFAULT false;
