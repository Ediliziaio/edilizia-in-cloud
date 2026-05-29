-- ════════════════════════════════════════════════════════════════════════════
-- MP-EMAIL-AI-09 · Da email/documento a scadenzario (Cashflow previsionale)
-- ────────────────────────────────────────────────────────────────────────────
-- Scadenze rilevate = voci PREVISIONALI da confermare, non fatti (cap.2).
-- - scadenze: +email_id, +email_documento_estratto_id, +is_previsionale (additivo).
-- - email_scadenza_bozza: scadenza rilevata in attesa di conferma umana.
-- - RPC email_scadenza_conferma: alla conferma crea una scadenza VALIDA
--   (status 'da_pagare', is_previsionale=true) → alimenta il Cashflow. Staff interno.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.scadenze
  ADD COLUMN IF NOT EXISTS email_id uuid,
  ADD COLUMN IF NOT EXISTS email_documento_estratto_id uuid,
  ADD COLUMN IF NOT EXISTS is_previsionale boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.scadenze.is_previsionale IS 'MP-EMAIL-AI-09: scadenza previsionale rilevata da email (non ancora consuntivata da banking/utente).';

CREATE TABLE IF NOT EXISTS public.email_scadenza_bozza (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email_id              uuid REFERENCES public.email_inbox(id) ON DELETE SET NULL,
  documento_estratto_id uuid REFERENCES public.email_documento_estratto(id) ON DELETE CASCADE,
  direzione             text NOT NULL DEFAULT 'uscita' CHECK (direzione IN ('entrata','uscita')),
  amount                numeric NOT NULL,
  due_date              date NOT NULL,
  descrizione           text,
  controparte_id        uuid,
  controparte_tipo      text,                 -- fornitore | cliente
  dedup_scadenza_id     uuid,                 -- scadenza già presente per quel documento
  scadenza_creata_id    uuid REFERENCES public.scadenze(id) ON DELETE SET NULL,
  stato                 text NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza','aggiunta','scartata')),
  created_by            uuid,
  confirmed_by          uuid,
  confirmed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_scad_bozza_company_stato ON public.email_scadenza_bozza (company_id, stato, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_scad_bozza_email ON public.email_scadenza_bozza (email_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_scad_bozza_doc_alive
  ON public.email_scadenza_bozza (documento_estratto_id)
  WHERE documento_estratto_id IS NOT NULL AND stato IN ('bozza','aggiunta');

ALTER TABLE public.email_scadenza_bozza ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_scad_bozza_staff_read ON public.email_scadenza_bozza;
CREATE POLICY email_scad_bozza_staff_read ON public.email_scadenza_bozza
  FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS email_scad_bozza_staff_update ON public.email_scadenza_bozza;
CREATE POLICY email_scad_bozza_staff_update ON public.email_scadenza_bozza
  FOR UPDATE TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno())
  WITH CHECK (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS email_scad_bozza_service_all ON public.email_scadenza_bozza;
CREATE POLICY email_scad_bozza_service_all ON public.email_scadenza_bozza
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS email_scad_bozza_super_admin ON public.email_scadenza_bozza;
CREATE POLICY email_scad_bozza_super_admin ON public.email_scadenza_bozza
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_email_scad_bozza_updated_at ON public.email_scadenza_bozza;
CREATE TRIGGER trg_email_scad_bozza_updated_at
  BEFORE UPDATE ON public.email_scadenza_bozza
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_doc_estratto_updated_at();

-- Conferma: crea una scadenza VALIDA (vincoli rispettati) e collega la bozza.
CREATE OR REPLACE FUNCTION public.email_scadenza_conferma(p_bozza_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_b record; v_id uuid; v_tipo text;
BEGIN
  IF NOT public.is_email_staff_interno() THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_company := public.get_effective_company_id();
  SELECT * INTO v_b FROM public.email_scadenza_bozza WHERE id = p_bozza_id AND company_id = v_company;
  IF v_b.id IS NULL THEN RAISE EXCEPTION 'bozza_not_found'; END IF;
  IF v_b.scadenza_creata_id IS NOT NULL THEN RETURN v_b.scadenza_creata_id; END IF;
  v_tipo := CASE WHEN v_b.direzione = 'entrata' THEN 'incasso_cliente' ELSE 'pagamento_fornitore' END;
  INSERT INTO public.scadenze (company_id, tipo, direction, description, amount, due_date, status,
                               paid_amount, is_recurring, is_auto_generated, auto_source, is_previsionale,
                               email_id, email_documento_estratto_id, created_by)
  VALUES (v_company, v_tipo, v_b.direzione, COALESCE(NULLIF(trim(v_b.descrizione),''), 'Scadenza rilevata da email'),
          v_b.amount, v_b.due_date, 'da_pagare', 0, false, true, 'email_ai', true,
          v_b.email_id, v_b.documento_estratto_id, auth.uid())
  RETURNING id INTO v_id;
  UPDATE public.email_scadenza_bozza
    SET stato='aggiunta', scadenza_creata_id=v_id, confirmed_by=auth.uid(), confirmed_at=now()
    WHERE id = p_bozza_id;
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.email_scadenza_conferma(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_scadenza_conferma(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.email_scadenza_bozza IS 'MP-EMAIL-AI-09: scadenza previsionale rilevata da email/documento, in attesa di conferma umana.';
