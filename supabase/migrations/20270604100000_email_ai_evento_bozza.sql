-- ════════════════════════════════════════════════════════════════════════════
-- MP-EMAIL-AI-11 · Da email a evento/appuntamento (proposta, mai cieco)
-- ────────────────────────────────────────────────────────────────────────────
-- Non esiste una tabella agenda nativa (solo integrazioni Google/Apple/Outlook).
-- email_evento_bozza è la PROPOSTA da confermare + il record appuntamento interno
-- una volta confermato. Date relative risolte e MOSTRATE per conferma. Mai evento
-- creato in automatico. Push al calendario esterno = step successivo.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.email_evento_bozza (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email_id           uuid REFERENCES public.email_inbox(id) ON DELETE SET NULL,
  titolo             text,
  inizio             timestamptz,
  fine               timestamptz,
  tutto_il_giorno    boolean NOT NULL DEFAULT false,
  luogo              text,
  partecipanti       text[] NOT NULL DEFAULT '{}',
  promemoria_minuti  int DEFAULT 60,
  cantiere_id        uuid,
  ambiguo            boolean NOT NULL DEFAULT false,   -- data non determinabile con certezza
  nota               text,
  stato              text NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza','aggiunto','scartato')),
  created_by         uuid,
  confirmed_by       uuid,
  confirmed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_evento_bozza_company_stato ON public.email_evento_bozza (company_id, stato, inizio);
CREATE INDEX IF NOT EXISTS idx_email_evento_bozza_email ON public.email_evento_bozza (email_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_evento_bozza_email_alive
  ON public.email_evento_bozza (email_id)
  WHERE email_id IS NOT NULL AND stato IN ('bozza','aggiunto');

ALTER TABLE public.email_evento_bozza ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_evento_bozza_staff_read ON public.email_evento_bozza;
CREATE POLICY email_evento_bozza_staff_read ON public.email_evento_bozza FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS email_evento_bozza_staff_update ON public.email_evento_bozza;
CREATE POLICY email_evento_bozza_staff_update ON public.email_evento_bozza FOR UPDATE TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno())
  WITH CHECK (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS email_evento_bozza_service_all ON public.email_evento_bozza;
CREATE POLICY email_evento_bozza_service_all ON public.email_evento_bozza FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS email_evento_bozza_super_admin ON public.email_evento_bozza;
CREATE POLICY email_evento_bozza_super_admin ON public.email_evento_bozza FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_email_evento_bozza_updated_at ON public.email_evento_bozza;
CREATE TRIGGER trg_email_evento_bozza_updated_at BEFORE UPDATE ON public.email_evento_bozza
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_doc_estratto_updated_at();

COMMENT ON TABLE public.email_evento_bozza IS 'MP-EMAIL-AI-11: appuntamento rilevato da email, da confermare. Mai creazione cieca.';
