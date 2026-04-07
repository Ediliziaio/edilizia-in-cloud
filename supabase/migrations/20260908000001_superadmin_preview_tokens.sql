-- Tabella token preview SuperAdmin (Feature: Visualizza Come)
-- Token monouso con TTL 15 min per apertura portali clienti.* / lavori.* in preview mode

CREATE TABLE IF NOT EXISTS public.superadmin_preview_tokens (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  token          text         NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_by     uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_role    text         NOT NULL
                               CHECK (target_role IN ('employee','subcontractor','customer')),
  company_id     uuid         NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  used_at        timestamptz,
  expires_at     timestamptz  NOT NULL DEFAULT (now() + interval '15 minutes'),
  created_at     timestamptz  NOT NULL DEFAULT now()
);

-- RLS: nessun accesso diretto dal client — tutto via service_role nelle edge functions
ALTER TABLE public.superadmin_preview_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_direct"
  ON public.superadmin_preview_tokens
  FOR ALL TO authenticated
  USING (false);

-- Indici per lookup e cleanup
CREATE INDEX IF NOT EXISTS idx_preview_tokens_token   ON public.superadmin_preview_tokens(token);
CREATE INDEX IF NOT EXISTS idx_preview_tokens_expires ON public.superadmin_preview_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_preview_tokens_company ON public.superadmin_preview_tokens(company_id);
