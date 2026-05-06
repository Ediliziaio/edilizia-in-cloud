-- MP-FAT-03 — Prima Nota Auto-Reconciliation + Financial Anomaly Detection
-- ════════════════════════════════════════════════════════════════════════════
-- Estende prima_nota_entries con campi AI (reconciliation_method, ai_confidence,
-- ai_reasoning, alternative_matches) e aggiunge financial_anomalies per
-- detector di duplicate payment, importi sospetti, controparti nuove,
-- pattern di splitting anti-antiriciclaggio.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Estensione prima_nota_entries (back-compat: ADD COLUMN IF NOT EXISTS)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.prima_nota_entries
  ADD COLUMN IF NOT EXISTS reconciliation_method text DEFAULT 'manual'
    CHECK (reconciliation_method IN (
      'manual','algorithmic_auto','ai_auto','ai_proposed','imported','generic_categorized'
    )),
  ADD COLUMN IF NOT EXISTS ai_confidence numeric(3,2),
  ADD COLUMN IF NOT EXISTS ai_reasoning text,
  ADD COLUMN IF NOT EXISTS alternative_matches jsonb,
  ADD COLUMN IF NOT EXISTS reconciliation_audit_log jsonb;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) financial_anomalies
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.financial_anomalies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  anomaly_type    text NOT NULL CHECK (anomaly_type IN (
    'duplicate_payment','unusual_high_amount','new_counterparty_high_value',
    'split_pattern_suspicion','round_amount_pattern','off_hours_transaction',
    'failed_chargeback','unauthorized_recurring'
  )),
  severity        text NOT NULL CHECK (severity IN ('low','medium','high','critical')),

  -- Riferimenti
  transaction_id           uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  related_transaction_ids  uuid[],
  related_invoice_ids      uuid[],
  counterparty_name        text,
  counterparty_iban        text,
  amount                   numeric(12,2),

  -- AI analysis
  ai_description           text NOT NULL,
  ai_recommendation        text,
  ai_confidence            numeric(3,2),

  -- Stato
  status          text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','reviewing','confirmed_anomaly','false_positive','resolved')),
  reviewed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  resolution_note text,

  -- Notification
  alert_sent_at   timestamptz,
  alert_channels  text[],

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anomalies_company_open
  ON public.financial_anomalies(company_id, created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_anomalies_severity
  ON public.financial_anomalies(severity, created_at DESC) WHERE status IN ('open','reviewing');
CREATE INDEX IF NOT EXISTS idx_anomalies_transaction
  ON public.financial_anomalies(transaction_id) WHERE transaction_id IS NOT NULL;

ALTER TABLE public.financial_anomalies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anomalies_company_read ON public.financial_anomalies;
CREATE POLICY anomalies_company_read ON public.financial_anomalies FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS anomalies_admin ON public.financial_anomalies;
CREATE POLICY anomalies_admin ON public.financial_anomalies FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS anomalies_super_admin ON public.financial_anomalies;
CREATE POLICY anomalies_super_admin ON public.financial_anomalies FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_anomalies_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_anomalies_updated_at ON public.financial_anomalies;
CREATE TRIGGER trg_anomalies_updated_at
  BEFORE UPDATE ON public.financial_anomalies
  FOR EACH ROW EXECUTE FUNCTION public.tg_anomalies_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 3) RPC: silvio_tool_flag_anomalia (creazione anomaly da AI/rules)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_flag_anomalia(
  p_company_id uuid,
  p_user_id uuid,
  p_anomaly_type text,
  p_severity text,
  p_ai_description text,
  p_transaction_id uuid DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_counterparty_name text DEFAULT NULL,
  p_ai_recommendation text DEFAULT NULL,
  p_ai_confidence numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.financial_anomalies (
    company_id, anomaly_type, severity, transaction_id, amount,
    counterparty_name, ai_description, ai_recommendation, ai_confidence
  ) VALUES (
    p_company_id, p_anomaly_type, p_severity, p_transaction_id, p_amount,
    p_counterparty_name, p_ai_description, p_ai_recommendation, p_ai_confidence
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'anomaly_id', v_id,
    'severity', p_severity,
    'message', format('Anomalia "%s" registrata (severity: %s)', p_anomaly_type, p_severity)
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_flag_anomalia(uuid, uuid, text, text, text, uuid, numeric, text, text, numeric)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_flag_anomalia(uuid, uuid, text, text, text, uuid, numeric, text, text, numeric)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) RPC: silvio_tool_anomalie_aperte (lista per UI/AI persona)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_anomalie_aperte(
  p_company_id uuid,
  p_user_id uuid,
  p_severity_min text DEFAULT 'medium'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_min_rank int;
BEGIN
  v_min_rank := CASE p_severity_min
    WHEN 'low' THEN 1
    WHEN 'medium' THEN 2
    WHEN 'high' THEN 3
    WHEN 'critical' THEN 4
    ELSE 2
  END;

  SELECT jsonb_build_object(
    'count', COUNT(*),
    'count_critical', COUNT(*) FILTER (WHERE severity = 'critical'),
    'count_high', COUNT(*) FILTER (WHERE severity = 'high'),
    'anomalies', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'anomaly_type', anomaly_type,
        'severity', severity,
        'amount', amount,
        'counterparty_name', counterparty_name,
        'ai_description', ai_description,
        'ai_recommendation', ai_recommendation,
        'ai_confidence', ai_confidence,
        'created_at', created_at
      ) ORDER BY
        CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
        created_at DESC
    ) FILTER (WHERE id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM public.financial_anomalies
  WHERE company_id = p_company_id
    AND status IN ('open','reviewing')
    AND (CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END) >= v_min_rank;

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'anomalies', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_anomalie_aperte(uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_anomalie_aperte(uuid, uuid, text) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) RPC: silvio_tool_detect_duplicate_payments (rule-based fast pre-AI)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_detect_duplicate_payments(
  p_company_id uuid,
  p_user_id uuid,
  p_days_back int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_table_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'bank_transactions'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RETURN jsonb_build_object('count', 0, 'note', 'Modulo banking non attivo', 'duplicates', '[]'::jsonb);
  END IF;

  -- Trova coppie di transazioni con stesso amount + counterparty entro N giorni
  EXECUTE format(
    'SELECT jsonb_build_object(
       ''count'', COUNT(*),
       ''duplicates'', COALESCE(jsonb_agg(jsonb_build_object(
         ''amount_eur'', amount_eur,
         ''counterparty'', counterparty,
         ''occurrences'', occurrences,
         ''last_date'', last_date,
         ''transaction_ids'', tx_ids
       )) FILTER (WHERE amount_eur IS NOT NULL), ''[]''::jsonb)
     )
     FROM (
       SELECT
         amount_eur,
         COALESCE(counterparty_name, counterparty_iban, ''sconosciuto'') AS counterparty,
         COUNT(*) AS occurrences,
         MAX(transaction_date) AS last_date,
         array_agg(id) AS tx_ids
       FROM public.bank_transactions
       WHERE company_id = $1
         AND transaction_date >= NOW() - ($2 || '' days'')::interval
       GROUP BY amount_eur, COALESCE(counterparty_name, counterparty_iban, ''sconosciuto'')
       HAVING COUNT(*) >= 2
       ORDER BY occurrences DESC, last_date DESC
       LIMIT 20
     ) t'
  )
  INTO v_result
  USING p_company_id, GREATEST(1, LEAST(90, p_days_back))::text;

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'duplicates', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_detect_duplicate_payments(uuid, uuid, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_detect_duplicate_payments(uuid, uuid, int) TO service_role;
