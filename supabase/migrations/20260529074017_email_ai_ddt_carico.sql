-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.email_ddt_carico (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email_id              uuid REFERENCES public.email_inbox(id) ON DELETE SET NULL,
  documento_estratto_id uuid REFERENCES public.email_documento_estratto(id) ON DELETE CASCADE,
  fornitore_match_id    uuid,
  ddt_numero            text,
  ddt_data              date,
  purchase_order_id     uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  purchase_order_numero text,
  senza_ordine          boolean NOT NULL DEFAULT false,
  righe                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  scostamenti_totali    int NOT NULL DEFAULT 0,
  stato                 text NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza','confermato','scartato')),
  movimento_created     boolean NOT NULL DEFAULT false,
  created_by            uuid,
  confirmed_by          uuid,
  confirmed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_ddt_carico_company_stato ON public.email_ddt_carico (company_id, stato, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_ddt_carico_email ON public.email_ddt_carico (email_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_ddt_carico_doc_alive
  ON public.email_ddt_carico (documento_estratto_id)
  WHERE documento_estratto_id IS NOT NULL AND stato IN ('bozza','confermato');

ALTER TABLE public.email_ddt_carico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_ddt_carico_staff_read ON public.email_ddt_carico;
CREATE POLICY email_ddt_carico_staff_read ON public.email_ddt_carico
  FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());

DROP POLICY IF EXISTS email_ddt_carico_staff_update ON public.email_ddt_carico;
CREATE POLICY email_ddt_carico_staff_update ON public.email_ddt_carico
  FOR UPDATE TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno())
  WITH CHECK (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());

DROP POLICY IF EXISTS email_ddt_carico_service_all ON public.email_ddt_carico;
CREATE POLICY email_ddt_carico_service_all ON public.email_ddt_carico
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS email_ddt_carico_super_admin ON public.email_ddt_carico;
CREATE POLICY email_ddt_carico_super_admin ON public.email_ddt_carico
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_email_ddt_carico_updated_at ON public.email_ddt_carico;
CREATE TRIGGER trg_email_ddt_carico_updated_at
  BEFORE UPDATE ON public.email_ddt_carico
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_doc_estratto_updated_at();

COMMENT ON TABLE public.email_ddt_carico IS 'MP-EMAIL-AI-07: proposta di carico magazzino da DDT email, con confronto ODA. Mai movimento automatico.';
