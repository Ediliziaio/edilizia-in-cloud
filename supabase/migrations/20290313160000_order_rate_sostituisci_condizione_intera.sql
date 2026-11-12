-- Le rate si salvano con la loro condizione intera (12/11/2026): soglia di avanzamento,
-- fase di cantiere e termine di pagamento. Le colonne ci sono dalla 20290313140000, ma la
-- funzione che scrive le rate non le leggeva: salvare la commessa riportava «al 30% dei
-- lavori» a una rata senza condizione, e quindi senza data attesa.
--
-- Il corpo è quello della 20290313110000 con quattro colonne in più nei due INSERT e
-- nell'UPDATE: trigger_soglia, trigger_fase, termine_giorni, termine_fine_mese.
CREATE OR REPLACE FUNCTION public.order_rate_sostituisci(p_order_id uuid, p_rate jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company  uuid;
  v_quante   integer;
  v_vecchie  jsonb;
  v_con_id   boolean;
BEGIN
  SELECT o.company_id INTO v_company FROM public.orders o WHERE o.id = p_order_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'commessa non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF public.user_can_access_company(v_company) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_permesso('can_edit_orders', 'modificare lo scadenzario di una commessa');

  IF p_rate IS NULL OR jsonb_typeof(p_rate) <> 'array' THEN
    RAISE EXCEPTION 'le rate devono essere un elenco' USING ERRCODE = '22023';
  END IF;

  v_con_id := EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rate) r
     WHERE nullif(r->>'id', '') IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.order_installments oi
                    WHERE oi.id = (r->>'id')::uuid AND oi.order_id = p_order_id)
  );

  IF v_con_id THEN
    -- Via le rate che non ci sono più.
    DELETE FROM public.order_installments oi
     WHERE oi.order_id = p_order_id
       AND oi.id NOT IN (
         SELECT (r->>'id')::uuid FROM jsonb_array_elements(p_rate) r
          WHERE nullif(r->>'id', '') IS NOT NULL);

    -- Quelle che restano, al loro posto: legami compresi. Una rata legata a
    -- una fattura già pagata resta incassata anche se il modulo (aperto
    -- prima dell'incasso) la manda «da incassare»: la segue la fattura, e
    -- l'incasso si toglie dal registro incassi, non salvando la commessa.
    UPDATE public.order_installments oi SET
      position          = coalesce((t.r->>'position')::integer, t.ord::integer),
      label             = coalesce(nullif(btrim(t.r->>'label'), ''), 'Rata ' || t.ord),
      type              = coalesce(nullif(t.r->>'type', ''), 'deposit'),
      amount            = coalesce((t.r->>'amount')::numeric, 0),
      is_paid           = CASE WHEN t.fattura_pagata THEN true
                               ELSE coalesce((t.r->>'is_paid')::boolean, false) END,
      paid_date         = CASE WHEN t.fattura_pagata THEN oi.paid_date
                               ELSE nullif(t.r->>'paid_date', '')::date END,
      expected_date     = nullif(t.r->>'expected_date', '')::date,
      trigger_evento    = coalesce(nullif(t.r->>'trigger_evento', ''), 'data_fissa'),
      trigger_status_id = nullif(t.r->>'trigger_status_id', '')::uuid,
      giorni_preavviso  = least(greatest(coalesce((t.r->>'giorni_preavviso')::integer, 7), 0), 90),
      trigger_numero    = nullif(t.r->>'trigger_numero', '')::integer,
      trigger_soglia    = nullif(t.r->>'trigger_soglia', '')::numeric,
      trigger_fase      = nullif(btrim(t.r->>'trigger_fase'), ''),
      termine_giorni    = least(greatest(coalesce((t.r->>'termine_giorni')::integer, 0), 0), 365),
      termine_fine_mese = coalesce((t.r->>'termine_fine_mese')::boolean, false),
      importo_da_misurare = coalesce((t.r->>'importo_da_misurare')::boolean, false),
      invoice_id        = CASE WHEN t.r ? 'invoice_id' THEN nullif(t.r->>'invoice_id', '')::uuid ELSE oi.invoice_id END
    FROM (
      SELECT e.r, e.ord,
             EXISTS (SELECT 1 FROM public.order_installments x
                       JOIN public.documenti_fiscali d ON d.id = x.documento_fiscale_id
                      WHERE x.id = nullif(e.r->>'id', '')::uuid
                        AND x.is_paid
                        AND (d.stato = 'pagata'
                             OR (coalesce(d.totale_da_pagare, 0) > 0
                                 AND coalesce(d.importo_pagato, 0) >= d.totale_da_pagare - 0.01))) AS fattura_pagata
        FROM jsonb_array_elements(p_rate) WITH ORDINALITY AS e(r, ord)
       WHERE nullif(e.r->>'id', '') IS NOT NULL
    ) AS t
    WHERE oi.id = (t.r->>'id')::uuid
      AND oi.order_id = p_order_id;

    -- E le nuove.
    INSERT INTO public.order_installments (
      order_id, position, label, type, amount, is_paid, paid_date,
      expected_date, trigger_evento, trigger_status_id, giorni_preavviso,
      trigger_numero, trigger_soglia, trigger_fase, termine_giorni, termine_fine_mese,
      importo_da_misurare, invoice_id
    )
    SELECT
      p_order_id,
      coalesce((r->>'position')::integer, ord::integer),
      coalesce(nullif(btrim(r->>'label'), ''), 'Rata ' || ord),
      coalesce(nullif(r->>'type', ''), 'deposit'),
      coalesce((r->>'amount')::numeric, 0),
      coalesce((r->>'is_paid')::boolean, false),
      nullif(r->>'paid_date', '')::date,
      nullif(r->>'expected_date', '')::date,
      coalesce(nullif(r->>'trigger_evento', ''), 'data_fissa'),
      nullif(r->>'trigger_status_id', '')::uuid,
      least(greatest(coalesce((r->>'giorni_preavviso')::integer, 7), 0), 90),
      nullif(r->>'trigger_numero', '')::integer,
      nullif(r->>'trigger_soglia', '')::numeric,
      nullif(btrim(r->>'trigger_fase'), ''),
      least(greatest(coalesce((r->>'termine_giorni')::integer, 0), 0), 365),
      coalesce((r->>'termine_fine_mese')::boolean, false),
      coalesce((r->>'importo_da_misurare')::boolean, false),
      nullif(r->>'invoice_id', '')::uuid
    FROM jsonb_array_elements(p_rate) WITH ORDINALITY AS t(r, ord)
    WHERE nullif(r->>'id', '') IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.order_installments oi
                       WHERE oi.id = (r->>'id')::uuid AND oi.order_id = p_order_id);

    SELECT count(*) INTO v_quante FROM public.order_installments WHERE order_id = p_order_id;
    RETURN v_quante;
  END IF;

  -- Senza id: come prima, ma i legami alle fatture si ricordano.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'position', oi.position, 'amount', oi.amount,
           'documento_fiscale_id', oi.documento_fiscale_id, 'invoice_id', oi.invoice_id)), '[]'::jsonb)
    INTO v_vecchie
    FROM public.order_installments oi
   WHERE oi.order_id = p_order_id
     AND (oi.documento_fiscale_id IS NOT NULL OR oi.invoice_id IS NOT NULL);

  DELETE FROM public.order_installments WHERE order_id = p_order_id;

  INSERT INTO public.order_installments (
    order_id, position, label, type, amount, is_paid, paid_date,
    expected_date, trigger_evento, trigger_status_id, giorni_preavviso,
    trigger_numero, trigger_soglia, trigger_fase, termine_giorni, termine_fine_mese,
    importo_da_misurare, invoice_id
  )
  SELECT
    p_order_id,
    coalesce((r->>'position')::integer, ord::integer),
    coalesce(nullif(btrim(r->>'label'), ''), 'Rata ' || ord),
    -- deposit / balance / financing: i soli ammessi dal vincolo.
    coalesce(nullif(r->>'type', ''), 'deposit'),
    coalesce((r->>'amount')::numeric, 0),
    coalesce((r->>'is_paid')::boolean, false),
    nullif(r->>'paid_date', '')::date,
    nullif(r->>'expected_date', '')::date,
    coalesce(nullif(r->>'trigger_evento', ''), 'data_fissa'),
    nullif(r->>'trigger_status_id', '')::uuid,
    -- 7 giorni, come dichiara la colonna: prima era 0, cioe' nessun preavviso.
    least(greatest(coalesce((r->>'giorni_preavviso')::integer, 7), 0), 90),
    nullif(r->>'trigger_numero', '')::integer,
    nullif(r->>'trigger_soglia', '')::numeric,
    nullif(btrim(r->>'trigger_fase'), ''),
    least(greatest(coalesce((r->>'termine_giorni')::integer, 0), 0), 365),
    coalesce((r->>'termine_fine_mese')::boolean, false),
    coalesce((r->>'importo_da_misurare')::boolean, false),
    nullif(r->>'invoice_id', '')::uuid
  FROM jsonb_array_elements(p_rate) WITH ORDINALITY AS t(r, ord);

  GET DIAGNOSTICS v_quante = ROW_COUNT;

  -- I legami tornano sulla rata con la stessa posizione e lo stesso importo.
  UPDATE public.order_installments oi SET
    documento_fiscale_id = nullif(v->>'documento_fiscale_id', '')::uuid,
    invoice_id = coalesce(oi.invoice_id, nullif(v->>'invoice_id', '')::uuid)
  FROM jsonb_array_elements(v_vecchie) v
  WHERE oi.order_id = p_order_id
    AND oi.position = (v->>'position')::integer
    AND abs(oi.amount - (v->>'amount')::numeric) <= 0.01;

  RETURN v_quante;
END;
$function$;
