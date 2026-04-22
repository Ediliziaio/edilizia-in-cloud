-- ============================================================================
-- Email Dual-Provider — FASE 2: company_email_preferences
-- ============================================================================
-- Tabella per branding dinamico applicato ai template master React Email
-- in fase di render. Ogni azienda ha 1 riga (PRIMARY KEY = company_id).
--
-- Riferimenti:
--   - logo, colori, footer, sender_name → applicati dal Layout component
--   - sender_prefix → noreply@, info@, ecc. (validato regex)
--   - reply_to_email → richiesto, default = company.email
--   - {transactional,marketing}_domain_id → punta a company_email_domains
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_email_preferences (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Branding dinamico applicato ai template master in fase di render
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#1E3A5F'
    CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color TEXT NOT NULL DEFAULT '#F97316'
    CHECK (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  footer_text TEXT,
  footer_show_powered_by BOOLEAN NOT NULL DEFAULT true,

  -- Identità mittente (applicata sia ai template transactional che marketing)
  sender_name TEXT,
  sender_prefix TEXT NOT NULL DEFAULT 'no-reply'
    CHECK (sender_prefix ~ '^[a-z0-9._-]{1,30}$'),
  reply_to_email TEXT NOT NULL,

  -- Dominio selezionato per stream (NULL = fallback EiC sottodomini condivisi)
  transactional_domain_id UUID REFERENCES public.company_email_domains(id) ON DELETE SET NULL,
  marketing_domain_id UUID REFERENCES public.company_email_domains(id) ON DELETE SET NULL,

  -- Compliance: override unsubscribe footer HTML (se NULL usa default Layout)
  unsubscribe_footer_html TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_company_email_preferences_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_email_preferences_updated_at ON public.company_email_preferences;
CREATE TRIGGER company_email_preferences_updated_at
  BEFORE UPDATE ON public.company_email_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_company_email_preferences_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE public.company_email_preferences ENABLE ROW LEVEL SECURITY;

-- Read: any member of the company OR super_admin
DROP POLICY IF EXISTS cep_read ON public.company_email_preferences;
CREATE POLICY cep_read ON public.company_email_preferences
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id IN (
      SELECT company_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  );

-- Write (INSERT/UPDATE/DELETE): company_admin OR super_admin
DROP POLICY IF EXISTS cep_write ON public.company_email_preferences;
CREATE POLICY cep_write ON public.company_email_preferences
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id IN (
      SELECT company_id FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'company_admin'::public.app_role
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR company_id IN (
      SELECT company_id FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = 'company_admin'::public.app_role
    )
  );

-- ============================================================================
-- Seed: una riga per ogni company esistente con valori di default
-- (reply_to_email viene preso da companies.email — campo obbligatorio sul
--  modello companies — altrimenti placeholder se NULL)
-- ============================================================================
INSERT INTO public.company_email_preferences (
  company_id,
  reply_to_email,
  sender_name
)
SELECT
  c.id,
  COALESCE(NULLIF(btrim(c.email), ''), 'admin-da-configurare@example.com'),
  COALESCE(NULLIF(btrim(c.name), ''), 'La tua azienda')
FROM public.companies c
ON CONFLICT (company_id) DO NOTHING;

-- ============================================================================
-- Trigger: crea preferences automaticamente per ogni nuova company
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_default_email_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_email_preferences (
    company_id,
    reply_to_email,
    sender_name
  ) VALUES (
    NEW.id,
    COALESCE(NULLIF(btrim(NEW.email), ''), 'admin-da-configurare@example.com'),
    COALESCE(NULLIF(btrim(NEW.name), ''), 'La tua azienda')
  )
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_create_email_prefs ON public.companies;
CREATE TRIGGER companies_create_email_prefs
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_email_preferences();

COMMENT ON TABLE public.company_email_preferences IS
  'Branding dinamico + identità mittente per stream. Applicato ai template master React Email in fase di render.';

COMMENT ON COLUMN public.company_email_preferences.transactional_domain_id IS
  'NULL = fallback notifiche.ediliziaincloud.it. NOT NULL = dominio custom verificato del cliente.';

COMMENT ON COLUMN public.company_email_preferences.marketing_domain_id IS
  'NULL = fallback mail.ediliziaincloud.it. NOT NULL = dominio custom verificato del cliente.';
