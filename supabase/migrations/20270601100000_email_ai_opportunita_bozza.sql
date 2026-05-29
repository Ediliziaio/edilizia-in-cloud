-- ════════════════════════════════════════════════════════════════════════════
-- MP-EMAIL-AI-08 · Da email a opportunità + bozza preventivo
-- ────────────────────────────────────────────────────────────────────────────
-- L'AI capisce e prepara, NON prezza (cap.2). Apre una BOZZA di opportunità con
-- la richiesta estratta + cliente collegato. L'apertura reale nel funnel
-- (marketing_opportunities: richiede contact/pipeline/stage) e il preventivo
-- restano azione umana confermata. Niente creazione cieca cliente, niente duplicati.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.email_opportunita_bozza (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email_id             uuid REFERENCES public.email_inbox(id) ON DELETE SET NULL,
  cliente_match_id     uuid,                 -- anagrafiche_native se trovato
  cliente_match_tipo   text,                 -- 'cliente' | null
  cliente_nuovo        jsonb,                -- { nome, email, telefono } dai dati firma (se nuovo)
  tipo_lavoro          text,
  indirizzo            text,
  tempistiche          text,
  vincoli              text,
  richiesta_sintesi    text,
  allegati             jsonb NOT NULL DEFAULT '[]'::jsonb,
  dedup_opportunita_id uuid,                 -- opportunità aperta già esistente (collega, non duplica)
  opportunita_creata_id uuid,                -- marketing_opportunities, dopo apertura
  quote_id             uuid,                 -- bozza preventivo collegata, dopo creazione
  stato                text NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza','aperta','scartata')),
  created_by           uuid,
  confirmed_by         uuid,
  confirmed_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_opp_bozza_company_stato ON public.email_opportunita_bozza (company_id, stato, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_opp_bozza_email ON public.email_opportunita_bozza (email_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_opp_bozza_email_alive
  ON public.email_opportunita_bozza (email_id)
  WHERE email_id IS NOT NULL AND stato IN ('bozza','aperta');

ALTER TABLE public.email_opportunita_bozza ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_opp_bozza_staff_read ON public.email_opportunita_bozza;
CREATE POLICY email_opp_bozza_staff_read ON public.email_opportunita_bozza
  FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());

DROP POLICY IF EXISTS email_opp_bozza_staff_update ON public.email_opportunita_bozza;
CREATE POLICY email_opp_bozza_staff_update ON public.email_opportunita_bozza
  FOR UPDATE TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno())
  WITH CHECK (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());

DROP POLICY IF EXISTS email_opp_bozza_service_all ON public.email_opportunita_bozza;
CREATE POLICY email_opp_bozza_service_all ON public.email_opportunita_bozza
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS email_opp_bozza_super_admin ON public.email_opportunita_bozza;
CREATE POLICY email_opp_bozza_super_admin ON public.email_opportunita_bozza
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_email_opp_bozza_updated_at ON public.email_opportunita_bozza;
CREATE TRIGGER trg_email_opp_bozza_updated_at
  BEFORE UPDATE ON public.email_opportunita_bozza
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_doc_estratto_updated_at();

COMMENT ON TABLE public.email_opportunita_bozza IS 'MP-EMAIL-AI-08: bozza opportunità da richiesta preventivo via email. Niente prezzi/clienti automatici.';
