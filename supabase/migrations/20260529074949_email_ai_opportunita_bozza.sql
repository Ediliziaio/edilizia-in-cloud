-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.email_opportunita_bozza (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email_id             uuid REFERENCES public.email_inbox(id) ON DELETE SET NULL,
  cliente_match_id     uuid,
  cliente_match_tipo   text,
  cliente_nuovo        jsonb,
  tipo_lavoro          text,
  indirizzo            text,
  tempistiche          text,
  vincoli              text,
  richiesta_sintesi    text,
  allegati             jsonb NOT NULL DEFAULT '[]'::jsonb,
  dedup_opportunita_id uuid,
  opportunita_creata_id uuid,
  quote_id             uuid,
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
