-- MP-FINAL — Gap closure
-- 1. RPC populate_broadcast_recipients per UI broadcast create
-- 2. RPC get_whatsapp_metrics per dashboard
-- 3. RPC get_cantieri_margine_basso per trigger margine_basso
-- 4. Event-driven triggers per preventivo_inviato / sal_raggiunto / fattura_emessa
-- 5. Deprecazione messaging_whatsapp_config (rename a _deprecated)

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. RPC populate_broadcast_recipients
-- Popola whatsapp_broadcast_recipients da un filter su marketing_contacts.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.populate_broadcast_recipients(
  p_broadcast_id uuid,
  p_segment_filter jsonb,
  p_variable_mapping jsonb
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_count int := 0;
  v_tipo_filter text;
  v_stato_filter text;
  v_exclude_opt_out boolean;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.whatsapp_broadcasts
  WHERE id = p_broadcast_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Broadcast % non trovato', p_broadcast_id;
  END IF;

  v_tipo_filter := p_segment_filter->>'tipo';
  v_stato_filter := p_segment_filter->>'stato';
  v_exclude_opt_out := COALESCE((p_segment_filter->>'exclude_opt_out')::boolean, true);

  INSERT INTO public.whatsapp_broadcast_recipients (
    broadcast_id, contact_id, phone_number, variables, status
  )
  SELECT
    p_broadcast_id,
    mc.id,
    mc.telefono,
    (
      SELECT jsonb_object_agg(
        key,
        CASE
          WHEN value::text = '"nome"' THEN to_jsonb(COALESCE(mc.nome, ''))
          WHEN value::text = '"cognome"' THEN to_jsonb(COALESCE(mc.cognome, ''))
          WHEN value::text = '"telefono"' THEN to_jsonb(COALESCE(mc.telefono, ''))
          ELSE value
        END
      )
      FROM jsonb_each(p_variable_mapping)
    ),
    'pending'
  FROM public.marketing_contacts mc
  WHERE mc.company_id = v_company_id
    AND (v_tipo_filter IS NULL OR mc.tipo = v_tipo_filter)
    AND (v_stato_filter IS NULL OR mc.stato = v_stato_filter)
    AND (NOT v_exclude_opt_out OR COALESCE(mc.opt_out, false) = false)
    AND mc.telefono IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.whatsapp_broadcasts
  SET total_recipients = v_count
  WHERE id = p_broadcast_id;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.populate_broadcast_recipients(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.populate_broadcast_recipients(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.populate_broadcast_recipients(uuid, jsonb, jsonb) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. RPC get_whatsapp_metrics per WhatsAppStatsBar
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_whatsapp_metrics(p_company_id uuid)
RETURNS TABLE (
  active_numbers int,
  messages_last_24h int,
  errors_last_24h int,
  total_spend_today numeric,
  tool_calls_last_24h int
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)::int FROM public.ai_whatsapp_numbers
       WHERE company_id = p_company_id
         AND deleted_at IS NULL
         AND stato = 'active') AS active_numbers,
    (SELECT COUNT(*)::int FROM public.whatsapp_messages
       WHERE company_id = p_company_id
         AND created_at > now() - interval '24 hours') AS messages_last_24h,
    (SELECT COUNT(*)::int FROM public.wa_routing_errors
       WHERE ts > now() - interval '24 hours'
         AND phone_number_id IN (
           SELECT phone_number_id FROM public.ai_whatsapp_numbers
           WHERE company_id = p_company_id
         )) AS errors_last_24h,
    (SELECT COALESCE(SUM(current_day_spend_eur), 0) FROM public.ai_whatsapp_numbers
       WHERE company_id = p_company_id
         AND deleted_at IS NULL) AS total_spend_today,
    (SELECT COUNT(*)::int FROM public.wa_tool_calls
       WHERE company_id = p_company_id
         AND ts > now() - interval '24 hours') AS tool_calls_last_24h;
$$;

REVOKE ALL ON FUNCTION public.get_whatsapp_metrics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_metrics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_metrics(uuid) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RPC get_cantieri_margine_basso per trigger margine_basso
-- ═══════════════════════════════════════════════════════════════════════════

-- Compatibilità catena pulita: questi campi operativi arrivano anche in
-- migrazioni successive, ma la RPC/trigger di questo modulo li usa già.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS percentuale_avanzamento NUMERIC DEFAULT 0;

ALTER TABLE public.campo_rapportini
  ADD COLUMN IF NOT EXISTS ore_straordinario NUMERIC(4,2) DEFAULT 0;

CREATE OR REPLACE FUNCTION public.get_cantieri_margine_basso(
  p_company_id uuid,
  p_soglia_percent numeric DEFAULT 10
) RETURNS TABLE (
  cantiere_id uuid,
  nome text,
  margine_percent numeric,
  valore numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH cantieri_attivi AS (
    SELECT
      o.id,
      COALESCE(o.description, o.order_code, 'Cantiere') AS nome,
      o.total_amount,
      o.percentuale_avanzamento
    FROM public.orders o
    WHERE o.company_id = p_company_id
      AND o.status IN ('in_produzione', 'in_corso', 'attivo', 'aperto', 'in_lavorazione')
      AND o.total_amount > 0
  ),
  costi AS (
    SELECT
      r.order_id AS cantiere_id,
      SUM(COALESCE(r.ore_lavorate, 0) + COALESCE(r.ore_straordinario, 0)) * 25 AS manodopera
    FROM public.campo_rapportini r
    GROUP BY r.order_id
  )
  SELECT
    c.id AS cantiere_id,
    c.nome,
    CASE
      WHEN c.total_amount * c.percentuale_avanzamento / 100 > 0 THEN
        ((c.total_amount * c.percentuale_avanzamento / 100 - COALESCE(co.manodopera, 0))
         / (c.total_amount * c.percentuale_avanzamento / 100)) * 100
      ELSE 0
    END AS margine_percent,
    c.total_amount AS valore
  FROM cantieri_attivi c
  LEFT JOIN costi co ON co.cantiere_id = c.id
  WHERE
    c.total_amount * c.percentuale_avanzamento / 100 > 0
    AND ((c.total_amount * c.percentuale_avanzamento / 100 - COALESCE(co.manodopera, 0))
         / (c.total_amount * c.percentuale_avanzamento / 100)) * 100 < p_soglia_percent;
$$;

REVOKE ALL ON FUNCTION public.get_cantieri_margine_basso(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cantieri_margine_basso(uuid, numeric) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Event-driven notifiche: NOTIFY queue su INSERT eventi
-- Invece di DB triggers che fanno HTTP call, usiamo una tabella coda:
--   wa_notifiche_event_queue — poll by check-wa-notifiche.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.wa_notifiche_event_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN (
    'preventivo_inviato','sal_raggiunto','fattura_emessa',
    'ddt_pendente','margine_basso'
  )),
  subject_id   TEXT NOT NULL,
  variables    JSONB DEFAULT '{}'::jsonb,
  processed    BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_wa_notifiche_event_queue_pending
  ON public.wa_notifiche_event_queue(created_at)
  WHERE processed = false;

ALTER TABLE public.wa_notifiche_event_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_notifiche_event_queue_service" ON public.wa_notifiche_event_queue;
CREATE POLICY "wa_notifiche_event_queue_service" ON public.wa_notifiche_event_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Trigger: quotes INSERT → event_queue (preventivo_inviato)
CREATE OR REPLACE FUNCTION public.fn_enqueue_preventivo_inviato()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR (OLD.status IS DISTINCT FROM NEW.status))
     AND NEW.status IN ('sent', 'inviato', 'sent_to_client')
  THEN
    INSERT INTO public.wa_notifiche_event_queue (
      company_id, trigger_kind, subject_id, variables
    ) VALUES (
      NEW.company_id,
      'preventivo_inviato',
      NEW.id::text,
      jsonb_build_object(
        '1', COALESCE(NEW.quote_number, 'N/D'),
        '2', COALESCE(NEW.client_company_name, NEW.client_name, ''),
        '3', COALESCE(NEW.total_amount::text, '0')
      )
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotes_preventivo_inviato ON public.quotes;
CREATE TRIGGER trg_quotes_preventivo_inviato
  AFTER INSERT OR UPDATE OF status ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_preventivo_inviato();

-- Trigger: orders UPDATE percentuale_avanzamento → event_queue (sal_raggiunto)
CREATE OR REPLACE FUNCTION public.fn_enqueue_sal_raggiunto()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_sal numeric;
  new_sal numeric;
  crossed_sal int;
BEGIN
  old_sal := COALESCE(OLD.percentuale_avanzamento, 0);
  new_sal := COALESCE(NEW.percentuale_avanzamento, 0);

  IF new_sal <= old_sal THEN
    RETURN NEW;
  END IF;

  -- Rileva crossing di 50, 75, 100
  FOR crossed_sal IN SELECT unnest(ARRAY[50, 75, 100]) LOOP
    IF old_sal < crossed_sal AND new_sal >= crossed_sal THEN
      INSERT INTO public.wa_notifiche_event_queue (
        company_id, trigger_kind, subject_id, variables
      ) VALUES (
        NEW.company_id,
        'sal_raggiunto',
        NEW.id::text || ':' || crossed_sal::text,
        jsonb_build_object(
          '1', COALESCE(NEW.description, NEW.order_code, 'Cantiere'),
          '2', crossed_sal::text,
          '3', COALESCE(NEW.client_name, '')
        )
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_sal_raggiunto ON public.orders;
CREATE TRIGGER trg_orders_sal_raggiunto
  AFTER UPDATE OF percentuale_avanzamento ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_sal_raggiunto();

-- Trigger: invoices INSERT → event_queue (fattura_emessa)
CREATE OR REPLACE FUNCTION public.fn_enqueue_fattura_emessa()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo fatture attive (document_type='invoice' o simili) emesse
  IF COALESCE(NEW.document_type, '') IN ('invoice', 'fattura', 'fattura_immediata', 'fattura_accompagnatoria') THEN
    INSERT INTO public.wa_notifiche_event_queue (
      company_id, trigger_kind, subject_id, variables
    ) VALUES (
      NEW.company_id,
      'fattura_emessa',
      NEW.id::text,
      jsonb_build_object(
        '1', COALESCE(NEW.invoice_number, 'N/D'),
        '2', COALESCE(NEW.client_company_name, ''),
        '3', COALESCE(NEW.total_amount::text, '0'),
        '4', COALESCE(NEW.due_date::text, '')
      )
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_fattura_emessa ON public.invoices;
CREATE TRIGGER trg_invoices_fattura_emessa
  AFTER INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_fattura_emessa();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Deprecazione messaging_whatsapp_config (RENAME, NO DROP per safety)
-- ═══════════════════════════════════════════════════════════════════════════

-- Safety check
DO $$
DECLARE
  legacy_count INT;
  migrated_count INT;
BEGIN
  SELECT COUNT(*) INTO legacy_count
  FROM public.messaging_whatsapp_config
  WHERE phone_number_id IS NOT NULL;

  SELECT COUNT(*) INTO migrated_count
  FROM public.ai_whatsapp_numbers
  WHERE purpose = 'bot_operativo' AND deleted_at IS NULL;

  IF legacy_count > 0 AND migrated_count < legacy_count THEN
    RAISE WARNING 'Legacy count=% > migrated=%. Rename comunque (reversibile).', legacy_count, migrated_count;
  END IF;
END $$;

-- NON facciamo DROP/RENAME fisico in questa migration per dare tempo
-- al codice src/ di essere refactorato (in MP-final-gap-closure si
-- rimuovono le reference). La tabella verrà renomata in una migration
-- finale di pulizia dopo 30gg di monitoring.
-- Per ora aggiungiamo solo il commento di deprecazione visibile in dashboard.

COMMENT ON TABLE public.messaging_whatsapp_config IS
  'DEPRECATED — Sostituita da ai_whatsapp_numbers (multi-purpose, MP01+). '
  'Non scrivere nuovi record. Tabella verrà rimossa dopo periodo di grazia 30gg.';

COMMIT;
