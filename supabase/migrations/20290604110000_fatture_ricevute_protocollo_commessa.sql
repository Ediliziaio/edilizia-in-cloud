-- Protocollo di commessa delle fatture ricevute (25/11/2026, richiesta di URBAN VISION, valida per
-- ogni azienda che lavora per cantieri): accanto al protocollo IVA — annuale, unico per registro,
-- fiscale (20290524090000) — serve il numero della cartella del cantiere: «Che1, Che2…» per
-- Cherubini, «Cal1…» per Callimaco, «Lot1…» per Lotti.
--
-- Perché non bastano i sezionali IVA: il protocollo IVA riparte da 1 ogni gennaio e deve seguire
-- l'ordine di registrazione del registro. Un cantiere dura più anni (Cherubini: maggio 2025 →
-- ottobre 2026) e la sua cartella è una sola, quindi il suo progressivo non riparte. Sono due
-- numeri con due scopi: questo non sostituisce quello fiscale e non entra nei registri IVA.
--
-- Il numero sta sul cantiere, cioè sulla commessa generale (una fattura su una commessa figlia
-- prende il progressivo della sua generale): è così che l'azienda divide le fatture.
-- Chi scrive: contabilita_puo_scrivere, come per il protocollo IVA. La sigla la può cambiare
-- anche chi modifica la commessa.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- 1. La sigla del cantiere, sulla commessa: «Che», «Cal», «Lot». Unica in azienda, perché è lei
--    che si legge nel numero di protocollo.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS protocollo_sigla text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_protocollo_sigla_valida') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_protocollo_sigla_valida
      CHECK (protocollo_sigla IS NULL OR protocollo_sigla ~ '^[A-Za-z0-9]{1,8}$');
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS orders_protocollo_sigla_unica
  ON public.orders(company_id, upper(protocollo_sigla))
  WHERE protocollo_sigla IS NOT NULL AND deleted_at IS NULL;

-- 2. Il protocollo sulla fattura ricevuta: la commessa (cantiere) e il numero dentro quella.
ALTER TABLE public.fatture_ricevute
  ADD COLUMN IF NOT EXISTS protocollo_commessa_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS protocollo_commessa_numero integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fatture_ricevute_protocollo_commessa_coerente') THEN
    ALTER TABLE public.fatture_ricevute ADD CONSTRAINT fatture_ricevute_protocollo_commessa_coerente
      CHECK ((protocollo_commessa_id IS NULL) = (protocollo_commessa_numero IS NULL)
             AND (protocollo_commessa_numero IS NULL OR protocollo_commessa_numero > 0));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS fatture_ricevute_protocollo_commessa_unico
  ON public.fatture_ricevute(protocollo_commessa_id, protocollo_commessa_numero)
  WHERE protocollo_commessa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fatture_ricevute_protocollo_commessa_azienda
  ON public.fatture_ricevute(company_id, protocollo_commessa_id);

-- 3. Il cantiere di una fattura: la commessa generale della quota più grande del suo costo,
--    altrimenti quella dell'ordine d'acquisto. Interna: la chiamano le funzioni qui sotto.
CREATE OR REPLACE FUNCTION public.fattura_ricevuta_cantiere(p_fattura uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  WITH f AS (SELECT id, company_id, company_cost_id, purchase_order_id FROM public.fatture_ricevute WHERE id = p_fattura),
  quote AS (
    SELECT (a->>'order_id')::uuid AS order_id,
           coalesce((a->>'importo')::numeric, (a->>'pct')::numeric, 0) AS peso
      FROM f JOIN public.company_costs cc ON cc.id = f.company_cost_id
        CROSS JOIN LATERAL jsonb_array_elements(cc.allocations) a
     WHERE jsonb_typeof(cc.allocations) = 'array'
       AND (a->>'order_id') ~ '^[0-9a-fA-F-]{36}$'
    UNION ALL
    SELECT cc.order_id, 0
      FROM f JOIN public.company_costs cc ON cc.id = f.company_cost_id
     WHERE cc.order_id IS NOT NULL AND coalesce(jsonb_array_length(cc.allocations), 0) = 0
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

-- 4. La sigla del cantiere. La cambia chi scrive la contabilità o chi modifica la commessa.
--    Sigla vuota = la commessa torna senza sigla (il numero resta, si legge col codice commessa).
CREATE OR REPLACE FUNCTION public.commessa_sigla_protocollo(p_commessa uuid, p_sigla text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE o public.orders; v_sigla text; v_altra text;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_commessa AND deleted_at IS NULL;
  IF NOT FOUND OR public.utente_bloccato()
     OR NOT (public.contabilita_puo_scrivere(o.company_id) OR public.puo_modificare_commessa(o.id)) THEN
    RAISE EXCEPTION 'Non hai il permesso di cambiare la sigla di questa commessa' USING ERRCODE = '42501';
  END IF;
  v_sigla := nullif(btrim(coalesce(p_sigla, '')), '');
  IF v_sigla IS NOT NULL AND v_sigla !~ '^[A-Za-z0-9]{1,8}$' THEN
    RAISE EXCEPTION 'La sigla è da 1 a 8 lettere o numeri, senza spazi (es. Che)' USING ERRCODE = '22023';
  END IF;
  IF v_sigla IS NOT NULL THEN
    SELECT coalesce(k.order_code, '') INTO v_altra FROM public.orders k
     WHERE k.company_id = o.company_id AND k.id <> o.id AND k.deleted_at IS NULL
       AND upper(k.protocollo_sigla) = upper(v_sigla);
    IF v_altra IS NOT NULL THEN
      RAISE EXCEPTION 'La sigla % è già della commessa %', v_sigla, v_altra USING ERRCODE = '23505';
    END IF;
  END IF;
  UPDATE public.orders SET protocollo_sigla = v_sigla, updated_at = now() WHERE id = o.id;
  RETURN jsonb_build_object('commessa', o.id, 'codice', o.order_code, 'sigla', v_sigla);
END $function$;
REVOKE ALL ON FUNCTION public.commessa_sigla_protocollo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commessa_sigla_protocollo(uuid, text) TO authenticated;

-- 5. Assegna (o cambia) il protocollo di cantiere di una fattura.
--    p_commessa NULL → il cantiere che risulta dal collegamento della fattura.
--    p_numero NULL   → il primo numero libero di quel cantiere.
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
  v_ord := coalesce(o.commessa_generale_id, o.id);
  IF v_ord <> o.id THEN SELECT * INTO o FROM public.orders WHERE id = v_ord; END IF;

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

-- 6. Toglie il protocollo (fattura finita sul cantiere sbagliato): il numero torna libero.
CREATE OR REPLACE FUNCTION public.fattura_ricevuta_sprotocolla_commessa(p_fattura uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE f public.fatture_ricevute;
BEGIN
  SELECT * INTO f FROM public.fatture_ricevute WHERE id = p_fattura;
  IF NOT FOUND OR public.utente_bloccato() OR NOT public.contabilita_puo_scrivere(f.company_id) THEN
    RAISE EXCEPTION 'Non hai il permesso di protocollare questa fattura' USING ERRCODE = '42501';
  END IF;
  UPDATE public.fatture_ricevute
     SET protocollo_commessa_id = NULL, protocollo_commessa_numero = NULL, updated_at = now()
   WHERE id = f.id;
  RETURN jsonb_build_object('commessa', f.protocollo_commessa_id, 'numero', f.protocollo_commessa_numero, 'tolto', f.protocollo_commessa_id IS NOT NULL);
END $function$;
REVOKE ALL ON FUNCTION public.fattura_ricevuta_sprotocolla_commessa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fattura_ricevuta_sprotocolla_commessa(uuid) TO authenticated;

-- 7. Numera in un colpo le fatture senza protocollo, cantiere per cantiere, in ordine di arrivo
--    (giorno SdI, poi data fattura, poi inserimento). Le già numerate tengono il loro numero.
--    p_commessa → un solo cantiere; p_primo → da dove partire (solo con un cantiere indicato).
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
