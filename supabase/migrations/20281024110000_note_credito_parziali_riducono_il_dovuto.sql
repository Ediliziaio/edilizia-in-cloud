-- Nota di credito parziale: riduce il dovuto della fattura, ovunque.
--
-- Una nota di credito più piccola della fattura (abbuono, reso parziale) non
-- storna la fattura ma ne abbassa il residuo: dovuto = totale − incassato −
-- somma delle note collegate. Finora questa sottrazione la faceva solo il
-- motore dei solleciti (dunning_pianifica); scadenzario, cruscotto e cash flow
-- mostravano ancora l'intero. Qui le tre RPC leggono il residuo vero.
--
-- Il collegamento (invoices.credited_invoice_id) lo scrive applica_note_di_credito
-- dal riferimento FIC, per qualsiasi importo; una nota che copre tutta la
-- fattura la porta a «credited» (già esclusa dallo stato), una parziale la
-- lascia emessa e qui pesa come riduzione. Una nota annullata non conta.

-- Somma delle note di credito collegate a una fattura (parziali o totali),
-- escluse le annullate. STABLE: una lettura per fattura nella stessa query.
CREATE OR REPLACE FUNCTION public.nc_collegate_importo(p_invoice_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce(sum(coalesce(nc.total, 0)), 0)
    FROM public.invoices nc
   WHERE nc.credited_invoice_id = p_invoice_id
     AND nc.document_type IN ('credit_note', 'nota_credito')
     AND nc.deleted_at IS NULL
     AND coalesce(nc.status, '') <> 'cancelled';
$$;

REVOKE ALL ON FUNCTION public.nc_collegate_importo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nc_collegate_importo(uuid) TO authenticated, service_role;


-- get_scadenzario: righe da incassare al netto delle note collegate, e le note
-- di credito non compaiono più come se fossero un credito da incassare.
CREATE OR REPLACE FUNCTION public.get_scadenzario(p_company_id uuid, p_from_date date DEFAULT (CURRENT_DATE - '30 days'::interval), p_to_date date DEFAULT (CURRENT_DATE + '90 days'::interval))
 RETURNS TABLE(invoice_id uuid, invoice_number text, client_name text, due_date date, total numeric, paid_amount numeric, remaining numeric, status text, days_until_due integer, urgency text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.invoice_number,
    i.client_company_name,
    i.due_date,
    i.total,
    i.paid_amount,
    (i.total - coalesce(i.paid_amount, 0) - public.nc_collegate_importo(i.id)) AS remaining,
    i.status,
    (i.due_date - CURRENT_DATE)::INTEGER,
    CASE
      WHEN i.due_date < CURRENT_DATE           THEN 'overdue'
      WHEN i.due_date <= CURRENT_DATE + 7      THEN 'critical'
      WHEN i.due_date <= CURRENT_DATE + 30     THEN 'warning'
      ELSE 'ok'
    END
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.status NOT IN ('paid', 'cancelled', 'draft', 'credited')
    AND coalesce(i.document_type, 'invoice') NOT IN ('credit_note', 'nota_credito')
    AND (i.total - coalesce(i.paid_amount, 0) - public.nc_collegate_importo(i.id)) > 0.005
    AND i.due_date BETWEEN p_from_date AND p_to_date
  ORDER BY i.due_date ASC;
END;
$function$;

-- get_cruscotto_invoice_stats: importi e conteggi sul residuo al netto delle note.
CREATE OR REPLACE FUNCTION public.get_cruscotto_invoice_stats(p_company_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  v_today date := current_date;
  v_month_start date := date_trunc('month', current_date)::date;
  v_month_end date := (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  SELECT json_build_object(
    'total_outstanding', COALESCE(SUM(CASE WHEN status NOT IN ('paid', 'pagata', 'cancelled', 'canceled', 'annullata', 'credited') THEN GREATEST(residuo, 0) ELSE 0 END), 0),
    'overdue_count', COALESCE(SUM(CASE WHEN due_date < v_today AND status NOT IN ('paid', 'pagata', 'cancelled', 'canceled', 'annullata', 'credited') AND residuo > 0 THEN 1 ELSE 0 END), 0),
    'overdue_amount', COALESCE(SUM(CASE WHEN due_date < v_today AND status NOT IN ('paid', 'pagata', 'cancelled', 'canceled', 'annullata', 'credited') AND residuo > 0 THEN GREATEST(residuo, 0) ELSE 0 END), 0),
    'due_this_week_count', COALESCE(SUM(CASE WHEN due_date BETWEEN v_today AND v_today + 7 AND status NOT IN ('paid', 'pagata', 'cancelled', 'canceled', 'annullata', 'credited') AND residuo > 0 THEN 1 ELSE 0 END), 0),
    'due_this_week_amount', COALESCE(SUM(CASE WHEN due_date BETWEEN v_today AND v_today + 7 AND status NOT IN ('paid', 'pagata', 'cancelled', 'canceled', 'annullata', 'credited') AND residuo > 0 THEN GREATEST(residuo, 0) ELSE 0 END), 0),
    'paid_this_month', COALESCE(SUM(CASE WHEN status IN ('paid', 'pagata') AND updated_at::date BETWEEN v_month_start AND v_month_end THEN COALESCE(total, 0) ELSE 0 END), 0),
    'issued_this_month', COALESCE(SUM(CASE WHEN issue_date BETWEEN v_month_start AND v_month_end THEN 1 ELSE 0 END), 0),
    'issued_this_month_amount', COALESCE(SUM(CASE WHEN issue_date BETWEEN v_month_start AND v_month_end THEN COALESCE(total, 0) ELSE 0 END), 0)
  ) INTO result
  FROM (
    SELECT i.*,
           (COALESCE(i.total, 0) - COALESCE(i.paid_amount, 0) - public.nc_collegate_importo(i.id)) AS residuo
      FROM public.invoices i
     WHERE i.company_id = p_company_id
       AND i.document_type IN ('invoice', 'fattura', 'fattura_accompagnatoria', 'parcella')
       AND i.deleted_at IS NULL
  ) t;

  RETURN COALESCE(result, json_build_object(
    'total_outstanding', 0,
    'overdue_count', 0,
    'overdue_amount', 0,
    'due_this_week_count', 0,
    'due_this_week_amount', 0,
    'paid_this_month', 0,
    'issued_this_month', 0,
    'issued_this_month_amount', 0
  ));
END;
$function$;

-- get_cash_flow_forecast: entrate attese al netto delle note collegate.
CREATE OR REPLACE FUNCTION public.get_cash_flow_forecast(p_company_id uuid, p_days integer DEFAULT 90)
 RETURNS TABLE(current_balance numeric, expected_income numeric, expected_expenses numeric, forecasted_balance numeric, income_details jsonb, expense_details jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_current_balance numeric;
  v_expected_income numeric;
  v_expected_expenses numeric;
  v_income_details jsonb;
  v_expense_details jsonb;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  SELECT COALESCE(SUM(ba.current_balance), 0)
  INTO v_current_balance
  FROM public.bank_accounts ba
  WHERE ba.company_id = p_company_id AND ba.is_active = true;

  -- Entrate attese: residuo delle fatture non pagate in scadenza entro p_days,
  -- al netto delle note di credito collegate.
  SELECT
    COALESCE(SUM(t.residuo), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'invoice_number', t.invoice_number, 'client', t.client_company_name,
      'amount', t.residuo, 'due_date', t.due_date)), '[]'::jsonb)
  INTO v_expected_income, v_income_details
  FROM (
    SELECT i.invoice_number, i.client_company_name, i.due_date,
           (i.total - COALESCE(i.paid_amount, 0) - public.nc_collegate_importo(i.id)) AS residuo
      FROM public.invoices i
     WHERE i.company_id = p_company_id
       AND i.deleted_at IS NULL
       AND i.status NOT IN ('paid', 'cancelled', 'draft', 'credited')
       AND i.document_type = 'invoice'
       AND i.due_date <= CURRENT_DATE + (p_days || ' days')::interval
  ) t
  WHERE t.residuo > 0;

  SELECT
    COALESCE(SUM(s.amount), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'description', s.description, 'amount', s.amount, 'due_date', s.due_date, 'type', s.tipo)), '[]'::jsonb)
  INTO v_expected_expenses, v_expense_details
  FROM public.scadenze s
  WHERE s.company_id = p_company_id
    AND s.direction = 'uscita'
    AND s.status = 'da_pagare'
    AND s.due_date <= CURRENT_DATE + (p_days || ' days')::interval;

  RETURN QUERY SELECT
    v_current_balance, v_expected_income, v_expected_expenses,
    v_current_balance + v_expected_income - v_expected_expenses,
    v_income_details, v_expense_details;
END;
$function$;
