-- ════════════════════════════════════════════════════════════════════════════
-- MP-EMAIL-AI-10 · Collegare email a cantieri (orders) e pratiche (pratiche_edilizie)
-- ────────────────────────────────────────────────────────────────────────────
-- Tabella ponte molti-a-molti. COLLEGAMENTO, non spostamento: l'email resta in
-- casella, si crea solo un legame. Niente modifiche ai moduli cantieri/pratiche.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.email_collegamenti (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email_id      uuid NOT NULL REFERENCES public.email_inbox(id) ON DELETE CASCADE,
  thread_id     uuid,
  oggetto_tipo  text NOT NULL CHECK (oggetto_tipo IN ('cantiere','pratica')),
  oggetto_id    uuid NOT NULL,
  origine       text NOT NULL DEFAULT 'manuale' CHECK (origine IN ('auto','suggerito','manuale','ereditato_thread')),
  confidenza    numeric,
  collegato_da  uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email_id, oggetto_tipo, oggetto_id)
);

CREATE INDEX IF NOT EXISTS idx_email_collegamenti_oggetto ON public.email_collegamenti (company_id, oggetto_tipo, oggetto_id);
CREATE INDEX IF NOT EXISTS idx_email_collegamenti_email ON public.email_collegamenti (email_id);
CREATE INDEX IF NOT EXISTS idx_email_collegamenti_thread ON public.email_collegamenti (thread_id) WHERE thread_id IS NOT NULL;

ALTER TABLE public.email_collegamenti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_collegamenti_staff_read ON public.email_collegamenti;
CREATE POLICY email_collegamenti_staff_read ON public.email_collegamenti
  FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());

DROP POLICY IF EXISTS email_collegamenti_staff_write ON public.email_collegamenti;
CREATE POLICY email_collegamenti_staff_write ON public.email_collegamenti
  FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno())
  WITH CHECK (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());

DROP POLICY IF EXISTS email_collegamenti_service_all ON public.email_collegamenti;
CREATE POLICY email_collegamenti_service_all ON public.email_collegamenti
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS email_collegamenti_super_admin ON public.email_collegamenti;
CREATE POLICY email_collegamenti_super_admin ON public.email_collegamenti
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

COMMENT ON TABLE public.email_collegamenti IS 'MP-EMAIL-AI-10: ponte email↔cantiere(orders)/pratica(pratiche_edilizie). Collega, non sposta.';
