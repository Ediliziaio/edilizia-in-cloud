-- Protocollo di cantiere: la numerazione in blocco torna una alla volta per azienda, e non
-- riscrive mai un numero già dato. Rimedio a un difetto introdotto da 20290604110100.
--
-- Com'era nata (20290604110000): il lucchetto `protocollo-cantiere-azienda:<azienda>` prima
-- del ciclo. Due numerazioni in blocco si mettevano in fila, e la seconda leggeva il lavoro
-- della prima. Però l'assegnazione singola prendeva un lucchetto diverso (per cantiere), e
-- se le due si sovrapponevano la numerazione in blocco moriva con «duplicate key».
-- Il rimedio di 20290604110100 — un solo lucchetto, per cantiere, dentro il ciclo — ha chiuso
-- quello scontro ma ne ha aperto uno peggiore: due numerazioni in blocco partite insieme
-- leggono entrambe l'elenco delle fatture «senza protocollo», e la seconda riscriveva anche
-- quelle che la prima aveva appena numerato (la UPDATE non ricontrollava di stare scrivendo
-- su una fattura ancora senza numero). Nessun numero doppio — ci sono l'indice unico e il
-- salto dei numeri presi — ma una Che5 diventava Che9 da sola, lasciando un buco. Su una
-- numerazione contabile un numero che cambia in silenzio è peggio di un errore rumoroso.
--
-- Adesso tiene entrambi i lucchetti: quello per azienda prima del ciclo (le numerazioni in
-- blocco una alla volta) e quello per cantiere dentro il ciclo (contro l'assegnazione
-- singola). E la UPDATE scrive solo su una fattura ancora senza protocollo: se nel frattempo
-- l'ha presa qualcun altro, quella fattura si salta e non viene contata.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

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
  -- Una numerazione in blocco alla volta per azienda: la seconda aspetta qui e poi legge
  -- l'elenco aggiornato, invece di lavorare su un elenco vecchio.
  PERFORM pg_advisory_xact_lock(hashtextextended('protocollo-cantiere-azienda:' || p_company, 0));
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
    -- E il lucchetto del cantiere: contro l'assegnazione singola, che prende lo stesso.
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
     WHERE id = r.id AND protocollo_commessa_id IS NULL;
    -- Se nel frattempo l'ha protocollata qualcun altro, quella fattura si salta: il suo
    -- numero non si tocca e non finisce nel conto.
    IF NOT FOUND THEN CONTINUE; END IF;
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
