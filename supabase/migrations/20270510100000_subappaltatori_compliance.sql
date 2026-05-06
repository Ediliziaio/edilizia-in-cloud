-- MP-COMP-03 — Subappaltatore Compliance Unificato
-- ════════════════════════════════════════════════════════════════════════════
-- Fascicolo unico subappaltatore: DURC + visura CCIAA + DVR + POS + SOA +
-- polizza RC + Cassa Edile. Monitora scadenze, OCR documenti uploadati,
-- score compliance, blocca pagamenti su irregolarità.
--
-- Defensive: subappaltatori_documenti NON esiste → CREATE TABLE.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.subappaltatori_documenti (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subappaltatore_id uuid NOT NULL REFERENCES public.subappaltatori(id) ON DELETE CASCADE,

  tipo            text NOT NULL CHECK (tipo IN (
    'durc','visura','dvr','pos','soa','polizza_rc','cassa_edile',
    'antimafia','iscrizione_albo','formazione_operai','altro'
  )),
  numero_protocollo text,

  data_emissione  date,
  scadenza        date,

  -- File
  storage_path    text,
  pdf_size_bytes  int,

  -- AI extraction
  ai_parsed       boolean NOT NULL DEFAULT false,
  ai_extracted_data jsonb,
  ai_validity_check jsonb,
  ai_confidence   numeric(3,2),

  -- Stato
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','superseded','revoked')),
  superseded_by   uuid REFERENCES public.subappaltatori_documenti(id) ON DELETE SET NULL,

  -- Esito (per DURC: regolare/irregolare; altri: valid/expired)
  esito           text CHECK (esito IN ('regolare','irregolare','in_attesa','valid','expired','errore')),
  irregularity_details text,

  -- Notification tracking (idempotente)
  alert_30d_sent_at      timestamptz,
  alert_15d_sent_at      timestamptz,
  alert_expired_sent_at  timestamptz,

  -- Renewal workflow
  renewal_requested_at   timestamptz,
  renewal_received_at    timestamptz,

  uploaded_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_docs_company_sub
  ON public.subappaltatori_documenti(company_id, subappaltatore_id, tipo);
CREATE INDEX IF NOT EXISTS idx_sub_docs_scadenza
  ON public.subappaltatori_documenti(scadenza) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sub_docs_irregolari
  ON public.subappaltatori_documenti(company_id, esito) WHERE esito = 'irregolare' AND status = 'active';

ALTER TABLE public.subappaltatori_documenti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sub_docs_company_read ON public.subappaltatori_documenti;
CREATE POLICY sub_docs_company_read ON public.subappaltatori_documenti FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS sub_docs_admin ON public.subappaltatori_documenti;
CREATE POLICY sub_docs_admin ON public.subappaltatori_documenti FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS sub_docs_super_admin ON public.subappaltatori_documenti;
CREATE POLICY sub_docs_super_admin ON public.subappaltatori_documenti FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_sub_docs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_sub_docs_updated_at ON public.subappaltatori_documenti;
CREATE TRIGGER trg_sub_docs_updated_at
  BEFORE UPDATE ON public.subappaltatori_documenti
  FOR EACH ROW EXECUTE FUNCTION public.tg_sub_docs_updated_at();

-- Trigger: supersede docs vecchi (stesso tipo+sub) quando ne arriva uno nuovo
CREATE OR REPLACE FUNCTION public.tg_supersede_old_sub_doc()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE public.subappaltatori_documenti
       SET status = 'superseded', superseded_by = NEW.id, updated_at = NOW()
     WHERE company_id = NEW.company_id
       AND subappaltatore_id = NEW.subappaltatore_id
       AND tipo = NEW.tipo
       AND status = 'active'
       AND id != NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_supersede_sub_doc ON public.subappaltatori_documenti;
CREATE TRIGGER trg_supersede_sub_doc
  AFTER INSERT ON public.subappaltatori_documenti
  FOR EACH ROW EXECUTE FUNCTION public.tg_supersede_old_sub_doc();

-- ────────────────────────────────────────────────────────────────────────────
-- View compliance status (semaforo per subappaltatore)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.subappaltatore_compliance_status
WITH (security_invoker = true) AS
WITH active_docs AS (
  SELECT
    sd.subappaltatore_id,
    sd.company_id,
    sd.tipo,
    sd.scadenza,
    sd.esito,
    sd.id AS doc_id
  FROM public.subappaltatori_documenti sd
  WHERE sd.status = 'active'
)
SELECT
  s.id AS subappaltatore_id,
  s.company_id,
  s.ragione_sociale AS denominazione,
  COALESCE(BOOL_OR(ad.tipo='durc' AND ad.scadenza > current_date AND COALESCE(ad.esito,'regolare') = 'regolare'), false) AS durc_ok,
  COALESCE(BOOL_OR(ad.tipo='visura' AND ad.scadenza > current_date), false) AS visura_ok,
  COALESCE(BOOL_OR(ad.tipo='dvr' AND (ad.scadenza IS NULL OR ad.scadenza > current_date)), false) AS dvr_ok,
  COALESCE(BOOL_OR(ad.tipo='pos' AND (ad.scadenza IS NULL OR ad.scadenza > current_date)), false) AS pos_ok,
  COALESCE(BOOL_OR(ad.tipo='soa' AND ad.scadenza > current_date), false) AS soa_ok,
  COALESCE(BOOL_OR(ad.tipo='polizza_rc' AND ad.scadenza > current_date), false) AS polizza_rc_ok,
  COALESCE(BOOL_OR(ad.tipo='cassa_edile' AND ad.scadenza > current_date), false) AS cassa_edile_ok,
  -- Compliance score: % documenti core (durc/visura/dvr/polizza/cassa) validi
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE ad.tipo IN ('durc','visura','dvr','polizza_rc','cassa_edile')
        AND (ad.scadenza IS NULL OR ad.scadenza > current_date)
        AND COALESCE(ad.esito, 'regolare') NOT IN ('irregolare')
    ) /
    NULLIF(GREATEST(5, COUNT(DISTINCT ad.tipo) FILTER (
      WHERE ad.tipo IN ('durc','visura','dvr','polizza_rc','cassa_edile')
    )), 0),
    1
  ) AS compliance_score,
  -- Prossima scadenza entro 30 giorni
  MIN(ad.scadenza) FILTER (WHERE ad.scadenza > current_date AND ad.scadenza < current_date + 30) AS next_expiry_30d,
  -- Conteggio doc irregolari
  COUNT(*) FILTER (WHERE ad.esito = 'irregolare') AS count_irregolari,
  -- Should block payments?
  COUNT(*) FILTER (WHERE ad.esito = 'irregolare' AND ad.tipo IN ('durc','cassa_edile')) > 0 AS should_block_payments
FROM public.subappaltatori s
LEFT JOIN active_docs ad ON ad.subappaltatore_id = s.id
GROUP BY s.id, s.company_id, s.ragione_sociale;

GRANT SELECT ON public.subappaltatore_compliance_status TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_lista_subappaltatori_compliance
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_subappaltatori_compliance(
  p_company_id uuid,
  p_user_id uuid,
  p_only_non_compliant boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'count_blocked', COUNT(*) FILTER (WHERE should_block_payments = true),
    'count_irregolari', COUNT(*) FILTER (WHERE count_irregolari > 0),
    'subappaltatori', COALESCE(jsonb_agg(
      jsonb_build_object(
        'subappaltatore_id', subappaltatore_id,
        'denominazione', denominazione,
        'compliance_score', compliance_score,
        'durc_ok', durc_ok,
        'visura_ok', visura_ok,
        'dvr_ok', dvr_ok,
        'pos_ok', pos_ok,
        'polizza_rc_ok', polizza_rc_ok,
        'cassa_edile_ok', cassa_edile_ok,
        'next_expiry_30d', next_expiry_30d,
        'count_irregolari', count_irregolari,
        'should_block_payments', should_block_payments
      ) ORDER BY compliance_score ASC NULLS FIRST
    ) FILTER (WHERE subappaltatore_id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM public.subappaltatore_compliance_status
  WHERE company_id = p_company_id
    AND (NOT p_only_non_compliant OR (compliance_score IS NULL OR compliance_score < 100 OR should_block_payments));

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'subappaltatori', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_subappaltatori_compliance(uuid, uuid, boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_subappaltatori_compliance(uuid, uuid, boolean)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_archivia_documento_subappaltatore
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_archivia_documento_subappaltatore(
  p_company_id uuid,
  p_user_id uuid,
  p_subappaltatore_id uuid,
  p_tipo text,
  p_data_emissione date,
  p_scadenza date,
  p_storage_path text DEFAULT NULL,
  p_numero_protocollo text DEFAULT NULL,
  p_esito text DEFAULT NULL,
  p_ai_extracted_data jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.subappaltatori_documenti (
    company_id, subappaltatore_id, tipo,
    data_emissione, scadenza, storage_path, numero_protocollo, esito,
    ai_extracted_data, ai_parsed,
    uploaded_by, status
  ) VALUES (
    p_company_id, p_subappaltatore_id, p_tipo,
    p_data_emissione, p_scadenza, p_storage_path, p_numero_protocollo, p_esito,
    p_ai_extracted_data, p_ai_extracted_data IS NOT NULL,
    p_user_id, 'active'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'doc_id', v_id,
    'tipo', p_tipo,
    'scadenza', p_scadenza,
    'message', format('Documento %s archiviato per subappaltatore', p_tipo)
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_archivia_documento_subappaltatore(uuid, uuid, uuid, text, date, date, text, text, text, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_archivia_documento_subappaltatore(uuid, uuid, uuid, text, date, date, text, text, text, jsonb)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_lista_documenti_in_scadenza
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_documenti_in_scadenza(
  p_company_id uuid,
  p_user_id uuid,
  p_days_ahead int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'count_scaduti', COUNT(*) FILTER (WHERE sd.scadenza < CURRENT_DATE),
    'count_in_scadenza', COUNT(*) FILTER (WHERE sd.scadenza BETWEEN CURRENT_DATE AND CURRENT_DATE + p_days_ahead),
    'documenti', COALESCE(jsonb_agg(
      jsonb_build_object(
        'doc_id', sd.id,
        'subappaltatore_id', sd.subappaltatore_id,
        'denominazione', s.ragione_sociale,
        'tipo', sd.tipo,
        'scadenza', sd.scadenza,
        'giorni_alla_scadenza', sd.scadenza - CURRENT_DATE,
        'esito', sd.esito,
        'numero_protocollo', sd.numero_protocollo,
        'renewal_requested_at', sd.renewal_requested_at
      ) ORDER BY sd.scadenza ASC
    ) FILTER (WHERE sd.id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM public.subappaltatori_documenti sd
  JOIN public.subappaltatori s ON s.id = sd.subappaltatore_id
  WHERE sd.company_id = p_company_id
    AND sd.status = 'active'
    AND sd.scadenza IS NOT NULL
    AND sd.scadenza <= CURRENT_DATE + GREATEST(1, LEAST(365, p_days_ahead));

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'documenti', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_documenti_in_scadenza(uuid, uuid, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_documenti_in_scadenza(uuid, uuid, int) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_richiedi_rinnovo_documento (registra richiesta + invia email)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_richiedi_rinnovo_documento(
  p_company_id uuid,
  p_user_id uuid,
  p_doc_id uuid,
  p_deadline date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc RECORD;
BEGIN
  SELECT id, company_id, subappaltatore_id, tipo, scadenza, renewal_requested_at INTO v_doc
    FROM public.subappaltatori_documenti WHERE id = p_doc_id;

  IF v_doc IS NULL OR v_doc.company_id <> p_company_id THEN
    RETURN jsonb_build_object('error', 'Documento non trovato');
  END IF;

  UPDATE public.subappaltatori_documenti
     SET renewal_requested_at = NOW(),
         updated_at = NOW()
   WHERE id = p_doc_id;

  RETURN jsonb_build_object(
    'success', true,
    'doc_id', p_doc_id,
    'tipo', v_doc.tipo,
    'subappaltatore_id', v_doc.subappaltatore_id,
    'message', format('Richiesta rinnovo %s registrata. Inviare email al subappaltatore.', v_doc.tipo)
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_richiedi_rinnovo_documento(uuid, uuid, uuid, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_richiedi_rinnovo_documento(uuid, uuid, uuid, date) TO service_role;
