-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-09 — Sprint 1: Proattività Silvio (alerts + daily briefing)
-- ════════════════════════════════════════════════════════════════════════════
-- Architettura:
--   1. silvio_alerts: tabella alert persistenti (dedupliczione via dedup_key)
--   2. silvio_user_preferences: orario briefing, canali, alert types
--   3. RPC detect_*: scansionano dati e inseriscono alert idempotenti
--   4. silvio-daily-briefing edge fn: legge alert, LLM compone briefing,
--      lo posta come messaggio Silvio nel canale silvio-ai dell'utente
--   5. pg_cron schedule: detection ogni ora, briefing ogni mattina
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Tabella silvio_alerts
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.silvio_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  /** Utente target (NULL = tutti gli admin azienda). Per alert personali. */
  target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,

  /** Tipo alert: 'durc_expiring', 'payment_overdue_30d', 'low_stock', ecc. */
  alert_type text NOT NULL,
  /** Severità: 'info' | 'warning' | 'critical' */
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),

  title text NOT NULL,
  message text NOT NULL,

  /** Call-to-action: bottone cliccabile in chat */
  cta_label text,
  cta_action text,
  cta_payload jsonb,

  /** Riferimento entità sorgente */
  source_type text,
  source_id uuid,
  source_meta jsonb DEFAULT '{}'::jsonb,

  /** Chiave deduplicazione: stesso problema = stesso alert (no spam) */
  dedup_key text NOT NULL,

  /** Stato: open | dismissed | resolved | expired */
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'dismissed', 'resolved', 'expired')),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  /** Auto-expire: dopo questa data alert va in 'expired' */
  expires_at timestamptz,
  /** L'alert è stato incluso in un briefing? */
  notified_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotenza: stesso dedup_key open = un solo alert
CREATE UNIQUE INDEX IF NOT EXISTS uq_silvio_alerts_dedup_open
  ON public.silvio_alerts(company_id, dedup_key) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_silvio_alerts_company_open
  ON public.silvio_alerts(company_id, severity, created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_silvio_alerts_pending_notify
  ON public.silvio_alerts(company_id, target_user_id, created_at)
  WHERE status = 'open' AND notified_at IS NULL;

ALTER TABLE public.silvio_alerts ENABLE ROW LEVEL SECURITY;

-- L'utente vede gli alert della sua azienda (o personali se target_user_id = self)
DROP POLICY IF EXISTS silvio_alerts_company_read ON public.silvio_alerts;
CREATE POLICY silvio_alerts_company_read ON public.silvio_alerts FOR SELECT
  USING (
    company_id = public.get_my_company_id()
    AND (target_user_id IS NULL OR target_user_id = auth.uid()
         OR public.has_role(auth.uid(), 'company_admin'::public.app_role))
  );

-- L'utente può dismiss/resolve i propri alert
DROP POLICY IF EXISTS silvio_alerts_company_update ON public.silvio_alerts;
CREATE POLICY silvio_alerts_company_update ON public.silvio_alerts FOR UPDATE
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS silvio_alerts_admin ON public.silvio_alerts;
CREATE POLICY silvio_alerts_admin ON public.silvio_alerts FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_silvio_alerts_updated_at ON public.silvio_alerts;
CREATE TRIGGER trg_silvio_alerts_updated_at
  BEFORE UPDATE ON public.silvio_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.silvio_alerts IS
  'Alert proattivi Silvio (scadenze, anomalie, soglie). Deduplicati via dedup_key, includono CTA cliccabili.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) silvio_user_preferences — preferenze briefing per utente
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.silvio_user_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,

  /** Briefing mattutino abilitato? */
  daily_briefing_enabled boolean NOT NULL DEFAULT true,
  /** Ora preferita (timezone Italia) */
  daily_briefing_time time NOT NULL DEFAULT '07:30:00',
  /** Tipi alert da includere ('all' o lista specifica) */
  alert_types jsonb NOT NULL DEFAULT '["all"]'::jsonb,
  /** Min severity da segnalare in briefing */
  min_severity text NOT NULL DEFAULT 'warning'
    CHECK (min_severity IN ('info', 'warning', 'critical')),
  /** Canali (per ora solo in_app/chat; whatsapp/email futuri) */
  channels jsonb NOT NULL DEFAULT '["in_app"]'::jsonb,
  /** Ultimo briefing inviato (per evitare doppi invii lo stesso giorno) */
  last_briefing_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.silvio_user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS silvio_prefs_self ON public.silvio_user_preferences;
CREATE POLICY silvio_prefs_self ON public.silvio_user_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS silvio_prefs_admin ON public.silvio_user_preferences;
CREATE POLICY silvio_prefs_admin ON public.silvio_user_preferences FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_silvio_prefs_updated_at ON public.silvio_user_preferences;
CREATE TRIGGER trg_silvio_prefs_updated_at
  BEFORE UPDATE ON public.silvio_user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 3) RPC: silvio_create_alert — insert idempotente con dedup
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_create_alert(
  p_company_id uuid,
  p_alert_type text,
  p_severity text,
  p_title text,
  p_message text,
  p_dedup_key text,
  p_target_user_id uuid DEFAULT NULL,
  p_cta_label text DEFAULT NULL,
  p_cta_action text DEFAULT NULL,
  p_cta_payload jsonb DEFAULT NULL,
  p_source_type text DEFAULT NULL,
  p_source_id uuid DEFAULT NULL,
  p_source_meta jsonb DEFAULT '{}'::jsonb,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.silvio_alerts (
    company_id, target_user_id, alert_type, severity, title, message,
    cta_label, cta_action, cta_payload,
    source_type, source_id, source_meta, dedup_key, expires_at
  ) VALUES (
    p_company_id, p_target_user_id, p_alert_type, p_severity, p_title, p_message,
    p_cta_label, p_cta_action, p_cta_payload,
    p_source_type, p_source_id, COALESCE(p_source_meta, '{}'::jsonb), p_dedup_key, p_expires_at
  )
  ON CONFLICT (company_id, dedup_key) WHERE status = 'open'
  DO UPDATE SET
    severity = EXCLUDED.severity,
    title = EXCLUDED.title,
    message = EXCLUDED.message,
    source_meta = EXCLUDED.source_meta,
    cta_payload = EXCLUDED.cta_payload,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_create_alert(uuid, text, text, text, text, text, uuid, text, text, jsonb, text, uuid, jsonb, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_create_alert(uuid, text, text, text, text, text, uuid, text, text, jsonb, text, uuid, jsonb, timestamptz) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) RPC: silvio_detect_alerts — scansiona dati azienda e crea alert
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_detect_alerts(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created int := 0;
  v_resolved int := 0;
  v_total_alerts int;
BEGIN
  -- ────────────────────────────────────────────────────────────────────
  -- 1) RATE SCADUTE (overdue payments) — deposit, deposit_2, balance, financing
  -- ────────────────────────────────────────────────────────────────────

  -- Acconto scaduto
  PERFORM public.silvio_create_alert(
    p_company_id, 'payment_overdue',
    CASE WHEN (CURRENT_DATE - o.deposit_expected_date) > 30 THEN 'critical' ELSE 'warning' END,
    format('Acconto in ritardo: %s', COALESCE(o.client_name, o.client_company, o.order_code)),
    format('L''acconto di € %s su %s è scaduto da %s giorni (atteso il %s).',
           to_char(o.deposit_amount, 'FM999G999D90'),
           o.order_code,
           CURRENT_DATE - o.deposit_expected_date,
           to_char(o.deposit_expected_date, 'DD/MM/YYYY')),
    format('overdue_acconto:%s', o.id),
    NULL,
    'Manda sollecito',
    'send_overdue_reminder',
    jsonb_build_object('order_id', o.id, 'rata_type', 'acconto', 'amount', o.deposit_amount,
                       'client_email', o.client_email, 'client_name', o.client_name),
    'order', o.id,
    jsonb_build_object('giorni_ritardo', CURRENT_DATE - o.deposit_expected_date,
                       'importo', o.deposit_amount),
    NULL
  )
  FROM public.orders o
  WHERE o.company_id = p_company_id
    AND COALESCE(o.deposit_paid, false) = false
    AND o.deposit_expected_date IS NOT NULL
    AND o.deposit_expected_date < CURRENT_DATE
    AND COALESCE(o.deposit_amount, 0) > 0;

  -- Saldo scaduto
  PERFORM public.silvio_create_alert(
    p_company_id, 'payment_overdue',
    CASE WHEN (CURRENT_DATE - o.balance_expected_date) > 30 THEN 'critical' ELSE 'warning' END,
    format('Saldo in ritardo: %s', COALESCE(o.client_name, o.client_company, o.order_code)),
    format('Il saldo di € %s su %s è scaduto da %s giorni (atteso il %s).',
           to_char(o.balance_amount, 'FM999G999D90'),
           o.order_code,
           CURRENT_DATE - o.balance_expected_date,
           to_char(o.balance_expected_date, 'DD/MM/YYYY')),
    format('overdue_saldo:%s', o.id),
    NULL,
    'Manda sollecito',
    'send_overdue_reminder',
    jsonb_build_object('order_id', o.id, 'rata_type', 'saldo', 'amount', o.balance_amount,
                       'client_email', o.client_email, 'client_name', o.client_name),
    'order', o.id,
    jsonb_build_object('giorni_ritardo', CURRENT_DATE - o.balance_expected_date,
                       'importo', o.balance_amount),
    NULL
  )
  FROM public.orders o
  WHERE o.company_id = p_company_id
    AND COALESCE(o.balance_paid, false) = false
    AND o.balance_expected_date IS NOT NULL
    AND o.balance_expected_date < CURRENT_DATE
    AND COALESCE(o.balance_amount, 0) > 0;

  -- ────────────────────────────────────────────────────────────────────
  -- 2) MAGAZZINO sotto soglia
  -- ────────────────────────────────────────────────────────────────────
  PERFORM public.silvio_create_alert(
    p_company_id, 'low_stock', 'warning',
    format('Magazzino: %s sotto soglia', ws.name),
    format('%s: disponibili %s, soglia minima %s. Riordino suggerito: %s.',
           ws.name,
           ws.quantity_available,
           ws.min_stock_level,
           COALESCE(ws.reorder_quantity::text, 'da definire')),
    format('low_stock:%s', ws.id),
    NULL,
    'Crea ordine fornitore',
    'create_purchase_order',
    jsonb_build_object('stock_id', ws.id, 'name', ws.name,
                       'reorder_qty', ws.reorder_quantity, 'supplier_id', ws.supplier_id),
    'warehouse_stock', ws.id,
    jsonb_build_object('disponibile', ws.quantity_available, 'soglia', ws.min_stock_level),
    NULL
  )
  FROM public.warehouse_stock ws
  WHERE ws.company_id = p_company_id
    AND ws.min_stock_level IS NOT NULL
    AND ws.quantity_available IS NOT NULL
    AND ws.quantity_available < ws.min_stock_level;

  -- ────────────────────────────────────────────────────────────────────
  -- 3) PREVENTIVI in attesa da troppi giorni
  -- ────────────────────────────────────────────────────────────────────
  BEGIN
    PERFORM public.silvio_create_alert(
      p_company_id, 'quote_aging', 'warning',
      format('Preventivo in attesa: %s', q.client_name),
      format('Il preventivo %s per %s (€ %s) è in attesa da %s giorni.',
             q.quote_number, q.client_name,
             to_char(q.total, 'FM999G999D90'),
             EXTRACT(day FROM (now() - q.created_at))::int),
      format('quote_aging:%s', q.id),
      NULL,
      'Sollecita cliente',
      'send_quote_followup',
      jsonb_build_object('quote_id', q.id, 'client_name', q.client_name),
      'quote', q.id,
      jsonb_build_object('giorni_attesa', EXTRACT(day FROM (now() - q.created_at))::int),
      NULL
    )
    FROM public.quotes q
    WHERE q.company_id = p_company_id
      AND q.status IN ('sent', 'pending', 'inviato', 'aperto')
      AND q.created_at < now() - interval '7 days';
  EXCEPTION WHEN OTHERS THEN
    NULL; -- skip se quotes non ha le colonne
  END;

  -- ────────────────────────────────────────────────────────────────────
  -- 4) RICHIESTE HR pending da approvare
  -- ────────────────────────────────────────────────────────────────────
  PERFORM public.silvio_create_alert(
    p_company_id, 'hr_request_pending', 'info',
    format('Richiesta HR da approvare: %s', r.tipo),
    format('%s ha chiesto %s dal %s al %s. Motivo: %s',
           COALESCE((SELECT first_name || ' ' || last_name FROM public.profiles p WHERE p.id = r.user_id), 'Dipendente'),
           r.tipo,
           to_char(r.data_inizio, 'DD/MM/YYYY'),
           to_char(r.data_fine, 'DD/MM/YYYY'),
           COALESCE(r.motivo, 'non specificato')),
    format('hr_pending:%s', r.id),
    NULL,
    'Apri richiesta',
    'open_hr_request',
    jsonb_build_object('richiesta_id', r.id),
    'hr_richiesta', r.id,
    jsonb_build_object('tipo', r.tipo),
    NULL
  )
  FROM public.hr_richieste r
  WHERE r.company_id = p_company_id
    AND COALESCE(r.stato, '') IN ('pending', 'in_attesa', 'da_approvare', '');

  -- ────────────────────────────────────────────────────────────────────
  -- 5) AUTO-RESOLVE alert obsoleti (i pagamenti ora pagati, stock ripristinato, ecc.)
  -- ────────────────────────────────────────────────────────────────────

  -- Risolvi overdue se pagato
  UPDATE public.silvio_alerts SET status = 'resolved', resolved_at = now()
  WHERE company_id = p_company_id AND status = 'open' AND alert_type = 'payment_overdue'
    AND source_type = 'order'
    AND source_id IN (
      SELECT id FROM public.orders WHERE company_id = p_company_id
        AND COALESCE(balance_paid, false) = true AND COALESCE(deposit_paid, false) = true
    );

  -- Risolvi low_stock se ripristinato
  UPDATE public.silvio_alerts SET status = 'resolved', resolved_at = now()
  WHERE company_id = p_company_id AND status = 'open' AND alert_type = 'low_stock'
    AND source_type = 'warehouse_stock'
    AND source_id IN (
      SELECT ws.id FROM public.warehouse_stock ws
      WHERE ws.company_id = p_company_id
        AND ws.quantity_available >= ws.min_stock_level
    );

  GET DIAGNOSTICS v_resolved = ROW_COUNT;

  -- Conteggio finale
  SELECT count(*) INTO v_total_alerts
  FROM public.silvio_alerts
  WHERE company_id = p_company_id AND status = 'open';

  RETURN jsonb_build_object(
    'success', true,
    'total_open_alerts', v_total_alerts,
    'auto_resolved', v_resolved,
    'detected_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_detect_alerts(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_detect_alerts(uuid) TO service_role;

COMMENT ON FUNCTION public.silvio_detect_alerts IS
  'Scansiona dati azienda e inserisce alert idempotenti (overdue, stock, hr, quotes). Auto-resolve obsoleti.';

-- ───────────────────────────────────────────────────────────────────────────
-- 5) RPC: silvio_get_briefing_alerts — alert da includere nel briefing utente
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_get_briefing_alerts(
  p_company_id uuid,
  p_user_id uuid,
  p_min_severity text DEFAULT 'warning',
  p_limit int DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alerts jsonb;
  v_count_critical int;
  v_count_warning int;
BEGIN
  SELECT
    count(*) FILTER (WHERE severity = 'critical'),
    count(*) FILTER (WHERE severity = 'warning')
  INTO v_count_critical, v_count_warning
  FROM public.silvio_alerts
  WHERE company_id = p_company_id AND status = 'open'
    AND (target_user_id IS NULL OR target_user_id = p_user_id);

  SELECT jsonb_agg(row_data ORDER BY sev_rank, created_at DESC) INTO v_alerts
  FROM (
    SELECT
      jsonb_build_object(
        'id', id,
        'type', alert_type,
        'severity', severity,
        'title', title,
        'message', message,
        'cta_label', cta_label,
        'cta_action', cta_action,
        'cta_payload', cta_payload,
        'source_type', source_type,
        'source_id', source_id,
        'source_meta', source_meta,
        'created_at', created_at
      ) AS row_data,
      CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END AS sev_rank,
      created_at
    FROM public.silvio_alerts
    WHERE company_id = p_company_id AND status = 'open'
      AND (target_user_id IS NULL OR target_user_id = p_user_id)
      AND CASE
        WHEN p_min_severity = 'critical' THEN severity = 'critical'
        WHEN p_min_severity = 'warning' THEN severity IN ('critical', 'warning')
        ELSE true
      END
    ORDER BY sev_rank, created_at DESC
    LIMIT GREATEST(LEAST(p_limit, 20), 1)
  ) x;

  RETURN jsonb_build_object(
    'alerts', COALESCE(v_alerts, '[]'::jsonb),
    'count_critical', v_count_critical,
    'count_warning', v_count_warning,
    'count_total', v_count_critical + v_count_warning
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_get_briefing_alerts(uuid, uuid, text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_get_briefing_alerts(uuid, uuid, text, int) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) RPC: silvio_dismiss_alert / silvio_resolve_alert
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_dismiss_alert(p_alert_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.silvio_alerts
  SET status = 'dismissed', resolved_at = now(), resolved_by = auth.uid()
  WHERE id = p_alert_id
    AND company_id = public.get_my_company_id()
    AND status = 'open';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_dismiss_alert(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_dismiss_alert(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7) RPC: silvio_alerts_stats — KPI alert per dashboard
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_alerts_stats(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_critical int;
  v_warning int;
  v_info int;
  v_resolved_7d int;
  v_by_type jsonb;
BEGIN
  SELECT
    count(*) FILTER (WHERE severity = 'critical' AND status = 'open'),
    count(*) FILTER (WHERE severity = 'warning' AND status = 'open'),
    count(*) FILTER (WHERE severity = 'info' AND status = 'open'),
    count(*) FILTER (WHERE status = 'resolved' AND resolved_at > now() - interval '7 days')
  INTO v_critical, v_warning, v_info, v_resolved_7d
  FROM public.silvio_alerts WHERE company_id = p_company_id;

  SELECT jsonb_object_agg(alert_type, c) INTO v_by_type
  FROM (
    SELECT alert_type, count(*) c
    FROM public.silvio_alerts
    WHERE company_id = p_company_id AND status = 'open'
    GROUP BY 1
  ) x;

  RETURN jsonb_build_object(
    'critical', v_critical,
    'warning', v_warning,
    'info', v_info,
    'total_open', v_critical + v_warning + v_info,
    'resolved_last_7d', v_resolved_7d,
    'by_type', COALESCE(v_by_type, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_alerts_stats(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.silvio_alerts_stats(uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 8) Auto-expire alert con expires_at scaduto
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_expire_alerts()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.silvio_alerts
  SET status = 'expired'
  WHERE status = 'open' AND expires_at IS NOT NULL AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_expire_alerts() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_expire_alerts() TO service_role;
