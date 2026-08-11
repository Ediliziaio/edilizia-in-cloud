-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Outreach Engine — schema core (Fasi 1-2)
CREATE OR REPLACE FUNCTION public.outreach_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.outreach_sending_domains (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain          text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','verifying','active','paused','error')),
  spf_verified    boolean NOT NULL DEFAULT false,
  dkim_verified   boolean NOT NULL DEFAULT false,
  dmarc_verified  boolean NOT NULL DEFAULT false,
  daily_cap       integer NOT NULL DEFAULT 200 CHECK (daily_cap >= 0),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outreach_sending_domains_unique UNIQUE (company_id, domain)
);
CREATE INDEX IF NOT EXISTS idx_outreach_domains_company ON public.outreach_sending_domains (company_id, status);

CREATE TABLE IF NOT EXISTS public.outreach_sender_accounts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sending_domain_id  uuid REFERENCES public.outreach_sending_domains(id) ON DELETE SET NULL,
  email              text NOT NULL,
  display_name       text,
  provider           text NOT NULL DEFAULT 'ses'
                       CHECK (provider IN ('ses','smtp','resend','elastic_email','sendgrid','brevo','mailgun')),
  smtp_host          text,
  smtp_port          integer,
  smtp_secure        boolean DEFAULT true,
  smtp_username      text,
  secret_ref         text,
  status             text NOT NULL DEFAULT 'warming'
                       CHECK (status IN ('warming','active','paused','disabled')),
  daily_cap_target   integer NOT NULL DEFAULT 40 CHECK (daily_cap_target >= 0),
  warmup_base        integer NOT NULL DEFAULT 5  CHECK (warmup_base >= 0),
  warmup_step        integer NOT NULL DEFAULT 5  CHECK (warmup_step >= 0),
  warmup_day         integer NOT NULL DEFAULT 0  CHECK (warmup_day >= 0),
  warmup_started_on  date,
  daily_sent         integer NOT NULL DEFAULT 0 CHECK (daily_sent >= 0),
  daily_sent_date    date,
  last_sent_at       timestamptz,
  bounce_count       integer NOT NULL DEFAULT 0,
  complaint_count    integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outreach_sender_accounts_unique UNIQUE (company_id, email)
);
CREATE INDEX IF NOT EXISTS idx_outreach_senders_company ON public.outreach_sender_accounts (company_id, status);
CREATE INDEX IF NOT EXISTS idx_outreach_senders_domain ON public.outreach_sender_accounts (sending_domain_id);

CREATE TABLE IF NOT EXISTS public.outreach_sequences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  created_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outreach_sequences_company ON public.outreach_sequences (company_id, status);

CREATE TABLE IF NOT EXISTS public.outreach_sequence_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id   uuid NOT NULL REFERENCES public.outreach_sequences(id) ON DELETE CASCADE,
  step_order    integer NOT NULL CHECK (step_order >= 0),
  channel       text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','whatsapp','sms')),
  delay_days    integer NOT NULL DEFAULT 0 CHECK (delay_days >= 0),
  delay_hours   integer NOT NULL DEFAULT 0 CHECK (delay_hours >= 0 AND delay_hours < 24),
  subject       text,
  body          text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outreach_sequence_steps_unique UNIQUE (sequence_id, step_order)
);
CREATE INDEX IF NOT EXISTS idx_outreach_steps_sequence ON public.outreach_sequence_steps (sequence_id, step_order);

CREATE TABLE IF NOT EXISTS public.outreach_enrollments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sequence_id    uuid NOT NULL REFERENCES public.outreach_sequences(id) ON DELETE CASCADE,
  contact_id     uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','paused','completed','stopped','replied','bounced','opted_out')),
  current_step   integer NOT NULL DEFAULT 0,
  next_action_at timestamptz,
  stop_reason    text,
  enrolled_at    timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outreach_enrollments_unique UNIQUE (sequence_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_outreach_enrollments_due ON public.outreach_enrollments (next_action_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_outreach_enrollments_contact ON public.outreach_enrollments (contact_id);
CREATE INDEX IF NOT EXISTS idx_outreach_enrollments_company ON public.outreach_enrollments (company_id, status);

CREATE TABLE IF NOT EXISTS public.outreach_send_queue (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  enrollment_id      uuid REFERENCES public.outreach_enrollments(id) ON DELETE CASCADE,
  contact_id         uuid REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  sender_account_id  uuid REFERENCES public.outreach_sender_accounts(id) ON DELETE SET NULL,
  channel            text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','whatsapp','sms')),
  to_email           text,
  to_phone           text,
  subject            text,
  body               text NOT NULL DEFAULT '',
  variant_index      integer,
  status             text NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued','sending','sent','failed','skipped','cancelled')),
  scheduled_for      timestamptz NOT NULL DEFAULT now(),
  attempts           integer NOT NULL DEFAULT 0,
  max_attempts       integer NOT NULL DEFAULT 3,
  last_error         text,
  sent_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outreach_queue_dispatch ON public.outreach_send_queue (scheduled_for) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_outreach_queue_company ON public.outreach_send_queue (company_id, status);
CREATE INDEX IF NOT EXISTS idx_outreach_queue_sender ON public.outreach_send_queue (sender_account_id, sent_at);

CREATE TABLE IF NOT EXISTS public.outreach_replies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id     uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  enrollment_id  uuid REFERENCES public.outreach_enrollments(id) ON DELETE SET NULL,
  channel        text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','whatsapp','sms')),
  from_email     text,
  from_phone     text,
  subject        text,
  snippet        text,
  status         text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','handled','archived')),
  received_at    timestamptz NOT NULL DEFAULT now(),
  raw            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outreach_replies_company ON public.outreach_replies (company_id, status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_replies_contact ON public.outreach_replies (contact_id);

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS optout_email     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS optout_sms       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS optout_whatsapp  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS optout_at        timestamptz,
  ADD COLUMN IF NOT EXISTS optout_reason    text;

DROP TRIGGER IF EXISTS trg_outreach_domains_updated ON public.outreach_sending_domains;
CREATE TRIGGER trg_outreach_domains_updated BEFORE UPDATE ON public.outreach_sending_domains
  FOR EACH ROW EXECUTE FUNCTION public.outreach_set_updated_at();
DROP TRIGGER IF EXISTS trg_outreach_senders_updated ON public.outreach_sender_accounts;
CREATE TRIGGER trg_outreach_senders_updated BEFORE UPDATE ON public.outreach_sender_accounts
  FOR EACH ROW EXECUTE FUNCTION public.outreach_set_updated_at();
DROP TRIGGER IF EXISTS trg_outreach_sequences_updated ON public.outreach_sequences;
CREATE TRIGGER trg_outreach_sequences_updated BEFORE UPDATE ON public.outreach_sequences
  FOR EACH ROW EXECUTE FUNCTION public.outreach_set_updated_at();
DROP TRIGGER IF EXISTS trg_outreach_enrollments_updated ON public.outreach_enrollments;
CREATE TRIGGER trg_outreach_enrollments_updated BEFORE UPDATE ON public.outreach_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.outreach_set_updated_at();
DROP TRIGGER IF EXISTS trg_outreach_queue_updated ON public.outreach_send_queue;
CREATE TRIGGER trg_outreach_queue_updated BEFORE UPDATE ON public.outreach_send_queue
  FOR EACH ROW EXECUTE FUNCTION public.outreach_set_updated_at();

ALTER TABLE public.outreach_sending_domains  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_sender_accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_sequences        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_sequence_steps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_enrollments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_send_queue       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_replies          ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'outreach_sending_domains','outreach_sender_accounts','outreach_sequences',
    'outreach_sequence_steps','outreach_enrollments','outreach_send_queue','outreach_replies'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_super ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_super ON public.%1$s FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_service ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_service ON public.%1$s FOR ALL TO service_role USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
