-- ============================================================================
-- v8.6.58 — Dati fatturazione separati dall'anagrafica company
--
-- Use case: il cliente può avere l'anagrafica aziendale (profilo) diversa
-- dai dati di fatturazione (es. holding paga per sussidiaria, P.IVA
-- diversa, indirizzo legale diverso). Stripe Customer non basta perché
-- vogliamo questi dati anche per la fatturazione nativa SDI italiana.
--
-- Schema 1:1 con companies (PK = company_id). Optional: row creata
-- al primo salvataggio dall'utente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_billing_details (
  company_id        UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Anagrafica fiscale (può differire da `companies.name`)
  legal_name        TEXT,
  vat_number        TEXT, -- P.IVA (IT12345678901 o estero)
  tax_code          TEXT, -- Codice fiscale (per ditte individuali / persone fisiche)

  -- Indirizzo di fatturazione
  address_line1     TEXT,
  address_line2     TEXT,
  postal_code       TEXT,
  city              TEXT,
  province          TEXT, -- sigla 2 lettere (MI, RM, ...)
  country           TEXT NOT NULL DEFAULT 'IT',

  -- Contatti fiscali
  pec               TEXT, -- PEC obbligatoria per B2B IT
  sdi_code          TEXT, -- Codice destinatario SDI (7 char)

  -- Preferenze
  invoice_email     TEXT, -- email a cui inviare copia PDF fattura
  payment_method    TEXT CHECK (payment_method IS NULL OR payment_method IN ('card', 'bank_transfer', 'sepa')),

  -- Audit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        UUID REFERENCES auth.users(id)
);

-- Constraint validity
ALTER TABLE public.company_billing_details
  ADD CONSTRAINT cbd_vat_format
  CHECK (vat_number IS NULL OR length(vat_number) BETWEEN 6 AND 20);

ALTER TABLE public.company_billing_details
  ADD CONSTRAINT cbd_sdi_format
  CHECK (sdi_code IS NULL OR length(sdi_code) = 7);

ALTER TABLE public.company_billing_details
  ADD CONSTRAINT cbd_pec_email
  CHECK (pec IS NULL OR pec ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$');

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.cbd_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cbd_updated_at ON public.company_billing_details;
CREATE TRIGGER trg_cbd_updated_at
  BEFORE UPDATE ON public.company_billing_details
  FOR EACH ROW EXECUTE FUNCTION public.cbd_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.company_billing_details ENABLE ROW LEVEL SECURITY;

-- Lettura: utenti della company + super_admin
DROP POLICY IF EXISTS cbd_read ON public.company_billing_details;
CREATE POLICY cbd_read
  ON public.company_billing_details FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Write: solo company_admin + super_admin
DROP POLICY IF EXISTS cbd_admin_write ON public.company_billing_details;
CREATE POLICY cbd_admin_write
  ON public.company_billing_details FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'company_admin')
    )
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'company_admin')
    )
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );
