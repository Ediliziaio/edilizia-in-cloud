-- ============================================================================
-- Email Dual-Provider — FASE 1: estensione email_logs + email_delivery_log
-- ============================================================================
-- Aggiunge le colonne mancanti per supportare un sistema dual-provider
-- (Resend transactional + Elastic Email marketing) con tracking completo
-- di stream, dominio mittente, costi e bounce/complaint hardening.
--
-- Nota architetturale:
--   - email_logs: righe per-contact di una campagna marketing (campaign_id NOT NULL).
--   - email_delivery_log: righe per-recipient di invii transactional (sendEmailUnified).
-- Entrambe le tabelle vanno estese per il tracking dual-provider + webhook.
--
-- Tutte le ALTER sono IDEMPOTENTI (IF NOT EXISTS) — sicure da rieseguire.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) email_logs (marketing: riga per-contact all'interno di una campagna)
-- ----------------------------------------------------------------------------

-- 1. Stream + provider esplicito su ogni log row (stream/provider già esistenti)
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS stream TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT;

-- Assicura il CHECK aggiornato (lo si aggiunge solo se non esiste già)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_logs_stream_check'
  ) THEN
    ALTER TABLE public.email_logs
      ADD CONSTRAINT email_logs_stream_check
        CHECK (stream IS NULL OR stream IN ('transactional', 'marketing'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_logs_provider_check'
  ) THEN
    ALTER TABLE public.email_logs
      ADD CONSTRAINT email_logs_provider_check
        CHECK (provider IS NULL OR provider IN ('resend', 'elastic_email', 'sendgrid', 'brevo', 'mailgun'));
  END IF;
END $$;

-- 2. Identità mittente effettiva (per audit + DMARC report)
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS from_email TEXT,
  ADD COLUMN IF NOT EXISTS from_domain_id UUID
    REFERENCES public.company_email_domains(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS using_custom_domain BOOLEAN NOT NULL DEFAULT false;

-- 3. Costi (in cents per evitare floating point drift)
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS cost_cents INTEGER;

-- 4. Eventi webhook completi (alcuni esistono già: opened_at, clicked_at)
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounce_type TEXT,
  ADD COLUMN IF NOT EXISTS complaint_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_logs_bounce_type_check'
  ) THEN
    ALTER TABLE public.email_logs
      ADD CONSTRAINT email_logs_bounce_type_check
        CHECK (bounce_type IS NULL OR bounce_type IN ('hard', 'soft', 'unknown'));
  END IF;
END $$;

-- 5. Indici performance per dashboard SuperAdmin
CREATE INDEX IF NOT EXISTS email_logs_stream_event_idx
  ON public.email_logs(stream, event_timestamp DESC);

CREATE INDEX IF NOT EXISTS email_logs_provider_status_idx
  ON public.email_logs(provider, status);

CREATE INDEX IF NOT EXISTS email_logs_from_domain_idx
  ON public.email_logs(from_domain_id)
  WHERE from_domain_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_logs_bounced_idx
  ON public.email_logs(bounced_at)
  WHERE bounced_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_logs_complaint_idx
  ON public.email_logs(complaint_at)
  WHERE complaint_at IS NOT NULL;

-- 6. Backfill: email_logs è solo marketing (ha sempre campaign_id NOT NULL).
UPDATE public.email_logs
SET stream = 'marketing'
WHERE stream IS NULL;

-- 7. Backfill provider dal sendgrid_message_id legacy (best-effort).
UPDATE public.email_logs
SET provider = 'sendgrid'
WHERE provider IS NULL
  AND sendgrid_message_id IS NOT NULL
  AND sendgrid_message_id != '';

-- ----------------------------------------------------------------------------
-- B) email_delivery_log (transactional: riga per-recipient da sendEmailUnified)
-- ----------------------------------------------------------------------------

-- 1. stream e provider già esistenti (valori liberi TEXT) — aggiungiamo CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_delivery_log_stream_check'
  ) THEN
    ALTER TABLE public.email_delivery_log
      ADD CONSTRAINT email_delivery_log_stream_check
        CHECK (stream IS NULL OR stream IN ('transactional', 'marketing'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_delivery_log_provider_check'
  ) THEN
    ALTER TABLE public.email_delivery_log
      ADD CONSTRAINT email_delivery_log_provider_check
        CHECK (provider IS NULL OR provider IN ('resend', 'elastic_email', 'sendgrid', 'brevo', 'mailgun', 'internal'));
  END IF;
END $$;

-- 2. Identità mittente effettiva
ALTER TABLE public.email_delivery_log
  ADD COLUMN IF NOT EXISTS from_email TEXT,
  ADD COLUMN IF NOT EXISTS from_domain_id UUID
    REFERENCES public.company_email_domains(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS using_custom_domain BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cost_cents INTEGER,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounce_type TEXT,
  ADD COLUMN IF NOT EXISTS complaint_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_delivery_log_bounce_type_check'
  ) THEN
    ALTER TABLE public.email_delivery_log
      ADD CONSTRAINT email_delivery_log_bounce_type_check
        CHECK (bounce_type IS NULL OR bounce_type IN ('hard', 'soft', 'unknown'));
  END IF;
END $$;

-- 3. Indici performance
CREATE INDEX IF NOT EXISTS edl_stream_sent_idx
  ON public.email_delivery_log(stream, sent_at DESC);

CREATE INDEX IF NOT EXISTS edl_provider_status_idx
  ON public.email_delivery_log(provider, status);

CREATE INDEX IF NOT EXISTS edl_from_domain_idx
  ON public.email_delivery_log(from_domain_id)
  WHERE from_domain_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS edl_bounced_idx
  ON public.email_delivery_log(bounced_at)
  WHERE bounced_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS edl_complaint_idx
  ON public.email_delivery_log(complaint_at)
  WHERE complaint_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS edl_company_sent_idx
  ON public.email_delivery_log(company_id, sent_at DESC);

-- 4. Backfill stream dove possibile (campaign_id → marketing)
UPDATE public.email_delivery_log
SET stream = CASE
  WHEN campaign_id IS NOT NULL THEN 'marketing'
  ELSE 'transactional'
END
WHERE stream IS NULL;

COMMENT ON COLUMN public.email_logs.stream IS
  'Email stream: sempre marketing per email_logs (campaign per-contact). Mantenuto per coerenza schema.';

COMMENT ON COLUMN public.email_logs.provider IS
  'Provider effettivo usato per l''invio. Source of truth per webhook routing e billing.';

COMMENT ON COLUMN public.email_logs.from_email IS
  'Indirizzo mittente effettivo (es. noreply@cliente.it o cliente@mail.ediliziaincloud.it). Audit trail per DMARC.';

COMMENT ON COLUMN public.email_logs.using_custom_domain IS
  'true = email uscita da dominio custom dell''azienda; false = fallback su sottodominio EiC.';

COMMENT ON COLUMN public.email_logs.cost_cents IS
  'Costo dell''invio in centesimi di euro (intero per evitare drift). NULL = costo zero o non calcolato.';

COMMENT ON COLUMN public.email_logs.bounce_type IS
  'Hard bounce (refund crediti) | Soft bounce (retry provider) | Unknown (provider non distingue).';

COMMENT ON COLUMN public.email_delivery_log.stream IS
  'Email stream: transactional (Resend default) o marketing. Origina da sendEmailUnified(args.stream).';

COMMENT ON COLUMN public.email_delivery_log.provider IS
  'Provider effettivo usato per l''invio. Valore internal=default quando logging senza provider esterno.';

COMMENT ON COLUMN public.email_delivery_log.from_email IS
  'Indirizzo mittente effettivo. Audit trail per DMARC + verifica dominio custom.';

COMMENT ON COLUMN public.email_delivery_log.using_custom_domain IS
  'true = email uscita da dominio custom dell''azienda; false = fallback su sottodominio EiC.';
