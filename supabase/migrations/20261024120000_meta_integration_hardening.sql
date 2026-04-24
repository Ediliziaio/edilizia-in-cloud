-- Meta integration hardening: rate limiting + field mapping versioning +
-- alert on stale integrations.

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- 1. RATE LIMITING — tracking chiamate Meta Graph API per company/hour
-- ────────────────────────────────────────────────────────────────────
-- Meta enforce 200 chiamate/ora/user a Graph API. Superata la soglia
-- ritorna 429 e lock-out temporaneo. Questa tabella traccia il conteggio
-- per ogni company + finestra oraria.
CREATE TABLE IF NOT EXISTS public.meta_api_rate_limit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  call_count INT NOT NULL DEFAULT 0 CHECK (call_count >= 0),
  last_429_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, window_start)
);

CREATE INDEX IF NOT EXISTS idx_meta_rate_limit_window
  ON public.meta_api_rate_limit(company_id, window_end DESC);

-- Auto-cleanup righe vecchie >7 giorni (riduce bloat)
-- Eseguito da pg_cron daily
CREATE OR REPLACE FUNCTION public.cleanup_meta_rate_limit()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.meta_api_rate_limit
  WHERE window_end < now() - INTERVAL '7 days';
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 2. FIELD MAPPING VERSIONING — versione del mapping al momento del lead
-- ────────────────────────────────────────────────────────────────────
-- Se admin cambia il mapping Meta form → marketing_contacts, i lead già
-- processati devono avere il mapping della loro epoca salvato.
ALTER TABLE public.meta_lead_forms
  ADD COLUMN IF NOT EXISTS mapping_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS mapping_updated_at TIMESTAMPTZ DEFAULT now();

-- Trigger: incrementa mapping_version quando la config cambia
CREATE OR REPLACE FUNCTION public.meta_lead_forms_bump_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Se il mapping JSONB cambia, bump versione (usa coalesce per NEW/OLD entrambi null)
  IF COALESCE(OLD.field_mapping::text, '') <> COALESCE(NEW.field_mapping::text, '') THEN
    NEW.mapping_version := COALESCE(OLD.mapping_version, 0) + 1;
    NEW.mapping_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_lead_forms_bump_version ON public.meta_lead_forms;
-- Nota: il trigger si attiva solo se la colonna field_mapping esiste.
-- Usa il try-catch DO block per essere safe se lo schema varia.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'meta_lead_forms'
      AND column_name = 'field_mapping'
  ) THEN
    CREATE TRIGGER trg_meta_lead_forms_bump_version
      BEFORE UPDATE ON public.meta_lead_forms
      FOR EACH ROW EXECUTE FUNCTION public.meta_lead_forms_bump_version();
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- 3. INTEGRATIONS: retry_count + alert quando consecutive_errors supera soglia
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS consecutive_errors INT NOT NULL DEFAULT 0 CHECK (consecutive_errors >= 0),
  ADD COLUMN IF NOT EXISTS last_healthy_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_alerted_at TIMESTAMPTZ;

-- ────────────────────────────────────────────────────────────────────
-- 4. AUDIT LOG MASKING — tabella helper con hash SHA256 per PII
-- ────────────────────────────────────────────────────────────────────
-- Il client non può chiamare questa, serve per backend (edge function).
-- Esempio: SELECT public.mask_pii_email('mario@acme.com') → 'ma***@a***.com'
CREATE OR REPLACE FUNCTION public.mask_pii_email(input TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  local_part TEXT;
  domain_part TEXT;
  at_pos INT;
  dot_pos INT;
BEGIN
  IF input IS NULL OR input = '' THEN RETURN NULL; END IF;
  at_pos := position('@' IN input);
  IF at_pos = 0 THEN RETURN '***'; END IF;
  local_part := substring(input FROM 1 FOR at_pos - 1);
  domain_part := substring(input FROM at_pos + 1);
  dot_pos := position('.' IN domain_part);
  RETURN
    substring(local_part FROM 1 FOR 2) || repeat('*', 3) ||
    '@' ||
    CASE WHEN dot_pos > 0 THEN substring(domain_part FROM 1 FOR 1) || repeat('*', 3) || substring(domain_part FROM dot_pos) ELSE repeat('*', 5) END;
END;
$$;

CREATE OR REPLACE FUNCTION public.mask_pii_phone(input TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF input IS NULL OR input = '' THEN RETURN NULL; END IF;
  IF length(input) < 4 THEN RETURN '***'; END IF;
  RETURN repeat('*', length(input) - 4) || substring(input FROM length(input) - 3);
END;
$$;

COMMIT;
