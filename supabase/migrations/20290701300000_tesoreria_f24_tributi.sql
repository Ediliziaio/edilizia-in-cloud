-- Tesoreria, lotto C (28/11/2026): un F24 in banca si chiude senza AI.
--
-- Il motore (private.tes_classifica) riconosce l'F24 (natura 'f24', regola R-F24) e lo
-- abbina solo alle scadenze fiscali aperte. Quando non trova niente lo lascia «da gestire»
-- e la pagina non offriva una strada propria. Qui due funzioni, senza toccare il motore
-- (la natura la decide lui, lotto B):
--
-- * tesoreria_f24_proposte(azienda, movimento) — sola lettura. Cerca ciò che l'F24 può pagare:
--   - scadenze fiscali aperte (stesso filtro del motore) con scadenza entro ±5 giorni;
--   - righe del modulo F24 (f24_entries) non pagate e non già in Prima Nota, con scadenza
--     entro ±5 giorni (senza data: il 16 del mese dopo quello del tributo).
--   Una riga con l'importo esatto, oppure la somma di 2-10 righe della stessa fonte: un F24
--   paga spesso più tributi insieme. Dice anche il tipo di tributo che la causale fa pensare.
-- * tesoreria_f24_registra(azienda, movimento, righe F24, tipo, note) — scrive, tutto o niente:
--   registra in Prima Nota (prima_nota_registra_divisa, quote 'f24' o una quota libera
--   «fiscale» = «Tributi pagati») e la collega al movimento (bank_associa_pagamenti), dentro la
--   stessa transazione. Le scadenze fiscali NON passano da qui: si confermano con
--   tesoreria_conferma_alternativa, il percorso di sempre.
--   La riga F24 non si segna pagata (regola di 20290524160000: il versamento vuole la quietanza).
--
-- Misura del 28/11/2026 (sola lettura): dei 55 F24 «da gestire» degli ultimi 120 giorni, 54 erano
-- già chiusi a mano senza documento (il motore non lo vede) e nessuno aveva una scadenza fiscale o
-- una riga F24 da abbinare; l'unico aperto non ha righe con l'importo giusto → «Tributi pagati».
--
-- Idempotente: CREATE OR REPLACE. Funzioni nuove chiuse ad anon, aperte solo ad authenticated.

-- Combinazioni: le righe (con «residuo») che fanno esattamente l'importo. Prima la riga singola,
-- poi le somme di 2-10 righe; al più 4 alternative.
CREATE OR REPLACE FUNCTION private.tes_f24_combinazioni(p_items jsonb, p_importo numeric, p_prefisso text, p_fonte text, p_fonti text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  m int := coalesce(jsonb_array_length(p_items), 0);
  combos jsonb := '[]'::jsonb; righe jsonb; somma numeric; mask int; k int;
BEGIN
  IF m = 0 OR p_importo IS NULL OR p_importo <= 0 THEN RETURN combos; END IF;
  IF m > 10 THEN RAISE EXCEPTION 'Al più 10 righe' USING ERRCODE = '22023'; END IF;
  FOR k IN 0..m-1 LOOP
    IF abs((p_items->k->>'residuo')::numeric - p_importo) < 0.005 THEN
      combos := combos || jsonb_build_array(jsonb_build_object(
        'chiave', p_prefisso || ':' || (p_items->k->>'id'), 'forza', 'media',
        'motivi', jsonb_build_array(format('Stesso importo di una %s', p_fonte)),
        'conflitti', '[]'::jsonb, 'righe', jsonb_build_array(p_items->k)));
      EXIT WHEN jsonb_array_length(combos) >= 4;
    END IF;
  END LOOP;
  IF jsonb_array_length(combos) > 0 OR m < 2 THEN RETURN combos; END IF;
  FOR mask IN 3..(1 << m) - 1 LOOP
    IF (SELECT count(*) FROM generate_series(0, m-1) b WHERE mask & (1 << b) <> 0) < 2 THEN CONTINUE; END IF;
    SELECT sum((p_items->b->>'residuo')::numeric) INTO somma FROM generate_series(0, m-1) b WHERE mask & (1 << b) <> 0;
    IF abs(somma - p_importo) < 0.005 THEN
      SELECT jsonb_agg(p_items->b ORDER BY b) INTO righe FROM generate_series(0, m-1) b WHERE mask & (1 << b) <> 0;
      combos := combos || jsonb_build_array(jsonb_build_object(
        'chiave', p_prefisso || ':' || md5(righe::text), 'forza', 'media',
        'motivi', jsonb_build_array(format('Somma esatta di %s %s', jsonb_array_length(righe), p_fonti)),
        'conflitti', '[]'::jsonb, 'righe', righe));
      EXIT WHEN jsonb_array_length(combos) >= 4;
    END IF;
  END LOOP;
  RETURN combos;
END $function$;
REVOKE ALL ON FUNCTION private.tes_f24_combinazioni(jsonb, numeric, text, text, text) FROM PUBLIC, anon, authenticated;

-- Il tipo di tributo che la causale fa pensare: solo un suggerimento, la scelta resta a chi conferma.
CREATE OR REPLACE FUNCTION private.tes_f24_tipo_da_causale(p_testo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_testo IS NULL THEN NULL
    WHEN lower(p_testo) ~ '\m(inail|inps|contribut[oi]|cassa edile)\M' THEN 'contributi'
    WHEN lower(p_testo) ~ '\m(ritenut[ae]|1001|1040|1012)\M' THEN 'ritenute'
    WHEN lower(p_testo) ~ '\m(iva|60(0[1-9]|1[0-2]|3[1-4]|99))\M' THEN 'iva'
    ELSE NULL
  END
$function$;
REVOKE ALL ON FUNCTION private.tes_f24_tipo_da_causale(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tesoreria_f24_proposte(p_company uuid, p_tx uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  t public.bank_transactions; v_resto numeric; v_scad jsonb; v_f24 jsonb; v_cand jsonb := '[]'::jsonb;
BEGIN
  PERFORM private.bank_operativa_access(p_company, false);
  IF public.has_permission_for_company(auth.uid(), 'can_view_prima_nota', p_company) IS NOT TRUE THEN
    RAISE EXCEPTION 'Non hai accesso alla prima nota' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO t FROM public.bank_transactions WHERE id = p_tx AND company_id = p_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimento bancario non trovato' USING ERRCODE = 'P0002'; END IF;
  IF coalesce(t.amount, 0) >= 0 OR coalesce(t.currency, 'EUR') <> 'EUR' THEN
    RETURN jsonb_build_object('residuo', 0, 'tipo_suggerito', NULL, 'candidati', '[]'::jsonb);
  END IF;
  SELECT round(abs(t.amount) - coalesce(sum(abs(r.matched_amount)), 0), 2) INTO v_resto
    FROM public.bank_reconciliations r WHERE r.company_id = p_company AND r.transaction_id = t.id AND r.unmatched_at IS NULL;
  -- Chiuso a mano senza documento: non resta niente da registrare (il motore non lo sa ancora).
  IF t.chiuso_senza_documento IS NOT NULL OR t.reconciliation_status = 'ignored' THEN v_resto := 0; END IF;
  -- Gli stessi rifiuti di bank_associa_pagamenti: niente pannello che poi al clic dà errore.
  IF coalesce(t.status, '') <> 'booked'
     OR t.linked_invoice_id IS NOT NULL OR t.linked_cost_id IS NOT NULL
     OR t.linked_installment_id IS NOT NULL OR t.linked_scadenza_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.bank_reconciliations r WHERE r.company_id = p_company AND r.transaction_id = t.id
                  AND r.unmatched_at IS NULL AND NOT r.ripartita) THEN
    v_resto := 0;
  END IF;

  IF v_resto > 0.005 THEN
    -- Scadenze fiscali aperte, le più vicine alla data della banca.
    SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', 'scadenza', 'id', s.id, 'titolo', s.description, 'controparte', 'Erario / enti',
             'residuo', s.resto, 'quota', s.resto, 'scadenza', s.due_date, 'commesse', '[]'::jsonb) ORDER BY s.vicino, s.due_date, s.id), '[]'::jsonb)
      INTO v_scad
      FROM (SELECT x.id, x.description, x.due_date, round(x.amount - coalesce(x.paid_amount, 0), 2) resto, abs(x.due_date - t.booking_date) vicino
              FROM public.scadenze x
             WHERE x.company_id = p_company AND x.direction = 'uscita' AND x.status IN ('da_pagare', 'parziale')
               AND coalesce(x.is_previsionale, false) = false
               -- Solo il tipo dichiarato: una fattura fornitore con «IVA» nella descrizione non è un tributo.
               AND x.tipo = 'scadenza_fiscale'
               AND x.amount - coalesce(x.paid_amount, 0) > 0.005
               AND x.due_date IS NOT NULL AND abs(x.due_date - t.booking_date) <= 5
             ORDER BY abs(x.due_date - t.booking_date), x.due_date, x.id
             LIMIT 10) s;

    -- Righe del modulo F24 non pagate e non già registrate in Prima Nota.
    SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', 'f24', 'id', f.id,
             'titolo', concat_ws(' · ', 'F24 ' || lpad(f.mese::text, 2, '0') || '/' || f.anno, f.tributo_code, f.tributo_descrizione),
             'controparte', 'Erario / enti', 'residuo', f.importo, 'quota', f.importo, 'scadenza', f.scad, 'commesse', '[]'::jsonb)
             ORDER BY f.vicino, f.scad, f.id), '[]'::jsonb)
      INTO v_f24
      FROM (SELECT x.id, x.anno, x.mese, x.tributo_code, x.tributo_descrizione, round(x.importo, 2) importo,
                   coalesce(x.data_scadenza, (make_date(x.anno, x.mese, 16) + interval '1 month')::date) scad,
                   abs(coalesce(x.data_scadenza, (make_date(x.anno, x.mese, 16) + interval '1 month')::date) - t.booking_date) vicino
              FROM public.f24_entries x
             WHERE x.company_id = p_company AND coalesce(x.stato, '') <> 'pagato' AND coalesce(x.importo, 0) > 0
               AND x.mese BETWEEN 1 AND 12 AND x.anno BETWEEN 2000 AND 2100
               AND abs(coalesce(x.data_scadenza, (make_date(x.anno, x.mese, 16) + interval '1 month')::date) - t.booking_date) <= 5
               AND NOT EXISTS (SELECT 1 FROM public.prima_nota_entries p WHERE p.company_id = p_company AND p.f24_id = x.id
                                 AND NOT EXISTS (SELECT 1 FROM public.prima_nota_entries y WHERE y.reversal_of = p.id))
             ORDER BY vicino, scad, x.id
             LIMIT 10) f;

    v_cand := private.tes_f24_combinazioni(v_scad, v_resto, 'f24s', 'scadenza fiscale', 'scadenze fiscali')
           || private.tes_f24_combinazioni(v_f24, v_resto, 'f24m', 'riga del modulo F24', 'righe del modulo F24');
  END IF;

  RETURN jsonb_build_object(
    'residuo', greatest(v_resto, 0),
    'tipo_suggerito', private.tes_f24_tipo_da_causale(concat_ws(' ', t.description, t.reference, t.creditor_name, t.counterparty_name)),
    'candidati', v_cand);
END $function$;
REVOKE ALL ON FUNCTION public.tesoreria_f24_proposte(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_f24_proposte(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tesoreria_f24_registra(p_company uuid, p_tx uuid, p_f24 uuid[] DEFAULT NULL, p_tipo text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  t public.bank_transactions; v_resto numeric; v_quote jsonb; v_somma numeric; v_n int; v_out jsonb; v_ids uuid[];
  v_tipo text := nullif(btrim(coalesce(p_tipo, '')), '');
  v_etichetta text;
BEGIN
  PERFORM private.bank_operativa_access(p_company, true);
  IF public.has_permission_for_company(auth.uid(), 'can_view_prima_nota', p_company) IS NOT TRUE THEN
    RAISE EXCEPTION 'Non hai accesso alla prima nota' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company::text, 2810));
  SELECT * INTO t FROM public.bank_transactions WHERE id = p_tx AND company_id = p_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimento bancario non trovato' USING ERRCODE = 'P0002'; END IF;
  IF coalesce(t.amount, 0) >= 0 THEN RAISE EXCEPTION 'Un F24 è un''uscita' USING ERRCODE = '22023'; END IF;
  IF coalesce(t.currency, 'EUR') <> 'EUR' OR t.status IS DISTINCT FROM 'booked' THEN
    RAISE EXCEPTION 'Il movimento deve essere in euro e contabilizzato dalla banca' USING ERRCODE = '22023';
  END IF;
  SELECT round(abs(t.amount) - coalesce(sum(abs(r.matched_amount)), 0), 2) INTO v_resto
    FROM public.bank_reconciliations r WHERE r.company_id = p_company AND r.transaction_id = t.id AND r.unmatched_at IS NULL;
  IF v_resto <= 0.005 THEN RAISE EXCEPTION 'Il movimento è già interamente collegato' USING ERRCODE = '22023'; END IF;

  IF coalesce(cardinality(p_f24), 0) > 0 THEN
    IF cardinality(p_f24) > 10 OR array_position(p_f24, NULL) IS NOT NULL
       OR cardinality(p_f24) <> (SELECT count(DISTINCT x) FROM unnest(p_f24) x) THEN
      RAISE EXCEPTION 'Righe F24 non valide' USING ERRCODE = '22023';
    END IF;
    SELECT count(*), coalesce(sum(round(f.importo, 2)), 0),
           jsonb_agg(jsonb_build_object('tipo', 'f24', 'id', f.id, 'importo', round(f.importo, 2)) ORDER BY f.id)
      INTO v_n, v_somma, v_quote
      FROM public.f24_entries f WHERE f.company_id = p_company AND f.id = ANY (p_f24);
    IF v_n <> cardinality(p_f24) THEN RAISE EXCEPTION 'Riga F24 non trovata' USING ERRCODE = '22023'; END IF;
    IF abs(v_somma - v_resto) > 0.004 THEN
      RAISE EXCEPTION 'Le righe F24 fanno % € ma restano da collegare % €',
        replace(to_char(v_somma, 'FM9999999990.00'), '.', ','), replace(to_char(v_resto, 'FM9999999990.00'), '.', ',') USING ERRCODE = '22023';
    END IF;
    v_etichetta := 'F24';
  ELSE
    IF v_tipo IS NULL OR v_tipo NOT IN ('iva', 'ritenute', 'contributi', 'altro') THEN
      RAISE EXCEPTION 'Scegli il tipo di tributo' USING ERRCODE = '22023';
    END IF;
    v_etichetta := 'Tributi pagati · ' || CASE v_tipo WHEN 'iva' THEN 'IVA' WHEN 'ritenute' THEN 'Ritenute' WHEN 'contributi' THEN 'Contributi' ELSE 'Altri tributi' END;
    v_quote := jsonb_build_array(jsonb_build_object('tipo', 'libera', 'categoria', 'fiscale', 'importo', v_resto,
      'descrizione', left(concat_ws(' · ', v_etichetta, nullif(btrim(coalesce(t.description, '')), '')), 300)));
  END IF;

  -- Prima Nota e banca nella stessa transazione: se il collegamento fallisce, la registrazione sparisce.
  v_out := public.prima_nota_registra_divisa(p_company,
    jsonb_build_object('direction', 'uscita', 'data', t.booking_date, 'importo', v_resto, 'metodo', 'bonifico',
      'riferimento', left(nullif(btrim(coalesce(t.reference, '')), ''), 120), 'bank_account_id', t.account_id,
      'descrizione', v_etichetta, 'note', nullif(btrim(coalesce(p_note, '')), '')),
    v_quote);
  SELECT array_agg((r->>'prima_nota_id')::uuid) INTO v_ids FROM jsonb_array_elements(v_out->'righe') r WHERE r ? 'prima_nota_id';
  IF coalesce(cardinality(v_ids), 0) = 0 THEN RAISE EXCEPTION 'Registrazione in Prima Nota non riuscita' USING ERRCODE = '22023'; END IF;
  PERFORM public.bank_associa_pagamenti(p_company, p_tx, v_ids);

  RETURN jsonb_build_object('gruppo_id', v_out->'gruppo_id', 'prima_nota_ids', to_jsonb(v_ids), 'importo', v_resto, 'tipo', coalesce(v_tipo, 'f24'));
END $function$;
REVOKE ALL ON FUNCTION public.tesoreria_f24_registra(uuid, uuid, uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_f24_registra(uuid, uuid, uuid[], text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
