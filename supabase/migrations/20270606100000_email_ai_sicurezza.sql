-- ════════════════════════════════════════════════════════════════════════════
-- MP-EMAIL-AI-16 · Sicurezza in arrivo: anti-phishing e frodi IBAN
-- ────────────────────────────────────────────────────────────────────────────
-- Colonne rischio su email_inbox (per trasparenza + digest MP-14) e storico IBAN
-- fornitori. La valutazione del rischio è deterministica (lib risk-signals, lato
-- client per l'avviso immediato). Mai aggiornamento IBAN automatico.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.email_inbox
  ADD COLUMN IF NOT EXISTS rischio_livello text,        -- 'basso'|'medio'|'alto'
  ADD COLUMN IF NOT EXISTS rischio_segnali jsonb;       -- [{codice,descrizione,peso}]

CREATE TABLE IF NOT EXISTS public.fornitori_iban_storico (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fornitore_id         uuid NOT NULL,
  fornitore_tipo       text,                            -- 'fornitore' (suppliers) | 'anagrafica'
  iban                 text NOT NULL,
  visto_la_prima_volta timestamptz NOT NULL DEFAULT now(),
  confermato           boolean NOT NULL DEFAULT false,
  confermato_da        uuid,
  confermato_at        timestamptz,
  fonte                text,                            -- 'email'|'pdf'|'manuale'
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, fornitore_id, iban)
);
CREATE INDEX IF NOT EXISTS idx_fornitori_iban_storico_forn ON public.fornitori_iban_storico (company_id, fornitore_id);

ALTER TABLE public.fornitori_iban_storico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fornitori_iban_storico_staff_read ON public.fornitori_iban_storico;
CREATE POLICY fornitori_iban_storico_staff_read ON public.fornitori_iban_storico FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS fornitori_iban_storico_staff_write ON public.fornitori_iban_storico;
CREATE POLICY fornitori_iban_storico_staff_write ON public.fornitori_iban_storico FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno())
  WITH CHECK (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS fornitori_iban_storico_service_all ON public.fornitori_iban_storico;
CREATE POLICY fornitori_iban_storico_service_all ON public.fornitori_iban_storico FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS fornitori_iban_storico_super_admin ON public.fornitori_iban_storico;
CREATE POLICY fornitori_iban_storico_super_admin ON public.fornitori_iban_storico FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

COMMENT ON TABLE public.fornitori_iban_storico IS 'MP-EMAIL-AI-16: storico IBAN per fornitore. Nuovo IBAN confermato solo con verifica umana (anti BEC).';
