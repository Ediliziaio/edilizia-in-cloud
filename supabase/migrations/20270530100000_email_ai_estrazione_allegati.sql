-- ════════════════════════════════════════════════════════════════════════════
-- MP-EMAIL-AI-06 · Estrazione dati da allegati PDF → bozza gestionale
-- ────────────────────────────────────────────────────────────────────────────
-- Tabella delle BOZZE estratte (stato da_confermare). Regola d'oro: mai
-- registrazione automatica — l'utente conferma. RLS: staff interno (doc fiscali).
-- Dedup verso fatture_ricevute (SDI) per non creare doppioni.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.email_documento_estratto (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email_id             uuid REFERENCES public.email_inbox(id) ON DELETE SET NULL,
  attachment_id        uuid REFERENCES public.email_attachments(id) ON DELETE SET NULL,
  tipo                 text NOT NULL DEFAULT 'altro',          -- fattura|proforma|nota_credito|ddt|altro
  confidenza_tipo      numeric,
  campi                jsonb NOT NULL DEFAULT '{}'::jsonb,     -- { piva:{valore,conf}, numero:{...}, ... }
  dati_incerti         text[] NOT NULL DEFAULT '{}',
  note                 text,
  stato                text NOT NULL DEFAULT 'da_confermare'   -- da_confermare|confermato|scartato|duplicato
                         CHECK (stato IN ('da_confermare','confermato','scartato','duplicato')),
  fornitore_match_id   uuid,
  fornitore_match_tipo text,                                   -- fornitore|cliente
  dedup_fattura_id     uuid REFERENCES public.fatture_ricevute(id) ON DELETE SET NULL,
  iban_estratto        text,
  iban_alert           boolean NOT NULL DEFAULT false,         -- IBAN diverso dal noto (anti-frode BEC)
  documento_creato_tipo text,                                  -- fattura_ricevuta|ddt_ricezione|...
  documento_creato_id  uuid,
  pdf_storage_bucket   text,
  pdf_storage_path     text,
  created_by           uuid,
  confirmed_by         uuid,
  confirmed_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_doc_estratto_company_stato
  ON public.email_documento_estratto (company_id, stato, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_doc_estratto_email
  ON public.email_documento_estratto (email_id);
-- Gli allegati inbox vivono come JSONB su email_inbox (con storage_path), non in
-- email_attachments. Dedup bozza "viva" per (email, file): una sola bozza attiva.
-- Solo gli stati "pendenti" (da_confermare|duplicato) sono unici per file: un
-- documento già confermato è storia e non blocca una nuova estrazione (l'edge
-- cancella i pendenti prima di re-inserire — coerente con questo WHERE).
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_doc_estratto_file_alive
  ON public.email_documento_estratto (email_id, pdf_storage_path)
  WHERE pdf_storage_path IS NOT NULL AND stato IN ('da_confermare','duplicato');

ALTER TABLE public.email_documento_estratto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_doc_estratto_staff_read ON public.email_documento_estratto;
CREATE POLICY email_doc_estratto_staff_read ON public.email_documento_estratto
  FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());

DROP POLICY IF EXISTS email_doc_estratto_staff_update ON public.email_documento_estratto;
CREATE POLICY email_doc_estratto_staff_update ON public.email_documento_estratto
  FOR UPDATE TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno())
  WITH CHECK (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());

DROP POLICY IF EXISTS email_doc_estratto_service_all ON public.email_documento_estratto;
CREATE POLICY email_doc_estratto_service_all ON public.email_documento_estratto
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS email_doc_estratto_super_admin ON public.email_documento_estratto;
CREATE POLICY email_doc_estratto_super_admin ON public.email_documento_estratto
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.tg_email_doc_estratto_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_email_doc_estratto_updated_at ON public.email_documento_estratto;
CREATE TRIGGER trg_email_doc_estratto_updated_at
  BEFORE UPDATE ON public.email_documento_estratto
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_doc_estratto_updated_at();

COMMENT ON TABLE public.email_documento_estratto IS 'MP-EMAIL-AI-06: bozze estratte da PDF allegati (mai auto-registrate). RLS staff interno.';
