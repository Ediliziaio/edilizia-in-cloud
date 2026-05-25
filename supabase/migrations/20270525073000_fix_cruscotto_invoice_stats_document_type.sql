-- Fix cruscotto invoice stats after invoices.type -> invoices.document_type schema change.
CREATE OR REPLACE FUNCTION public.get_cruscotto_invoice_stats(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_today date := current_date;
  v_month_start date := date_trunc('month', current_date)::date;
  v_month_end date := (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date;
BEGIN
  SELECT json_build_object(
    'total_outstanding', COALESCE(SUM(CASE WHEN status NOT IN ('paid', 'pagata', 'cancelled', 'canceled', 'annullata') THEN GREATEST(COALESCE(total, 0) - COALESCE(paid_amount, 0), 0) ELSE 0 END), 0),
    'overdue_count', COALESCE(SUM(CASE WHEN due_date < v_today AND status NOT IN ('paid', 'pagata', 'cancelled', 'canceled', 'annullata') AND (COALESCE(total, 0) - COALESCE(paid_amount, 0)) > 0 THEN 1 ELSE 0 END), 0),
    'overdue_amount', COALESCE(SUM(CASE WHEN due_date < v_today AND status NOT IN ('paid', 'pagata', 'cancelled', 'canceled', 'annullata') AND (COALESCE(total, 0) - COALESCE(paid_amount, 0)) > 0 THEN GREATEST(COALESCE(total, 0) - COALESCE(paid_amount, 0), 0) ELSE 0 END), 0),
    'due_this_week_count', COALESCE(SUM(CASE WHEN due_date BETWEEN v_today AND v_today + 7 AND status NOT IN ('paid', 'pagata', 'cancelled', 'canceled', 'annullata') AND (COALESCE(total, 0) - COALESCE(paid_amount, 0)) > 0 THEN 1 ELSE 0 END), 0),
    'due_this_week_amount', COALESCE(SUM(CASE WHEN due_date BETWEEN v_today AND v_today + 7 AND status NOT IN ('paid', 'pagata', 'cancelled', 'canceled', 'annullata') AND (COALESCE(total, 0) - COALESCE(paid_amount, 0)) > 0 THEN GREATEST(COALESCE(total, 0) - COALESCE(paid_amount, 0), 0) ELSE 0 END), 0),
    'paid_this_month', COALESCE(SUM(CASE WHEN status IN ('paid', 'pagata') AND updated_at::date BETWEEN v_month_start AND v_month_end THEN COALESCE(total, 0) ELSE 0 END), 0),
    'issued_this_month', COALESCE(SUM(CASE WHEN issue_date BETWEEN v_month_start AND v_month_end THEN 1 ELSE 0 END), 0),
    'issued_this_month_amount', COALESCE(SUM(CASE WHEN issue_date BETWEEN v_month_start AND v_month_end THEN COALESCE(total, 0) ELSE 0 END), 0)
  ) INTO result
  FROM public.invoices
  WHERE company_id = p_company_id
    AND document_type IN ('invoice', 'fattura', 'fattura_accompagnatoria', 'parcella')
    AND deleted_at IS NULL;

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
$$;
