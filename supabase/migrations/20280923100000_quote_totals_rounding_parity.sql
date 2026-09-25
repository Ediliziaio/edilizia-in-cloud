-- Preparata localmente. Applicare dopo le migrazioni già presenti, incluso
-- 20280922100000_prezzo_a_mano_preventivo_generico.sql.
-- Parità con calcolaTotaliPreventivo: righe arrotondate al centesimo,
-- netto arrotondato dopo sconto e IVA raggruppata per aliquota.
-- Non ricalcola retroattivamente i preventivi esistenti.
CREATE OR REPLACE FUNCTION public.do_recalculate_quote_totals(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_base numeric;
  v_net numeric;
  v_vat numeric;
  v_manual numeric;
  v_manual_rate numeric;
  v_discount numeric;
BEGIN
  SELECT prezzo_manuale, prezzo_manuale_iva_pct, COALESCE(discount_percent, 0)
  INTO v_manual, v_manual_rate, v_discount
  FROM public.quotes
  WHERE id = p_quote_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_manual > 0 THEN
    v_base := ROUND(v_manual, 2);
    v_net := ROUND(v_base * (1 - v_discount / 100), 2);
    v_vat := ROUND(v_net * COALESCE(v_manual_rate, 0) / 100, 2);
  ELSE
    SELECT COALESCE(SUM(line_total), 0)
    INTO v_base
    FROM public.quote_items
    WHERE quote_id = p_quote_id AND NOT COALESCE(is_optional, false);
    v_net := ROUND(v_base * (1 - v_discount / 100), 2);

    SELECT COALESCE(SUM(t.tax), 0)
    INTO v_vat
    FROM (
      SELECT ROUND(SUM(line_total) * COALESCE(vat_rate, 22) / 100
        * (1 - v_discount / 100), 2) AS tax
      FROM public.quote_items
      WHERE quote_id = p_quote_id AND NOT COALESCE(is_optional, false)
      GROUP BY COALESCE(vat_rate, 22)
    ) AS t;
  END IF;

  UPDATE public.quotes
  SET subtotal = v_base,
      discount_amount = ROUND(v_base - v_net, 2),
      vat_amount = v_vat,
      total = ROUND(v_net + v_vat, 2),
      updated_at = now()
  WHERE id = p_quote_id;
END;
$function$;
