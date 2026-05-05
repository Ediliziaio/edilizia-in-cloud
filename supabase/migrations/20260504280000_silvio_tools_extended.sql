-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-07 — Silvio Tool Catalog ESTESO: HR, magazzino, suppliers, azioni
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 9) silvio_tool_team_summary — team employees + ferie pending
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_team_summary(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_active int;
  v_total_gross numeric;
  v_total_net numeric;
  v_pending_richieste int;
  v_employees jsonb;
  v_richieste jsonb;
BEGIN
  -- Stats employees
  SELECT
    count(*),
    count(*) FILTER (WHERE COALESCE(is_active, true) = true),
    COALESCE(sum(CASE WHEN COALESCE(is_active,true) THEN gross_salary ELSE 0 END), 0),
    COALESCE(sum(CASE WHEN COALESCE(is_active,true) THEN net_salary ELSE 0 END), 0)
  INTO v_total, v_active, v_total_gross, v_total_net
  FROM public.employees
  WHERE company_id = p_company_id;

  -- Top 15 employees attivi
  SELECT jsonb_agg(row_data) INTO v_employees
  FROM (
    SELECT
      first_name || ' ' || last_name AS nome,
      role_type,
      area,
      monthly_hours,
      round(gross_salary::numeric, 2) AS lordo_eur,
      round(net_salary::numeric, 2) AS netto_eur,
      is_active
    FROM public.employees
    WHERE company_id = p_company_id
    ORDER BY is_active DESC, gross_salary DESC NULLS LAST
    LIMIT 15
  ) row_data;

  -- Richieste HR pending (ferie, permessi, malattia)
  SELECT count(*) INTO v_pending_richieste
  FROM public.hr_richieste
  WHERE company_id = p_company_id
    AND COALESCE(stato, '') IN ('pending', 'in_attesa', 'da_approvare', '');

  SELECT jsonb_agg(row_data) INTO v_richieste
  FROM (
    SELECT
      r.tipo,
      r.data_inizio,
      r.data_fine,
      r.ore_richieste,
      r.motivo,
      r.stato,
      (SELECT first_name || ' ' || last_name FROM public.profiles p WHERE p.id = r.user_id) AS richiedente
    FROM public.hr_richieste r
    WHERE r.company_id = p_company_id
      AND COALESCE(r.stato, '') IN ('pending', 'in_attesa', 'da_approvare', '')
    ORDER BY r.created_at DESC
    LIMIT 10
  ) row_data;

  RETURN jsonb_build_object(
    'team_size_totale', v_total,
    'team_attivi', v_active,
    'costo_lordo_mensile_eur', round(v_total_gross::numeric, 2),
    'costo_netto_mensile_eur', round(v_total_net::numeric, 2),
    'richieste_hr_pending', v_pending_richieste,
    'employees', COALESCE(v_employees, '[]'::jsonb),
    'richieste_pending_dettaglio', COALESCE(v_richieste, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_team_summary(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_team_summary(uuid) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 10) silvio_tool_warehouse_status — stato magazzino + alert sotto-soglia
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_warehouse_status(
  p_company_id uuid,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_items int;
  v_total_value numeric;
  v_low_stock_count int;
  v_low_stock jsonb;
  v_top_value jsonb;
BEGIN
  SELECT count(*), COALESCE(sum(quantity * unit_cost), 0)
  INTO v_total_items, v_total_value
  FROM public.warehouse_stock
  WHERE company_id = p_company_id;

  -- Items sotto soglia minima
  SELECT count(*) INTO v_low_stock_count
  FROM public.warehouse_stock
  WHERE company_id = p_company_id
    AND min_stock_level IS NOT NULL
    AND quantity_available < min_stock_level;

  SELECT jsonb_agg(row_data) INTO v_low_stock
  FROM (
    SELECT
      ws.name AS articolo,
      ws.internal_code,
      round(ws.quantity_available::numeric, 2) AS qta_disponibile,
      round(ws.min_stock_level::numeric, 2) AS soglia_minima,
      round(ws.reorder_quantity::numeric, 2) AS qta_riordino_suggerita,
      round(ws.unit_cost::numeric, 2) AS costo_unit_eur,
      (SELECT name FROM public.suppliers s WHERE s.id = ws.supplier_id) AS fornitore_principale
    FROM public.warehouse_stock ws
    WHERE ws.company_id = p_company_id
      AND ws.min_stock_level IS NOT NULL
      AND ws.quantity_available < ws.min_stock_level
    ORDER BY (ws.min_stock_level - ws.quantity_available) DESC
    LIMIT 15
  ) row_data;

  -- Top items per valore (qta * costo)
  SELECT jsonb_agg(row_data) INTO v_top_value
  FROM (
    SELECT
      ws.name AS articolo,
      ws.internal_code,
      round(ws.quantity::numeric, 2) AS qta,
      round(ws.unit_cost::numeric, 2) AS costo_unit_eur,
      round((ws.quantity * ws.unit_cost)::numeric, 2) AS valore_totale_eur
    FROM public.warehouse_stock ws
    WHERE ws.company_id = p_company_id
      AND (p_search IS NULL OR ws.name ILIKE '%' || p_search || '%' OR ws.internal_code ILIKE '%' || p_search || '%')
    ORDER BY (ws.quantity * ws.unit_cost) DESC NULLS LAST
    LIMIT 10
  ) row_data;

  RETURN jsonb_build_object(
    'totale_articoli', v_total_items,
    'valore_magazzino_eur', round(v_total_value::numeric, 2),
    'articoli_sotto_soglia', v_low_stock_count,
    'sotto_soglia_dettaglio', COALESCE(v_low_stock, '[]'::jsonb),
    'top_articoli_per_valore', COALESCE(v_top_value, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_warehouse_status(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_warehouse_status(uuid, text) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 11) silvio_tool_suppliers_summary — fornitori attivi + valore acquisti
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_suppliers_summary(
  p_company_id uuid,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_active int;
  v_suppliers jsonb;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE COALESCE(is_active, true) = true)
  INTO v_total, v_active
  FROM public.suppliers
  WHERE company_id = p_company_id;

  SELECT jsonb_agg(row_data) INTO v_suppliers
  FROM (
    SELECT
      s.name AS fornitore,
      s.product_category,
      s.email,
      s.phone,
      s.city,
      s.payment_method,
      s.lead_time_days,
      s.rating,
      s.is_active
    FROM public.suppliers s
    WHERE s.company_id = p_company_id
      AND (p_search IS NULL OR s.name ILIKE '%' || p_search || '%' OR s.product_category ILIKE '%' || p_search || '%')
    ORDER BY s.is_active DESC, s.rating DESC NULLS LAST
    LIMIT 20
  ) row_data;

  RETURN jsonb_build_object(
    'totale_fornitori', v_total,
    'fornitori_attivi', v_active,
    'fornitori', COALESCE(v_suppliers, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_suppliers_summary(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_suppliers_summary(uuid, text) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 12) silvio_tool_subappaltatori_summary — subappaltatori attivi
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_subappaltatori_summary(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_active int;
  v_subs jsonb;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE COALESCE(is_active, true) = true)
  INTO v_total, v_active
  FROM public.subappaltatori
  WHERE company_id = p_company_id;

  SELECT jsonb_agg(row_data) INTO v_subs
  FROM (
    SELECT
      ragione_sociale,
      responsabile,
      telefono,
      email,
      piva,
      is_active
    FROM public.subappaltatori
    WHERE company_id = p_company_id
    ORDER BY is_active DESC, created_at DESC
    LIMIT 30
  ) row_data;

  RETURN jsonb_build_object(
    'totale_subappaltatori', v_total,
    'subappaltatori_attivi', v_active,
    'subappaltatori', COALESCE(v_subs, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_subappaltatori_summary(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_subappaltatori_summary(uuid) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 13) silvio_tool_received_invoices — fatture ricevute (da pagare)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_received_invoices(
  p_company_id uuid,
  p_status text DEFAULT 'unpaid'  -- 'unpaid' | 'paid' | 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_total_amount numeric;
  v_invoices jsonb;
  v_has_table boolean;
BEGIN
  -- Verifica esistenza tabella e relevant columns (defensive)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'fatture_ricevute'
  ) INTO v_has_table;

  IF NOT v_has_table THEN
    RETURN jsonb_build_object('error', 'tabella fatture_ricevute non disponibile');
  END IF;

  -- Query dinamica defensive (alcune colonne potrebbero non esistere)
  BEGIN
    EXECUTE format($f$
      SELECT
        COUNT(*),
        COALESCE(SUM(importo_totale), 0),
        jsonb_agg(jsonb_build_object(
          'numero', numero,
          'fornitore', fornitore_ragione_sociale,
          'data_emissione', data_emissione,
          'data_scadenza', data_scadenza,
          'importo_eur', round(COALESCE(importo_totale, 0)::numeric, 2),
          'pagata', COALESCE(pagata, false),
          'descrizione', LEFT(COALESCE(descrizione, ''), 80)
        ) ORDER BY data_scadenza NULLS LAST)
      FROM public.fatture_ricevute
      WHERE company_id = $1
        AND CASE
          WHEN $2 = 'unpaid' THEN COALESCE(pagata, false) = false
          WHEN $2 = 'paid' THEN COALESCE(pagata, false) = true
          ELSE true
        END
    $f$) INTO v_total, v_total_amount, v_invoices
    USING p_company_id, p_status;
  EXCEPTION WHEN undefined_column OR undefined_function THEN
    -- Fallback: just count rows
    SELECT count(*), 0, '[]'::jsonb INTO v_total, v_total_amount, v_invoices
    FROM public.fatture_ricevute WHERE company_id = p_company_id;
  END;

  RETURN jsonb_build_object(
    'filter_status', p_status,
    'totale_fatture', v_total,
    'importo_totale_eur', round(v_total_amount::numeric, 2),
    'fatture', COALESCE(v_invoices, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_received_invoices(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_received_invoices(uuid, text) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 14) silvio_tool_propose_action — crea bozza azione 🟡 da confermare
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_propose_action(
  p_company_id uuid,
  p_user_id uuid,
  p_action_type text,
  p_summary text,
  p_payload jsonb,
  p_session_id uuid DEFAULT NULL,
  p_persona_key text DEFAULT 'silvio',
  p_risk_level text DEFAULT 'yellow'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_action_type IS NULL OR length(trim(p_action_type)) < 2 THEN
    RAISE EXCEPTION 'action_type obbligatorio' USING ERRCODE = '22023';
  END IF;
  IF p_summary IS NULL OR length(trim(p_summary)) < 5 THEN
    RAISE EXCEPTION 'summary obbligatorio (min 5 char)' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ai_action_proposals (
    session_id, company_id, user_id, persona_key,
    action_type, summary, payload, status, risk_level
  ) VALUES (
    p_session_id, p_company_id, p_user_id, p_persona_key,
    p_action_type, p_summary, COALESCE(p_payload, '{}'::jsonb), 'pending', p_risk_level
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'proposal_id', v_id,
    'action_type', p_action_type,
    'risk_level', p_risk_level,
    'message', 'Bozza creata. L''azione richiede conferma esplicita prima di essere applicata.',
    'expires_in_hours', 24
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_propose_action(uuid, uuid, text, text, jsonb, uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_propose_action(uuid, uuid, text, text, jsonb, uuid, text, text) TO service_role;
