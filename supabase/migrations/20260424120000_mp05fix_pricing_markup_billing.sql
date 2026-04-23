-- MP05-FIX — Ownership SuperAdmin + markup per-task + scalo ai_credits
-- 5 parti + view, adattate allo schema reale del progetto:
--   - platform_settings usa (key TEXT, value TEXT) → parsing numerico
--   - ai_credit_transactions usa (crediti NUMERIC, saldo_prima, saldo_dopo, creato_il, tipo, descrizione)
--   - ai_credits ha balance_eur, total_spent_eur, calls_blocked, alert_threshold_eur, alert_email_sent_at
-- Owner: Florin Andriciuc | Data: 2026-04-24

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. NEW TABLE ai_pricing_markup
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_pricing_markup (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_kind             TEXT NOT NULL UNIQUE CHECK (task_kind IN (
    'bot_operativo_titolare', 'bot_operativo_operaio',
    'assistenza_clienti', 'lead_qualificazione',
    'vision_ddt', 'vision_cantiere',
    'parse_rapportino', 'computo_metrico',
    'bank_categorize', 'chat_routine',
    'default'
  )),
  markup_multiplier     NUMERIC(5,2) NOT NULL DEFAULT 3.00
                          CHECK (markup_multiplier >= 1.0 AND markup_multiplier <= 20.0),
  min_charge_eur        NUMERIC(10,6) DEFAULT 0.001 CHECK (min_charge_eur >= 0),
  display_label         TEXT NOT NULL,
  description           TEXT,
  notes                 TEXT,
  enabled               BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  updated_by_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.ai_pricing_markup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "markup_super_admin_all" ON public.ai_pricing_markup;
CREATE POLICY "markup_super_admin_all" ON public.ai_pricing_markup
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "markup_service_all" ON public.ai_pricing_markup;
CREATE POLICY "markup_service_all" ON public.ai_pricing_markup
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.fn_pricing_markup_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_pricing_markup_updated_at ON public.ai_pricing_markup;
CREATE TRIGGER trg_pricing_markup_updated_at
  BEFORE UPDATE ON public.ai_pricing_markup
  FOR EACH ROW EXECUTE FUNCTION public.fn_pricing_markup_updated_at();

INSERT INTO public.ai_pricing_markup (task_kind, markup_multiplier, display_label, description)
VALUES
  ('bot_operativo_titolare', 3.00, 'Bot titolare',
    'Interrogazione AI del titolare su cantieri, margini, scadenze'),
  ('bot_operativo_operaio', 2.50, 'Bot operaio',
    'Rapportini, DDT, foto, presenze via WhatsApp da operai'),
  ('assistenza_clienti', 2.50, 'Assistenza clienti',
    'Chat AI con clienti finali dell''impresa'),
  ('lead_qualificazione', 4.00, 'Qualifica lead',
    'Qualificazione commerciale di nuovi contatti — alto valore'),
  ('vision_ddt', 5.00, 'Analisi DDT',
    'Estrazione dati da foto DDT — alto valore aggiunto vs manuale'),
  ('vision_cantiere', 3.50, 'Analisi foto cantiere',
    'Descrizione immagini cantiere, classificazione'),
  ('parse_rapportino', 3.00, 'Parse rapportino',
    'Estrazione strutturata da rapportino testuale libero'),
  ('computo_metrico', 5.00, 'Computo metrico',
    'Parsing computi metrici complessi — alto valore'),
  ('bank_categorize', 2.00, 'Categorizza movimento bancario',
    'Classificazione automatica movimenti — alto volume, margine su volume'),
  ('chat_routine', 2.50, 'Chat generica',
    'Conversazione AI routine, FAQ, help'),
  ('default', 3.00, 'Default',
    'Task non categorizzato')
ON CONFLICT (task_kind) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ALTER ai_model_usage_log con colonne billing
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ai_model_usage_log
  ADD COLUMN IF NOT EXISTS usd_eur_rate        NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS cost_real_eur       NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS markup_applied_pct  NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS cost_billed_eur     NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS margin_eur          NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS credits_deducted    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS credit_tx_id        UUID;

CREATE INDEX IF NOT EXISTS ix_ai_usage_log_billing_period
  ON public.ai_model_usage_log (ts DESC, task_kind, ok)
  WHERE ok = true AND credits_deducted = true;

CREATE INDEX IF NOT EXISTS ix_ai_usage_log_company_period
  ON public.ai_model_usage_log (company_id, ts DESC)
  WHERE ok = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ai_model_config: solo global SuperAdmin (CHECK company_id IS NULL)
-- ═══════════════════════════════════════════════════════════════════════════

-- Safety notice
DO $$
DECLARE n_company INT;
BEGIN
  SELECT COUNT(*) INTO n_company FROM public.ai_model_config WHERE company_id IS NOT NULL;
  RAISE NOTICE 'ai_model_config: % righe company-specific da archiviare', n_company;
END $$;

-- Archive
CREATE TABLE IF NOT EXISTS public.ai_model_config_archive_mp05fix AS
  SELECT *, now() AS archived_at FROM public.ai_model_config WHERE 1 = 0;

INSERT INTO public.ai_model_config_archive_mp05fix
  SELECT *, now() FROM public.ai_model_config WHERE company_id IS NOT NULL;

DELETE FROM public.ai_model_config WHERE company_id IS NOT NULL;

-- CHECK constraint: company_id DEVE essere NULL
ALTER TABLE public.ai_model_config
  DROP CONSTRAINT IF EXISTS ai_model_config_company_id_must_be_null;

ALTER TABLE public.ai_model_config
  ADD CONSTRAINT ai_model_config_company_id_must_be_null
  CHECK (company_id IS NULL);

-- Drop old unique constraint + indice + re-create su task_kind solo
ALTER TABLE public.ai_model_config
  DROP CONSTRAINT IF EXISTS ai_model_config_company_id_task_kind_key;
DROP INDEX IF EXISTS public.ai_model_config_company_id_task_kind_key;
DROP INDEX IF EXISTS public.ux_ai_model_config_global_task;

CREATE UNIQUE INDEX IF NOT EXISTS ux_ai_model_config_task_kind
  ON public.ai_model_config (task_kind);

-- RLS refactor: solo SuperAdmin scrive, authenticated legge
DROP POLICY IF EXISTS "config_company_read" ON public.ai_model_config;
DROP POLICY IF EXISTS "config_company_write" ON public.ai_model_config;

DROP POLICY IF EXISTS "config_read_all" ON public.ai_model_config;
CREATE POLICY "config_read_all" ON public.ai_model_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "config_super_admin_write" ON public.ai_model_config;
CREATE POLICY "config_super_admin_write" ON public.ai_model_config
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "config_super_admin_update" ON public.ai_model_config;
CREATE POLICY "config_super_admin_update" ON public.ai_model_config
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "config_super_admin_delete" ON public.ai_model_config;
CREATE POLICY "config_super_admin_delete" ON public.ai_model_config
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

-- service_role policy resta da MP05 v1.0

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. platform_settings: seed chiavi billing (schema reale usa value TEXT)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.platform_settings (key, value)
VALUES
  ('usd_eur_rate', '0.92'),
  ('ai_min_balance_eur_to_call', '0.05'),
  ('ai_warn_balance_eur', '2.00')
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RPC deduct_ai_credits_with_markup (atomica)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.deduct_ai_credits_with_markup(
  p_company_id        UUID,
  p_task_kind         TEXT,
  p_model_used        TEXT,
  p_cost_usd_real     NUMERIC,
  p_tokens_prompt     INT,
  p_tokens_completion INT,
  p_wa_message_id     UUID DEFAULT NULL,
  p_metadata          JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  ok                  BOOLEAN,
  reason              TEXT,
  cost_real_eur       NUMERIC,
  cost_billed_eur     NUMERIC,
  margin_eur          NUMERIC,
  balance_before      NUMERIC,
  balance_after       NUMERIC,
  markup_used         NUMERIC,
  usage_log_id        UUID,
  tx_id               UUID
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate          NUMERIC;
  v_markup        NUMERIC;
  v_cost_real     NUMERIC;
  v_cost_billed   NUMERIC;
  v_margin        NUMERIC;
  v_balance       NUMERIC;
  v_blocked       BOOLEAN;
  v_new_balance   NUMERIC;
  v_log_id        UUID;
  v_tx_id         UUID;
  v_label         TEXT;
BEGIN
  -- 1. Parametri piattaforma (value è TEXT, cast a NUMERIC)
  SELECT COALESCE(NULLIF(value, '')::NUMERIC, 0.92) INTO v_rate
  FROM public.platform_settings WHERE key = 'usd_eur_rate';
  IF v_rate IS NULL THEN v_rate := 0.92; END IF;

  -- 2. Markup per task (fallback 'default')
  SELECT markup_multiplier INTO v_markup
  FROM public.ai_pricing_markup WHERE task_kind = p_task_kind AND enabled = true;

  IF v_markup IS NULL THEN
    SELECT markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup WHERE task_kind = 'default' AND enabled = true;
  END IF;

  IF v_markup IS NULL THEN
    RETURN QUERY SELECT false, 'markup_missing'::TEXT,
      NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC,
      NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC,
      NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- 3. Calcoli
  v_cost_real   := COALESCE(p_cost_usd_real, 0) * v_rate;
  v_cost_billed := v_cost_real * v_markup;
  v_margin      := v_cost_billed - v_cost_real;

  -- 4. Lock wallet
  SELECT balance_eur, calls_blocked INTO v_balance, v_blocked
  FROM public.ai_credits
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    -- Crea wallet a 0 se assente
    INSERT INTO public.ai_credits (company_id, balance_eur)
    VALUES (p_company_id, 0)
    ON CONFLICT (company_id) DO NOTHING;
    v_balance := 0;
    v_blocked := false;
  END IF;

  IF v_blocked THEN
    RETURN QUERY SELECT false, 'blocked'::TEXT,
      v_cost_real, v_cost_billed, v_margin,
      v_balance, v_balance, v_markup,
      NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  IF v_balance < v_cost_billed THEN
    RETURN QUERY SELECT false, 'insufficient_credits'::TEXT,
      v_cost_real, v_cost_billed, v_margin,
      v_balance, v_balance, v_markup,
      NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- 5. Scala saldo
  v_new_balance := v_balance - v_cost_billed;
  UPDATE public.ai_credits
  SET balance_eur      = v_new_balance,
      total_spent_eur  = COALESCE(total_spent_eur, 0) + v_cost_billed,
      updated_at       = now()
  WHERE company_id = p_company_id;

  -- 6. Label human-readable
  SELECT display_label INTO v_label
  FROM public.ai_pricing_markup WHERE task_kind = p_task_kind;
  IF v_label IS NULL THEN v_label := p_task_kind; END IF;

  -- 7. Log transazione azienda
  INSERT INTO public.ai_credit_transactions (
    company_id, tipo, crediti, saldo_prima, saldo_dopo,
    descrizione, metadata
  ) VALUES (
    p_company_id, 'consumo_ai', v_cost_billed, v_balance, v_new_balance,
    format('Chat AI — %s', v_label),
    jsonb_build_object(
      'task_kind', p_task_kind,
      'tokens_total', p_tokens_prompt + p_tokens_completion,
      'wa_message_id', p_wa_message_id,
      'source', 'ai_provider'
    ) || p_metadata
  )
  RETURNING id INTO v_tx_id;

  -- 8. Log tecnico
  INSERT INTO public.ai_model_usage_log (
    ts, company_id, task_kind,
    model_requested, model_used, provider_used, fallback_hops,
    tokens_prompt, tokens_completion, tokens_total,
    cost_usd, ok,
    usd_eur_rate, cost_real_eur, markup_applied_pct,
    cost_billed_eur, margin_eur,
    credits_deducted, credit_tx_id,
    wa_message_id, metadata
  ) VALUES (
    now(), p_company_id, p_task_kind,
    p_model_used, p_model_used, split_part(p_model_used, '/', 1), 0,
    p_tokens_prompt, p_tokens_completion, p_tokens_prompt + p_tokens_completion,
    p_cost_usd_real, true,
    v_rate, v_cost_real, (v_markup - 1) * 100,
    v_cost_billed, v_margin,
    true, v_tx_id,
    p_wa_message_id, p_metadata
  )
  RETURNING id INTO v_log_id;

  -- 9. Alert flag se sotto soglia (email send gestito da cron esterno)
  UPDATE public.ai_credits
  SET alert_email_sent_at = now()
  WHERE company_id = p_company_id
    AND v_new_balance < COALESCE(alert_threshold_eur, 0)
    AND (alert_email_sent_at IS NULL OR alert_email_sent_at < now() - interval '24 hours');

  RETURN QUERY SELECT true, 'success'::TEXT,
    v_cost_real, v_cost_billed, v_margin,
    v_balance, v_new_balance, v_markup,
    v_log_id, v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_ai_credits_with_markup(UUID, TEXT, TEXT, NUMERIC, INT, INT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_ai_credits_with_markup(UUID, TEXT, TEXT, NUMERIC, INT, INT, UUID, JSONB) TO service_role;

-- RPC check saldo pre-chiamata (no writes)
-- Usa OUT aliases prefissati con o_ per evitare ambiguità con colonne DB.
CREATE OR REPLACE FUNCTION public.check_ai_credits_available(
  p_company_id    UUID,
  p_est_cost_usd  NUMERIC DEFAULT 0.001,
  p_task_kind     TEXT DEFAULT 'default'
)
RETURNS TABLE (
  o_ok              BOOLEAN,
  o_reason          TEXT,
  o_balance_eur     NUMERIC,
  o_est_cost_eur    NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate      NUMERIC;
  v_markup    NUMERIC;
  v_min       NUMERIC;
  v_balance   NUMERIC;
  v_blocked   BOOLEAN;
  v_est_eur   NUMERIC;
BEGIN
  SELECT COALESCE(NULLIF(ps.value, '')::NUMERIC, 0.92) INTO v_rate
  FROM public.platform_settings ps WHERE ps.key = 'usd_eur_rate';
  IF v_rate IS NULL THEN v_rate := 0.92; END IF;

  SELECT COALESCE(NULLIF(ps.value, '')::NUMERIC, 0.05) INTO v_min
  FROM public.platform_settings ps WHERE ps.key = 'ai_min_balance_eur_to_call';
  IF v_min IS NULL THEN v_min := 0.05; END IF;

  SELECT pm.markup_multiplier INTO v_markup
  FROM public.ai_pricing_markup pm
  WHERE pm.task_kind = p_task_kind AND pm.enabled = true;
  IF v_markup IS NULL THEN
    SELECT pm.markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup pm
    WHERE pm.task_kind = 'default' AND pm.enabled = true;
  END IF;
  IF v_markup IS NULL THEN v_markup := 3.00; END IF;

  SELECT ac.balance_eur, ac.calls_blocked INTO v_balance, v_blocked
  FROM public.ai_credits ac WHERE ac.company_id = p_company_id;

  IF v_balance IS NULL THEN v_balance := 0; v_blocked := false; END IF;

  v_est_eur := COALESCE(p_est_cost_usd, 0) * v_rate * v_markup;

  IF v_blocked THEN
    RETURN QUERY SELECT false, 'blocked'::TEXT, v_balance, v_est_eur;
  ELSIF v_balance < v_min THEN
    RETURN QUERY SELECT false, 'below_minimum'::TEXT, v_balance, v_est_eur;
  ELSIF v_balance < v_est_eur THEN
    RETURN QUERY SELECT false, 'insufficient'::TEXT, v_balance, v_est_eur;
  ELSE
    RETURN QUERY SELECT true, 'ok'::TEXT, v_balance, v_est_eur;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_ai_credits_available(UUID, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_ai_credits_available(UUID, NUMERIC, TEXT) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. VIEW v_company_ai_spend (campi non sensibili per azienda)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_company_ai_spend AS
SELECT
  company_id,
  DATE_TRUNC('day', ts)::date AS day,
  task_kind,
  COUNT(*) AS n_calls,
  SUM(cost_billed_eur) AS total_spent_eur,
  SUM(tokens_total) AS total_tokens
FROM public.ai_model_usage_log
WHERE ok = true AND credits_deducted = true
GROUP BY company_id, DATE_TRUNC('day', ts), task_kind;

GRANT SELECT ON public.v_company_ai_spend TO authenticated;
GRANT SELECT ON public.v_company_ai_spend TO service_role;

COMMENT ON TABLE public.ai_pricing_markup IS
  'MP05-FIX — Listino markup gestito dal SuperAdmin (moltiplicativo: ×3 = costo_reale×3).';
COMMENT ON VIEW public.v_company_ai_spend IS
  'MP05-FIX — Spesa aggregata per azienda (solo cost_billed, no real/margin).';

COMMIT;
