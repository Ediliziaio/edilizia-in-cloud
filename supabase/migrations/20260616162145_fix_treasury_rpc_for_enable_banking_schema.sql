-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- ============================================================================
-- Fix RPC Tesoreria: erano scritte per il vecchio schema GoCardless.
-- Bug: i.type (inesistente → crash tab Previsioni), colonne scadenze sbagliate
-- (importo/descrizione/data_scadenza/stato), e filtro bc.status='active' mentre
-- Enable Banking usa 'linked' → saldi/conteggi sempre 0.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_cash_flow_forecast(p_company_id uuid, p_days integer DEFAULT 90)
 RETURNS TABLE(current_balance numeric, expected_income numeric, expected_expenses numeric, forecasted_balance numeric, income_details jsonb, expense_details jsonb)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_current_balance numeric;
  v_expected_income numeric;
  v_expected_expenses numeric;
  v_income_details jsonb;
  v_expense_details jsonb;
BEGIN
  -- Saldo attuale: somma saldi conti attivi (il saldo sta sul conto, non serve lo stato connessione)
  SELECT COALESCE(SUM(ba.current_balance), 0)
  INTO v_current_balance
  FROM public.bank_accounts ba
  WHERE ba.company_id = p_company_id AND ba.is_active = true;

  -- Entrate attese: fatture attive non pagate in scadenza entro p_days
  SELECT
    COALESCE(SUM(i.total - COALESCE(i.paid_amount, 0)), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'invoice_number', i.invoice_number, 'client', i.client_company_name,
      'amount', i.total - COALESCE(i.paid_amount, 0), 'due_date', i.due_date)), '[]'::jsonb)
  INTO v_expected_income, v_income_details
  FROM public.invoices i
  WHERE i.company_id = p_company_id
    AND i.deleted_at IS NULL
    AND i.status NOT IN ('paid', 'cancelled', 'draft')
    AND i.document_type = 'invoice'
    AND (i.total - COALESCE(i.paid_amount, 0)) > 0
    AND i.due_date <= CURRENT_DATE + (p_days || ' days')::interval;

  -- Uscite previste: scadenze in uscita ancora da pagare entro p_days
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

CREATE OR REPLACE FUNCTION public.get_treasury_summary(p_company_id uuid)
 RETURNS TABLE(total_balance numeric, total_credit_balance numeric, total_debit_balance numeric, accounts_count bigint, connections_count bigint, monthly_income numeric, monthly_expenses numeric, monthly_net numeric, last_sync_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT COALESCE(SUM(ba.current_balance), 0) FROM public.bank_accounts ba WHERE ba.company_id = p_company_id AND ba.is_active = true) AS total_balance,
    (SELECT COALESCE(SUM(ba.current_balance), 0) FROM public.bank_accounts ba WHERE ba.company_id = p_company_id AND ba.is_active = true AND ba.current_balance > 0) AS total_credit_balance,
    (SELECT COALESCE(SUM(ba.current_balance), 0) FROM public.bank_accounts ba WHERE ba.company_id = p_company_id AND ba.is_active = true AND ba.current_balance < 0) AS total_debit_balance,
    (SELECT COUNT(*) FROM public.bank_accounts ba WHERE ba.company_id = p_company_id AND ba.is_active = true) AS accounts_count,
    (SELECT COUNT(*) FROM public.bank_connections bc WHERE bc.company_id = p_company_id AND bc.status IN ('active','linked')) AS connections_count,
    (SELECT COALESCE(SUM(t.amount), 0) FROM public.bank_transactions t WHERE t.company_id = p_company_id AND t.transaction_type = 'credit' AND t.status = 'booked' AND t.booking_date >= date_trunc('month', CURRENT_DATE)) AS monthly_income,
    (SELECT COALESCE(SUM(ABS(t.amount)), 0) FROM public.bank_transactions t WHERE t.company_id = p_company_id AND t.transaction_type = 'debit' AND t.status = 'booked' AND t.booking_date >= date_trunc('month', CURRENT_DATE)) AS monthly_expenses,
    (SELECT COALESCE(SUM(t.amount), 0) FROM public.bank_transactions t WHERE t.company_id = p_company_id AND t.status = 'booked' AND t.booking_date >= date_trunc('month', CURRENT_DATE)) AS monthly_net,
    (SELECT MAX(bc.last_sync_at) FROM public.bank_connections bc WHERE bc.company_id = p_company_id AND bc.status IN ('active','linked')) AS last_sync_at;
$function$;
