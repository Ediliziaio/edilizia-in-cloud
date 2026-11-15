-- Bollette e utenze (area D, §7.11 del piano del 15/11/2026; proposta in
-- docs/automazioni-subappalti-operativita.md §4).
--
-- Una bolletta È una fattura ricevuta: niente secondo registro dei costi. Qui si aggiunge solo
-- quello che la fattura non sa: a quale utenza (contatore) si riferisce ogni parte, per quale
-- periodo, se è un conguaglio, un doppione o una nota di credito, e dove va il costo.
--
-- - utenze: una per POD (luce) / PDR (gas) / codice, per azienda. Il codice identifica il
--   contatore anche quando cambia il fornitore. L'indirizzo di fornitura è solo un aiuto.
-- - utenze_destinazioni: sede, immobile o commessa, con validità (un contatore di cantiere passa
--   da una commessa all'altra). Lo decide una persona: l'indirizzo non basta mai da solo.
-- - bollette / bollette_righe: la lettura del documento, una riga per utenza (più utenze nello
--   stesso documento), con periodo, consumo, importo, letture stimate o effettive.
--
-- Regola doppione / conguaglio (decide il database, sotto un lock per azienda, così due letture
-- simultanee non sfuggono l'una all'altra):
-- - stesso fornitore, stesso numero e stesso anno di un'altra bolletta → doppione certo;
-- - stessa utenza, periodo che si sovrappone, stesso importo, entrambe ordinarie → doppione
--   sospetto: niente costo finché una persona non decide;
-- - conguaglio (dichiarato, o letture effettive su un periodo fatturato con letture stimate) →
--   rettifica legittima delle bollette che copre; i periodi stimati non si annullano;
-- - nota di credito (TD04) → storna le bollette che cita;
-- - periodi sovrapposti con importi diversi fra ordinarie → avviso, non blocco.
--
-- Il costo: se tutte le righe hanno una destinazione, la fattura va sulla commessa (o si ripartisce
-- fra più commesse in proporzione agli importi). Una scrittura «automatica» segue l'interruttore
-- del collegamento automatico; ogni collegamento va nella traccia acquisti_collegamenti.
-- Nessuna scrittura sui dati esistenti: le bollette storiche si leggono a lotti, dopo l'anteprima.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ── Tabelle ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.utenze (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('luce', 'gas', 'acqua', 'telefono', 'altro')),
  codice text NOT NULL,
  codice_chiave text NOT NULL,
  fornitore_piva text,
  fornitore_nome text,
  intestatario text,
  numero_contratto text,
  indirizzo_fornitura text,
  attiva boolean NOT NULL DEFAULT true,
  origine text NOT NULL DEFAULT 'bolletta' CHECK (origine IN ('bolletta', 'manuale')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT utenze_codice_unico UNIQUE (company_id, codice_chiave)
);
COMMENT ON TABLE public.utenze IS 'Contatori dell''azienda (POD luce, PDR gas, codice acqua/telefono). Il codice identifica, l''indirizzo aiuta.';

CREATE TABLE IF NOT EXISTS public.utenze_destinazioni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  utenza_id uuid NOT NULL REFERENCES public.utenze(id) ON DELETE CASCADE,
  destinazione_tipo text NOT NULL CHECK (destinazione_tipo IN ('sede', 'immobile', 'commessa')),
  sede_id uuid REFERENCES public.sedi(id) ON DELETE CASCADE,
  unita_id uuid REFERENCES public.unita_immobiliari(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  valido_dal date NOT NULL,
  valido_al date,
  stato text NOT NULL DEFAULT 'collegato' CHECK (stato IN ('collegato', 'annullato')),
  collegato_da uuid DEFAULT auth.uid(),
  collegato_il timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT utenze_destinazioni_una_sola CHECK (
    (destinazione_tipo = 'sede' AND sede_id IS NOT NULL AND unita_id IS NULL AND order_id IS NULL)
    OR (destinazione_tipo = 'immobile' AND unita_id IS NOT NULL AND sede_id IS NULL AND order_id IS NULL)
    OR (destinazione_tipo = 'commessa' AND order_id IS NOT NULL AND sede_id IS NULL AND unita_id IS NULL)),
  CONSTRAINT utenze_destinazioni_date CHECK (valido_al IS NULL OR valido_al >= valido_dal)
);
CREATE INDEX IF NOT EXISTS idx_utenze_destinazioni_utenza ON public.utenze_destinazioni (utenza_id, valido_dal);

CREATE TABLE IF NOT EXISTS public.bollette (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fattura_ricevuta_id uuid NOT NULL REFERENCES public.fatture_ricevute(id) ON DELETE CASCADE,
  fornitore_piva text,
  numero text,
  data date,
  tipo text NOT NULL CHECK (tipo IN ('ordinaria', 'conguaglio', 'nota_credito')),
  totale numeric(14,2),
  stato text NOT NULL CHECK (stato IN ('riconosciuta', 'doppione_sospetto', 'senza_utenze', 'scartata')),
  doppione_di uuid REFERENCES public.bollette(id) ON DELETE SET NULL,
  rettifica_di uuid[] NOT NULL DEFAULT '{}',
  avvisi jsonb NOT NULL DEFAULT '[]',
  costo_esito text,
  letta_il timestamptz NOT NULL DEFAULT now(),
  deciso_da uuid,
  deciso_il timestamptz,
  CONSTRAINT bollette_una_per_fattura UNIQUE (fattura_ricevuta_id)
);
CREATE INDEX IF NOT EXISTS idx_bollette_company ON public.bollette (company_id, data);

CREATE TABLE IF NOT EXISTS public.bollette_righe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bolletta_id uuid NOT NULL REFERENCES public.bollette(id) ON DELETE CASCADE,
  utenza_id uuid REFERENCES public.utenze(id) ON DELETE SET NULL,
  codice text NOT NULL,
  periodo_dal date,
  periodo_al date,
  consumo numeric,
  unita text,
  importo numeric(14,2) NOT NULL DEFAULT 0,
  letture text CHECK (letture IS NULL OR letture IN ('effettive', 'stimate')),
  righe_fattura integer[] NOT NULL DEFAULT '{}',
  prove jsonb NOT NULL DEFAULT '[]',
  CONSTRAINT bollette_righe_una_per_codice UNIQUE (bolletta_id, codice)
);
CREATE INDEX IF NOT EXISTS idx_bollette_righe_utenza ON public.bollette_righe (utenza_id, periodo_dal);

-- Lettura: chi vede i costi dell'azienda. Scrittura: solo dalle funzioni qui sotto.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['utenze', 'utenze_destinazioni', 'bollette', 'bollette_righe'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_lettura', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
      (SELECT public.user_can_access_company(company_id))
      AND (SELECT public.has_permission_for_company((SELECT auth.uid()), 'can_view_costs', company_id)))$p$, t || '_lettura', t);
  END LOOP;
END $$;

-- ── Chi può decidere ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.bollette_puo_decidere(p_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      OR (auth.uid() IS NOT NULL
          AND coalesce(public.has_permission_for_company(auth.uid(), 'can_view_costs', p_company), false)
          AND NOT coalesce(public.utente_sola_lettura(p_company), false))
$$;

-- ── Il costo della bolletta sulla commessa ───────────────────────────────────
-- Esiti: 'applicato', 'proposta' (interruttore spento), 'generale' (tutto su sedi), 'da_collegare'
-- (un'utenza senza destinazione), 'senza_costo' (fattura non ancora contabilizzata: resta il
-- suggerimento), 'gia_assegnato' (una persona o un'altra regola l'ha già messo), 'misto'
-- (parte generale e parte commesse: da ripartire a mano), 'sospesa' (doppione o scartata).
CREATE OR REPLACE FUNCTION public.bolletta_applica_costo(p_bolletta uuid, p_esito text DEFAULT 'manuale')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET lock_timeout TO '3s' AS $$
DECLARE
  b public.bollette; f record; c record; r record;
  v_ordini jsonb := '{}'; v_generale numeric := 0; v_totale numeric := 0; v_mancano int := 0;
  v_ord uuid; v_imp numeric; v_alloc jsonb := '[]'; v_n int; v_esito text;
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
    v_totale := v_totale + abs(r.importo);
    IF r.dest IS NULL THEN v_mancano := v_mancano + 1;
    ELSIF r.order_id IS NULL THEN v_generale := v_generale + abs(r.importo);
    ELSE v_ordini := jsonb_set(v_ordini, ARRAY[r.order_id::text], to_jsonb(coalesce((v_ordini ->> r.order_id::text)::numeric, 0) + abs(r.importo)));
    END IF;
  END LOOP;

  IF v_mancano > 0 THEN v_esito := 'da_collegare';
  ELSIF v_ordini = '{}'::jsonb THEN v_esito := 'generale';
  ELSIF v_generale > 0 THEN v_esito := 'misto';
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

-- ── Registrare la lettura di una bolletta (dal giro del server) ───────────────
-- p_lettura: { tipo, numero, data, totale, fatture_collegate: [numeri], utenze: [{ codice,
-- tipo_utenza, periodo_dal, periodo_al, consumo, unita, importo, letture, indirizzo, righe }] }.
-- Idempotente: una fattura ha una sola bolletta; rilanciata restituisce quella che c'è.
CREATE OR REPLACE FUNCTION public.bolletta_registra(p_fattura uuid, p_lettura jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET lock_timeout TO '3s' AS $$
DECLARE
  f record; v_b uuid; v_tipo text; u jsonb; v_ut uuid; v_chiave text; v_riga uuid; o record;
  v_stato text := 'riconosciuta'; v_doppione uuid; v_rettifica uuid[] := '{}'; v_avvisi jsonb := '[]'; v_data date; v_esito jsonb;
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') <> 'service_role' AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'La lettura delle bollette la registra solo il giro del server.' USING errcode = '42501';
  END IF;
  SELECT id, company_id, cedente_piva, cedente_ragione_sociale, numero_fattura, data_fattura, tipo_documento, totale_documento, imponibile_totale
    INTO f FROM public.fatture_ricevute WHERE id = p_fattura FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fattura non trovata.' USING errcode = 'P0002'; END IF;

  SELECT id INTO v_b FROM public.bollette WHERE fattura_ricevuta_id = f.id;
  IF v_b IS NOT NULL THEN RETURN jsonb_build_object('bolletta_id', v_b, 'gia_letta', true); END IF;

  -- Una lettura alla volta per azienda: il controllo dei doppioni vede anche quella in corso.
  PERFORM pg_advisory_xact_lock(hashtextextended(f.company_id::text || ':bollette', 0));

  v_tipo := CASE WHEN f.tipo_documento IN ('TD04', 'passive_credit_note') THEN 'nota_credito'
                 WHEN p_lettura ->> 'tipo' = 'conguaglio' THEN 'conguaglio' ELSE 'ordinaria' END;
  v_data := coalesce(f.data_fattura, (p_lettura ->> 'data')::date);

  -- Stesso fornitore, stesso numero, stesso anno: è lo stesso documento arrivato due volte.
  SELECT b.id INTO v_doppione FROM public.bollette b
   WHERE b.company_id = f.company_id AND b.stato <> 'scartata'
     AND public.partner_tax_key(b.fornitore_piva) = public.partner_tax_key(f.cedente_piva)
     AND upper(regexp_replace(coalesce(b.numero, ''), '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(coalesce(f.numero_fattura, ''), '[^A-Za-z0-9]', '', 'g'))
     AND coalesce(f.numero_fattura, '') <> ''
     AND extract(year FROM b.data) = extract(year FROM v_data)
   LIMIT 1;
  IF v_doppione IS NOT NULL THEN
    v_stato := 'doppione_sospetto';
    v_avvisi := v_avvisi || jsonb_build_object('codice', 'stesso_numero', 'testo', 'Stesso fornitore, stesso numero e stesso anno di un''altra bolletta: è lo stesso documento.');
  END IF;

  INSERT INTO public.bollette (company_id, fattura_ricevuta_id, fornitore_piva, numero, data, tipo, totale, stato, doppione_di)
  VALUES (f.company_id, f.id, f.cedente_piva, f.numero_fattura, v_data, v_tipo, coalesce(f.imponibile_totale, f.totale_documento),
          CASE WHEN jsonb_array_length(coalesce(p_lettura -> 'utenze', '[]')) = 0 THEN 'senza_utenze' ELSE v_stato END, v_doppione)
  RETURNING id INTO v_b;
  IF jsonb_array_length(coalesce(p_lettura -> 'utenze', '[]')) = 0 THEN
    RETURN jsonb_build_object('bolletta_id', v_b, 'stato', 'senza_utenze');
  END IF;

  FOR u IN SELECT * FROM jsonb_array_elements(p_lettura -> 'utenze') LOOP
    v_chiave := upper(regexp_replace(coalesce(u ->> 'codice', ''), '[^A-Za-z0-9]', '', 'g'));
    CONTINUE WHEN v_chiave = '';
    -- L'utenza dal codice: esiste già (anche con un altro fornitore) o nasce adesso, senza destinazione.
    INSERT INTO public.utenze (company_id, tipo, codice, codice_chiave, fornitore_piva, fornitore_nome, indirizzo_fornitura, numero_contratto)
    VALUES (f.company_id, coalesce(nullif(u ->> 'tipo_utenza', ''), 'altro'), u ->> 'codice', v_chiave, f.cedente_piva, f.cedente_ragione_sociale,
            nullif(u ->> 'indirizzo', ''), nullif(p_lettura ->> 'contratto', ''))
    ON CONFLICT (company_id, codice_chiave) DO UPDATE
      SET indirizzo_fornitura = coalesce(public.utenze.indirizzo_fornitura, excluded.indirizzo_fornitura),
          fornitore_piva = excluded.fornitore_piva, fornitore_nome = excluded.fornitore_nome,
          numero_contratto = coalesce(excluded.numero_contratto, public.utenze.numero_contratto), updated_at = now()
    RETURNING id INTO v_ut;

    INSERT INTO public.bollette_righe (company_id, bolletta_id, utenza_id, codice, periodo_dal, periodo_al, consumo, unita, importo, letture, righe_fattura, prove)
    VALUES (f.company_id, v_b, v_ut, u ->> 'codice', (u ->> 'periodo_dal')::date, (u ->> 'periodo_al')::date, (u ->> 'consumo')::numeric,
            nullif(u ->> 'unita', ''), coalesce((u ->> 'importo')::numeric, 0), nullif(u ->> 'letture', ''),
            coalesce((SELECT array_agg(x::int) FROM jsonb_array_elements_text(coalesce(u -> 'righe', '[]')) x), '{}'),
            jsonb_build_array(jsonb_build_object('campo', 'codice_utenza', 'ruolo', 'identifica', 'esito', 'uguale', 'trovato', u ->> 'codice',
                                                 'testo', 'Codice dell''utenza nella fattura: ' || (u ->> 'codice'))))
    ON CONFLICT (bolletta_id, codice) DO NOTHING
    RETURNING id INTO v_riga;
    CONTINUE WHEN v_riga IS NULL;

    -- Le altre bollette della stessa utenza su un periodo che si sovrappone.
    FOR o IN
      SELECT ob.id AS bolletta, ob.tipo, ob.numero, orr.importo, orr.letture, orr.periodo_dal, orr.periodo_al
        FROM public.bollette_righe orr JOIN public.bollette ob ON ob.id = orr.bolletta_id
       WHERE orr.utenza_id = v_ut AND ob.id <> v_b AND ob.company_id = f.company_id AND ob.stato NOT IN ('scartata')
         AND orr.periodo_dal IS NOT NULL AND (u ->> 'periodo_dal') IS NOT NULL
         AND orr.periodo_dal <= (u ->> 'periodo_al')::date AND (u ->> 'periodo_dal')::date <= orr.periodo_al
    LOOP
      IF v_tipo = 'nota_credito' THEN
        CONTINUE;  -- una nota di credito si sovrappone di proposito
      ELSIF v_tipo = 'conguaglio' OR (u ->> 'letture' = 'effettive' AND o.letture = 'stimate') THEN
        v_rettifica := array_append(v_rettifica, o.bolletta);
      ELSIF o.tipo = 'ordinaria' AND abs(abs(o.importo) - abs(coalesce((u ->> 'importo')::numeric, 0))) <= 0.01 THEN
        v_stato := 'doppione_sospetto';
        v_doppione := coalesce(v_doppione, o.bolletta);
        v_avvisi := v_avvisi || jsonb_build_object('codice', 'stesso_periodo_stesso_importo',
          'testo', format('Utenza %s: stesso periodo e stesso importo della bolletta %s. Doppione? Lo decide una persona.', u ->> 'codice', coalesce(o.numero, '')));
      ELSE
        v_avvisi := v_avvisi || jsonb_build_object('codice', 'periodo_sovrapposto',
          'testo', format('Utenza %s: il periodo si sovrappone alla bolletta %s con un importo diverso.', u ->> 'codice', coalesce(o.numero, '')));
      END IF;
    END LOOP;
  END LOOP;

  -- Nota di credito: storna le bollette che cita (numero tra le fatture collegate).
  IF v_tipo = 'nota_credito' THEN
    SELECT coalesce(array_agg(b.id), '{}') INTO v_rettifica FROM public.bollette b
     WHERE b.company_id = f.company_id AND b.id <> v_b
       AND upper(regexp_replace(coalesce(b.numero, ''), '[^A-Za-z0-9]', '', 'g')) IN (
         SELECT upper(regexp_replace(x, '[^A-Za-z0-9]', '', 'g')) FROM jsonb_array_elements_text(coalesce(p_lettura -> 'fatture_collegate', '[]')) x);
  END IF;

  UPDATE public.bollette
     SET stato = v_stato, doppione_di = v_doppione, avvisi = v_avvisi,
         rettifica_di = (SELECT coalesce(array_agg(DISTINCT x), '{}') FROM unnest(v_rettifica) x)
   WHERE id = v_b;

  v_esito := public.bolletta_applica_costo(v_b, 'automatico');
  RETURN jsonb_build_object('bolletta_id', v_b, 'stato', v_stato, 'costo', v_esito, 'avvisi', v_avvisi);
END $$;

-- ── Collegare un'utenza a sede, immobile o commessa (decide una persona) ──────
CREATE OR REPLACE FUNCTION public.utenza_collega_destinazione(p_utenza uuid, p_tipo text, p_destinazione uuid, p_valido_dal date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET lock_timeout TO '3s' AS $$
DECLARE u public.utenze; v_dal date := coalesce(p_valido_dal, '-infinity'::date); v_id uuid; v_b uuid; v_n int := 0;
BEGIN
  SELECT * INTO u FROM public.utenze WHERE id = p_utenza FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Utenza non trovata.' USING errcode = 'P0002'; END IF;
  IF auth.uid() IS NULL OR NOT private.bollette_puo_decidere(u.company_id) THEN
    RAISE EXCEPTION 'Il tuo ruolo non permette di collegare le utenze.' USING errcode = '42501';
  END IF;
  IF p_tipo IS NOT NULL AND p_tipo NOT IN ('sede', 'immobile', 'commessa') THEN
    RAISE EXCEPTION 'Destinazione non valida: sede, immobile o commessa.' USING errcode = '22023';
  END IF;
  -- La destinazione deve essere della stessa azienda.
  IF (p_tipo = 'sede' AND NOT EXISTS (SELECT 1 FROM public.sedi WHERE id = p_destinazione AND company_id = u.company_id))
     OR (p_tipo = 'immobile' AND NOT EXISTS (SELECT 1 FROM public.unita_immobiliari WHERE id = p_destinazione AND company_id = u.company_id))
     OR (p_tipo = 'commessa' AND NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_destinazione AND company_id = u.company_id AND deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'La destinazione non è di questa azienda.' USING errcode = '42501';
  END IF;

  -- Le destinazioni da quella data in poi sono sostituite; quella in corso si chiude il giorno prima.
  UPDATE public.utenze_destinazioni SET stato = 'annullato'
   WHERE utenza_id = u.id AND stato = 'collegato' AND valido_dal >= v_dal;
  UPDATE public.utenze_destinazioni SET valido_al = v_dal - 1
   WHERE utenza_id = u.id AND stato = 'collegato' AND valido_dal < v_dal AND (valido_al IS NULL OR valido_al >= v_dal);

  IF p_tipo IS NOT NULL THEN
    INSERT INTO public.utenze_destinazioni (company_id, utenza_id, destinazione_tipo, sede_id, unita_id, order_id, valido_dal)
    VALUES (u.company_id, u.id, p_tipo,
            CASE WHEN p_tipo = 'sede' THEN p_destinazione END,
            CASE WHEN p_tipo = 'immobile' THEN p_destinazione END,
            CASE WHEN p_tipo = 'commessa' THEN p_destinazione END, v_dal)
    RETURNING id INTO v_id;
  END IF;

  -- Le bollette di questa utenza il cui costo non è ancora assegnato: deciso da una persona.
  FOR v_b IN SELECT DISTINCT br.bolletta_id FROM public.bollette_righe br JOIN public.bollette b ON b.id = br.bolletta_id
              WHERE br.utenza_id = u.id AND b.stato = 'riconosciuta'
                AND coalesce(b.costo_esito, '') IN ('', 'da_collegare', 'senza_costo', 'proposta', 'generale', 'misto')
  LOOP
    PERFORM public.bolletta_applica_costo(v_b, 'manuale');
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('destinazione_id', v_id, 'bollette_riviste', v_n);
END $$;

-- ── Decidere un doppione sospetto ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bolletta_decidi(p_bolletta uuid, p_decisione text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.bollette;
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
    UPDATE public.bollette SET stato = 'scartata', costo_esito = 'sospesa', deciso_da = auth.uid(), deciso_il = now() WHERE id = b.id;
    RETURN jsonb_build_object('esito', 'scartata');
  END IF;
  RAISE EXCEPTION 'Decisione non valida: non_doppione o scarta.' USING errcode = '22023';
END $$;

REVOKE ALL ON FUNCTION private.bollette_puo_decidere(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bolletta_applica_costo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bolletta_applica_costo(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.bolletta_registra(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bolletta_registra(uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.utenza_collega_destinazione(uuid, text, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.utenza_collega_destinazione(uuid, text, uuid, date) TO authenticated;
REVOKE ALL ON FUNCTION public.bolletta_decidi(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bolletta_decidi(uuid, text) TO authenticated;
