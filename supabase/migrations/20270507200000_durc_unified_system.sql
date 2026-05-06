-- MP-COMP-01 v2 — DURC Unified Monitoring System
-- ════════════════════════════════════════════════════════════════════════════
-- Schema unificato per DURC (azienda + subappaltatori + fornitori) con:
--   • Storia completa documenti
--   • Trigger supersede (un nuovo DURC marca i vecchi come 'superseded')
--   • RPC tool: lista_scadenze_durc, archivia_durc_pdf
--   • Cron daily check + alert proattivi (lasciato a edge function dedicata)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.durc_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Soggetto del DURC
  target_type     text NOT NULL CHECK (target_type IN ('self','subcontractor','supplier','employee')),
  target_id       uuid,
  target_codice_fiscale text,
  target_partita_iva    text,
  target_denominazione  text,

  -- Identificativi DURC
  numero_protocollo text,
  data_richiesta  date,
  data_emissione  date,
  data_scadenza   date,

  -- Esito
  esito           text NOT NULL CHECK (esito IN ('regolare','irregolare','in_attesa','errore','scaduto')),
  irregularity_details   text,
  irregularity_amount    numeric(10,2),
  enti_irregolari        text[],

  -- File
  pdf_storage_path text,
  pdf_size_bytes  int,

  -- Origine
  source          text NOT NULL CHECK (source IN ('manual_upload','api_inps','ai_request','imported_legacy')),
  requested_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ai_parsed       boolean NOT NULL DEFAULT false,
  ai_confidence   numeric(3,2),

  -- Stato workflow
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','superseded','revoked')),
  superseded_by   uuid REFERENCES public.durc_documents(id) ON DELETE SET NULL,

  -- Notification tracking (idempotente)
  alert_30d_sent_at      timestamptz,
  alert_15d_sent_at      timestamptz,
  alert_7d_sent_at       timestamptz,
  alert_expired_sent_at  timestamptz,
  alert_irregolare_sent_at timestamptz,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_durc_company_target
  ON public.durc_documents(company_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_durc_scadenza_active
  ON public.durc_documents(data_scadenza) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_durc_esito_irregolare
  ON public.durc_documents(company_id, esito) WHERE esito = 'irregolare' AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_durc_status
  ON public.durc_documents(company_id, status, data_scadenza DESC);

ALTER TABLE public.durc_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS durc_company_read ON public.durc_documents;
CREATE POLICY durc_company_read ON public.durc_documents FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS durc_admin ON public.durc_documents;
CREATE POLICY durc_admin ON public.durc_documents FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS durc_super_admin ON public.durc_documents;
CREATE POLICY durc_super_admin ON public.durc_documents FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

COMMENT ON TABLE public.durc_documents IS
  'MP-COMP-01 v2: registro unificato DURC azienda + subappaltatori + fornitori con storia + esito.';

-- ────────────────────────────────────────────────────────────────────────────
-- Trigger: supersede DURC vecchi quando ne arriva uno nuovo
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_supersede_old_durc()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE public.durc_documents
       SET status = 'superseded',
           superseded_by = NEW.id,
           updated_at = NOW()
     WHERE company_id = NEW.company_id
       AND target_type = NEW.target_type
       AND COALESCE(target_id::text, '_self') = COALESCE(NEW.target_id::text, '_self')
       AND status = 'active'
       AND id != NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_supersede_durc ON public.durc_documents;
CREATE TRIGGER trg_supersede_durc
  AFTER INSERT ON public.durc_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_supersede_old_durc();

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_durc_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_durc_updated_at ON public.durc_documents;
CREATE TRIGGER trg_durc_updated_at
  BEFORE UPDATE ON public.durc_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_durc_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_lista_scadenze_durc (nuovo, sovrascrive verifica_durc)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_scadenze_durc(
  p_company_id uuid,
  p_user_id uuid,
  p_giorni int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_giorni int := GREATEST(1, LEAST(365, p_giorni));
BEGIN
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'count_irregolari', COUNT(*) FILTER (WHERE esito = 'irregolare'),
    'count_scaduti', COUNT(*) FILTER (WHERE data_scadenza < CURRENT_DATE),
    'count_in_scadenza', COUNT(*) FILTER (WHERE data_scadenza BETWEEN CURRENT_DATE AND CURRENT_DATE + v_giorni),
    'durc', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'target_type', target_type,
        'target_denominazione', target_denominazione,
        'esito', esito,
        'data_emissione', data_emissione,
        'data_scadenza', data_scadenza,
        'giorni_alla_scadenza', data_scadenza - CURRENT_DATE,
        'numero_protocollo', numero_protocollo,
        'irregularity_details', irregularity_details
      ) ORDER BY data_scadenza ASC
    ) FILTER (WHERE id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM public.durc_documents
  WHERE company_id = p_company_id
    AND status = 'active'
    AND (data_scadenza IS NULL OR data_scadenza <= CURRENT_DATE + v_giorni);

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'durc', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_scadenze_durc(uuid, uuid, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_scadenze_durc(uuid, uuid, int) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_archivia_durc_manuale (manual upload con dati pre-estratti)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_archivia_durc_manuale(
  p_company_id uuid,
  p_user_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_target_denominazione text,
  p_target_partita_iva text,
  p_data_emissione date,
  p_data_scadenza date,
  p_esito text,
  p_numero_protocollo text DEFAULT NULL,
  p_pdf_storage_path text DEFAULT NULL,
  p_irregularity_details text DEFAULT NULL,
  p_enti_irregolari text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_esito NOT IN ('regolare','irregolare','in_attesa','errore','scaduto') THEN
    RETURN jsonb_build_object('error', 'esito non valido');
  END IF;

  INSERT INTO public.durc_documents (
    company_id, target_type, target_id, target_denominazione, target_partita_iva,
    numero_protocollo, data_emissione, data_scadenza, esito,
    irregularity_details, enti_irregolari,
    pdf_storage_path, source, requested_by_user_id, status
  ) VALUES (
    p_company_id, p_target_type, p_target_id, p_target_denominazione, p_target_partita_iva,
    p_numero_protocollo, p_data_emissione, p_data_scadenza, p_esito,
    p_irregularity_details, p_enti_irregolari,
    p_pdf_storage_path, 'manual_upload', p_user_id, 'active'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'durc_id', v_id,
    'message', format('DURC archiviato per %s. Esito: %s', p_target_denominazione, p_esito)
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_archivia_durc_manuale(uuid, uuid, text, uuid, text, text, date, date, text, text, text, text, text[])
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_archivia_durc_manuale(uuid, uuid, text, uuid, text, text, date, date, text, text, text, text, text[])
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_durc_status_self (stato DURC azienda corrente)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_durc_status_self(
  p_company_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'esito', esito,
    'data_emissione', data_emissione,
    'data_scadenza', data_scadenza,
    'giorni_alla_scadenza', data_scadenza - CURRENT_DATE,
    'numero_protocollo', numero_protocollo,
    'is_scaduto', data_scadenza < CURRENT_DATE,
    'is_in_scadenza_30d', data_scadenza BETWEEN CURRENT_DATE AND CURRENT_DATE + 30,
    'irregularity_details', irregularity_details
  ) INTO v_result
  FROM public.durc_documents
  WHERE company_id = p_company_id
    AND target_type = 'self'
    AND status = 'active'
  ORDER BY data_emissione DESC NULLS LAST
  LIMIT 1;

  RETURN COALESCE(v_result, jsonb_build_object(
    'esito', 'sconosciuto',
    'note', 'Nessun DURC archiviato per questa azienda'
  ));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_durc_status_self(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_durc_status_self(uuid, uuid) TO service_role;
