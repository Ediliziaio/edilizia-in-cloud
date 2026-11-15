-- Correzioni della revisione finale dell'area D (15/11/2026).
--
-- 1. Acconto al subappaltatore riconosciuto in modo esplicito. Prima ogni fattura collegata al
--    contratto senza SAL contava come «acconto fatturato», anche quella di un SAL non ancora
--    verificato (la scheda la collega al solo contratto): si recuperava un acconto che non c'era.
--    Ora l'acconto è `fatture_ricevute.subappalto_acconto`, che scrive solo
--    subappalto_collega_fattura(…, p_acconto => true) e solo se il contratto prevede un acconto.
--    Lo leggono il recupero nei SAL (sal_sub_registra_con_garanzia), il controllo della fattura e
--    il riepilogo del contratto.
-- 2. Un SAL contestato non tiene il suo recupero: quando diventa contestato `acconto_recuperato`
--    torna a 0 (così riapprovato non recupera due volte), e la somma dei recuperi del contratto
--    non può superare l'acconto (controllo su SAL e contratto).
-- 3. Bolletta sospetta doppione o scartata: la fattura non si può contabilizzare (il database lo
--    rifiuta). Scartata: la fattura passa a «rifiutata», lo stato che i conti economici escludono,
--    e la bolletta ne tiene traccia. Il costo già registrato NON si cancella: `company_costs` non
--    ha `deleted_at` e ha scadenze, prima nota e rate collegate; lo segnala l'avviso.
-- 4. Ripartizione delle bollette col segno: un rimborso non diventa un costo; segni diversi su
--    commesse diverse = «misto», da ripartire a mano.
-- 5. Una fattura senza XML non si segna «non bolletta»: torna in coda quando l'XML arriva.
-- 6. Sovrapposizione dei periodi anche quando manca la data di fine (coalesce).

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ── 1. L'acconto esplicito ───────────────────────────────────────────────────
ALTER TABLE public.fatture_ricevute ADD COLUMN IF NOT EXISTS subappalto_acconto boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.fatture_ricevute.subappalto_acconto IS
  'Fattura d''acconto del subappaltatore (collegata al contratto senza SAL). La scrive solo subappalto_collega_fattura.';

DROP FUNCTION IF EXISTS public.subappalto_collega_fattura(uuid, uuid, uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.subappalto_collega_fattura(
  p_fattura uuid, p_contratto uuid, p_sal uuid DEFAULT NULL::uuid,
  p_esito text DEFAULT 'manuale', p_regola text DEFAULT NULL, p_prove jsonb DEFAULT NULL, p_acconto boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET lock_timeout TO '3s'
AS $function$
DECLARE
  f record;
  ctr record;
  s record;
  r record;
  v_costo uuid;
  v_esito text := 'collegata';
  v_regola text := coalesce(nullif(btrim(p_regola), ''), 'subappalto_controllo_fattura');
  v_prove jsonb := coalesce(p_prove, '[]'::jsonb);
  v_importo numeric;
  v_servizio boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_acconto boolean := coalesce(p_acconto, false) AND p_sal IS NULL;
BEGIN
  -- Un esito vuoto non passa (prima il coalesce lo lasciava arrivare nullo alla traccia).
  IF p_esito IS NULL OR p_esito NOT IN ('manuale', 'automatico') THEN
    RAISE EXCEPTION 'Esito non valido: manuale o automatico.' USING errcode = '22023';
  END IF;
  IF jsonb_typeof(v_prove) <> 'array' THEN
    RAISE EXCEPTION 'Le prove vanno passate come elenco.' USING errcode = '22023';
  END IF;

  SELECT id, company_id, cedente_piva, tipo_documento, stato, company_cost_id, purchase_order_id, imponibile_totale, totale_documento
    INTO f FROM public.fatture_ricevute WHERE id = p_fattura FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fattura non trovata.' USING errcode = 'P0002'; END IF;

  IF v_servizio THEN
    -- Il giro del server (subappalti-collega-fatture) collega solo da sé, mai a nome di una persona.
    IF p_esito <> 'automatico' THEN
      RAISE EXCEPTION 'Dal servizio si collega solo con esito automatico.' USING errcode = '42501';
    END IF;
    PERFORM set_config('acquisti.processo', 'subappalti-collega-fatture', true);
  ELSIF NOT coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', f.company_id), false)
     OR NOT coalesce(public.has_permission_for_company(auth.uid(), 'can_view_subappaltatori_amministrazione', f.company_id), false) THEN
    RAISE EXCEPTION 'Il tuo ruolo non permette di gestire le fatture dei subappalti.' USING errcode = '42501';
  END IF;

  IF p_contratto IS NULL AND v_servizio THEN
    RAISE EXCEPTION 'Il servizio non scollega: lo fa una persona.' USING errcode = '42501';
  END IF;
  IF p_contratto IS NULL THEN
    UPDATE public.fatture_ricevute SET contratto_subappalto_id = NULL, sal_subappaltatore_id = NULL, subappalto_acconto = false, updated_at = now() WHERE id = f.id;
    -- La traccia dice che il collegamento non vale più (la storia resta).
    FOR r IN SELECT c.id FROM public.acquisti_collegamenti c
              WHERE c.company_id = f.company_id AND c.da_tipo = 'fattura_ricevuta' AND c.da_id = f.id
                AND c.a_tipo IN ('contratto', 'sal') AND c.stato IN ('proposto', 'collegato', 'verificato')
    LOOP
      PERFORM public.acquisti_collegamento_cambia_stato(r.id, 'annullato', 'Scollegata dal contratto di subappalto');
    END LOOP;
    RETURN jsonb_build_object('esito', 'scollegata', 'fattura_id', f.id);
  END IF;

  SELECT cs.id, cs.company_id, cs.order_id, cs.numero_contratto, cs.acconto_importo, ss.piva
    INTO ctr
    FROM public.contratti_subappalto cs
    LEFT JOIN public.subappaltatori_sicurezza ss ON ss.id = cs.subappaltatore_id
   WHERE cs.id = p_contratto;
  IF NOT FOUND OR ctr.company_id <> f.company_id THEN
    RAISE EXCEPTION 'Il contratto non è della stessa azienda della fattura.' USING errcode = '42501';
  END IF;
  IF public.partner_tax_key(f.cedente_piva) <> '' AND public.partner_tax_key(ctr.piva) <> ''
     AND public.partner_tax_key(f.cedente_piva) <> public.partner_tax_key(ctr.piva) THEN
    RAISE EXCEPTION 'La partita IVA della fattura non è quella del subappaltatore del contratto.' USING errcode = 'P0001';
  END IF;
  IF f.stato = 'rifiutata' THEN
    RAISE EXCEPTION 'La fattura è rifiutata: non si collega.' USING errcode = 'P0001';
  END IF;

  IF p_sal IS NOT NULL THEN
    SELECT id, contratto_id, stato, numero_sal INTO s FROM public.sal_subappaltatori WHERE id = p_sal;
    IF NOT FOUND OR s.contratto_id <> ctr.id THEN
      RAISE EXCEPTION 'Il SAL non è di questo contratto.' USING errcode = 'P0001';
    END IF;
    IF s.stato NOT IN ('verificato', 'pagato') THEN
      RAISE EXCEPTION 'Il SAL n. % non è ancora verificato: la fattura si emette dopo il benestare.', s.numero_sal USING errcode = 'P0001';
    END IF;
  END IF;

  -- Fattura d'acconto: solo se il contratto prevede un acconto, e mai insieme a un SAL.
  IF v_acconto AND coalesce(ctr.acconto_importo, 0) <= 0 THEN
    RAISE EXCEPTION 'Il contratto non prevede un acconto: la fattura si collega a un SAL.' USING errcode = 'P0001';
  END IF;

  v_importo := coalesce(f.imponibile_totale, f.totale_documento);

  -- Interruttore spento: un collegamento deciso dal controllo resta una proposta, nella traccia.
  IF p_esito = 'automatico' AND NOT public.azienda_collegamento_automatico(f.company_id) THEN
    PERFORM public.acquisti_collegamento_registra(f.company_id, 'fattura_ricevuta', f.id, NULL, 'contratto', ctr.id, NULL,
      v_regola, 'proposta', v_prove, NULL, NULL, NULL, v_importo, 1, false, 'Collegamento automatico spento: da confermare');
    IF p_sal IS NOT NULL THEN
      PERFORM public.acquisti_collegamento_registra(f.company_id, 'fattura_ricevuta', f.id, NULL, 'sal', p_sal, NULL,
        v_regola, 'proposta', v_prove, NULL, NULL, NULL, v_importo, 1, false, 'Collegamento automatico spento: da confermare');
    END IF;
    RETURN jsonb_build_object('esito', 'proposta', 'fattura_id', f.id, 'contratto_id', ctr.id, 'sal_id', p_sal);
  END IF;

  UPDATE public.fatture_ricevute
     SET contratto_subappalto_id = ctr.id,
         sal_subappaltatore_id = p_sal,
         subappalto_acconto = v_acconto,
         order_id_suggerito = coalesce(order_id_suggerito, ctr.order_id),
         updated_at = now()
   WHERE id = f.id;

  -- Il SAL cambiato: le righe della traccia verso un altro SAL della stessa fattura non valgono più.
  FOR r IN SELECT c.id FROM public.acquisti_collegamenti c
            WHERE c.company_id = f.company_id AND c.da_tipo = 'fattura_ricevuta' AND c.da_id = f.id
              AND ((c.a_tipo = 'sal' AND c.a_id IS DISTINCT FROM p_sal) OR (c.a_tipo = 'contratto' AND c.a_id <> ctr.id))
              AND c.stato IN ('proposto', 'collegato', 'verificato')
  LOOP
    PERFORM public.acquisti_collegamento_cambia_stato(r.id, 'annullato', 'Collegata a un altro contratto o SAL');
  END LOOP;

  PERFORM public.acquisti_collegamento_registra(f.company_id, 'fattura_ricevuta', f.id, NULL, 'contratto', ctr.id, NULL,
    v_regola, p_esito, v_prove, NULL, NULL, NULL, v_importo, 1, false, NULL);
  IF p_sal IS NOT NULL THEN
    PERFORM public.acquisti_collegamento_registra(f.company_id, 'fattura_ricevuta', f.id, NULL, 'sal', p_sal, NULL,
      v_regola, p_esito, v_prove, NULL, NULL, NULL, v_importo, 1, false, NULL);
  END IF;

  v_costo := f.company_cost_id;
  IF v_costo IS NULL AND coalesce(f.tipo_documento, '') NOT IN ('TD04', 'passive_credit_note') THEN
    v_costo := (public.contabilizza_fattura_ricevuta(f.id) ->> 'company_cost_id')::uuid;
    v_esito := 'contabilizzata_e_collegata';
  END IF;

  IF v_costo IS NOT NULL AND ctr.order_id IS NOT NULL THEN
    UPDATE public.company_costs
       SET order_id = ctr.order_id, updated_at = now()
     WHERE id = v_costo AND company_id = f.company_id
       AND order_id IS NULL AND purchase_order_id IS NULL
       AND (allocations IS NULL OR jsonb_typeof(allocations) <> 'array' OR jsonb_array_length(allocations) = 0);
  END IF;

  RETURN jsonb_build_object('esito', v_esito, 'fattura_id', f.id, 'contratto_id', ctr.id, 'sal_id', p_sal,
                            'company_cost_id', v_costo, 'order_id', ctr.order_id);
END
$function$;

REVOKE ALL ON FUNCTION public.subappalto_collega_fattura(uuid, uuid, uuid, text, text, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subappalto_collega_fattura(uuid, uuid, uuid, text, text, jsonb, boolean) TO authenticated, service_role;

-- Il recupero nei SAL conta solo le fatture d'acconto dichiarate.
DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.sal_sub_registra_con_garanzia(uuid,uuid,uuid,integer,date,numeric,numeric,text,text)'::regprocedure);
  IF position('and f.subappalto_acconto' IN v_def) = 0 THEN
    IF position('and f.sal_subappaltatore_id is null' IN v_def) = 0 THEN
      RAISE EXCEPTION 'sal_sub_registra_con_garanzia: non trovo il filtro dell''acconto';
    END IF;
    EXECUTE replace(v_def, 'and f.sal_subappaltatore_id is null', 'and f.subappalto_acconto');
  END IF;
END $$;

-- ── 2. SAL contestato e somma dei recuperi ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sal_sub_acconto_contestato()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF new.stato = 'contestato' AND old.stato IS DISTINCT FROM 'contestato' THEN
    new.acconto_recuperato := 0;
  END IF;
  RETURN new;
END $$;
-- Prima di sal_sub_protetto (ordine alfabetico), che lascia passare proprio questo cambio.
DROP TRIGGER IF EXISTS sal_sub_acconto_contestato ON public.sal_subappaltatori;
CREATE TRIGGER sal_sub_acconto_contestato BEFORE UPDATE OF stato ON public.sal_subappaltatori
  FOR EACH ROW EXECUTE FUNCTION public.sal_sub_acconto_contestato();

DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.sal_sub_protetto()'::regprocedure);
  IF position('new.stato = ''contestato'' AND new.acconto_recuperato = 0' IN v_def) = 0 THEN
    IF position('or new.acconto_recuperato is distinct from old.acconto_recuperato' IN v_def) = 0 THEN
      RAISE EXCEPTION 'sal_sub_protetto: non trovo il controllo del recupero';
    END IF;
    EXECUTE replace(v_def, 'or new.acconto_recuperato is distinct from old.acconto_recuperato',
      'or (new.acconto_recuperato is distinct from old.acconto_recuperato AND NOT (new.stato = ''contestato'' AND new.acconto_recuperato = 0))');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.subappalto_acconto_non_oltre()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE v_contratto uuid; v_acconto numeric; v_recuperato numeric;
BEGIN
  v_contratto := CASE WHEN tg_table_name = 'sal_subappaltatori' THEN new.contratto_id ELSE new.id END;
  SELECT coalesce(c.acconto_importo, 0) INTO v_acconto FROM public.contratti_subappalto c WHERE c.id = v_contratto;
  SELECT coalesce(sum(s.acconto_recuperato), 0) INTO v_recuperato FROM public.sal_subappaltatori s
   WHERE s.contratto_id = v_contratto AND s.stato <> 'contestato';
  IF v_recuperato > coalesce(v_acconto, 0) + 0.01 THEN
    RAISE EXCEPTION 'I SAL recuperano % di acconto, più dell''acconto del contratto (%).', v_recuperato, coalesce(v_acconto, 0) USING errcode = '23514';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS subappalto_acconto_non_oltre ON public.sal_subappaltatori;
CREATE CONSTRAINT TRIGGER subappalto_acconto_non_oltre AFTER INSERT OR UPDATE OF acconto_recuperato, stato ON public.sal_subappaltatori
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.subappalto_acconto_non_oltre();
DROP TRIGGER IF EXISTS subappalto_acconto_non_oltre ON public.contratti_subappalto;
CREATE CONSTRAINT TRIGGER subappalto_acconto_non_oltre AFTER UPDATE OF acconto_importo ON public.contratti_subappalto
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.subappalto_acconto_non_oltre();
REVOKE ALL ON FUNCTION public.sal_sub_acconto_contestato() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.subappalto_acconto_non_oltre() FROM PUBLIC, anon, authenticated;

-- ── 3. Bolletta sospesa: non si contabilizza; scartata: fattura rifiutata ─────
CREATE OR REPLACE FUNCTION public.bolletta_sospesa_non_si_contabilizza()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF new.company_cost_id IS NOT NULL AND new.company_cost_id IS DISTINCT FROM old.company_cost_id
     AND EXISTS (SELECT 1 FROM public.bollette b WHERE b.fattura_ricevuta_id = new.id AND b.stato IN ('doppione_sospetto', 'scartata')) THEN
    RAISE EXCEPTION 'La bolletta è un possibile doppione o è scartata: decidi in Costi → Utenze prima di contabilizzarla.' USING errcode = '23514';
  END IF;
  RETURN new;
END $$;
DROP TRIGGER IF EXISTS bolletta_sospesa_non_si_contabilizza ON public.fatture_ricevute;
CREATE TRIGGER bolletta_sospesa_non_si_contabilizza BEFORE UPDATE OF company_cost_id ON public.fatture_ricevute
  FOR EACH ROW EXECUTE FUNCTION public.bolletta_sospesa_non_si_contabilizza();
REVOKE ALL ON FUNCTION public.bolletta_sospesa_non_si_contabilizza() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.bolletta_decidi(p_bolletta uuid, p_decisione text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.bollette; v_costo uuid;
BEGIN
  SELECT * INTO b FROM public.bollette WHERE id = p_bolletta FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bolletta non trovata.' USING errcode = 'P0002'; END IF;
  IF auth.uid() IS NULL OR NOT private.bollette_puo_decidere(b.company_id) THEN
    RAISE EXCEPTION 'Il tuo ruolo non permette di decidere sulle bollette.' USING errcode = '42501';
  END IF;
  IF p_decisione = 'non_doppione' THEN
    UPDATE public.bollette SET stato = 'riconosciuta', doppione_di = NULL, deciso_da = auth.uid(), deciso_il = now() WHERE id = b.id;
    RETURN public.bolletta_applica_costo(b.id, 'manuale');
  ELSIF p_decisione = 'scarta' THEN
    -- La fattura esce dai conti economici come rifiutata; il costo già registrato resta e si segnala.
    UPDATE public.fatture_ricevute SET stato = 'rifiutata', updated_at = now()
     WHERE id = b.fattura_ricevuta_id RETURNING company_cost_id INTO v_costo;
    UPDATE public.bollette
       SET stato = 'scartata', costo_esito = 'sospesa', deciso_da = auth.uid(), deciso_il = now(),
           avvisi = avvisi || jsonb_build_object('codice', 'scartata', 'da', auth.uid(), 'il', now(),
             'testo', CASE WHEN v_costo IS NULL THEN 'Scartata: la fattura è rifiutata e non si contabilizza.'
                           ELSE 'Scartata: la fattura è rifiutata. Il costo era già registrato: annullalo (e le sue scadenze) dalla fattura.' END,
             'costo_id', v_costo)
     WHERE id = b.id;
    RETURN jsonb_build_object('esito', 'scartata', 'costo_da_annullare', v_costo);
  END IF;
  RAISE EXCEPTION 'Decisione non valida: non_doppione o scarta.' USING errcode = '22023';
END $$;
REVOKE ALL ON FUNCTION public.bolletta_decidi(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bolletta_decidi(uuid, text) TO authenticated;

-- ── 4. Ripartizione col segno ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bolletta_applica_costo(p_bolletta uuid, p_esito text DEFAULT 'manuale')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET lock_timeout TO '3s' AS $$
DECLARE
  b public.bollette; f record; c record; r record;
  v_ordini jsonb := '{}'; v_generale numeric := 0; v_totale numeric := 0; v_mancano int := 0;
  v_ord uuid; v_imp numeric; v_alloc jsonb := '[]'; v_n int; v_esito text; v_positivi int; v_negativi int;
BEGIN
  SELECT * INTO b FROM public.bollette WHERE id = p_bolletta FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bolletta non trovata.' USING errcode = 'P0002'; END IF;
  IF NOT private.bollette_puo_decidere(b.company_id) THEN
    RAISE EXCEPTION 'Il tuo ruolo non permette di assegnare il costo delle bollette.' USING errcode = '42501';
  END IF;
  IF coalesce(p_esito, '') NOT IN ('manuale', 'automatico') THEN
    RAISE EXCEPTION 'Esito non valido: manuale o automatico.' USING errcode = '22023';
  END IF;
  IF b.stato <> 'riconosciuta' THEN
    UPDATE public.bollette SET costo_esito = 'sospesa' WHERE id = b.id;
    RETURN jsonb_build_object('esito', 'sospesa');
  END IF;

  -- La destinazione valida alla fine del periodo di ogni riga (o alla data del documento).
  FOR r IN
    SELECT br.importo, d.destinazione_tipo, coalesce(d.order_id, u.order_id) AS order_id, d.id AS dest
      FROM public.bollette_righe br
      LEFT JOIN LATERAL (
        SELECT x.* FROM public.utenze_destinazioni x
         WHERE x.utenza_id = br.utenza_id AND x.stato = 'collegato'
           AND x.valido_dal <= coalesce(br.periodo_al, b.data, current_date)
           AND (x.valido_al IS NULL OR x.valido_al >= coalesce(br.periodo_al, b.data, current_date))
         ORDER BY x.valido_dal DESC LIMIT 1) d ON true
      LEFT JOIN public.unita_immobiliari u ON u.id = d.unita_id
     WHERE br.bolletta_id = b.id
  LOOP
    -- Con il segno: un rimborso resta un rimborso.
    v_totale := v_totale + r.importo;
    IF r.dest IS NULL THEN v_mancano := v_mancano + 1;
    ELSIF r.order_id IS NULL THEN v_generale := v_generale + abs(r.importo);
    ELSE v_ordini := jsonb_set(v_ordini, ARRAY[r.order_id::text], to_jsonb(coalesce((v_ordini ->> r.order_id::text)::numeric, 0) + r.importo));
    END IF;
  END LOOP;

  SELECT count(*) FILTER (WHERE value::numeric > 0), count(*) FILTER (WHERE value::numeric < 0)
    INTO v_positivi, v_negativi FROM jsonb_each_text(v_ordini);
  IF v_mancano > 0 THEN v_esito := 'da_collegare';
  ELSIF v_ordini = '{}'::jsonb THEN v_esito := 'generale';
  ELSIF v_generale > 0 THEN v_esito := 'misto';
  -- Segni diversi su commesse diverse (un rimborso qui, un costo là) o totale zero: a mano.
  ELSIF (v_positivi > 0 AND v_negativi > 0) OR v_totale = 0 THEN v_esito := 'misto';
  END IF;
  IF v_esito IS NOT NULL THEN
    UPDATE public.bollette SET costo_esito = v_esito WHERE id = b.id;
    RETURN jsonb_build_object('esito', v_esito);
  END IF;

  SELECT id, company_id, company_cost_id INTO f FROM public.fatture_ricevute WHERE id = b.fattura_ricevuta_id FOR UPDATE;
  v_n := (SELECT count(*) FROM jsonb_object_keys(v_ordini));

  -- Già assegnato (da una persona o da un'altra regola): non si tocca, nemmeno con una proposta.
  IF f.company_cost_id IS NOT NULL THEN
    SELECT id, order_id, purchase_order_id, allocations INTO c FROM public.company_costs WHERE id = f.company_cost_id AND company_id = b.company_id FOR UPDATE;
    IF c.order_id IS NOT NULL OR c.purchase_order_id IS NOT NULL
       OR (c.allocations IS NOT NULL AND jsonb_typeof(c.allocations) = 'array' AND jsonb_array_length(c.allocations) > 0) THEN
      UPDATE public.bollette SET costo_esito = 'gia_assegnato' WHERE id = b.id;
      RETURN jsonb_build_object('esito', 'gia_assegnato');
    END IF;
  END IF;

  -- Interruttore spento e decisione della regola: proposta nella traccia, niente scrittura.
  IF p_esito = 'automatico' AND NOT public.azienda_collegamento_automatico(b.company_id) THEN
    FOR v_ord, v_imp IN SELECT key::uuid, value::numeric FROM jsonb_each_text(v_ordini) LOOP
      PERFORM public.acquisti_collegamento_registra(b.company_id, 'fattura_ricevuta', f.id, NULL, 'commessa', v_ord, NULL,
        'bolletta_utenza_destinazione', 'proposta', '[]'::jsonb, NULL, NULL, NULL, v_imp, 1, false, 'Collegamento automatico spento: da confermare');
    END LOOP;
    UPDATE public.bollette SET costo_esito = 'proposta' WHERE id = b.id;
    RETURN jsonb_build_object('esito', 'proposta');
  END IF;

  IF f.company_cost_id IS NULL THEN
    -- Non ancora contabilizzata: resta il suggerimento, che la contabilizzazione userà.
    IF v_n = 1 THEN
      UPDATE public.fatture_ricevute SET order_id_suggerito = coalesce(order_id_suggerito, (SELECT key::uuid FROM jsonb_object_keys(v_ordini) key LIMIT 1)), updated_at = now() WHERE id = f.id;
    END IF;
    UPDATE public.bollette SET costo_esito = 'senza_costo' WHERE id = b.id;
    RETURN jsonb_build_object('esito', 'senza_costo');
  END IF;

  IF v_n = 1 THEN
    UPDATE public.company_costs SET order_id = (SELECT key::uuid FROM jsonb_object_keys(v_ordini) key LIMIT 1), updated_at = now() WHERE id = c.id;
  ELSE
    SELECT jsonb_agg(jsonb_build_object('order_id', key, 'importo', round(value::numeric, 2), 'pct', round(value::numeric / v_totale * 100, 4)))
      INTO v_alloc FROM jsonb_each_text(v_ordini);
    UPDATE public.company_costs SET allocations = v_alloc, updated_at = now() WHERE id = c.id;
  END IF;
  FOR v_ord, v_imp IN SELECT key::uuid, value::numeric FROM jsonb_each_text(v_ordini) LOOP
    PERFORM public.acquisti_collegamento_registra(b.company_id, 'fattura_ricevuta', f.id, NULL, 'commessa', v_ord, NULL,
      'bolletta_utenza_destinazione', p_esito, '[]'::jsonb, NULL, NULL, NULL, v_imp, 1, false, NULL);
  END LOOP;
  UPDATE public.bollette SET costo_esito = 'applicato' WHERE id = b.id;
  RETURN jsonb_build_object('esito', 'applicato', 'commesse', v_n);
END $$;

-- ── 6. Sovrapposizione anche senza data di fine ──────────────────────────────
DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.bolletta_registra(uuid, jsonb)'::regprocedure);
  IF position('coalesce(orr.periodo_al, orr.periodo_dal)' IN v_def) = 0 THEN
    IF position('AND orr.periodo_dal <= private.data_iso(u ->> ''periodo_al'') AND private.data_iso(u ->> ''periodo_dal'') <= orr.periodo_al' IN v_def) = 0 THEN
      RAISE EXCEPTION 'bolletta_registra: non trovo il confronto dei periodi';
    END IF;
    EXECUTE replace(v_def,
      'AND orr.periodo_dal <= private.data_iso(u ->> ''periodo_al'') AND private.data_iso(u ->> ''periodo_dal'') <= orr.periodo_al',
      'AND orr.periodo_dal <= coalesce(private.data_iso(u ->> ''periodo_al''), private.data_iso(u ->> ''periodo_dal'')) AND private.data_iso(u ->> ''periodo_dal'') <= coalesce(orr.periodo_al, orr.periodo_dal)');
  END IF;
END $$;

-- ── 5. Senza XML si torna in coda ────────────────────────────────────────────
-- Le fatture segnate «non bolletta» quando non avevano ancora l'XML si rimettono in coda.
DELETE FROM public.bollette_viste v USING public.fatture_ricevute f
 WHERE f.id = v.fattura_ricevuta_id AND NOT v.e_bolletta AND f.xml_raw IS NULL;

CREATE OR REPLACE FUNCTION public.bollette_da_leggere(p_limite integer DEFAULT 30)
RETURNS TABLE (id uuid, company_id uuid, indice_corpo integer, xml_raw text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '20s' AS $$
BEGIN
  -- 1. Le fatture nuove, al massimo 200 per giro: si esaminano e si segnano.
  INSERT INTO public.bollette_viste (fattura_ricevuta_id, company_id, e_bolletta)
  SELECT f.id, f.company_id,
         (f.xml_raw ~ 'IT[0-9]{3}E[0-9A-Z]{8}' OR f.xml_raw ~* '<CodiceTipo>\s*PDR' OR f.xml_raw ~* 'PDR[^0-9]{0,12}[0-9]{14}')
    FROM (SELECT x.id, x.company_id, x.xml_raw FROM public.fatture_ricevute x
           WHERE x.created_at >= now() - interval '120 days'
             AND x.xml_raw IS NOT NULL  -- senza XML non si decide: torna quando l'XML arriva
             AND NOT EXISTS (SELECT 1 FROM public.bollette_viste v WHERE v.fattura_ricevuta_id = x.id)
           ORDER BY x.created_at LIMIT 200) f
  ON CONFLICT (fattura_ricevuta_id) DO NOTHING;

  -- 2. Le bollette viste e non ancora lette.
  RETURN QUERY
  SELECT f.id, f.company_id, coalesce(f.indice_corpo, 0), f.xml_raw
    FROM public.bollette_viste v
    JOIN public.fatture_ricevute f ON f.id = v.fattura_ricevuta_id
   WHERE v.e_bolletta
     AND NOT EXISTS (SELECT 1 FROM public.bollette b WHERE b.fattura_ricevuta_id = v.fattura_ricevuta_id)
   ORDER BY v.vista_il
   LIMIT least(greatest(coalesce(p_limite, 30), 1), 100);
END $$;

REVOKE ALL ON FUNCTION public.bollette_da_leggere(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bollette_da_leggere(integer) TO service_role;
