-- Preventivo serramenti → commessa: nella commessa va l'IMPONIBILE (05/10/2026).
--
-- In orders.total_amount c'è l'imponibile, e il PDF della commessa ci aggiunge
-- l'IVA di orders.vat_rate (vedi converti-preventivo-cantiere e
-- convertiInCommessa.ts, già corretti così). Questa funzione invece metteva
-- sr_progetti.totale_max, che è il totale IVA INCLUSA, e lasciava vat_rate al
-- default 22: un preventivo da 11.000 € IVA inclusa al 10% diventava una
-- commessa da 11.000 € + 22% = 13.420 €. Nessuna commessa è ancora nata da un
-- preventivo serramenti, quindi nessun dato da riparare.
--
-- Ora:
--  - aliquota standard (0, 4, 10, 22): imponibile = totale / (1 + aliquota);
--  - IVA mista (beni significativi, iva_percentuale = -1): l'aliquota media si
--    ricava dalle righe con la stessa regola di calcolaIvaMista
--    (src/lib/serramenti/calcoli.ts). Lo sconto e il prezzo scritto a mano
--    scalano tutte le categorie nella stessa proporzione, e la regola è
--    omogenea: l'aliquota media dipende solo da serramenti (beni
--    significativi), accessori e servizi;
--  - la commessa prende quell'aliquota (come l'aliquota media del preventivo
--    generico in converti-preventivo-cantiere).
-- Stessa firma, stessi permessi.

CREATE OR REPLACE FUNCTION public.sr_converti_in_ordine(
  p_progetto_id uuid,
  p_importo_eur numeric DEFAULT NULL::numeric,
  p_anticipo_eur numeric DEFAULT NULL::numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_progetto record;
  v_ordine_id uuid;
  v_cliente text;
  v_descrizione text;
  v_lordo numeric;
  v_aliquota numeric;
  v_importo numeric;
  v_anticipo numeric;
  v_bs numeric;
  v_acc numeric;
  v_serv numeric;
  v_altre numeric;
  v_iva numeric;
BEGIN
  -- 1. Carica progetto (RLS guard)
  SELECT * INTO v_progetto
  FROM public.sr_progetti
  WHERE id = p_progetto_id
    AND (company_id = public.get_my_company_id() OR public.is_super_admin());

  IF v_progetto IS NULL THEN
    RAISE EXCEPTION 'Progetto Serramenti non trovato o non accessibile';
  END IF;

  PERFORM public.assert_permesso('can_edit_orders', 'convertire un preventivo in commessa');

  IF v_progetto.ordine_id IS NOT NULL THEN
    RAISE EXCEPTION 'Progetto già convertito in commessa (ordine_id: %)', v_progetto.ordine_id;
  END IF;

  -- 2. Totale del preventivo, IVA inclusa (priorità: param > totale_max > totale_min > 0)
  v_lordo := COALESCE(p_importo_eur, v_progetto.totale_max, v_progetto.totale_min, 0);

  IF v_lordo IS NULL OR v_lordo <= 0 THEN
    RAISE EXCEPTION 'Impossibile creare la commessa: il preventivo non ha un importo valido. Compila lo Step Economia e clicca "Applica calcoli al progetto".'
      USING ERRCODE = '22023'; -- invalid_parameter_value
  END IF;

  IF v_progetto.totale_min IS NOT NULL
     AND v_progetto.totale_max IS NOT NULL
     AND v_progetto.totale_min > v_progetto.totale_max THEN
    RAISE EXCEPTION 'Forbice prezzo non coerente: min (%) maggiore di max (%)',
      v_progetto.totale_min, v_progetto.totale_max
      USING ERRCODE = '22023';
  END IF;

  -- 3. Aliquota del preventivo e imponibile
  IF COALESCE(v_progetto.iva_percentuale, 10) >= 0 THEN
    v_aliquota := COALESCE(v_progetto.iva_percentuale, 10);
  ELSE
    -- IVA mista: stessa regola di calcolaIvaMista, sulle righe del preventivo.
    SELECT COALESCE(SUM(COALESCE(prezzo_totale, prezzo_unitario * COALESCE(quantita, 1), 0)), 0)
      INTO v_bs FROM public.sr_serramenti_progetto WHERE progetto_id = p_progetto_id;
    SELECT COALESCE(SUM(COALESCE(prezzo_totale, prezzo_unitario * COALESCE(quantita, 1), 0)), 0)
      INTO v_acc FROM public.sr_accessori_progetto WHERE progetto_id = p_progetto_id;
    SELECT COALESCE(SUM(COALESCE(prezzo_totale_vendita, prezzo_unitario_vendita * COALESCE(quantita, 1), 0)), 0)
      INTO v_serv FROM public.sr_servizi_progetto WHERE progetto_id = p_progetto_id;
    v_altre := v_acc + v_serv;
    IF v_bs + v_altre <= 0 THEN
      -- Solo prezzo scritto a mano, voci a 0 €: tutto bene significativo, al 22%.
      v_aliquota := 22;
    ELSE
      v_iva := 0.10 * (LEAST(v_bs, v_altre) + v_altre) + 0.22 * GREATEST(0, v_bs - v_altre);
      v_aliquota := round(v_iva / (v_bs + v_altre) * 100, 2);
    END IF;
  END IF;

  v_importo := round(v_lordo / (1 + v_aliquota / 100), 2);

  v_anticipo := COALESCE(p_anticipo_eur, v_importo * (COALESCE(v_progetto.fin_anticipo_pct, 0) / 100.0), 0);
  IF v_anticipo > v_importo THEN
    v_anticipo := v_importo;
  END IF;

  v_cliente := TRIM(COALESCE(v_progetto.cliente_nome, '') || ' ' || COALESCE(v_progetto.cliente_cognome, ''));
  v_descrizione := 'Stima Serramenti ' || v_progetto.code
    || CASE WHEN v_cliente IS NOT NULL AND v_cliente <> '' THEN ' · ' || v_cliente ELSE '' END
    || CASE WHEN v_progetto.cantiere_citta IS NOT NULL THEN ' (' || v_progetto.cantiere_citta || ')' ELSE '' END;

  -- 4. Crea ordine: imponibile + aliquota, l'IVA la aggiunge la commessa.
  INSERT INTO public.orders (
    company_id,
    customer_id,
    description,
    total_amount,
    vat_rate,
    deposit_amount,
    balance_amount,
    internal_notes,
    order_type
  ) VALUES (
    v_progetto.company_id,
    v_progetto.cliente_id,
    v_descrizione,
    v_importo,
    v_aliquota,
    v_anticipo,
    GREATEST(0, v_importo - v_anticipo),
    'Creato automaticamente dalla stima Serramenti ' || v_progetto.code ||
      coalesce(E'\n\nIntervento: ' || v_progetto.intervento_sintesi, ''),
    'cliente'
  )
  RETURNING id INTO v_ordine_id;

  -- 5. Aggiorna progetto: link + stato accettato
  UPDATE public.sr_progetti
  SET
    ordine_id = v_ordine_id,
    stato = 'accettato',
    updated_at = now()
  WHERE id = p_progetto_id;

  -- 6. Audit
  INSERT INTO public.sr_progetti_audit (progetto_id, company_id, user_id, event_type, event_data)
  VALUES (
    p_progetto_id,
    v_progetto.company_id,
    auth.uid(),
    'converted_to_ordine',
    jsonb_build_object(
      'ordine_id', v_ordine_id,
      'importo_eur', v_importo,
      'importo_iva_inclusa_eur', v_lordo,
      'aliquota_iva', v_aliquota,
      'anticipo_eur', v_anticipo
    )
  );

  RETURN v_ordine_id;
END
$function$;
