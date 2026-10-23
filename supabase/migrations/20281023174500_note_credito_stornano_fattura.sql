-- Note di credito collegate alla fattura che stornano.
--
-- Una nota di credito importata (Fatture in Cloud e altri) resta un documento
-- a sé: fattura e nota risultano entrambe aperte, e la fattura compare da
-- incassare in scadenzario, cruscotto e previsionale anche quando il cliente
-- non deve più niente.
--
-- Qui:
-- 1. sulla nota si salva il riferimento alla fattura stornata come lo dà il
--    gestionale esterno (numero e data, DatiFattureCollegate in FatturaPA);
-- 2. applica_note_di_credito(azienda) collega le note alla fattura per numero,
--    data e cliente e chiude la coppia quando la nota copre tutto il residuo di
--    una fattura non incassata: fattura e nota passano allo stato «credited»
--    (stornata / compensata) e le loro scadenze aperte diventano «annullata».
--    Nessun incasso inventato: paid_amount resta quello che era, quindi il
--    previsionale non conta entrate che non ci sono state. Il documento resta
--    emesso a tutti gli effetti fiscali (registro IVA, fatturato).
-- 3. abbina_note_di_credito_per_importo(azienda, applica) serve per le note già
--    importate senza riferimento: propone le coppie solo quando c'è un unico
--    candidato da entrambe le parti, e scrive solo se richiesto.
-- 4. le letture che contano il «da incassare» trattano «credited» come chiuso.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS rif_fattura_numero text,
  ADD COLUMN IF NOT EXISTS rif_fattura_data date;

COMMENT ON COLUMN public.invoices.rif_fattura_numero IS
  'Nota di credito: numero della fattura stornata, come lo riporta il gestionale esterno (DatiFattureCollegate).';
COMMENT ON COLUMN public.invoices.rif_fattura_data IS
  'Nota di credito: data della fattura stornata, come la riporta il gestionale esterno.';

CREATE INDEX IF NOT EXISTS idx_invoices_credited_invoice_id
  ON public.invoices (credited_invoice_id) WHERE credited_invoice_id IS NOT NULL;

-- Identificativo fiscale del cliente in forma confrontabile (P.IVA o CF).
CREATE OR REPLACE FUNCTION public.nc_identificativo_cliente(p_piva text, p_cf text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT nullif(upper(regexp_replace(coalesce(nullif(btrim(p_piva), ''), p_cf, ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

REVOKE ALL ON FUNCTION public.nc_identificativo_cliente(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nc_identificativo_cliente(text, text) TO authenticated, service_role;

-- Collega e chiude. Idempotente: si può chiamare a ogni giro d'import.
CREATE OR REPLACE FUNCTION public.applica_note_di_credito(p_company_id uuid)
RETURNS TABLE(collegate integer, fatture_stornate integer, scadenze_chiuse integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET lock_timeout TO '3s'
SET statement_timeout TO '30s'
AS $$
#variable_conflict use_column
DECLARE
  v_collegate integer := 0;
  v_stornate integer := 0;
  v_scadenze integer := 0;
BEGIN
  -- 1. Collegamento per riferimento: stesso numero, stessa data se c'è,
  --    stesso cliente se entrambi i documenti lo identificano. Solo se il
  --    candidato è uno.
  WITH candidati AS (
    SELECT nc.id AS nc_id, f.id AS fattura_id,
           count(*) OVER (PARTITION BY nc.id) AS n
      FROM public.invoices nc
      JOIN public.invoices f
        ON f.company_id = nc.company_id
       AND f.id <> nc.id
       AND f.deleted_at IS NULL
       AND coalesce(f.document_type, 'invoice') IN ('invoice', 'fattura', 'fattura_accompagnatoria', 'parcella')
       AND btrim(f.invoice_number) = btrim(nc.rif_fattura_numero)
       AND (nc.rif_fattura_data IS NULL OR f.issue_date = nc.rif_fattura_data)
       AND f.issue_date <= nc.issue_date
       AND (
         public.nc_identificativo_cliente(nc.client_vat_number, nc.client_fiscal_code) IS NULL
         OR public.nc_identificativo_cliente(f.client_vat_number, f.client_fiscal_code) IS NULL
         OR public.nc_identificativo_cliente(f.client_vat_number, f.client_fiscal_code)
            = public.nc_identificativo_cliente(nc.client_vat_number, nc.client_fiscal_code)
         OR upper(btrim(f.client_fiscal_code)) = upper(btrim(nc.client_fiscal_code))
       )
     WHERE nc.company_id = p_company_id
       AND nc.document_type IN ('credit_note', 'nota_credito')
       AND nc.deleted_at IS NULL
       AND nc.credited_invoice_id IS NULL
       AND nullif(btrim(nc.rif_fattura_numero), '') IS NOT NULL
  )
  UPDATE public.invoices nc
     SET credited_invoice_id = c.fattura_id
    FROM candidati c
   WHERE nc.id = c.nc_id AND c.n = 1;
  GET DIAGNOSTICS v_collegate = ROW_COUNT;

  -- 2. Fatture non incassate coperte per intero dalle loro note.
  CREATE TEMP TABLE IF NOT EXISTS _nc_storni (fattura_id uuid, nc_ids uuid[]) ON COMMIT DROP;
  TRUNCATE _nc_storni;
  INSERT INTO _nc_storni
  SELECT f.id, array_agg(nc.id)
    FROM public.invoices f
    JOIN public.invoices nc
      ON nc.credited_invoice_id = f.id
     AND nc.document_type IN ('credit_note', 'nota_credito')
     AND nc.deleted_at IS NULL
   WHERE f.company_id = p_company_id
     AND f.deleted_at IS NULL
     AND coalesce(f.status, '') NOT IN ('paid', 'cancelled', 'draft')
     AND coalesce(f.paid_amount, 0) <= 0.01
     AND coalesce(f.total, 0) > 0
   GROUP BY f.id, f.total
  HAVING sum(coalesce(nc.total, 0)) >= coalesce(f.total, 0) - 0.01;

  UPDATE public.invoices f
     SET status = 'credited', updated_at = now()
    FROM _nc_storni s
   WHERE f.id = s.fattura_id AND f.status IS DISTINCT FROM 'credited';
  GET DIAGNOSTICS v_stornate = ROW_COUNT;

  -- La nota che compensa una fattura mai incassata non è un rimborso da fare.
  UPDATE public.invoices nc
     SET status = 'credited', updated_at = now()
    FROM _nc_storni s
   WHERE nc.id = ANY (s.nc_ids) AND nc.status IS DISTINCT FROM 'credited';

  -- 3. Scadenze aperte di fattura e nota: chiuse senza importo pagato. Sulla
  --    nota si chiude anche la «pagata» scritta dall'import (nota saldata sul
  --    gestionale, senza data né modalità): non è un rimborso uscito. Quella
  --    segnata a mano da una persona resta com'è.
  UPDATE public.scadenze sc
     SET status = 'annullata',
         notes = concat_ws(E'\n', nullif(sc.notes, ''), 'Chiusa: fattura stornata con nota di credito.'),
         updated_at = now()
    FROM _nc_storni s
   WHERE (sc.invoice_id = s.fattura_id OR sc.invoice_id = ANY (s.nc_ids))
     AND (sc.status IN ('da_pagare', 'parziale')
          OR (sc.invoice_id = ANY (s.nc_ids) AND sc.status = 'pagata'
              AND sc.auto_source = 'invoice' AND sc.paid_date IS NULL AND sc.payment_method IS NULL));
  GET DIAGNOSTICS v_scadenze = ROW_COUNT;

  RETURN QUERY SELECT v_collegate, v_stornate, v_scadenze;
END;
$$;

REVOKE ALL ON FUNCTION public.applica_note_di_credito(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.applica_note_di_credito(uuid) TO service_role;

-- Note già importate senza riferimento: abbinamento per cliente e importo.
-- Prudente: la nota deve avere un solo candidato e il candidato una sola nota.
-- Con p_applica = false restituisce soltanto l'anteprima.
CREATE OR REPLACE FUNCTION public.abbina_note_di_credito_per_importo(p_company_id uuid, p_applica boolean DEFAULT false)
RETURNS TABLE(
  nota_id uuid, nota_numero text, nota_data date,
  fattura_id uuid, fattura_numero text, fattura_data date,
  cliente text, importo numeric, esito text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET lock_timeout TO '3s'
SET statement_timeout TO '30s'
AS $$
#variable_conflict use_column
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _nc_abbinamenti (
    nota_id uuid, nota_numero text, nota_data date,
    fattura_id uuid, fattura_numero text, fattura_data date,
    cliente text, importo numeric, esito text
  ) ON COMMIT DROP;
  TRUNCATE _nc_abbinamenti;

  WITH note AS (
    SELECT nc.*, public.nc_identificativo_cliente(nc.client_vat_number, nc.client_fiscal_code) AS ident
      FROM public.invoices nc
     WHERE nc.company_id = p_company_id
       AND nc.document_type IN ('credit_note', 'nota_credito')
       AND nc.deleted_at IS NULL
       AND nc.credited_invoice_id IS NULL
       AND coalesce(nc.total, 0) > 0
  ),
  aperte AS (
    SELECT f.*, public.nc_identificativo_cliente(f.client_vat_number, f.client_fiscal_code) AS ident
      FROM public.invoices f
     WHERE f.company_id = p_company_id
       AND f.deleted_at IS NULL
       AND coalesce(f.document_type, 'invoice') IN ('invoice', 'fattura', 'fattura_accompagnatoria', 'parcella')
       AND coalesce(f.status, '') NOT IN ('paid', 'cancelled', 'draft', 'credited')
       AND coalesce(f.paid_amount, 0) <= 0.01
       AND NOT EXISTS (SELECT 1 FROM public.invoices x
                        WHERE x.credited_invoice_id = f.id AND x.deleted_at IS NULL)
  ),
  coppie AS (
    SELECT n.id AS nota_id, n.invoice_number AS nota_numero, n.issue_date AS nota_data,
           a.id AS fattura_id, a.invoice_number AS fattura_numero, a.issue_date AS fattura_data,
           n.client_company_name AS cliente, n.total AS importo,
           count(*) OVER (PARTITION BY n.id) AS per_nota,
           count(*) OVER (PARTITION BY a.id) AS per_fattura
      FROM note n
      JOIN aperte a
        ON n.ident IS NOT NULL
       AND a.ident = n.ident
       AND abs(coalesce(a.total, 0) - n.total) <= 0.01
       AND a.issue_date <= n.issue_date
  )
  INSERT INTO _nc_abbinamenti
  SELECT c.nota_id, c.nota_numero, c.nota_data, c.fattura_id, c.fattura_numero, c.fattura_data,
         c.cliente, c.importo,
         CASE WHEN c.per_nota = 1 AND c.per_fattura = 1 THEN 'abbinabile'
              ELSE 'ambiguo: decide una persona' END
    FROM coppie c;

  IF p_applica THEN
    UPDATE public.invoices nc
       SET credited_invoice_id = a.fattura_id
      FROM _nc_abbinamenti a
     WHERE nc.id = a.nota_id AND a.esito = 'abbinabile' AND nc.credited_invoice_id IS NULL;
    UPDATE _nc_abbinamenti SET esito = 'collegata' WHERE esito = 'abbinabile';
    PERFORM public.applica_note_di_credito(p_company_id);
  END IF;

  RETURN QUERY SELECT * FROM _nc_abbinamenti ORDER BY nota_data, nota_numero;
END;
$$;

REVOKE ALL ON FUNCTION public.abbina_note_di_credito_per_importo(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abbina_note_di_credito_per_importo(uuid, boolean) TO service_role;

-- Letture del «da incassare»: una fattura stornata è chiusa.
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
    AND i.status NOT IN ('paid', 'cancelled', 'draft', 'credited')
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
    'total_outstanding', COALESCE(SUM(CASE WHEN status NOT IN ('paid', 'pagata', 'cancelled', 'canceled', 'annullata', 'credited') THEN GREATEST(COALESCE(total, 0) - COALESCE(paid_amount, 0), 0) ELSE 0 END), 0),
    'overdue_count', COALESCE(SUM(CASE WHEN due_date < v_today AND status NOT IN ('paid', 'pagata', 'cancelled', 'canceled', 'annullata', 'credited') AND (COALESCE(total, 0) - COALESCE(paid_amount, 0)) > 0 THEN 1 ELSE 0 END), 0),
    'overdue_amount', COALESCE(SUM(CASE WHEN due_date < v_today AND status NOT IN ('paid', 'pagata', 'cancelled', 'canceled', 'annullata', 'credited') AND (COALESCE(total, 0) - COALESCE(paid_amount, 0)) > 0 THEN GREATEST(COALESCE(total, 0) - COALESCE(paid_amount, 0), 0) ELSE 0 END), 0),
    'due_this_week_count', COALESCE(SUM(CASE WHEN due_date BETWEEN v_today AND v_today + 7 AND status NOT IN ('paid', 'pagata', 'cancelled', 'canceled', 'annullata', 'credited') AND (COALESCE(total, 0) - COALESCE(paid_amount, 0)) > 0 THEN 1 ELSE 0 END), 0),
    'due_this_week_amount', COALESCE(SUM(CASE WHEN due_date BETWEEN v_today AND v_today + 7 AND status NOT IN ('paid', 'pagata', 'cancelled', 'canceled', 'annullata', 'credited') AND (COALESCE(total, 0) - COALESCE(paid_amount, 0)) > 0 THEN GREATEST(COALESCE(total, 0) - COALESCE(paid_amount, 0), 0) ELSE 0 END), 0),
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
$function$;

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
    (i.total - i.paid_amount) AS remaining,
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
    AND i.due_date BETWEEN p_from_date AND p_to_date
  ORDER BY i.due_date ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.silvio_tool_storico_pagamenti(p_company_id uuid, p_user_id uuid, p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        AND status NOT IN ('paid', 'cancelled', 'credited')
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
END $function$;
