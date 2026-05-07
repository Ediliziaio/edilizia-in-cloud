-- Silvio finance tools:
-- normalize JSON aliases and add operational priority fields so prompts can
-- reason consistently across companies and not depend on Italian-only keys.

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
  v_days int := LEAST(GREATEST(COALESCE(p_days_ahead, 30), 1), 365);
  v_until date := (CURRENT_DATE + (LEAST(GREATEST(COALESCE(p_days_ahead, 30), 1), 365) || ' days')::interval)::date;
  v_orders_count int := 0;
  v_deposit_due numeric := 0;
  v_deposit2_due numeric := 0;
  v_balance_due numeric := 0;
  v_financing_due numeric := 0;
  v_total_due numeric := 0;
  v_future_count int := 0;
  v_overdue_excluded numeric := 0;
  v_breakdown jsonb := '[]'::jsonb;
  v_warnings text[] := ARRAY[]::text[];
BEGIN
  SELECT COUNT(*) INTO v_orders_count
  FROM public.orders
  WHERE company_id = p_company_id;

  WITH due AS (
    SELECT
      COALESCE(NULLIF(TRIM(o.order_code), ''), 'Ordine senza codice') AS order_code,
      COALESCE(
        NULLIF(TRIM(o.client_name), ''),
        NULLIF(TRIM(o.client_company), ''),
        NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
        p.email,
        'Cliente non indicato'
      ) AS cliente,
      'acconto' AS tipo,
      COALESCE(o.deposit_amount, 0) AS importo_eur,
      o.deposit_expected_date AS data_attesa
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND COALESCE(o.deposit_paid, false) = false
      AND o.deposit_expected_date BETWEEN CURRENT_DATE AND v_until
    UNION ALL
    SELECT
      COALESCE(NULLIF(TRIM(o.order_code), ''), 'Ordine senza codice'),
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'acconto_2',
      COALESCE(o.deposit_2_amount, 0),
      o.deposit_2_expected_date
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND COALESCE(o.deposit_2_paid, false) = false
      AND o.deposit_2_expected_date BETWEEN CURRENT_DATE AND v_until
    UNION ALL
    SELECT
      COALESCE(NULLIF(TRIM(o.order_code), ''), 'Ordine senza codice'),
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'saldo',
      COALESCE(o.balance_amount, 0),
      o.balance_expected_date
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND COALESCE(o.balance_paid, false) = false
      AND o.balance_expected_date BETWEEN CURRENT_DATE AND v_until
    UNION ALL
    SELECT
      COALESCE(NULLIF(TRIM(o.order_code), ''), 'Ordine senza codice'),
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'finanziamento',
      COALESCE(o.financing_amount, 0),
      o.financing_expected_date
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND COALESCE(o.financing_paid, false) = false
      AND o.financing_expected_date BETWEEN CURRENT_DATE AND v_until
  )
  SELECT
    COALESCE(SUM(importo_eur) FILTER (WHERE tipo = 'acconto'), 0),
    COALESCE(SUM(importo_eur) FILTER (WHERE tipo = 'acconto_2'), 0),
    COALESCE(SUM(importo_eur) FILTER (WHERE tipo = 'saldo'), 0),
    COALESCE(SUM(importo_eur) FILTER (WHERE tipo = 'finanziamento'), 0),
    COALESCE(SUM(importo_eur), 0),
    COUNT(*) FILTER (WHERE importo_eur > 0),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'commessa', order_code,
          'cliente', cliente,
          'tipo_rata', tipo,
          'importo_eur', ROUND(importo_eur::numeric, 2),
          'data_attesa', data_attesa,
          'giorni_a_scadenza', data_attesa - CURRENT_DATE,
          'priorita', CASE
            WHEN data_attesa <= CURRENT_DATE + 7 THEN 'alta'
            WHEN data_attesa <= CURRENT_DATE + 30 THEN 'media'
            ELSE 'bassa'
          END
        )
        ORDER BY data_attesa ASC, importo_eur DESC
      ),
      '[]'::jsonb
    )
  INTO v_deposit_due, v_deposit2_due, v_balance_due, v_financing_due, v_total_due, v_future_count, v_breakdown
  FROM due;

  WITH overdue AS (
    SELECT COALESCE(o.deposit_amount, 0) AS importo_eur
    FROM public.orders o
    WHERE o.company_id = p_company_id AND COALESCE(o.deposit_paid, false) = false AND o.deposit_expected_date < CURRENT_DATE
    UNION ALL
    SELECT COALESCE(o.deposit_2_amount, 0)
    FROM public.orders o
    WHERE o.company_id = p_company_id AND COALESCE(o.deposit_2_paid, false) = false AND o.deposit_2_expected_date < CURRENT_DATE
    UNION ALL
    SELECT COALESCE(o.balance_amount, 0)
    FROM public.orders o
    WHERE o.company_id = p_company_id AND COALESCE(o.balance_paid, false) = false AND o.balance_expected_date < CURRENT_DATE
    UNION ALL
    SELECT COALESCE(o.financing_amount, 0)
    FROM public.orders o
    WHERE o.company_id = p_company_id AND COALESCE(o.financing_paid, false) = false AND o.financing_expected_date < CURRENT_DATE
  )
  SELECT COALESCE(SUM(importo_eur), 0) INTO v_overdue_excluded
  FROM overdue;

  IF v_orders_count = 0 THEN
    v_warnings := array_append(v_warnings, 'orders_missing');
  END IF;
  IF v_future_count = 0 THEN
    v_warnings := array_append(v_warnings, 'future_receivables_missing');
  END IF;

  RETURN jsonb_build_object(
    'orizzonte_giorni', v_days,
    'dal', CURRENT_DATE,
    'data_limite', v_until,
    'totale_da_incassare_eur', ROUND(v_total_due::numeric, 2),
    'total_expected_eur', ROUND(v_total_due::numeric, 2),
    'future_receivables_count', v_future_count,
    'expected_count', v_future_count,
    'scaduti_esclusi_eur', ROUND(v_overdue_excluded::numeric, 2),
    'overdue_excluded_eur', ROUND(v_overdue_excluded::numeric, 2),
    'nota', 'Il forecast include solo incassi futuri. I crediti gia scaduti sono esclusi e vanno letti con get_overdue_payments.',
    'data_quality', jsonb_build_object(
      'orders_count', v_orders_count,
      'future_receivables_count', v_future_count,
      'warnings', to_jsonb(v_warnings)
    ),
    'breakdown', jsonb_build_object(
      'acconti_eur', ROUND(v_deposit_due::numeric, 2),
      'acconti_2_eur', ROUND(v_deposit2_due::numeric, 2),
      'saldi_eur', ROUND(v_balance_due::numeric, 2),
      'finanziamenti_eur', ROUND(v_financing_due::numeric, 2)
    ),
    'top_commesse', v_breakdown,
    'incassi_futuri', v_breakdown
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_revenue_forecast(uuid, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_revenue_forecast(uuid, int) TO service_role;

CREATE OR REPLACE FUNCTION public.silvio_tool_overdue_payments(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orders_count int := 0;
  v_total numeric := 0;
  v_count int := 0;
  v_overdue jsonb := '[]'::jsonb;
  v_warnings text[] := ARRAY[]::text[];
BEGIN
  SELECT COUNT(*) INTO v_orders_count
  FROM public.orders
  WHERE company_id = p_company_id;

  WITH overdue AS (
    SELECT
      COALESCE(NULLIF(TRIM(o.order_code), ''), 'Ordine senza codice') AS order_code,
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato') AS cliente,
      'acconto' AS tipo,
      COALESCE(o.deposit_amount, 0) AS importo_eur,
      o.deposit_expected_date AS data_attesa,
      (CURRENT_DATE - o.deposit_expected_date) AS giorni_ritardo
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND COALESCE(o.deposit_paid, false) = false
      AND o.deposit_expected_date IS NOT NULL
      AND o.deposit_expected_date < CURRENT_DATE
    UNION ALL
    SELECT
      COALESCE(NULLIF(TRIM(o.order_code), ''), 'Ordine senza codice'),
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'acconto_2',
      COALESCE(o.deposit_2_amount, 0),
      o.deposit_2_expected_date,
      (CURRENT_DATE - o.deposit_2_expected_date)
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND COALESCE(o.deposit_2_paid, false) = false
      AND o.deposit_2_expected_date IS NOT NULL
      AND o.deposit_2_expected_date < CURRENT_DATE
    UNION ALL
    SELECT
      COALESCE(NULLIF(TRIM(o.order_code), ''), 'Ordine senza codice'),
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'saldo',
      COALESCE(o.balance_amount, 0),
      o.balance_expected_date,
      (CURRENT_DATE - o.balance_expected_date)
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND COALESCE(o.balance_paid, false) = false
      AND o.balance_expected_date IS NOT NULL
      AND o.balance_expected_date < CURRENT_DATE
    UNION ALL
    SELECT
      COALESCE(NULLIF(TRIM(o.order_code), ''), 'Ordine senza codice'),
      COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), p.email, 'Cliente non indicato'),
      'finanziamento',
      COALESCE(o.financing_amount, 0),
      o.financing_expected_date,
      (CURRENT_DATE - o.financing_expected_date)
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND COALESCE(o.financing_paid, false) = false
      AND o.financing_expected_date IS NOT NULL
      AND o.financing_expected_date < CURRENT_DATE
  ),
  ranked AS (
    SELECT
      *,
      ROW_NUMBER() OVER (ORDER BY (importo_eur + (GREATEST(giorni_ritardo, 0) * 50)) DESC, giorni_ritardo DESC, importo_eur DESC) AS priorita_num,
      ROUND((importo_eur + (GREATEST(giorni_ritardo, 0) * 50))::numeric, 2) AS priority_score
    FROM overdue
  )
  SELECT
    COUNT(*),
    COALESCE(SUM(importo_eur), 0),
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'priorita_num', priorita_num,
          'priorita', CASE WHEN priorita_num <= 3 THEN 'alta' WHEN priorita_num <= 6 THEN 'media' ELSE 'bassa' END,
          'priority_score', priority_score,
          'commessa', order_code,
          'cliente', cliente,
          'tipo_rata', tipo,
          'importo_eur', ROUND(importo_eur::numeric, 2),
          'data_attesa', data_attesa,
          'giorni_ritardo', giorni_ritardo,
          'azione_suggerita', CASE
            WHEN giorni_ritardo >= 30 THEN 'telefonata oggi + promessa pagamento scritta'
            WHEN importo_eur >= 5000 THEN 'telefonata oggi + sollecito formale'
            ELSE 'sollecito email/whatsapp oggi'
          END
        )
        ORDER BY priorita_num ASC
      ),
      '[]'::jsonb
    )
  INTO v_count, v_total, v_overdue
  FROM ranked;

  IF v_orders_count = 0 THEN
    v_warnings := array_append(v_warnings, 'orders_missing');
  END IF;
  IF v_count = 0 THEN
    v_warnings := array_append(v_warnings, 'overdue_receivables_missing');
  END IF;

  RETURN jsonb_build_object(
    'totale_scaduti', v_count,
    'count', v_count,
    'importo_totale_eur', ROUND(v_total::numeric, 2),
    'total_overdue_eur', ROUND(v_total::numeric, 2),
    'data_quality', jsonb_build_object(
      'orders_count', v_orders_count,
      'overdue_receivables_count', v_count,
      'warnings', to_jsonb(v_warnings)
    ),
    'rate_scadute', v_overdue,
    'priorita_recupero', v_overdue
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_overdue_payments(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_overdue_payments(uuid) TO service_role;
