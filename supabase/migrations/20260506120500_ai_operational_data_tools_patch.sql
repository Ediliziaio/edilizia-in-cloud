-- ============================================================================
-- AI operational data tools patch
-- ============================================================================
-- Fixes concrete data gaps surfaced by Silvio chat:
--   1. Orders tools only used denormalized client_name/client_company and missed
--      the canonical orders.customer_id -> profiles link.
--   2. search_orders did not return order_id, making invoice draft creation
--      impossible to drive safely from chat.
--   3. lista_scadenze referenced a non-existing invoices.amount_total column.
--   4. create_invoice_draft inserted Italian installment types that violate the
--      order_installments type check and could duplicate unpaid drafts.
--   5. Missing read-only tools for "pose/lavori prossima settimana" and
--      "fatture/rate restanti" with real customer names.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.silvio_ai_customer_display_name(
  p_client_name text,
  p_client_company text,
  p_first_name text,
  p_last_name text,
  p_email text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(btrim(p_client_name), ''),
    NULLIF(btrim(p_client_company), ''),
    NULLIF(btrim(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, '')), ''),
    NULLIF(btrim(p_email), ''),
    'Cliente senza nome'
  );
$$;

REVOKE ALL ON FUNCTION public.silvio_ai_customer_display_name(text, text, text, text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_ai_customer_display_name(text, text, text, text, text)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Commesse summary: cliente robusto + order_id/codici utili per azioni
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_orders_summary(
  p_company_id uuid,
  p_status text DEFAULT 'active',
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
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 20), 50));
BEGIN
  SELECT
    count(*),
    COALESCE(sum(COALESCE(o.total_amount, 0)), 0),
    COALESCE(sum(GREATEST(COALESCE(o.balance_amount, 0), 0)), 0)
  INTO v_count, v_total_amount, v_balance_amount
  FROM public.orders o
  WHERE o.company_id = p_company_id
    AND CASE
      WHEN p_status = 'active' THEN COALESCE(o.balance_paid, false) = false
      WHEN p_status = 'closed' THEN COALESCE(o.balance_paid, false) = true
      ELSE true
    END;

  SELECT jsonb_agg(row_data ORDER BY row_data->>'created_at' DESC)
  INTO v_orders
  FROM (
    SELECT jsonb_build_object(
      'order_id', o.id,
      'order_code', o.order_code,
      'customer_id', o.customer_id,
      'cliente', public.silvio_ai_customer_display_name(o.client_name, o.client_company, p.first_name, p.last_name, p.email),
      'customer_email', p.email,
      'descrizione_lavoro', o.description,
      'indirizzo_lavori', o.indirizzo_lavori,
      'stato', os.name,
      'valore_eur', round(COALESCE(o.total_amount, 0)::numeric, 2),
      'da_incassare_eur', round(GREATEST(COALESCE(o.balance_amount, 0), 0)::numeric, 2),
      'percentuale_avanzamento', o.percentuale_avanzamento,
      'work_start_date', o.work_start_date,
      'work_end_date', o.work_end_date,
      'expected_date', o.expected_date,
      'warehouse_arrival_date', o.warehouse_arrival_date,
      'balance_paid', o.balance_paid,
      'created_at', o.created_at
    ) AS row_data
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    LEFT JOIN public.order_statuses os ON os.id = o.current_status_id
    WHERE o.company_id = p_company_id
      AND CASE
        WHEN p_status = 'active' THEN COALESCE(o.balance_paid, false) = false
        WHEN p_status = 'closed' THEN COALESCE(o.balance_paid, false) = true
        ELSE true
      END
    ORDER BY o.created_at DESC
    LIMIT v_limit
  ) s;

  RETURN jsonb_build_object(
    'totale_commesse', COALESCE(v_count, 0),
    'valore_totale_eur', COALESCE(v_total_amount, 0),
    'da_incassare_totale_eur', COALESCE(v_balance_amount, 0),
    'filter_status', p_status,
    'nota_dati', 'cliente risolto da orders.client_name/client_company oppure orders.customer_id -> profiles',
    'commesse', COALESCE(v_orders, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_orders_summary(uuid, text, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_orders_summary(uuid, text, int) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Ricerca commesse: cliente robusto + order_id per azioni successive
-- ────────────────────────────────────────────────────────────────────────────

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
  v_query text := btrim(COALESCE(p_query, ''));
BEGIN
  IF length(v_query) < 2 THEN
    RETURN jsonb_build_object('error', 'query troppo corta (min 2 caratteri)');
  END IF;

  SELECT jsonb_agg(row_data ORDER BY row_data->>'created_at' DESC)
  INTO v_results
  FROM (
    SELECT jsonb_build_object(
      'order_id', o.id,
      'order_code', o.order_code,
      'customer_id', o.customer_id,
      'cliente', public.silvio_ai_customer_display_name(o.client_name, o.client_company, p.first_name, p.last_name, p.email),
      'customer_email', p.email,
      'descrizione_lavoro', o.description,
      'indirizzo_lavori', o.indirizzo_lavori,
      'stato', os.name,
      'valore_eur', round(COALESCE(o.total_amount, 0)::numeric, 2),
      'da_incassare_eur', round(GREATEST(COALESCE(o.balance_amount, 0), 0)::numeric, 2),
      'percentuale_avanzamento', o.percentuale_avanzamento,
      'expected_date', o.expected_date,
      'work_start_date', o.work_start_date,
      'work_end_date', o.work_end_date,
      'warehouse_arrival_date', o.warehouse_arrival_date,
      'created_at', o.created_at
    ) AS row_data
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    LEFT JOIN public.order_statuses os ON os.id = o.current_status_id
    WHERE o.company_id = p_company_id
      AND (
        o.order_code ILIKE '%' || v_query || '%' OR
        o.client_name ILIKE '%' || v_query || '%' OR
        o.client_company ILIKE '%' || v_query || '%' OR
        o.description ILIKE '%' || v_query || '%' OR
        o.indirizzo_lavori ILIKE '%' || v_query || '%' OR
        p.first_name ILIKE '%' || v_query || '%' OR
        p.last_name ILIKE '%' || v_query || '%' OR
        p.email ILIKE '%' || v_query || '%'
      )
    ORDER BY o.created_at DESC
    LIMIT 15
  ) s;

  RETURN jsonb_build_object(
    'query', v_query,
    'totale_match', COALESCE(jsonb_array_length(v_results), 0),
    'nota_dati', 'i risultati includono order_id: usalo per azioni successive come create_invoice_draft',
    'risultati', COALESCE(v_results, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_search_orders(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_search_orders(uuid, text) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Scadenze fatture: usa lo schema reale invoices.total/paid_amount
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_scadenze(
  p_company_id uuid,
  p_user_id uuid,
  p_days_ahead int DEFAULT 30,
  p_only_unpaid boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_today date := CURRENT_DATE;
  v_limit_date date := CURRENT_DATE + GREATEST(1, LEAST(COALESCE(p_days_ahead, 30), 365));
BEGIN
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'total_amount_eur', COALESCE(SUM(total), 0),
    'remaining_amount_eur', COALESCE(SUM(residuo), 0),
    'overdue_count', COUNT(*) FILTER (WHERE due_date < v_today),
    'invoices', COALESCE(jsonb_agg(
      jsonb_build_object(
        'invoice_id', id,
        'invoice_number', invoice_number,
        'cliente', cliente,
        'client_id', client_id,
        'amount_total_eur', round(COALESCE(total, 0)::numeric, 2),
        'paid_amount_eur', round(COALESCE(paid_amount, 0)::numeric, 2),
        'remaining_amount_eur', round(GREATEST(COALESCE(residuo, 0), 0)::numeric, 2),
        'due_date', due_date,
        'status', status,
        'days_to_due', due_date - v_today
      ) ORDER BY due_date ASC
    ) FILTER (WHERE id IS NOT NULL), '[]'::jsonb)
  )
  INTO v_result
  FROM (
    SELECT
      i.id,
      i.invoice_number,
      i.client_id,
      COALESCE(
        NULLIF(btrim(i.client_company_name), ''),
        NULLIF(btrim(mc.company_name), ''),
        NULLIF(btrim(COALESCE(mc.first_name, '') || ' ' || COALESCE(mc.last_name, '')), ''),
        NULLIF(btrim(i.client_email), ''),
        'Cliente senza nome'
      ) AS cliente,
      i.total,
      i.paid_amount,
      GREATEST(COALESCE(i.total, 0) - COALESCE(i.paid_amount, 0), 0) AS residuo,
      i.due_date,
      i.status
    FROM public.invoices i
    LEFT JOIN public.marketing_contacts mc ON mc.id = i.client_id
    WHERE i.company_id = p_company_id
      AND i.due_date IS NOT NULL
      AND i.due_date <= v_limit_date
      AND (
        NOT p_only_unpaid OR
        COALESCE(i.total, 0) - COALESCE(i.paid_amount, 0) > 0 OR
        i.status IN ('unpaid', 'overdue', 'sent', 'draft', 'da_pagare', 'parziale')
      )
    ORDER BY i.due_date ASC
    LIMIT 100
  ) sub;

  RETURN COALESCE(
    v_result,
    jsonb_build_object('count', 0, 'remaining_amount_eur', 0, 'invoices', '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_scadenze(uuid, uuid, int, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_scadenze(uuid, uuid, int, boolean) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Calendario operativo AI: lavori, pose, appuntamenti, arrivi merce
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lavori_pose_periodo(
  p_company_id uuid,
  p_user_id uuid,
  p_start_date date DEFAULT NULL,
  p_days int DEFAULT 7,
  p_include_materials boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date := COALESCE(p_start_date, CURRENT_DATE);
  v_days int := GREATEST(1, LEAST(COALESCE(p_days, 7), 60));
  v_end date;
  v_events jsonb;
  v_total int;
  v_lavori int;
  v_pose int;
  v_appuntamenti int;
  v_merci int;
BEGIN
  v_end := v_start + (v_days - 1);

  WITH events AS (
    SELECT
      'lavoro'::text AS event_type,
      GREATEST(o.work_start_date, v_start)::date AS event_date,
      10 AS priority,
      o.id AS order_id,
      o.order_code,
      o.customer_id,
      public.silvio_ai_customer_display_name(o.client_name, o.client_company, p.first_name, p.last_name, p.email) AS cliente,
      'Lavoro in corso'::text AS title,
      o.description AS description,
      o.indirizzo_lavori AS address,
      COALESCE(o.work_start_date, v_start) AS start_date,
      COALESCE(o.work_end_date, o.work_start_date, v_start) AS end_date,
      jsonb_build_object(
        'stato', os.name,
        'operai', COALESCE(op.operai, '[]'::jsonb),
        'subappaltatori', COALESCE(ext.squadre, '[]'::jsonb),
        'valore_eur', round(COALESCE(o.total_amount, 0)::numeric, 2),
        'avanzamento_pct', o.percentuale_avanzamento
      ) AS details
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    LEFT JOIN public.order_statuses os ON os.id = o.current_status_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object('id', e.id, 'nome', btrim(e.first_name || ' ' || e.last_name))
        ORDER BY e.last_name, e.first_name
      ) AS operai
      FROM public.order_employees oe
      JOIN public.employees e ON e.id = oe.employee_id
      WHERE oe.order_id = o.id
    ) op ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object('id', et.id, 'nome', et.name, 'contatto', et.contact_name)
        ORDER BY et.name
      ) AS squadre
      FROM public.order_external_teams oet
      JOIN public.external_teams et ON et.id = oet.external_team_id
      WHERE oet.order_id = o.id
    ) ext ON true
    WHERE o.company_id = p_company_id
      AND o.work_start_date IS NOT NULL
      AND o.work_start_date <= v_end
      AND COALESCE(o.work_end_date, o.work_start_date) >= v_start

    UNION ALL

    SELECT
      'posa'::text AS event_type,
      o.expected_date AS event_date,
      20 AS priority,
      o.id AS order_id,
      o.order_code,
      o.customer_id,
      public.silvio_ai_customer_display_name(o.client_name, o.client_company, p.first_name, p.last_name, p.email) AS cliente,
      'Posa prevista'::text AS title,
      o.description AS description,
      o.indirizzo_lavori AS address,
      o.expected_date AS start_date,
      o.expected_date AS end_date,
      jsonb_build_object(
        'stato', os.name,
        'operai', COALESCE(op.operai, '[]'::jsonb),
        'subappaltatori', COALESCE(ext.squadre, '[]'::jsonb),
        'valore_eur', round(COALESCE(o.total_amount, 0)::numeric, 2)
      ) AS details
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    LEFT JOIN public.order_statuses os ON os.id = o.current_status_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object('id', e.id, 'nome', btrim(e.first_name || ' ' || e.last_name))
        ORDER BY e.last_name, e.first_name
      ) AS operai
      FROM public.order_employees oe
      JOIN public.employees e ON e.id = oe.employee_id
      WHERE oe.order_id = o.id
    ) op ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object('id', et.id, 'nome', et.name, 'contatto', et.contact_name)
        ORDER BY et.name
      ) AS squadre
      FROM public.order_external_teams oet
      JOIN public.external_teams et ON et.id = oet.external_team_id
      WHERE oet.order_id = o.id
    ) ext ON true
    WHERE o.company_id = p_company_id
      AND o.expected_date BETWEEN v_start AND v_end

    UNION ALL

    SELECT
      'merce'::text AS event_type,
      po.expected_delivery_date AS event_date,
      30 AS priority,
      o.id AS order_id,
      COALESCE(o.order_code, po.oda_number) AS order_code,
      o.customer_id,
      public.silvio_ai_customer_display_name(o.client_name, o.client_company, p.first_name, p.last_name, p.email) AS cliente,
      'Arrivo merce'::text AS title,
      po.notes AS description,
      o.indirizzo_lavori AS address,
      po.expected_delivery_date AS start_date,
      po.expected_delivery_date AS end_date,
      jsonb_build_object(
        'oda_id', po.id,
        'oda_number', po.oda_number,
        'supplier', s.name,
        'status', po.status,
        'total_eur', round(COALESCE(po.total, 0)::numeric, 2),
        'items', COALESCE(items.items, '[]'::jsonb)
      ) AS details
    FROM public.purchase_orders po
    JOIN public.suppliers s ON s.id = po.supplier_id
    LEFT JOIN public.orders o ON o.id = po.order_id
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'descrizione', poi.description,
          'quantita', poi.quantity,
          'um', poi.unit_of_measure,
          'quantita_ricevuta', poi.quantity_received,
          'note', poi.notes
        )
        ORDER BY poi.sort_order, poi.description
      ) AS items
      FROM public.purchase_order_items poi
      WHERE poi.purchase_order_id = po.id
    ) items ON true
    WHERE p_include_materials
      AND po.company_id = p_company_id
      AND po.expected_delivery_date BETWEEN v_start AND v_end

    UNION ALL

    SELECT
      'appuntamento'::text AS event_type,
      a.appointment_date AS event_date,
      40 AS priority,
      o.id AS order_id,
      o.order_code,
      o.customer_id,
      public.silvio_ai_customer_display_name(o.client_name, o.client_company, p.first_name, p.last_name, p.email) AS cliente,
      COALESCE(a.title, 'Appuntamento') AS title,
      a.description,
      o.indirizzo_lavori AS address,
      a.appointment_date AS start_date,
      a.appointment_date AS end_date,
      jsonb_build_object(
        'appointment_id', a.id,
        'appointment_time', a.appointment_time,
        'appointment_type', a.appointment_type,
        'is_completed', a.is_completed
      ) AS details
    FROM public.appointments a
    LEFT JOIN public.orders o ON o.id = a.order_id
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE a.company_id = p_company_id
      AND a.appointment_date BETWEEN v_start AND v_end
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.event_date, e.priority, e.title), '[]'::jsonb)
  INTO v_events
  FROM events e;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE elem->>'event_type' = 'lavoro'),
    COUNT(*) FILTER (WHERE elem->>'event_type' = 'posa'),
    COUNT(*) FILTER (WHERE elem->>'event_type' = 'appuntamento'),
    COUNT(*) FILTER (WHERE elem->>'event_type' = 'merce')
  INTO v_total, v_lavori, v_pose, v_appuntamenti, v_merci
  FROM jsonb_array_elements(v_events) elem;

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('dal', v_start, 'al', v_end, 'giorni', v_days),
    'count', COALESCE(v_total, 0),
    'lavori_count', COALESCE(v_lavori, 0),
    'pose_count', COALESCE(v_pose, 0),
    'appuntamenti_count', COALESCE(v_appuntamenti, 0),
    'merci_count', COALESCE(v_merci, 0),
    'eventi', COALESCE(v_events, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_lavori_pose_periodo(uuid, uuid, date, int, boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lavori_pose_periodo(uuid, uuid, date, int, boolean)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) Fatture/rate restanti: legge rate esistenti e campi legacy ordine
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_fatture_restanti(
  p_company_id uuid,
  p_user_id uuid,
  p_only_unpaid boolean DEFAULT true,
  p_limit int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
  v_rows jsonb;
  v_count int;
  v_total numeric;
BEGIN
  WITH existing_installments AS (
    SELECT
      oi.id AS installment_id,
      o.id AS order_id,
      o.order_code,
      o.customer_id,
      public.silvio_ai_customer_display_name(o.client_name, o.client_company, p.first_name, p.last_name, p.email) AS cliente,
      oi.label,
      oi.type,
      CASE
        WHEN oi.type = 'deposit' AND lower(oi.label) LIKE '%2%' THEN 'acconto_2'
        WHEN oi.type = 'deposit' THEN 'acconto'
        WHEN oi.type = 'balance' THEN 'saldo'
        WHEN oi.type = 'financing' THEN 'finanziamento'
        ELSE oi.type
      END AS rata_type_for_create_invoice_draft,
      oi.amount,
      oi.expected_date,
      oi.is_paid,
      'installment_esistente'::text AS source,
      false AS can_create_invoice_draft
    FROM public.order_installments oi
    JOIN public.orders o ON o.id = oi.order_id
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    WHERE o.company_id = p_company_id
      AND (NOT p_only_unpaid OR COALESCE(oi.is_paid, false) = false)
      AND COALESCE(oi.amount, 0) > 0
  ),
  generated_from_orders AS (
    SELECT
      NULL::uuid AS installment_id,
      o.id AS order_id,
      o.order_code,
      o.customer_id,
      public.silvio_ai_customer_display_name(o.client_name, o.client_company, p.first_name, p.last_name, p.email) AS cliente,
      data.label,
      data.db_type AS type,
      data.rata_type_for_create_invoice_draft,
      data.amount,
      data.expected_date,
      false AS is_paid,
      'campo_ordine'::text AS source,
      true AS can_create_invoice_draft
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.customer_id
    CROSS JOIN LATERAL (
      VALUES
        ('Fattura acconto', 'deposit', 'acconto', COALESCE(o.deposit_amount, 0), o.deposit_expected_date, COALESCE(o.deposit_paid, false)),
        ('Fattura acconto 2', 'deposit', 'acconto_2', COALESCE(o.deposit_2_amount, 0), o.deposit_2_expected_date, COALESCE(o.deposit_2_paid, false)),
        ('Fattura saldo', 'balance', 'saldo', COALESCE(o.balance_amount, 0), o.balance_expected_date, COALESCE(o.balance_paid, false)),
        ('Fattura finanziamento', 'financing', 'finanziamento', COALESCE(o.financing_amount, 0), o.financing_expected_date, COALESCE(o.financing_paid, false))
    ) AS data(label, db_type, rata_type_for_create_invoice_draft, amount, expected_date, already_paid)
    WHERE o.company_id = p_company_id
      AND COALESCE(data.amount, 0) > 0
      AND (NOT p_only_unpaid OR data.already_paid = false)
      AND NOT EXISTS (
        SELECT 1
        FROM public.order_installments oi
        WHERE oi.order_id = o.id
          AND oi.type = data.db_type
          AND lower(oi.label) = lower(data.label)
      )
  ),
  all_rows AS (
    SELECT * FROM existing_installments
    UNION ALL
    SELECT * FROM generated_from_orders
  ),
  limited AS (
    SELECT *
    FROM all_rows
    ORDER BY expected_date NULLS LAST, order_code, label
    LIMIT v_limit
  )
  SELECT
    COUNT(*),
    COALESCE(SUM(amount), 0),
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'installment_id', installment_id,
        'order_id', order_id,
        'order_code', order_code,
        'customer_id', customer_id,
        'cliente', cliente,
        'label', label,
        'type', type,
        'rata_type_for_create_invoice_draft', rata_type_for_create_invoice_draft,
        'amount_eur', round(COALESCE(amount, 0)::numeric, 2),
        'expected_date', expected_date,
        'is_paid', is_paid,
        'source', source,
        'can_create_invoice_draft', can_create_invoice_draft
      )
    ), '[]'::jsonb)
  INTO v_count, v_total, v_rows
  FROM limited;

  RETURN jsonb_build_object(
    'count', COALESCE(v_count, 0),
    'total_amount_eur', round(COALESCE(v_total, 0)::numeric, 2),
    'nota_operativa', 'can_create_invoice_draft=true indica una rata non ancora presente in order_installments: usa create_invoice_draft solo su quelle e dopo conferma utente.',
    'fatture_restanti', COALESCE(v_rows, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_fatture_restanti(uuid, uuid, boolean, int)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_fatture_restanti(uuid, uuid, boolean, int)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 6) Invoice draft: mapping type sicuro, cliente robusto, deduplica
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_create_invoice_draft(
  p_company_id uuid,
  p_user_id uuid,
  p_order_id uuid,
  p_rata_type text,
  p_amount numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_requested_type text := lower(btrim(COALESCE(p_rata_type, '')));
  v_db_type text;
  v_label text;
  v_amount numeric;
  v_expected_date date;
  v_already_paid boolean;
  v_installment_id uuid;
BEGIN
  SELECT
    o.id,
    o.company_id,
    o.order_code,
    o.customer_id,
    public.silvio_ai_customer_display_name(o.client_name, o.client_company, p.first_name, p.last_name, p.email) AS cliente,
    o.total_amount,
    o.deposit_amount,
    o.balance_amount,
    o.deposit_2_amount,
    o.financing_amount,
    o.deposit_paid,
    o.deposit_2_paid,
    o.balance_paid,
    o.financing_paid,
    o.deposit_expected_date,
    o.deposit_2_expected_date,
    o.balance_expected_date,
    o.financing_expected_date
  INTO v_order
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.customer_id
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordine non trovato' USING ERRCODE = '22023';
  END IF;

  IF v_order.company_id <> p_company_id THEN
    RAISE EXCEPTION 'Ordine non autorizzato' USING ERRCODE = '42501';
  END IF;

  v_db_type := CASE v_requested_type
    WHEN 'acconto' THEN 'deposit'
    WHEN 'deposit' THEN 'deposit'
    WHEN 'acconto_2' THEN 'deposit'
    WHEN 'saldo' THEN 'balance'
    WHEN 'balance' THEN 'balance'
    WHEN 'finanziamento' THEN 'financing'
    WHEN 'financing' THEN 'financing'
    ELSE NULL
  END;

  IF v_db_type IS NULL THEN
    RAISE EXCEPTION 'rata_type non valido: %', p_rata_type USING ERRCODE = '22023';
  END IF;

  v_label := CASE v_requested_type
    WHEN 'acconto' THEN 'Fattura acconto'
    WHEN 'deposit' THEN 'Fattura acconto'
    WHEN 'acconto_2' THEN 'Fattura acconto 2'
    WHEN 'saldo' THEN 'Fattura saldo'
    WHEN 'balance' THEN 'Fattura saldo'
    WHEN 'finanziamento' THEN 'Fattura finanziamento'
    WHEN 'financing' THEN 'Fattura finanziamento'
    ELSE 'Fattura ' || p_rata_type
  END;

  v_amount := COALESCE(p_amount, CASE v_requested_type
    WHEN 'acconto' THEN v_order.deposit_amount
    WHEN 'deposit' THEN v_order.deposit_amount
    WHEN 'acconto_2' THEN v_order.deposit_2_amount
    WHEN 'saldo' THEN v_order.balance_amount
    WHEN 'balance' THEN v_order.balance_amount
    WHEN 'finanziamento' THEN v_order.financing_amount
    WHEN 'financing' THEN v_order.financing_amount
    ELSE NULL
  END);

  v_expected_date := COALESCE(CASE v_requested_type
    WHEN 'acconto' THEN v_order.deposit_expected_date
    WHEN 'deposit' THEN v_order.deposit_expected_date
    WHEN 'acconto_2' THEN v_order.deposit_2_expected_date
    WHEN 'saldo' THEN v_order.balance_expected_date
    WHEN 'balance' THEN v_order.balance_expected_date
    WHEN 'finanziamento' THEN v_order.financing_expected_date
    WHEN 'financing' THEN v_order.financing_expected_date
    ELSE NULL
  END, CURRENT_DATE);

  v_already_paid := COALESCE(CASE v_requested_type
    WHEN 'acconto' THEN v_order.deposit_paid
    WHEN 'deposit' THEN v_order.deposit_paid
    WHEN 'acconto_2' THEN v_order.deposit_2_paid
    WHEN 'saldo' THEN v_order.balance_paid
    WHEN 'balance' THEN v_order.balance_paid
    WHEN 'finanziamento' THEN v_order.financing_paid
    WHEN 'financing' THEN v_order.financing_paid
    ELSE false
  END, false);

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Importo non determinabile per rata_type=%', p_rata_type USING ERRCODE = '22023';
  END IF;

  IF v_already_paid THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'rata_gia_pagata',
      'order_id', v_order.id,
      'order_code', v_order.order_code,
      'cliente', v_order.cliente,
      'rata_type', p_rata_type,
      'message', format('La rata %s su %s risulta gia pagata: non creo duplicati.', v_label, v_order.order_code)
    );
  END IF;

  SELECT oi.id
  INTO v_installment_id
  FROM public.order_installments oi
  WHERE oi.order_id = p_order_id
    AND oi.type = v_db_type
    AND lower(oi.label) = lower(v_label)
    AND COALESCE(oi.is_paid, false) = false
  ORDER BY oi.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'deduplicated', true,
      'installment_id', v_installment_id,
      'order_id', v_order.id,
      'order_code', v_order.order_code,
      'cliente', v_order.cliente,
      'rata_type', p_rata_type,
      'amount_eur', round(v_amount::numeric, 2),
      'message', format('La riga %s era gia presente su %s: ho evitato un doppione.', v_label, v_order.order_code)
    );
  END IF;

  INSERT INTO public.order_installments (
    order_id, label, type, amount, expected_date, position
  ) VALUES (
    p_order_id,
    v_label,
    v_db_type,
    v_amount,
    v_expected_date,
    COALESCE((SELECT MAX(position) + 1 FROM public.order_installments WHERE order_id = p_order_id), 1)
  )
  RETURNING id INTO v_installment_id;

  RETURN jsonb_build_object(
    'success', true,
    'installment_id', v_installment_id,
    'order_id', v_order.id,
    'order_code', v_order.order_code,
    'cliente', v_order.cliente,
    'rata_type', p_rata_type,
    'db_type', v_db_type,
    'amount_eur', round(v_amount::numeric, 2),
    'expected_date', v_expected_date,
    'message', format('Riga fattura %s da € %s creata su ordine %s per %s. Apri commessa per emetterla via SDI.',
                      v_label, to_char(v_amount, 'FM999G999D90'), v_order.order_code, v_order.cliente)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_create_invoice_draft(uuid, uuid, uuid, text, numeric, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_create_invoice_draft(uuid, uuid, uuid, text, numeric, text)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 7) Align persona allow-lists where the DB config is used by future routers
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tools jsonb := '["lista_lavori_pose_periodo", "lista_fatture_restanti"]'::jsonb;
BEGIN
  UPDATE public.ai_personas
  SET allowed_tools = (
    SELECT jsonb_agg(DISTINCT tool_name ORDER BY tool_name)
    FROM jsonb_array_elements_text(COALESCE(allowed_tools, '[]'::jsonb) || v_tools) AS tool_name
  )
  WHERE persona_key IN (
    'silvio',
    'pm_cantiere',
    'capocantiere',
    'assistente_imprenditore',
    'amministrazione',
    'cfo',
    'controller',
    'tecnico',
    'acquisti'
  );
END $$;

COMMENT ON FUNCTION public.silvio_tool_lavori_pose_periodo IS
  'TOOL Silvio: calendario operativo reale per lavori, pose, appuntamenti e merci in arrivo in un periodo.';

COMMENT ON FUNCTION public.silvio_tool_fatture_restanti IS
  'TOOL Silvio: lista rate/fatture restanti con cliente risolto e order_id azionabile.';
