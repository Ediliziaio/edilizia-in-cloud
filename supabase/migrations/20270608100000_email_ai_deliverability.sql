-- ════════════════════════════════════════════════════════════════════════════
-- MP-EMAIL-AI-15 · Deliverability: SPF, DKIM, DMARC e reputazione
-- ────────────────────────────────────────────────────────────────────────────
-- Stato autenticazione del dominio mittente (verifica DNS reale) + metriche di
-- consegna. Le chiavi DKIM private restano nel provider, MAI qui. Fondamenta per
-- MP-13 (sequenze): senza, gli invii vanno in spam.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.domini_invio (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  dominio         text NOT NULL,
  spf_ok          boolean,
  dkim_ok         boolean,
  dmarc_ok        boolean,
  dmarc_policy    text,                 -- none|quarantine|reject
  dkim_selector   text,
  ultimo_check_at timestamptz,
  warmup_stato    text DEFAULT 'nuovo', -- nuovo|in_corso|completato
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, dominio)
);

CREATE TABLE IF NOT EXISTS public.deliverability_metriche (
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  giorno      date NOT NULL,
  inviate     int NOT NULL DEFAULT 0,
  consegnate  int NOT NULL DEFAULT 0,
  bounce      int NOT NULL DEFAULT 0,
  spam_report int NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, giorno)
);

ALTER TABLE public.domini_invio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS domini_invio_staff_read ON public.domini_invio;
CREATE POLICY domini_invio_staff_read ON public.domini_invio FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS domini_invio_service_all ON public.domini_invio;
CREATE POLICY domini_invio_service_all ON public.domini_invio FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS domini_invio_super_admin ON public.domini_invio;
CREATE POLICY domini_invio_super_admin ON public.domini_invio FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

ALTER TABLE public.deliverability_metriche ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deliverability_metriche_staff_read ON public.deliverability_metriche;
CREATE POLICY deliverability_metriche_staff_read ON public.deliverability_metriche FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS deliverability_metriche_service_all ON public.deliverability_metriche;
CREATE POLICY deliverability_metriche_service_all ON public.deliverability_metriche FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.domini_invio IS 'MP-EMAIL-AI-15: stato SPF/DKIM/DMARC del dominio mittente (verifica DNS reale).';
