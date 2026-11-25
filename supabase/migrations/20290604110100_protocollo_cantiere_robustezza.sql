-- Protocollo di cantiere, tre rinforzi alla migrazione 20290604110000 (applicata lo stesso
-- giorno, prima della pubblicazione). Nessun dato cambia: si sostituiscono tre funzioni.
--
-- 1. Lo stesso lucchetto per tutti. L'assegnazione singola prendeva
--    `protocollo-cantiere:<commessa>`, la numerazione in blocco
--    `protocollo-cantiere-azienda:<azienda>`: chiavi diverse, quindi i due lavori sullo
--    stesso cantiere potevano sovrapporsi. L'indice unico impediva il numero doppio, ma la
--    numerazione in blocco moriva con «duplicate key», un errore che nessuno capisce. Adesso
--    anche il blocco prende il lucchetto del cantiere su cui sta scrivendo.
-- 2. `jsonb_array_elements` non si fida più della WHERE: il filtro sul tipo sta dentro la
--    lateral, così un `allocations` che non fosse un elenco non fa esplodere la funzione
--    (oggi non ce ne sono: 3.936 elenchi e un NULL).
-- 3. Quando il protocollo si sposta sulla commessa generale, la seconda lettura ricontrolla
--    azienda e `deleted_at`: una generale cancellata non si prende il protocollo.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.fattura_ricevuta_cantiere(p_fattura uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH f AS (SELECT id, company_id, company_cost_id, purchase_order_id FROM public.fatture_ricevute WHERE id = p_fattura),
  quote AS (
    SELECT (a->>'order_id')::uuid AS order_id,
           coalesce((a->>'importo')::numeric, (a->>'pct')::numeric, 0) AS peso
      FROM f JOIN public.company_costs cc ON cc.id = f.company_cost_id
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(cc.allocations) = 'array' THEN cc.allocations ELSE '[]'::jsonb END) a
     WHERE (a->>'order_id') ~ '^[0-9a-fA-F-]{36}$'
    UNION ALL
    SELECT cc.order_id, 0
      FROM f JOIN public.company_costs cc ON cc.id = f.company_cost_id
     WHERE cc.order_id IS NOT NULL
       AND coalesce(CASE WHEN jsonb_typeof(cc.allocations) = 'array' THEN jsonb_array_length(cc.allocations) END, 0) = 0
    UNION ALL
    SELECT po.order_id, -1
      FROM f JOIN public.purchase_orders po ON po.id = f.purchase_order_id
     WHERE po.order_id IS NOT NULL
  )
  SELECT coalesce(o.commessa_generale_id, o.id)
    FROM quote q JOIN public.orders o ON o.id = q.order_id
    JOIN f ON f.company_id = o.company_id
   WHERE o.deleted_at IS NULL
   ORDER BY q.peso DESC, o.created_at, o.id
   LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.fattura_ricevuta_cantiere(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fattura_ricevuta_protocolla_commessa(
  p_fattura uuid, p_commessa uuid DEFAULT NULL, p_numero integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE f public.fatture_ricevute; v_ord uuid; v_num integer; v_occupata text; o public.orders;
BEGIN
  SELECT * INTO f FROM public.fatture_ricevute WHERE id = p_fattura;
  IF NOT FOUND OR public.utente_bloccato() OR NOT public.contabilita_puo_scrivere(f.company_id) THEN
    RAISE EXCEPTION 'Non hai il permesso di protocollare questa fattura' USING ERRCODE = '42501';
  END IF;
  IF f.stato = 'rifiutata' THEN RAISE EXCEPTION 'Una fattura rifiutata non si protocolla' USING ERRCODE = '22023'; END IF;
  IF p_numero IS NOT NULL AND p_numero <= 0 THEN RAISE EXCEPTION 'Il numero di protocollo parte da 1' USING ERRCODE = '22023'; END IF;
  v_ord := coalesce(p_commessa, f.protocollo_commessa_id, public.fattura_ricevuta_cantiere(p_fattura));
  IF v_ord IS NULL THEN
    RAISE EXCEPTION 'Collega prima la fattura a una commessa: il protocollo è diviso per cantiere' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO o FROM public.orders WHERE id = v_ord AND company_id = f.company_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commessa non valida per questa azienda' USING ERRCODE = '22023'; END IF;
  IF o.commessa_generale_id IS NOT NULL AND o.commessa_generale_id <> o.id THEN
    -- Il protocollo sta sul cantiere: la generale deve essere della stessa azienda e viva.
    SELECT * INTO o FROM public.orders
     WHERE id = o.commessa_generale_id AND company_id = f.company_id AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'La commessa generale di questo cantiere non è disponibile' USING ERRCODE = '22023'; END IF;
  END IF;
  v_ord := o.id;

  PERFORM pg_advisory_xact_lock(hashtextextended('protocollo-cantiere:' || v_ord, 0));
  SELECT * INTO f FROM public.fatture_ricevute WHERE id = p_fattura;
  IF f.protocollo_commessa_id = v_ord AND (p_numero IS NULL OR p_numero = f.protocollo_commessa_numero) THEN
    RETURN jsonb_build_object('commessa', v_ord, 'codice', o.order_code, 'sigla', o.protocollo_sigla,
                              'numero', f.protocollo_commessa_numero, 'gia_presente', true);
  END IF;
  IF p_numero IS NOT NULL THEN
    SELECT format('%s n. %s', r.cedente_ragione_sociale, r.numero_fattura) INTO v_occupata
      FROM public.fatture_ricevute r
     WHERE r.protocollo_commessa_id = v_ord AND r.protocollo_commessa_numero = p_numero AND r.id <> f.id;
    IF v_occupata IS NOT NULL THEN
      RAISE EXCEPTION 'Il protocollo % è già della fattura %',
        coalesce(o.protocollo_sigla, o.order_code) || p_numero, v_occupata USING ERRCODE = '23505';
    END IF;
  END IF;
  v_num := coalesce(p_numero, (SELECT coalesce(max(protocollo_commessa_numero), 0) + 1
                                 FROM public.fatture_ricevute WHERE protocollo_commessa_id = v_ord));
  UPDATE public.fatture_ricevute
     SET protocollo_commessa_id = v_ord, protocollo_commessa_numero = v_num, updated_at = now()
   WHERE id = f.id;
  RETURN jsonb_build_object('commessa', v_ord, 'codice', o.order_code, 'sigla', o.protocollo_sigla,
                            'numero', v_num, 'gia_presente', false);
END $function$;
REVOKE ALL ON FUNCTION public.fattura_ricevuta_protocolla_commessa(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fattura_ricevuta_protocolla_commessa(uuid, uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.fatture_ricevute_protocolla_cantieri(
  p_company uuid, p_commessa uuid DEFAULT NULL, p_primo integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r record; v_num integer; v_fatte jsonb := '{}'; v_senza integer := 0; v_ord uuid;
BEGIN
  IF public.utente_bloccato() OR NOT public.contabilita_puo_scrivere(p_company) THEN
    RAISE EXCEPTION 'Non hai il permesso di protocollare le fatture' USING ERRCODE = '42501';
  END IF;
  IF p_primo IS NOT NULL AND (p_commessa IS NULL OR p_primo <= 0) THEN
    RAISE EXCEPTION 'Il primo numero vale per un solo cantiere e parte da 1' USING ERRCODE = '22023';
  END IF;
  IF p_commessa IS NOT NULL THEN
    SELECT coalesce(o.commessa_generale_id, o.id) INTO v_ord FROM public.orders o
     WHERE o.id = p_commessa AND o.company_id = p_company AND o.deleted_at IS NULL;
    IF v_ord IS NULL THEN RAISE EXCEPTION 'Commessa non valida per questa azienda' USING ERRCODE = '22023'; END IF;
  END IF;
  PERFORM set_config('lock_timeout', '3s', true);
  PERFORM set_config('statement_timeout', '120s', true);
  FOR r IN
    SELECT f.id, public.fattura_ricevuta_cantiere(f.id) AS cantiere
      FROM public.fatture_ricevute f
     WHERE f.company_id = p_company AND f.stato <> 'rifiutata' AND f.protocollo_commessa_id IS NULL
     ORDER BY coalesce(f.data_ricezione_sdi::date, f.data_fattura), f.data_fattura, f.created_at, f.id
  LOOP
    IF r.cantiere IS NULL OR (v_ord IS NOT NULL AND r.cantiere <> v_ord) THEN
      IF r.cantiere IS NULL THEN v_senza := v_senza + 1; END IF;
      CONTINUE;
    END IF;
    -- Lo stesso lucchetto dell'assegnazione singola: due lavori sullo stesso cantiere si
    -- mettono in fila invece di scontrarsi sull'indice unico.
    PERFORM pg_advisory_xact_lock(hashtextextended('protocollo-cantiere:' || r.cantiere, 0));
    v_num := coalesce(nullif(p_primo, 0) + coalesce((v_fatte->(r.cantiere::text)->>'quante')::int, 0),
                      (SELECT coalesce(max(protocollo_commessa_numero), 0) + 1
                         FROM public.fatture_ricevute WHERE protocollo_commessa_id = r.cantiere));
    WHILE EXISTS (SELECT 1 FROM public.fatture_ricevute q
                   WHERE q.protocollo_commessa_id = r.cantiere AND q.protocollo_commessa_numero = v_num) LOOP
      v_num := v_num + 1;
    END LOOP;
    UPDATE public.fatture_ricevute
       SET protocollo_commessa_id = r.cantiere, protocollo_commessa_numero = v_num, updated_at = now()
     WHERE id = r.id;
    v_fatte := jsonb_set(v_fatte, ARRAY[r.cantiere::text],
      jsonb_build_object('quante', coalesce((v_fatte->(r.cantiere::text)->>'quante')::int, 0) + 1,
                         'primo', coalesce((v_fatte->(r.cantiere::text)->>'primo')::int, v_num),
                         'ultimo', v_num), true);
  END LOOP;
  RETURN jsonb_build_object(
    'cantieri', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'commessa', k.key, 'codice', o.order_code, 'sigla', o.protocollo_sigla,
        'quante', (k.value->>'quante')::int, 'primo', (k.value->>'primo')::int, 'ultimo', (k.value->>'ultimo')::int)
        ORDER BY o.order_code)
      FROM jsonb_each(v_fatte) k JOIN public.orders o ON o.id = (k.key)::uuid), '[]'::jsonb),
    'senza_cantiere', v_senza);
END $function$;
REVOKE ALL ON FUNCTION public.fatture_ricevute_protocolla_cantieri(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fatture_ricevute_protocolla_cantieri(uuid, uuid, integer) TO authenticated;
