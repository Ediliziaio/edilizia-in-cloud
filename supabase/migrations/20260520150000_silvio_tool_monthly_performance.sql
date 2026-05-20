-- ============================================================================
-- silvio_tool_monthly_performance
-- ----------------------------------------------------------------------------
-- Tool RPC per Silvio AI: ritorna performance aziendale di UN MESE SPECIFICO
-- (anno + mese). Colma una gap critica del catalogo tool: prima Silvio non
-- aveva modo di rispondere a "com'è andato il mese scorso?" (vedi audit AI
-- 2026-05-20). I tool finance esistenti coprivano solo YTD (get_company_kpi)
-- o forward-looking (get_revenue_forecast, calculate_revenue_needed_next_month).
--
-- Output JSONB:
--   - month_period          stringa "YYYY-MM"
--   - emesso                aggregati documenti_fiscali tipo='fattura'/'fattura_pa'
--     - count, totale_imponibile_eur, totale_iva_eur, totale_documento_eur
--   - incassato             bank_transactions credit nel mese
--     - count, totale_eur
--   - speso                 bank_transactions debit nel mese
--     - count, totale_eur
--   - margine_cash_eur      incassato - speso (cash basis, NON economic)
--   - ordini_creati          count + sum(total_amount) di orders.created_at nel mese
--   - top_clienti_emesso     top 5 anagrafiche per fatturato del mese
--   - confronto_mese_prec   stesso oggetto compatto per mese-1 + delta %
--   - data_quality          array warnings se bank_transactions vuota, ecc.
--
-- Differenze con get_company_kpi:
--   - Periodo arbitrario (year+month) invece di YTD fisso
--   - Aggrega da documenti_fiscali (fatture effettive), non da orders.total_amount
--   - Include cash flow reale (bank_transactions) — get_company_kpi solo saldo
--   - Confronto vs mese precedente built-in
--
-- ============================================================================

CREATE OR REPLACE FUNCTION public.silvio_tool_monthly_performance(
  p_company_id uuid,
  p_year int,
  p_month int
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_end date;
  v_prev_start date;
  v_prev_end date;
  v_warnings text[] := ARRAY[]::text[];

  -- Mese target
  v_emesso_count int;
  v_emesso_imp numeric;
  v_emesso_iva numeric;
  v_emesso_tot numeric;
  v_incasso_count int;
  v_incasso_tot numeric;
  v_spesa_count int;
  v_spesa_tot numeric;
  v_ordini_count int;
  v_ordini_tot numeric;
  v_top_clienti jsonb;

  -- Mese precedente (per confronto)
  v_prev_emesso_tot numeric;
  v_prev_incasso_tot numeric;
  v_prev_spesa_tot numeric;
BEGIN
  -- Validazione parametri
  IF p_year < 2000 OR p_year > 2100 THEN
    RETURN jsonb_build_object('error', 'p_year fuori range');
  END IF;
  IF p_month < 1 OR p_month > 12 THEN
    RETURN jsonb_build_object('error', 'p_month deve essere 1-12');
  END IF;

  v_start := make_date(p_year, p_month, 1);
  v_end := (v_start + interval '1 month')::date;
  v_prev_start := (v_start - interval '1 month')::date;
  v_prev_end := v_start;

  -- ─── 1. Documenti fiscali emessi nel mese ─────────────────────────────
  -- Solo fatture vere (NON preventivi/proforma/ddt). Stati che contano per
  -- il fatturato: emessa, inviata_sdi, consegnata, accettata, pagata,
  -- parzialmente_pagata. Bozze e annullate ESCLUSE.
  SELECT
    COUNT(*),
    COALESCE(SUM(imponibile_totale), 0),
    COALESCE(SUM(iva_totale), 0),
    COALESCE(SUM(totale_documento), 0)
  INTO v_emesso_count, v_emesso_imp, v_emesso_iva, v_emesso_tot
  FROM public.documenti_fiscali
  WHERE company_id = p_company_id
    AND tipo IN ('fattura', 'fattura_pa')
    AND stato NOT IN ('bozza', 'annullata', 'stornata')
    AND data_emissione >= v_start
    AND data_emissione < v_end;

  -- ─── 2. Incassi (bank_transactions credit) ────────────────────────────
  BEGIN
    SELECT
      COUNT(*),
      COALESCE(SUM(amount), 0)
    INTO v_incasso_count, v_incasso_tot
    FROM public.bank_transactions
    WHERE company_id = p_company_id
      AND transaction_type = 'credit'
      AND COALESCE(value_date, booking_date) >= v_start
      AND COALESCE(value_date, booking_date) < v_end;
  EXCEPTION WHEN OTHERS THEN
    v_incasso_count := NULL;
    v_incasso_tot := NULL;
    v_warnings := array_append(v_warnings, 'bank_transactions non leggibile (forse banking non collegato)');
  END;

  -- ─── 3. Spese (bank_transactions debit) ───────────────────────────────
  BEGIN
    SELECT
      COUNT(*),
      COALESCE(SUM(ABS(amount)), 0)
    INTO v_spesa_count, v_spesa_tot
    FROM public.bank_transactions
    WHERE company_id = p_company_id
      AND transaction_type = 'debit'
      AND COALESCE(value_date, booking_date) >= v_start
      AND COALESCE(value_date, booking_date) < v_end;
  EXCEPTION WHEN OTHERS THEN
    v_spesa_count := NULL;
    v_spesa_tot := NULL;
  END;

  -- ─── 4. Ordini creati nel mese (commesse nuove) ───────────────────────
  SELECT
    COUNT(*),
    COALESCE(SUM(total_amount), 0)
  INTO v_ordini_count, v_ordini_tot
  FROM public.orders
  WHERE company_id = p_company_id
    AND created_at >= v_start
    AND created_at < v_end;

  -- ─── 5. Top 5 clienti per fatturato nel mese ──────────────────────────
  -- Estrae il nome cliente dallo snapshot JSONB (cliente_snapshot.ragione_sociale
  -- o cliente_snapshot.nome+cognome) per evitare JOIN su anagrafiche.
  WITH per_cliente AS (
    SELECT
      COALESCE(
        NULLIF(cliente_snapshot->>'ragione_sociale', ''),
        TRIM(CONCAT(cliente_snapshot->>'nome', ' ', cliente_snapshot->>'cognome')),
        'Cliente sconosciuto'
      ) AS cliente_nome,
      SUM(totale_documento) AS totale_eur,
      COUNT(*) AS num_fatture
    FROM public.documenti_fiscali
    WHERE company_id = p_company_id
      AND tipo IN ('fattura', 'fattura_pa')
      AND stato NOT IN ('bozza', 'annullata', 'stornata')
      AND data_emissione >= v_start
      AND data_emissione < v_end
    GROUP BY cliente_nome
    ORDER BY totale_eur DESC
    LIMIT 5
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'cliente', cliente_nome,
    'totale_eur', round(totale_eur::numeric, 2),
    'num_fatture', num_fatture
  )), '[]'::jsonb)
  INTO v_top_clienti
  FROM per_cliente;

  -- ─── 6. Confronto mese precedente (solo aggregati base) ───────────────
  SELECT COALESCE(SUM(totale_documento), 0)
  INTO v_prev_emesso_tot
  FROM public.documenti_fiscali
  WHERE company_id = p_company_id
    AND tipo IN ('fattura', 'fattura_pa')
    AND stato NOT IN ('bozza', 'annullata', 'stornata')
    AND data_emissione >= v_prev_start
    AND data_emissione < v_prev_end;

  BEGIN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_prev_incasso_tot
    FROM public.bank_transactions
    WHERE company_id = p_company_id
      AND transaction_type = 'credit'
      AND COALESCE(value_date, booking_date) >= v_prev_start
      AND COALESCE(value_date, booking_date) < v_prev_end;

    SELECT COALESCE(SUM(ABS(amount)), 0)
    INTO v_prev_spesa_tot
    FROM public.bank_transactions
    WHERE company_id = p_company_id
      AND transaction_type = 'debit'
      AND COALESCE(value_date, booking_date) >= v_prev_start
      AND COALESCE(value_date, booking_date) < v_prev_end;
  EXCEPTION WHEN OTHERS THEN
    v_prev_incasso_tot := NULL;
    v_prev_spesa_tot := NULL;
  END;

  -- ─── 7. Data quality warnings ─────────────────────────────────────────
  IF v_emesso_count = 0 THEN
    v_warnings := array_append(v_warnings,
      format('Nessuna fattura emessa nel mese %s. Verifica che le fatture del periodo siano state registrate.', to_char(v_start, 'MM/YYYY')));
  END IF;
  IF v_incasso_tot IS NOT NULL AND v_incasso_count = 0 THEN
    v_warnings := array_append(v_warnings, 'Nessun incasso bancario registrato nel mese. Possibile mancata sincronizzazione conti.');
  END IF;

  -- ─── 8. Risposta finale ──────────────────────────────────────────────
  RETURN jsonb_build_object(
    'month_period', to_char(v_start, 'YYYY-MM'),
    'mese_label', to_char(v_start, 'TMMonth YYYY'),
    'periodo_inizio', v_start,
    'periodo_fine', (v_end - interval '1 day')::date,
    'emesso', jsonb_build_object(
      'num_fatture', v_emesso_count,
      'imponibile_eur', round(v_emesso_imp::numeric, 2),
      'iva_eur', round(v_emesso_iva::numeric, 2),
      'totale_eur', round(v_emesso_tot::numeric, 2)
    ),
    'incassato', jsonb_build_object(
      'num_movimenti', v_incasso_count,
      'totale_eur', CASE WHEN v_incasso_tot IS NOT NULL THEN round(v_incasso_tot::numeric, 2) ELSE NULL END
    ),
    'speso', jsonb_build_object(
      'num_movimenti', v_spesa_count,
      'totale_eur', CASE WHEN v_spesa_tot IS NOT NULL THEN round(v_spesa_tot::numeric, 2) ELSE NULL END
    ),
    'margine_cash_eur', CASE
      WHEN v_incasso_tot IS NOT NULL AND v_spesa_tot IS NOT NULL
      THEN round((v_incasso_tot - v_spesa_tot)::numeric, 2)
      ELSE NULL
    END,
    'ordini_creati_mese', jsonb_build_object(
      'count', v_ordini_count,
      'totale_eur', round(v_ordini_tot::numeric, 2)
    ),
    'top_clienti_emesso', v_top_clienti,
    'confronto_mese_precedente', jsonb_build_object(
      'periodo', to_char(v_prev_start, 'YYYY-MM'),
      'emesso_eur', round(v_prev_emesso_tot::numeric, 2),
      'incassato_eur', CASE WHEN v_prev_incasso_tot IS NOT NULL THEN round(v_prev_incasso_tot::numeric, 2) ELSE NULL END,
      'speso_eur', CASE WHEN v_prev_spesa_tot IS NOT NULL THEN round(v_prev_spesa_tot::numeric, 2) ELSE NULL END,
      'delta_emesso_pct', CASE
        WHEN v_prev_emesso_tot > 0 THEN round((((v_emesso_tot - v_prev_emesso_tot) / v_prev_emesso_tot) * 100)::numeric, 1)
        ELSE NULL
      END
    ),
    'data_quality', jsonb_build_object(
      'warnings', to_jsonb(v_warnings)
    ),
    'aggiornato_al', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.silvio_tool_monthly_performance(uuid, int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_monthly_performance(uuid, int, int) TO service_role;

COMMENT ON FUNCTION public.silvio_tool_monthly_performance IS
'Silvio AI tool: performance aziendale di UN MESE SPECIFICO. Colma gap audit 2026-05-20: prima Silvio rispondeva "dati non disponibili" a "com''è andato il mese scorso?". Output: emesso, incassato, speso, margine cash, ordini, top clienti, confronto mese precedente.';
