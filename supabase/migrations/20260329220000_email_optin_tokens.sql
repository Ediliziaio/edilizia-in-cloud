-- GAP-15: Double opt-in GDPR
-- Stores pending confirmation tokens for email opt-in requests.

CREATE TABLE IF NOT EXISTS public.email_optin_tokens (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token        TEXT NOT NULL,
  contact_id   UUID NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_optin_tokens_token_unique UNIQUE (token)
);

ALTER TABLE public.email_optin_tokens ENABLE ROW LEVEL SECURITY;

-- Company admins can manage tokens for their contacts
CREATE POLICY "Company admins manage optin tokens"
  ON public.email_optin_tokens FOR ALL
  USING (
    has_role(auth.uid(), 'company_admin'::app_role)
    AND company_id = get_user_company_id(auth.uid())
  );

-- Super admins can manage all tokens
CREATE POLICY "Super admins manage all optin tokens"
  ON public.email_optin_tokens FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS email_optin_tokens_token_idx
  ON public.email_optin_tokens(token);

CREATE INDEX IF NOT EXISTS email_optin_tokens_contact_id_idx
  ON public.email_optin_tokens(contact_id);
