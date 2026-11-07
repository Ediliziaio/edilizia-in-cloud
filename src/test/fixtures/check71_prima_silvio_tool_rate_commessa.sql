CREATE OR REPLACE FUNCTION public.silvio_tool_rate_commessa(p_company_id uuid, p_order_code text DEFAULT NULL::text, p_order_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order record; v_rate jsonb := '[]'::jsonb;
  v_tot numeric := 0; v_inc numeric := 0; v_res numeric := 0; v_scad numeric := 0; v_scoperto numeric := 0;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  SELECT o.id, o.order_code, o.client_name, o.client_company, o.total_amount,
         round(o.total_amount * (1 + coalesce(oo.vat_rate, 22) / 100), 2)
           - case when oo.payment_type = 'financing' then coalesce(oo.financing_cost, 0) else 0 end AS totale_ivato
    INTO v_order
    FROM public.commesse_valore_pattuito o JOIN public.orders oo ON oo.id = o.id
   WHERE o.company_id = p_company_id
     AND ((p_order_id IS NOT NULL AND o.id = p_order_id)
       OR (p_order_code IS NOT NULL AND UPPER(TRIM(o.order_code)) = UPPER(TRIM(p_order_code)))) LIMIT 1;
  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Commessa non trovata: serve il codice esatto o l''id.');
  END IF;

  -- La regola della scheda commessa: importi delle rate (il saldo è il residuo), da incassare e incassato.
  WITH ri AS MATERIALIZED (SELECT * FROM public.rate_importi(p_company_id) x WHERE x.order_id = v_order.id),
       d AS MATERIALIZED (SELECT * FROM public.rate_da_incassare(p_company_id) x WHERE x.order_id = v_order.id),
       righe AS (
         SELECT coalesce(nullif(btrim(oi.label), ''),
                         CASE ri.type WHEN 'deposit' THEN 'Acconto' WHEN 'balance' THEN 'Saldo'
                                      WHEN 'financing' THEN 'Finanziamento' ELSE 'Rata' END) AS label,
                ri.type AS tipo, ri.importo, ri.is_paid, ri.paid_date, ri.expected_date,
                coalesce(dd.residuo, 0) AS residuo, coalesce(dd.finanziamento, ri.type = 'financing') AS finanziamento,
                oi.trigger_evento, oi.giorni_preavviso
           FROM ri
           LEFT JOIN public.order_installments oi ON oi.id = ri.installment_id
           LEFT JOIN d dd ON dd.installment_id = ri.installment_id
       )
  SELECT COALESCE(SUM(importo), 0),
    COALESCE(SUM(residuo), 0),
    COALESCE(SUM(residuo) FILTER (WHERE NOT finanziamento AND expected_date IS NOT NULL AND expected_date < CURRENT_DATE), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'rata', label, 'tipo', tipo, 'importo_eur', ROUND(importo::numeric, 2),
      'da_incassare_eur', ROUND(residuo::numeric, 2),
      'incassata', is_paid, 'incassata_il', paid_date, 'attesa_il', expected_date,
      'giorni', CASE WHEN is_paid OR expected_date IS NULL THEN NULL ELSE expected_date - CURRENT_DATE END,
      'semaforo', CASE WHEN is_paid THEN 'incassata'
        WHEN expected_date IS NULL THEN 'senza data'
        WHEN expected_date < CURRENT_DATE THEN 'scaduta'
        WHEN giorni_preavviso IS NOT NULL AND expected_date <= CURRENT_DATE + giorni_preavviso THEN 'in preavviso'
        ELSE 'futura' END,
      'agganciata_a_evento', trigger_evento, 'giorni_preavviso', giorni_preavviso
    ) ORDER BY expected_date NULLS LAST, importo DESC), '[]'::jsonb)
  INTO v_tot, v_res, v_scad, v_rate
  FROM righe;

  SELECT COALESCE(SUM(x.residuo), 0) INTO v_scoperto
    FROM public.rate_da_incassare(p_company_id) x WHERE x.order_id = v_order.id AND x.installment_id IS NULL;
  SELECT COALESCE(SUM(x.importo), 0) INTO v_inc
    FROM public.rate_incassi(p_company_id) x WHERE x.order_id = v_order.id;

  RETURN jsonb_build_object('ok', true, 'commessa', v_order.order_code,
    'cliente', COALESCE(NULLIF(TRIM(v_order.client_name), ''), NULLIF(TRIM(v_order.client_company), ''), 'Cliente non indicato'),
    'valore_imponibile_eur', ROUND(COALESCE(v_order.total_amount, 0)::numeric, 2),
    'valore_ivato_eur', ROUND(COALESCE(v_order.totale_ivato, 0)::numeric, 2),
    'piano_rate_eur', ROUND(v_tot::numeric, 2), 'incassato_eur', ROUND(v_inc::numeric, 2),
    'residuo_eur', ROUND((v_res + v_scoperto)::numeric, 2), 'scaduto_eur', ROUND(v_scad::numeric, 2),
    'non_pianificato_eur', ROUND(v_scoperto::numeric, 2),
    'quadra_col_valore', (ABS(COALESCE(v_order.totale_ivato, 0) - v_tot) < 0.01),
    'rate', v_rate,
    'nota', 'Importi IVA inclusa, con la regola della scheda commessa (il saldo è il residuo). Una rata "agganciata a evento" prende la data dall''evento di cantiere: se il cantiere slitta, slitta anche l''incasso.');
END;
$function$
