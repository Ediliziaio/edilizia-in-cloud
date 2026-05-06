-- AI RPC schema compatibility patch
-- Fixes SQL functions introduced by the 2026-05-06 AI tracks that referenced
-- non-existing production columns or had PostgreSQL format/aggregate errors.
-- This migration is intentionally additive/replacing only RPC bodies.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Aedix Brain: stable pseudonymization
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aedix_brain.pseudo_company_id(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = aedix_brain, public, extensions
AS $$
DECLARE
  v_salt text;
BEGIN
  v_salt := current_setting('aedix.salt', true);

  IF v_salt IS NULL OR length(v_salt) < 32 THEN
    RAISE EXCEPTION 'aedix.salt is required and must be at least 32 characters';
  END IF;

  RETURN encode(extensions.digest((p_company_id::text || v_salt)::text, 'sha256'::text), 'hex');
END $$;

REVOKE ALL ON FUNCTION aedix_brain.pseudo_company_id(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION aedix_brain.pseudo_company_id(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Aedix Brain: snapshot computed from the current invoices schema
-- invoices uses: client_id, total, paid_amount, payment_date.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aedix_brain_compute_snapshot(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = aedix_brain, public, extensions
AS $$
DECLARE
  v_pseudo_id text;
  v_vertical text;
  v_revenue_12m numeric := 0;
  v_active_jobs int := 0;
  v_avg_job_value numeric := 0;
  v_monthly_invoiced numeric := 0;
  v_monthly_collected numeric := 0;
  v_active_customers int := 0;
  v_dso numeric := NULL;
  v_team_size int := 0;
  v_ai_credits int := 0;
  v_snapshot_date date := CURRENT_DATE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.companies
     WHERE id = p_company_id
       AND COALESCE(aedix_brain_opt_in, false) = true
  ) THEN
    RETURN jsonb_build_object('error', 'company_opted_out_or_not_found');
  END IF;

  v_pseudo_id := aedix_brain.pseudo_company_id(p_company_id);

  SELECT vertical_key
    INTO v_vertical
    FROM public.companies
   WHERE id = p_company_id;

  BEGIN
    SELECT COUNT(DISTINCT id)
      INTO v_active_jobs
      FROM public.orders
     WHERE company_id = p_company_id
       AND COALESCE(status, '') IN ('in_corso', 'programmato', 'confermato');
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_active_jobs := 0;
  END;

  BEGIN
    SELECT
      COALESCE(SUM(total) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0),
      COALESCE(SUM(COALESCE(paid_amount, 0)) FILTER (WHERE payment_date >= CURRENT_DATE - INTERVAL '30 days'), 0),
      COUNT(DISTINCT client_id),
      AVG(EXTRACT(EPOCH FROM (payment_date::timestamp - due_date::timestamp)) / 86400.0)
        FILTER (WHERE payment_date IS NOT NULL AND due_date IS NOT NULL),
      AVG(total)
    INTO v_monthly_invoiced, v_monthly_collected, v_active_customers, v_dso, v_avg_job_value
    FROM public.invoices
    WHERE company_id = p_company_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_monthly_invoiced := 0;
    v_monthly_collected := 0;
    v_active_customers := 0;
    v_dso := NULL;
    v_avg_job_value := 0;
  END;

  BEGIN
    SELECT COUNT(*)
      INTO v_team_size
      FROM public.employees
     WHERE company_id = p_company_id
       AND COALESCE(is_active, true) = true;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_team_size := 0;
  END;

  BEGIN
    SELECT COALESCE(SUM(total), 0)
      INTO v_revenue_12m
      FROM public.invoices
     WHERE company_id = p_company_id
       AND created_at >= NOW() - INTERVAL '12 months';
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_revenue_12m := 0;
  END;

  BEGIN
    SELECT COALESCE(SUM(cost_billed_eur), 0)::int
      INTO v_ai_credits
      FROM public.ai_call_ledger
     WHERE company_id = p_company_id
       AND created_at >= date_trunc('month', NOW());
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_ai_credits := 0;
  END;

  RETURN jsonb_build_object(
    'snapshot_date', v_snapshot_date,
    'pseudo_company_id', v_pseudo_id,
    'vertical_key', COALESCE(v_vertical, 'edilizia'),
    'revenue_12m', COALESCE(v_revenue_12m, 0),
    'active_jobs', COALESCE(v_active_jobs, 0),
    'avg_job_value', COALESCE(v_avg_job_value, 0),
    'monthly_invoiced', COALESCE(v_monthly_invoiced, 0),
    'monthly_collected', COALESCE(v_monthly_collected, 0),
    'active_customers', COALESCE(v_active_customers, 0),
    'dso_days', v_dso,
    'team_size', COALESCE(v_team_size, 0),
    'ai_credits_month', COALESCE(v_ai_credits, 0)
  );
END $$;

REVOKE ALL ON FUNCTION public.aedix_brain_compute_snapshot(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aedix_brain_compute_snapshot(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Dunning: payment history and dunning scheduling on current invoices schema
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.silvio_tool_storico_pagamenti(
  p_company_id uuid,
  p_user_id uuid,
  p_customer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_invoices int;
  v_paid_count int;
  v_overdue_count int;
  v_avg_dso numeric;
  v_total_amount numeric;
  v_total_paid numeric;
  v_punctuality text;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'paid' OR COALESCE(paid_amount, 0) >= COALESCE(total, 0)),
    COUNT(*) FILTER (
      WHERE due_date < CURRENT_DATE
        AND status NOT IN ('paid', 'cancelled')
        AND COALESCE(total, 0) - COALESCE(paid_amount, 0) > 0
    ),
    AVG(EXTRACT(EPOCH FROM (payment_date::timestamp - due_date::timestamp)) / 86400.0)
      FILTER (WHERE payment_date IS NOT NULL AND due_date IS NOT NULL),
    COALESCE(SUM(total), 0),
    COALESCE(SUM(COALESCE(paid_amount, 0)), 0)
  INTO v_total_invoices, v_paid_count, v_overdue_count, v_avg_dso, v_total_amount, v_total_paid
  FROM public.invoices
  WHERE company_id = p_company_id
    AND client_id = p_customer_id;

  v_punctuality := CASE
    WHEN v_total_invoices = 0 THEN 'sconosciuto'
    WHEN v_avg_dso IS NULL OR v_avg_dso <= 7 THEN 'puntuale'
    WHEN v_avg_dso <= 30 THEN 'ritardatario_lieve'
    WHEN v_avg_dso <= 60 THEN 'ritardatario_serio'
    ELSE 'cliente_problema'
  END;

  RETURN jsonb_build_object(
    'customer_id', p_customer_id,
    'total_invoices', COALESCE(v_total_invoices, 0),
    'paid_count', COALESCE(v_paid_count, 0),
    'overdue_count', COALESCE(v_overdue_count, 0),
    'avg_dso_days', ROUND(COALESCE(v_avg_dso, 0)::numeric, 1),
    'total_amount_eur', COALESCE(v_total_amount, 0),
    'total_paid_eur', COALESCE(v_total_paid, 0),
    'punctuality_score', v_punctuality,
    'recommended_tone', CASE v_punctuality
      WHEN 'puntuale' THEN 'gentile'
      WHEN 'ritardatario_lieve' THEN 'standard'
      WHEN 'ritardatario_serio' THEN 'fermo'
      WHEN 'cliente_problema' THEN 'urgente'
      ELSE 'standard'
    END
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_storico_pagamenti(uuid, uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_storico_pagamenti(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.silvio_tool_pianifica_dunning_step(
  p_company_id uuid,
  p_user_id uuid,
  p_invoice_id uuid,
  p_step_n int,
  p_scheduled_at timestamptz,
  p_channel text DEFAULT 'email',
  p_ai_tone text DEFAULT 'standard',
  p_ai_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_action_id uuid;
  v_customer_profile_id uuid;
BEGIN
  SELECT id, client_id, company_id, total, due_date, status
    INTO v_invoice
    FROM public.invoices
   WHERE id = p_invoice_id;

  IF v_invoice IS NULL OR v_invoice.company_id <> p_company_id THEN
    RETURN jsonb_build_object('error', 'Fattura non trovata');
  END IF;

  SELECT id
    INTO v_customer_profile_id
    FROM public.profiles
   WHERE id = v_invoice.client_id;

  INSERT INTO public.dunning_actions (
    company_id, invoice_id, customer_id, step_n, scheduled_at,
    ai_tone, ai_message, channel
  ) VALUES (
    p_company_id, p_invoice_id, v_customer_profile_id, p_step_n, p_scheduled_at,
    p_ai_tone, p_ai_message, p_channel
  )
  RETURNING id INTO v_action_id;

  RETURN jsonb_build_object(
    'success', true,
    'action_id', v_action_id,
    'step_n', p_step_n,
    'scheduled_at', p_scheduled_at,
    'message', format('Step dunning #%s pianificato per %s via %s', p_step_n, p_scheduled_at, p_channel)
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_pianifica_dunning_step(uuid, uuid, uuid, int, timestamptz, text, text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_pianifica_dunning_step(uuid, uuid, uuid, int, timestamptz, text, text, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Banking anomaly detector on current bank_transactions schema
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.silvio_tool_detect_duplicate_payments(
  p_company_id uuid,
  p_user_id uuid,
  p_days_back int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_table_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'bank_transactions'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RETURN jsonb_build_object('count', 0, 'note', 'Modulo banking non attivo', 'duplicates', '[]'::jsonb);
  END IF;

  SELECT jsonb_build_object(
    'count', COUNT(*),
    'duplicates', COALESCE(jsonb_agg(jsonb_build_object(
      'amount_eur', amount_eur,
      'counterparty', counterparty,
      'occurrences', occurrences,
      'last_date', last_date,
      'transaction_ids', tx_ids
    )) FILTER (WHERE amount_eur IS NOT NULL), '[]'::jsonb)
  )
  INTO v_result
  FROM (
    SELECT
      amount AS amount_eur,
      COALESCE(merchant_name, creditor_name, debtor_name, creditor_iban, debtor_iban, 'sconosciuto') AS counterparty,
      COUNT(*) AS occurrences,
      MAX(COALESCE(booking_date, value_date, created_at::date)) AS last_date,
      array_agg(id) AS tx_ids
    FROM public.bank_transactions
    WHERE company_id = p_company_id
      AND COALESCE(booking_date, value_date, created_at::date) >= CURRENT_DATE - GREATEST(1, LEAST(90, p_days_back))
    GROUP BY amount, COALESCE(merchant_name, creditor_name, debtor_name, creditor_iban, debtor_iban, 'sconosciuto')
    HAVING COUNT(*) >= 2
    ORDER BY occurrences DESC, last_date DESC
    LIMIT 20
  ) t;

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'duplicates', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_detect_duplicate_payments(uuid, uuid, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_detect_duplicate_payments(uuid, uuid, int) TO service_role;

-- ---------------------------------------------------------------------------
-- Capomastro briefing: avoid future-only/non-existent order columns
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.silvio_tool_lista_cantieri_per_briefing(
  p_company_id uuid,
  p_briefing_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_target_date date := COALESCE(p_briefing_date, CURRENT_DATE);
BEGIN
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'cantieri', COALESCE(jsonb_agg(
      jsonb_build_object(
        'cantiere_id', o.id,
        'order_code', o.order_code,
        'capomastro_user_id', o.capomastro_user_id,
        'capomastro_name', trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')),
        'capomastro_channel', COALESCE(p.preferred_briefing_channel, 'whatsapp'),
        'capomastro_phone', p.phone,
        'cantiere_address', COALESCE(o.indirizzo_lavori, ''),
        'cantiere_city', NULL,
        'work_description', o.description
      )
    ) FILTER (WHERE o.id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.capomastro_user_id
  WHERE o.company_id = p_company_id
    AND COALESCE(o.status, '') IN ('in_corso', 'programmato', 'confermato')
    AND o.capomastro_user_id IS NOT NULL
    AND COALESCE(p.preferred_briefing_channel, 'whatsapp') <> 'none'
    AND NOT EXISTS (
      SELECT 1
        FROM public.capomastro_briefings b
       WHERE b.cantiere_id = o.id
         AND b.briefing_date = v_target_date
         AND b.sent_at IS NOT NULL
    );

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'cantieri', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_cantieri_per_briefing(uuid, date)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_cantieri_per_briefing(uuid, date)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Giornale lavori: pgcrypto digest qualified and direct auth revoked
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.silvio_tool_approva_giornale(
  p_company_id uuid,
  p_user_id uuid,
  p_giornale_id uuid,
  p_observations text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_giornale RECORD;
  v_signature_hash text;
BEGIN
  SELECT id, company_id, order_id, data_lavori, pm_signed_at, lavorazioni_eseguite
    INTO v_giornale
    FROM public.giornale_lavori
   WHERE id = p_giornale_id;

  IF v_giornale IS NULL OR v_giornale.company_id <> p_company_id THEN
    RETURN jsonb_build_object('error', 'Giornale non trovato');
  END IF;

  IF v_giornale.pm_signed_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Giornale già firmato', 'signed_at', v_giornale.pm_signed_at);
  END IF;

  v_signature_hash := encode(
    extensions.digest((
      p_giornale_id::text ||
      p_user_id::text ||
      COALESCE(v_giornale.lavorazioni_eseguite, '') ||
      NOW()::text
    )::text, 'sha256'::text),
    'hex'
  );

  UPDATE public.giornale_lavori
     SET pm_signed_at = NOW(),
         pm_signature_hash = v_signature_hash,
         firmato_da = p_user_id::text,
         firmato_il = NOW(),
         note = CASE
           WHEN p_observations IS NOT NULL
           THEN COALESCE(note, '') || E'\n\n[Osservazioni firma]: ' || p_observations
           ELSE note
         END
   WHERE id = p_giornale_id;

  RETURN jsonb_build_object(
    'success', true,
    'giornale_id', p_giornale_id,
    'signature_hash', v_signature_hash,
    'signed_at', NOW(),
    'message', format('Giornale del %s firmato digitalmente', v_giornale.data_lavori)
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_approva_giornale(uuid, uuid, uuid, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_approva_giornale(uuid, uuid, uuid, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Purchase order proposal: PostgreSQL format() does not support %.2f
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.silvio_tool_crea_proposta_ordine_fornitore(
  p_company_id uuid,
  p_user_id uuid,
  p_supplier_id uuid,
  p_for_cantiere_id uuid,
  p_items jsonb,
  p_proposal_reason text,
  p_total_amount_eur numeric,
  p_optimal_send_date date DEFAULT NULL,
  p_expected_delivery_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.proposed_purchase_orders (
    company_id, proposed_supplier_id, for_cantiere_id,
    items, proposal_reason, total_amount_eur,
    optimal_send_date, expected_delivery_date,
    status
  ) VALUES (
    p_company_id, p_supplier_id, p_for_cantiere_id,
    p_items, p_proposal_reason, p_total_amount_eur,
    p_optimal_send_date, p_expected_delivery_date,
    'draft'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'proposed_po_id', v_id,
    'total_amount_eur', p_total_amount_eur,
    'message', format(
      'Proposta ordine creata (%s items, €%s)',
      COALESCE(jsonb_array_length(p_items), 0),
      to_char(COALESCE(p_total_amount_eur, 0), 'FM999G999G990D00')
    )
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_crea_proposta_ordine_fornitore(uuid, uuid, uuid, uuid, jsonb, text, numeric, date, date)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_crea_proposta_ordine_fornitore(uuid, uuid, uuid, uuid, jsonb, text, numeric, date, date)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Team AI tools: aggregate after ordering/limiting and revoke direct auth.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.silvio_tool_suggerisci_squadra_cantiere(
  p_company_id uuid,
  p_cantiere_id uuid,
  p_lavorazione text DEFAULT NULL,
  p_team_size int DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'employee_id', q.id,
    'first_name', q.first_name,
    'last_name', q.last_name,
    'productivity_score', q.productivity_score,
    'proficiency_level', q.proficiency_level,
    'total_hours_in_skill', q.total_hours_in_skill,
    'reasoning', format('Score %s, %s ore in skill', q.score, COALESCE(q.total_hours_in_skill, 0))
  ) ORDER BY q.score DESC NULLS LAST), '[]'::jsonb)
  INTO v_team
  FROM (
    SELECT
      e.id,
      e.first_name,
      e.last_name,
      s.productivity_score,
      s.proficiency_level,
      s.total_hours_in_skill,
      ROUND((COALESCE(s.productivity_score, 0) * COALESCE(s.proficiency_level, 0))::numeric, 2) AS score
    FROM public.employee_skills s
    JOIN public.employees e ON e.id = s.employee_id
    WHERE s.company_id = p_company_id
      AND (p_lavorazione IS NULL OR s.skill_key = p_lavorazione)
      AND COALESCE(e.is_active, true) = true
    ORDER BY (COALESCE(s.productivity_score, 0) * COALESCE(s.proficiency_level, 0)) DESC NULLS LAST
    LIMIT GREATEST(1, LEAST(10, COALESCE(p_team_size, 3)))
  ) q;

  RETURN jsonb_build_object(
    'ok', true,
    'cantiere_id', p_cantiere_id,
    'lavorazione', p_lavorazione,
    'team_suggested', v_team
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_suggerisci_squadra_cantiere(uuid, uuid, text, int)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_suggerisci_squadra_cantiere(uuid, uuid, text, int)
  TO service_role;

CREATE OR REPLACE FUNCTION public.silvio_tool_analizza_competenze_operaio(
  p_company_id uuid,
  p_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_skills jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'skill_key', q.skill_key,
    'proficiency_level', q.proficiency_level,
    'total_hours', q.total_hours_in_skill,
    'productivity_score', q.productivity_score,
    'certified', q.certified,
    'last_used_at', q.last_used_at
  ) ORDER BY q.proficiency_level DESC, q.skill_key), '[]'::jsonb)
  INTO v_skills
  FROM (
    SELECT skill_key, proficiency_level, total_hours_in_skill, productivity_score, certified, last_used_at
      FROM public.employee_skills
     WHERE company_id = p_company_id
       AND employee_id = p_employee_id
     ORDER BY proficiency_level DESC, skill_key
  ) q;

  RETURN jsonb_build_object('ok', true, 'employee_id', p_employee_id, 'skills', v_skills);
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_analizza_competenze_operaio(uuid, uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_analizza_competenze_operaio(uuid, uuid)
  TO service_role;
