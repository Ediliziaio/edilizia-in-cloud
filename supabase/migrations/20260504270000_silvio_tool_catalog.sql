-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-06 — Silvio Tool Catalog: RPC interrogabili dall'AI con tool-calling
-- ════════════════════════════════════════════════════════════════════════════
-- Set di RPC SECURITY DEFINER che Silvio (e altre personas AI) può chiamare via
-- OpenRouter tool-calling per accedere a dati REALI dell'azienda.
--
-- Ogni tool:
--   • Riceve p_company_id esplicito (passato dal server, derivato da auth.uid())
--   • Ritorna JSONB strutturato (parsabile dal LLM)
--   • Read-only — NESSUNO modifica dati
--   • Scoped: query sempre filtrate per company_id
--   • Concise: limita rows per controllare token output
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) silvio_tool_orders_summary — commesse attive/chiuse + valori
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_orders_summary(
  p_company_id uuid,
  p_status text DEFAULT 'active',  -- 'active' | 'closed' | 'all'
  p_limit int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_total_amount numeric;
  v_balance_amount numeric;
  v_orders jsonb;
BEGIN
  -- Aggregati globali
  SELECT
    count(*),
    COALESCE(sum(total_amount), 0),
    COALESCE(sum(balance_amount), 0)
  INTO v_count, v_total_amount, v_balance_amount
  FROM public.orders o
  WHERE o.company_id = p_company_id
    AND CASE
      WHEN p_status = 'active' THEN COALESCE(o.balance_paid, false) = false
      WHEN p_status = 'closed' THEN COALESCE(o.balance_paid, false) = true
      ELSE true
    END;

  -- Top N commesse
  SELECT jsonb_agg(o)
  INTO v_orders
  FROM (
    SELECT
      o.order_code,
      COALESCE(o.client_name, o.client_company) AS cliente,
      o.tipo_lavoro,
      o.indirizzo_lavori,
      round(o.total_amount::numeric, 2) AS valore_eur,
      round(o.balance_amount::numeric, 2) AS da_incassare_eur,
      o.percentuale_avanzamento,
      o.work_start_date,
      o.expected_date,
      o.status,
      o.balance_paid
    FROM public.orders o
    WHERE o.company_id = p_company_id
      AND CASE
        WHEN p_status = 'active' THEN COALESCE(o.balance_paid, false) = false
        WHEN p_status = 'closed' THEN COALESCE(o.balance_paid, false) = true
        ELSE true
      END
    ORDER BY o.created_at DESC
    LIMIT GREATEST(LEAST(p_limit, 50), 1)
  ) o;

  RETURN jsonb_build_object(
    'totale_commesse', v_count,
    'valore_totale_eur', v_total_amount,
    'da_incassare_totale_eur', v_balance_amount,
    'filter_status', p_status,
    'commesse', COALESCE(v_orders, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_orders_summary(uuid, text, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_orders_summary(uuid, text, int) TO service_role;

COMMENT ON FUNCTION public.silvio_tool_orders_summary IS
  'TOOL Silvio: ritorna sintesi commesse (orders) per stato (active/closed/all). Read-only.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) silvio_tool_revenue_forecast — incassi previsti nei prossimi N giorni
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_revenue_forecast(
  p_company_id uuid,
  p_days_ahead int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_until date := (now() + (p_days_ahead || ' days')::interval)::date;
  v_deposit_due numeric;
  v_deposit2_due numeric;
  v_balance_due numeric;
  v_financing_due numeric;
  v_total_due numeric;
  v_breakdown jsonb;
BEGIN
  -- Acconto da incassare entro p_days_ahead
  SELECT COALESCE(sum(o.deposit_amount), 0) INTO v_deposit_due
  FROM public.orders o
  WHERE o.company_id = p_company_id
    AND COALESCE(o.deposit_paid, false) = false
    AND o.deposit_expected_date IS NOT NULL
    AND o.deposit_expected_date <= v_until;

  SELECT COALESCE(sum(o.deposit_2_amount), 0) INTO v_deposit2_due
  FROM public.orders o
  WHERE o.company_id = p_company_id
    AND COALESCE(o.deposit_2_paid, false) = false
    AND o.deposit_2_expected_date IS NOT NULL
    AND o.deposit_2_expected_date <= v_until;

  SELECT COALESCE(sum(o.balance_amount), 0) INTO v_balance_due
  FROM public.orders o
  WHERE o.company_id = p_company_id
    AND COALESCE(o.balance_paid, false) = false
    AND o.balance_expected_date IS NOT NULL
    AND o.balance_expected_date <= v_until;

  SELECT COALESCE(sum(o.financing_amount), 0) INTO v_financing_due
  FROM public.orders o
  WHERE o.company_id = p_company_id
    AND COALESCE(o.financing_paid, false) = false
    AND o.financing_expected_date IS NOT NULL
    AND o.financing_expected_date <= v_until;

  v_total_due := v_deposit_due + v_deposit2_due + v_balance_due + v_financing_due;

  -- Breakdown per commessa (top 10 per importo)
  SELECT jsonb_agg(row_data) INTO v_breakdown
  FROM (
    SELECT
      o.order_code,
      COALESCE(o.client_name, o.client_company) AS cliente,
      jsonb_build_object(
        'acconto_eur',     CASE WHEN COALESCE(o.deposit_paid, false) = false AND o.deposit_expected_date <= v_until THEN o.deposit_amount ELSE 0 END,
        'acconto_2_eur',   CASE WHEN COALESCE(o.deposit_2_paid, false) = false AND o.deposit_2_expected_date <= v_until THEN o.deposit_2_amount ELSE 0 END,
        'saldo_eur',       CASE WHEN COALESCE(o.balance_paid, false) = false AND o.balance_expected_date <= v_until THEN o.balance_amount ELSE 0 END,
        'finanziamento_eur', CASE WHEN COALESCE(o.financing_paid, false) = false AND o.financing_expected_date <= v_until THEN o.financing_amount ELSE 0 END,
        'data_attesa', LEAST(o.deposit_expected_date, o.deposit_2_expected_date, o.balance_expected_date, o.financing_expected_date)
      ) AS dettaglio
    FROM public.orders o
    WHERE o.company_id = p_company_id
      AND (
        (COALESCE(o.deposit_paid, false) = false AND o.deposit_expected_date <= v_until) OR
        (COALESCE(o.deposit_2_paid, false) = false AND o.deposit_2_expected_date <= v_until) OR
        (COALESCE(o.balance_paid, false) = false AND o.balance_expected_date <= v_until) OR
        (COALESCE(o.financing_paid, false) = false AND o.financing_expected_date <= v_until)
      )
    ORDER BY o.balance_amount DESC NULLS LAST
    LIMIT 10
  ) row_data;

  RETURN jsonb_build_object(
    'orizzonte_giorni', p_days_ahead,
    'data_limite', v_until,
    'totale_da_incassare_eur', round(v_total_due::numeric, 2),
    'breakdown', jsonb_build_object(
      'acconti_eur', round(v_deposit_due::numeric, 2),
      'acconti_2_eur', round(v_deposit2_due::numeric, 2),
      'saldi_eur', round(v_balance_due::numeric, 2),
      'finanziamenti_eur', round(v_financing_due::numeric, 2)
    ),
    'top_commesse', COALESCE(v_breakdown, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_revenue_forecast(uuid, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_revenue_forecast(uuid, int) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) silvio_tool_overdue_payments — rate scadute non pagate
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_overdue_payments(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric;
  v_count int;
  v_overdue jsonb;
BEGIN
  WITH overdue AS (
    SELECT
      o.order_code,
      COALESCE(o.client_name, o.client_company) AS cliente,
      'acconto' AS tipo,
      o.deposit_amount AS importo_eur,
      o.deposit_expected_date AS data_attesa,
      (CURRENT_DATE - o.deposit_expected_date) AS giorni_ritardo
    FROM public.orders o
    WHERE o.company_id = p_company_id
      AND COALESCE(o.deposit_paid, false) = false
      AND o.deposit_expected_date IS NOT NULL
      AND o.deposit_expected_date < CURRENT_DATE
    UNION ALL
    SELECT
      o.order_code, COALESCE(o.client_name, o.client_company), 'acconto_2',
      o.deposit_2_amount, o.deposit_2_expected_date,
      (CURRENT_DATE - o.deposit_2_expected_date)
    FROM public.orders o
    WHERE o.company_id = p_company_id
      AND COALESCE(o.deposit_2_paid, false) = false
      AND o.deposit_2_expected_date IS NOT NULL
      AND o.deposit_2_expected_date < CURRENT_DATE
    UNION ALL
    SELECT
      o.order_code, COALESCE(o.client_name, o.client_company), 'saldo',
      o.balance_amount, o.balance_expected_date,
      (CURRENT_DATE - o.balance_expected_date)
    FROM public.orders o
    WHERE o.company_id = p_company_id
      AND COALESCE(o.balance_paid, false) = false
      AND o.balance_expected_date IS NOT NULL
      AND o.balance_expected_date < CURRENT_DATE
    UNION ALL
    SELECT
      o.order_code, COALESCE(o.client_name, o.client_company), 'finanziamento',
      o.financing_amount, o.financing_expected_date,
      (CURRENT_DATE - o.financing_expected_date)
    FROM public.orders o
    WHERE o.company_id = p_company_id
      AND COALESCE(o.financing_paid, false) = false
      AND o.financing_expected_date IS NOT NULL
      AND o.financing_expected_date < CURRENT_DATE
  )
  SELECT
    count(*),
    COALESCE(sum(importo_eur), 0),
    jsonb_agg(jsonb_build_object(
      'commessa', order_code,
      'cliente', cliente,
      'tipo_rata', tipo,
      'importo_eur', round(importo_eur::numeric, 2),
      'data_attesa', data_attesa,
      'giorni_ritardo', giorni_ritardo
    ) ORDER BY giorni_ritardo DESC)
  INTO v_count, v_total, v_overdue
  FROM overdue;

  RETURN jsonb_build_object(
    'totale_scaduti', v_count,
    'importo_totale_eur', round(v_total::numeric, 2),
    'rate_scadute', COALESCE(v_overdue, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_overdue_payments(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_overdue_payments(uuid) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) silvio_tool_cashflow_status — saldo banche + entrate/uscite recenti
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_cashflow_status(
  p_company_id uuid,
  p_days_back int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_total numeric;
  v_accounts jsonb;
  v_in numeric;
  v_out numeric;
  v_since date := (CURRENT_DATE - p_days_back);
BEGIN
  -- Saldo totale per banca
  SELECT
    COALESCE(sum(ba.current_balance), 0),
    jsonb_agg(jsonb_build_object(
      'banca', ba.bank_name,
      'iban_last4', RIGHT(COALESCE(ba.iban, ''), 4),
      'saldo_eur', round(COALESCE(ba.current_balance, 0)::numeric, 2),
      'aggiornato_il', ba.last_synced_at
    ))
  INTO v_balance_total, v_accounts
  FROM public.bank_accounts ba
  WHERE ba.company_id = p_company_id
    AND COALESCE(ba.is_archived, false) = false;

  -- Entrate / uscite ultimi N giorni (se bank_transactions accessibile)
  BEGIN
    SELECT
      COALESCE(sum(CASE WHEN bt.amount > 0 THEN bt.amount ELSE 0 END), 0),
      COALESCE(sum(CASE WHEN bt.amount < 0 THEN ABS(bt.amount) ELSE 0 END), 0)
    INTO v_in, v_out
    FROM public.bank_transactions bt
    WHERE bt.company_id = p_company_id
      AND bt.transaction_date >= v_since;
  EXCEPTION WHEN OTHERS THEN
    v_in := NULL;
    v_out := NULL;
  END;

  RETURN jsonb_build_object(
    'saldo_totale_eur', round(v_balance_total::numeric, 2),
    'banche', COALESCE(v_accounts, '[]'::jsonb),
    'periodo_movimenti_giorni', p_days_back,
    'entrate_periodo_eur', CASE WHEN v_in IS NOT NULL THEN round(v_in::numeric, 2) ELSE NULL END,
    'uscite_periodo_eur', CASE WHEN v_out IS NOT NULL THEN round(v_out::numeric, 2) ELSE NULL END,
    'cashflow_netto_periodo_eur', CASE WHEN v_in IS NOT NULL THEN round((v_in - v_out)::numeric, 2) ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_cashflow_status(uuid, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_cashflow_status(uuid, int) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) silvio_tool_quotes_summary — pipeline preventivi
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_quotes_summary(
  p_company_id uuid,
  p_status text DEFAULT 'all'  -- 'open' | 'won' | 'lost' | 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_total numeric;
  v_status_breakdown jsonb;
  v_recent jsonb;
BEGIN
  -- Breakdown per status
  SELECT jsonb_object_agg(s, c) INTO v_status_breakdown
  FROM (
    SELECT COALESCE(status, 'unknown') AS s, count(*) AS c
    FROM public.quotes
    WHERE company_id = p_company_id
    GROUP BY 1
  ) x;

  -- Filtered count + total
  SELECT count(*), COALESCE(sum(total), 0)
  INTO v_count, v_total
  FROM public.quotes q
  WHERE q.company_id = p_company_id
    AND CASE
      WHEN p_status = 'open' THEN q.status IN ('draft', 'sent', 'pending', 'aperto', 'inviato')
      WHEN p_status = 'won' THEN q.status IN ('accepted', 'won', 'vinto', 'accettato', 'approved')
      WHEN p_status = 'lost' THEN q.status IN ('lost', 'perso', 'rejected', 'rifiutato')
      ELSE true
    END;

  -- Top recenti (10)
  SELECT jsonb_agg(row_data)
  INTO v_recent
  FROM (
    SELECT
      q.quote_number,
      q.client_name,
      q.status,
      round(q.total::numeric, 2) AS valore_eur,
      q.created_at
    FROM public.quotes q
    WHERE q.company_id = p_company_id
      AND CASE
        WHEN p_status = 'open' THEN q.status IN ('draft', 'sent', 'pending', 'aperto', 'inviato')
        WHEN p_status = 'won' THEN q.status IN ('accepted', 'won', 'vinto', 'accettato', 'approved')
        WHEN p_status = 'lost' THEN q.status IN ('lost', 'perso', 'rejected', 'rifiutato')
        ELSE true
      END
    ORDER BY q.created_at DESC
    LIMIT 10
  ) row_data;

  RETURN jsonb_build_object(
    'filter_status', p_status,
    'totale_preventivi', v_count,
    'valore_totale_eur', round(v_total::numeric, 2),
    'breakdown_status', COALESCE(v_status_breakdown, '{}'::jsonb),
    'recenti', COALESCE(v_recent, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_quotes_summary(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_quotes_summary(uuid, text) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) silvio_tool_search_orders — ricerca commesse per cliente/codice/descrizione
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_search_orders(
  p_company_id uuid,
  p_query text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_results jsonb;
BEGIN
  IF p_query IS NULL OR length(trim(p_query)) < 2 THEN
    RETURN jsonb_build_object('error', 'query troppo corta (min 2 char)');
  END IF;

  SELECT jsonb_agg(row_data) INTO v_results
  FROM (
    SELECT
      o.order_code,
      COALESCE(o.client_name, o.client_company) AS cliente,
      o.tipo_lavoro,
      o.indirizzo_lavori,
      round(o.total_amount::numeric, 2) AS valore_eur,
      round(o.balance_amount::numeric, 2) AS da_incassare_eur,
      o.percentuale_avanzamento,
      o.status,
      o.expected_date
    FROM public.orders o
    WHERE o.company_id = p_company_id
      AND (
        o.order_code ILIKE '%' || p_query || '%' OR
        o.client_name ILIKE '%' || p_query || '%' OR
        o.client_company ILIKE '%' || p_query || '%' OR
        o.tipo_lavoro ILIKE '%' || p_query || '%' OR
        o.indirizzo_lavori ILIKE '%' || p_query || '%' OR
        o.work_description ILIKE '%' || p_query || '%'
      )
    ORDER BY o.created_at DESC
    LIMIT 15
  ) row_data;

  RETURN jsonb_build_object(
    'query', p_query,
    'totale_match', COALESCE(jsonb_array_length(v_results), 0),
    'risultati', COALESCE(v_results, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_search_orders(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_search_orders(uuid, text) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 7) silvio_tool_company_kpi — KPI sintetici aziendali
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_company_kpi(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employees int;
  v_orders_active int;
  v_orders_ytd int;
  v_revenue_ytd numeric;
  v_quotes_open int;
  v_overdue_count int;
  v_overdue_amount numeric;
  v_bank_balance numeric;
BEGIN
  SELECT count(*) INTO v_employees
    FROM public.profiles WHERE company_id = p_company_id;

  SELECT count(*) INTO v_orders_active
    FROM public.orders WHERE company_id = p_company_id
      AND COALESCE(balance_paid, false) = false;

  SELECT count(*), COALESCE(sum(total_amount), 0) INTO v_orders_ytd, v_revenue_ytd
    FROM public.orders WHERE company_id = p_company_id
      AND created_at >= date_trunc('year', CURRENT_DATE);

  BEGIN
    SELECT count(*) INTO v_quotes_open
      FROM public.quotes WHERE company_id = p_company_id
        AND status IN ('draft', 'sent', 'pending', 'aperto', 'inviato');
  EXCEPTION WHEN OTHERS THEN v_quotes_open := NULL; END;

  -- Overdue summary
  WITH overdue AS (
    SELECT count(*) c, COALESCE(sum(amt), 0) tot FROM (
      SELECT deposit_amount AS amt FROM public.orders WHERE company_id = p_company_id
        AND COALESCE(deposit_paid, false) = false AND deposit_expected_date < CURRENT_DATE
      UNION ALL
      SELECT deposit_2_amount FROM public.orders WHERE company_id = p_company_id
        AND COALESCE(deposit_2_paid, false) = false AND deposit_2_expected_date < CURRENT_DATE
      UNION ALL
      SELECT balance_amount FROM public.orders WHERE company_id = p_company_id
        AND COALESCE(balance_paid, false) = false AND balance_expected_date < CURRENT_DATE
      UNION ALL
      SELECT financing_amount FROM public.orders WHERE company_id = p_company_id
        AND COALESCE(financing_paid, false) = false AND financing_expected_date < CURRENT_DATE
    ) x
  )
  SELECT c, tot INTO v_overdue_count, v_overdue_amount FROM overdue;

  BEGIN
    SELECT COALESCE(sum(current_balance), 0) INTO v_bank_balance
      FROM public.bank_accounts WHERE company_id = p_company_id
        AND COALESCE(is_archived, false) = false;
  EXCEPTION WHEN OTHERS THEN v_bank_balance := NULL; END;

  RETURN jsonb_build_object(
    'aggiornato_al', now(),
    'team_size', v_employees,
    'commesse_attive', v_orders_active,
    'commesse_anno_corrente', v_orders_ytd,
    'fatturato_anno_corrente_eur', round(v_revenue_ytd::numeric, 2),
    'preventivi_aperti', v_quotes_open,
    'rate_scadute_count', v_overdue_count,
    'rate_scadute_eur', round(v_overdue_amount::numeric, 2),
    'saldo_banche_totale_eur', CASE WHEN v_bank_balance IS NOT NULL THEN round(v_bank_balance::numeric, 2) ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_company_kpi(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_company_kpi(uuid) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 8) silvio_tool_top_customers — top clienti per fatturato cumulato
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_top_customers(
  p_company_id uuid,
  p_limit int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_top jsonb;
BEGIN
  SELECT jsonb_agg(row_data) INTO v_top
  FROM (
    SELECT
      COALESCE(o.client_name, o.client_company) AS cliente,
      o.client_company,
      o.client_email,
      o.client_phone,
      count(*) AS commesse_count,
      round(sum(o.total_amount)::numeric, 2) AS fatturato_totale_eur,
      round(sum(o.balance_amount)::numeric, 2) AS da_incassare_eur,
      max(o.created_at) AS ultima_commessa_il
    FROM public.orders o
    WHERE o.company_id = p_company_id
      AND COALESCE(o.client_name, o.client_company) IS NOT NULL
    GROUP BY 1, 2, 3, 4
    ORDER BY sum(o.total_amount) DESC NULLS LAST
    LIMIT GREATEST(LEAST(p_limit, 50), 1)
  ) row_data;

  RETURN jsonb_build_object(
    'limit', p_limit,
    'top_clienti', COALESCE(v_top, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_top_customers(uuid, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_top_customers(uuid, int) TO service_role;
