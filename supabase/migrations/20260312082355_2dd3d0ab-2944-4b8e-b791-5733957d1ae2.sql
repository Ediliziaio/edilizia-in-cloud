-- 1. Email delivery log table
CREATE TABLE IF NOT EXISTS public.email_delivery_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  recipient     TEXT NOT NULL,
  subject       TEXT,
  template_type TEXT,
  provider      TEXT,
  status        TEXT NOT NULL DEFAULT 'sent',
  provider_id   TEXT,
  error_message TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
