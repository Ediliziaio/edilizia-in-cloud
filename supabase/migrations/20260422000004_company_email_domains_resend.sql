-- ============================================================================
-- Email Dual-Provider — FASE 4: company_email_domains estensione Resend
-- ============================================================================
-- Estende company_email_domains per supportare anche Resend come provider
-- transactional (in alternativa a SendGrid).
--
-- L'azienda può quindi avere il proprio dominio (es. rossicostruzioni.it)
-- registrato su:
--   - Elastic Email (marketing) — già esistente
--   - SendGrid (transactional legacy) — già esistente
--   - Resend (transactional NUOVO default) — questa migration
--
-- L'azienda sceglie quale provider transactional usare via
-- platform_settings.email_transactional_provider, ma il dominio è
-- preregistrato su tutti per facilitare lo switch.
-- ============================================================================

-- 1. Riferimenti Resend
ALTER TABLE public.company_email_domains
  ADD COLUMN IF NOT EXISTS resend_domain_id TEXT,
  ADD COLUMN IF NOT EXISTS resend_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (resend_status IN ('pending', 'verifying', 'verified', 'failed', 'temporary_failure', 'not_started')),
  ADD COLUMN IF NOT EXISTS resend_region TEXT NOT NULL DEFAULT 'eu-west-1'
    CHECK (resend_region IN ('us-east-1', 'eu-west-1', 'sa-east-1', 'ap-northeast-1'));

-- 2. Resend usa SPF + DKIM + return-path automatici (3 record DNS aggregati in JSONB)
-- Esempio struttura:
--   [
--     { "type": "TXT",   "name": "send.dominio.it",     "value": "v=spf1 include:amazonses.com ~all", "verified": false },
--     { "type": "TXT",   "name": "resend._domainkey.dominio.it", "value": "v=DKIM1; ...", "verified": false },
--     { "type": "MX",    "name": "send.dominio.it",     "value": "feedback-smtp.eu-west-1.amazonses.com", "priority": 10, "verified": false }
--   ]
ALTER TABLE public.company_email_domains
  ADD COLUMN IF NOT EXISTS resend_dns_records JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 3. Stato aggregato + metadati verifica (utili per polling UI)
ALTER TABLE public.company_email_domains
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_verification_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- 4. Drop & ricrea is_verified per includere Resend (almeno UNO dei 2 transactional verde)
-- Strategia: dominio "verified" se EE marketing OK + (SendGrid OK OPPURE Resend OK)
-- → consente migrazione SG→Resend senza perdere lo status verificato
ALTER TABLE public.company_email_domains
  DROP COLUMN IF EXISTS is_verified;

ALTER TABLE public.company_email_domains
  ADD COLUMN is_verified BOOLEAN GENERATED ALWAYS AS (
    -- Marketing (Elastic Email) deve essere ok
    (ee_spf_verified AND ee_dkim_verified)
    AND (
      -- Almeno UN provider transactional ok (SendGrid 3 CNAME oppure Resend status='verified')
      (sg_cname_1_valid AND sg_cname_2_valid AND sg_cname_3_valid)
      OR resend_status = 'verified'
    )
  ) STORED;

-- 5. Indici performance
CREATE INDEX IF NOT EXISTS ced_resend_id_idx
  ON public.company_email_domains(resend_domain_id)
  WHERE resend_domain_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ced_pending_verify_idx
  ON public.company_email_domains(last_verification_attempt_at)
  WHERE NOT is_verified
    AND verification_attempts < 20;

-- 6. Rate limit guard: max 3 add/ora per company, max 10 verify/ora per dominio
-- (helper RPC, le Edge Function lo chiamano prima di chiamare i provider API)
CREATE OR REPLACE FUNCTION public.check_email_domain_rate_limit(
  p_company_id UUID,
  p_action TEXT  -- 'add' | 'verify'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_limit INTEGER;
  v_window INTERVAL := '1 hour';
BEGIN
  IF p_action = 'add' THEN
    v_limit := 3;
    SELECT COUNT(*) INTO v_count
    FROM public.company_email_domains
    WHERE company_id = p_company_id
      AND created_at > now() - v_window;
  ELSIF p_action = 'verify' THEN
    v_limit := 10;
    SELECT COUNT(*) INTO v_count
    FROM public.company_email_domains
    WHERE company_id = p_company_id
      AND last_verification_attempt_at > now() - v_window;
  ELSE
    RETURN false;
  END IF;

  RETURN v_count < v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_email_domain_rate_limit(UUID, TEXT) TO service_role;

COMMENT ON COLUMN public.company_email_domains.resend_domain_id IS
  'ID Resend del dominio. NULL se dominio non ancora registrato su Resend (es. azienda usa SendGrid legacy).';

COMMENT ON COLUMN public.company_email_domains.resend_dns_records IS
  'Record DNS richiesti da Resend (SPF, DKIM, MX return-path). JSONB array di {type, name, value, verified}.';

COMMENT ON COLUMN public.company_email_domains.is_verified IS
  'Aggregate: marketing (EE) verde + ALMENO UN transactional (SG o Resend) verde. Permette switch graduale SG→Resend.';
