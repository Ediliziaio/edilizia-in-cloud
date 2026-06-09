-- =============================================================================
-- White-label Produttore → Rivenditori — FONDAMENTA (gerarchia + billing)
-- =============================================================================
-- Modello: un PRODUTTORE (fabbrica serramenti, company con whitelabel_tier='agency')
-- offre il software ai suoi RIVENDITORI. Ogni rivenditore = company figlia (tenant
-- isolato) col brand del produttore. Due modelli di pagamento, scelti per-produttore:
--   • fabbrica_paga   → i rivenditori sono "comped" (paga il produttore)
--   • reseller_paga   → ogni rivenditore paga noi (+ markup al produttore)
--
-- Questa migration aggiunge SOLO le fondamenta (colonne + RLS additiva + helper).
-- Provisioning, portale produttore, branding ereditato e webhook billing = fasi 2-3.
-- Additiva e idempotente. NON applicata (modalità solo-locale).
-- =============================================================================

-- ── Gerarchia ────────────────────────────────────────────────────────────────
-- Rivenditore → Produttore. NULL = company normale o produttore di primo livello.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS parent_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_companies_parent_company_id
  ON public.companies(parent_company_id) WHERE parent_company_id IS NOT NULL;

-- ── Billing ──────────────────────────────────────────────────────────────────
-- billing_comped = true  → paga il PRODUTTORE (modello fabbrica-paga); il rivenditore
--                          non è fatturato direttamente da noi.
-- billing_comped = false → il rivenditore paga noi (modello ogni-rivenditore-paga).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_comped boolean NOT NULL DEFAULT false;

-- Modello scelto dal produttore per i suoi rivenditori (default di provisioning).
-- NB: companies.billing_mode (external|native) esiste GIÀ con altro significato → NON toccato.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS reseller_billing_mode text
    CHECK (reseller_billing_mode IS NULL OR reseller_billing_mode IN ('fabbrica_paga','reseller_paga'));

COMMENT ON COLUMN public.companies.parent_company_id IS
  'Produttore/fabbrica padre di questo rivenditore (white-label). NULL = company normale.';
COMMENT ON COLUMN public.companies.billing_comped IS
  'true = rivenditore pagato dal produttore (fabbrica-paga); false = paga noi.';
COMMENT ON COLUMN public.companies.reseller_billing_mode IS
  'Sul produttore: modello billing per i rivenditori (fabbrica_paga|reseller_paga).';

-- ── RLS additiva: il produttore vede le company dei suoi rivenditori ─────────
-- Additiva (OR con le policy esistenti) → non altera l'accesso corrente.
DROP POLICY IF EXISTS companies_produttore_vede_rivenditori ON public.companies;
CREATE POLICY companies_produttore_vede_rivenditori ON public.companies
  FOR SELECT TO authenticated
  USING (
    parent_company_id IS NOT NULL
    AND parent_company_id = public.get_user_company_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'company_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'produttore_admin'::public.app_role)
    )
  );

-- ── Helper riusabile: questa company è un mio rivenditore? ───────────────────
-- Per le policy sulle tabelle figlie (Fase 3) e per i gate UI.
CREATE OR REPLACE FUNCTION public.is_mio_rivenditore(p_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = p_company_id
      AND c.parent_company_id = public.get_user_company_id(auth.uid())
      AND (
        public.has_role(auth.uid(), 'company_admin'::public.app_role)
        OR public.has_role(auth.uid(), 'produttore_admin'::public.app_role)
      )
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_mio_rivenditore(uuid) TO authenticated;

-- ── RLS: il produttore gestisce il branding della PROPRIA azienda ────────────
-- Il portale produttore usa il ruolo produttore_admin (NON company_admin), che
-- la policy company_admin_manage_branding non copre. Additiva: permette al
-- produttore di leggere/scrivere SOLO il branding white-label della sua azienda
-- (quello che i rivenditori erediteranno).
DROP POLICY IF EXISTS produttore_manage_own_branding ON public.company_branding;
CREATE POLICY produttore_manage_own_branding ON public.company_branding
  FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'produttore_admin'::public.app_role)
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'produttore_admin'::public.app_role)
  );
