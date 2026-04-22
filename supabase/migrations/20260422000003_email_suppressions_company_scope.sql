-- ============================================================================
-- Email Dual-Provider — FASE 3: email_suppressions per-company + helper SQL
-- ============================================================================
-- Estende email_suppressions per supportare:
--   - Suppression GLOBALE (company_id NULL) — hard bounce, spam complaint
--   - Suppression PER-AZIENDA (company_id NOT NULL) — unsubscribe marketing
--
-- Aggiunge la funzione is_suppressed() che fa il check rapido nelle
-- Edge Functions prima dell'invio (transactional + marketing).
-- ============================================================================

-- 1. Aggiunge company_id (NULL = globale)
ALTER TABLE public.email_suppressions
  ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES public.companies(id) ON DELETE CASCADE;

-- 2. Aggiunge source_provider + source_event_id per audit trail
ALTER TABLE public.email_suppressions
  ADD COLUMN IF NOT EXISTS source_provider TEXT
    CHECK (source_provider IS NULL OR source_provider IN ('resend', 'elastic_email', 'sendgrid', 'brevo', 'mailgun', 'manual')),
  ADD COLUMN IF NOT EXISTS source_event_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. Estende il CHECK su reason per coprire tutti i casi del masterprompt
ALTER TABLE public.email_suppressions
  DROP CONSTRAINT IF EXISTS email_suppressions_reason_check;

-- Normalizza valori legacy esistenti (bounce → hard_bounce, spam → spam_complaint)
UPDATE public.email_suppressions
SET reason = 'hard_bounce'
WHERE reason = 'bounce';

UPDATE public.email_suppressions
SET reason = 'spam_complaint'
WHERE reason = 'spam';

ALTER TABLE public.email_suppressions
  ADD CONSTRAINT email_suppressions_reason_check
    CHECK (reason IN ('unsubscribe', 'hard_bounce', 'spam_complaint', 'manual', 'invalid', 'legal'));

-- 4. Email normalizzata generata (lowercase) per lookup case-insensitive
ALTER TABLE public.email_suppressions
  ADD COLUMN IF NOT EXISTS email_normalized TEXT
    GENERATED ALWAYS AS (lower(email)) STORED;

CREATE INDEX IF NOT EXISTS email_suppressions_normalized_idx
  ON public.email_suppressions(email_normalized);

CREATE INDEX IF NOT EXISTS email_suppressions_company_idx
  ON public.email_suppressions(company_id)
  WHERE company_id IS NOT NULL;

-- 5. Cambia UNIQUE constraint per supportare scope misto (global + per-company)
-- Vecchio: UNIQUE (email)
-- Nuovo: UNIQUE NULLS NOT DISTINCT (company_id, email_normalized, reason)
-- → permette stessa email su company diverse, e blocca duplicati esatti
ALTER TABLE public.email_suppressions
  DROP CONSTRAINT IF EXISTS email_suppressions_email_unique;

-- Pulizia preventiva: se duplicati esistenti, mantiene solo il più recente
DELETE FROM public.email_suppressions a
USING public.email_suppressions b
WHERE a.id < b.id
  AND lower(a.email) = lower(b.email)
  AND COALESCE(a.company_id::text, '') = COALESCE(b.company_id::text, '')
  AND a.reason = b.reason;

ALTER TABLE public.email_suppressions
  ADD CONSTRAINT email_suppressions_unique_scope
    UNIQUE NULLS NOT DISTINCT (company_id, email_normalized, reason);

-- ============================================================================
-- RLS aggiornato per scope per-company
-- ============================================================================
DROP POLICY IF EXISTS "Super admins manage email_suppressions" ON public.email_suppressions;

-- Read: super_admin tutto, company members vedono solo proprie suppressions + globali
CREATE POLICY email_suppressions_read ON public.email_suppressions
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id IS NULL  -- suppression globali leggibili da tutti i loggati
    OR company_id IN (
      SELECT company_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  );

-- Write: solo super_admin per globali, company_admin per proprie
CREATE POLICY email_suppressions_write ON public.email_suppressions
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      company_id IS NOT NULL
      AND company_id IN (
        SELECT company_id FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role = 'company_admin'::public.app_role
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      company_id IS NOT NULL
      AND company_id IN (
        SELECT company_id FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role = 'company_admin'::public.app_role
      )
    )
  );

-- ============================================================================
-- Helper SQL: is_suppressed(email, company_id) → boolean
-- ============================================================================
-- Ritorna true se l'email è suppressata GLOBALMENTE oppure
-- per la company_id specificata (per il caso unsubscribe marketing).
--
-- STABILE → utilizzabile in trigger e check sincroni nelle Edge Functions.
-- SECURITY DEFINER → bypass RLS (chiamata trusted da Edge Functions con
-- service_role key, ma sicuro perché torna solo boolean).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_suppressed(
  p_email TEXT,
  p_company_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.email_suppressions
    WHERE email_normalized = lower(btrim(p_email))
      AND (
        company_id IS NULL          -- suppression globale
        OR company_id = p_company_id -- suppression per la company
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_suppressed(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_suppressed(TEXT, UUID) TO service_role;

COMMENT ON FUNCTION public.is_suppressed(TEXT, UUID) IS
  'Check rapido pre-invio: ritorna true se email è in suppression list globale o per la company. Usata da Edge Functions transactional + marketing.';

COMMENT ON COLUMN public.email_suppressions.company_id IS
  'NULL = suppression globale (hard bounce, spam complaint). NOT NULL = scope per-azienda (unsubscribe marketing).';

COMMENT ON COLUMN public.email_suppressions.source_provider IS
  'Provider che ha emesso l''evento di suppression. Audit per debugging webhook.';
