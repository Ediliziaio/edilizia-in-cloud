-- Fatture verso lo SDI: gli esiti si registrano, gli scarti si correggono,
-- gli incassi non si perdono (24/09/2026).
--
-- 1. sdi_identificativo non era fra i campi scrivibili di una fattura emessa.
--    sdi-stato-tick lo scrive insieme al primo esito (consegna o scarto): il
--    trigger rifiutava l'intero aggiornamento, e la fattura sarebbe rimasta
--    «in attesa di esito» per sempre. Provato il 24/09 in una transazione
--    annullata: «non si possono modificare sdi_identificativo».
--
-- 2. Una fattura scartata dallo SDI (notifica NS) per l'Agenzia delle Entrate
--    non è mai stata emessa (circolare 13/E del 2 luglio 2018, par. 3.1): si
--    corregge e si rimanda entro cinque giorni con lo stesso numero e la
--    stessa data. Il trigger la trattava come emessa e suggeriva una nota di
--    credito, e il «Reinvia» rispediva lo stesso XML sbagliato. Ora si corregge
--    tutto tranne ciò che la identifica (numero, serie, data, tipo, azienda);
--    ogni modifica resta nello storico come prima.
--
-- 3. claim_documento_per_invio: l'esito dell'ente (EC01, EC02) e la mancata
--    consegna (MC) chiudono la trasmissione come consegna e decorrenza: una
--    fattura rifiutata dall'ente si corregge con una nota di credito, non si
--    rispedisce. Una fattura incassata e poi scartata, invece, si rimanda.
--
-- 4. storna_incasso_atomico e il trigger dei movimenti di cassa: tolto
--    l'incasso, la fattura torna allo stato del suo invio (consegnata,
--    accettata, inviata), non a «emessa» come se allo SDI non fosse mai
--    partita. E un incasso durante l'invio non tocca lo stato «in_invio».
--
-- 5. L'esito dello SDI (sdi_stato, identificativi, consegna) lo scrive solo il
--    sistema: da quando lo scarto riapre la fattura, un utente che scrivesse
--    «NS» a mano potrebbe modificarne una già consegnata.
--
-- Solo funzioni sostituite: nessuna riga riscritta, nessun lock sulle tabelle.

-- ── 1. Campi scrivibili dopo l'emissione ────────────────────────────────
CREATE OR REPLACE FUNCTION public.documento_fiscale_campi_modificabili()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT ARRAY[
    'stato', 'importo_pagato', 'pagato_at', 'deleted_at',
    'sdi_id_trasmissione', 'sdi_stato', 'sdi_data_consegna', 'sdi_file_xml_url',
    'sdi_ricevuta_url', 'sdi_errori', 'sdi_notifica_tipo', 'sdi_firmato',
    'sdi_file_p7m_url', 'sdi_identificativo', 'trasmissione',
    'pdf_url', 'note_interne', 'updated_at',
    'ddt_fatturato', 'ddt_fattura_id', 'documento_correlato_id',
    'anagrafica_id', 'ordine_id'
  ]::text[];
$function$;

-- ── 2. Il trigger: la fattura scartata si corregge ──────────────────────
CREATE OR REPLACE FUNCTION public.documenti_fiscali_proteggi_emessi()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_consentiti text[] := public.documento_fiscale_campi_modificabili();
  -- Ciò che identifica una fattura scartata: per rimandarla resta com'era.
  v_fissi_scartata text[] := ARRAY['id', 'company_id', 'tipo', 'numero', 'numero_progressivo',
                                   'anno', 'serie', 'data_emissione', 'created_at'];
  v_scartata   boolean := false;
  v_prima      jsonb;
  v_dopo       jsonb;
  v_campo      text;
  v_violati    text[] := '{}';
  v_toccati    text[] := '{}';
  v_diff       jsonb  := '{}'::jsonb;
  v_motivo     text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.documento_fiscale_e_immutabile(OLD.tipo, OLD.stato) THEN
      -- Il consiglio dipende dallo stato: a un documento gia' annullato non
      -- si puo' dire "annullalo".
      IF OLD.stato = 'annullata' THEN
        v_motivo := format(
          'Un documento %s annullato non si cancella: la conservazione è obbligatoria anche per i documenti annullati. Resta nello storico.',
          OLD.tipo);
      ELSE
        v_motivo := format(
          'Un documento %s in stato "%s" non si cancella: la conservazione è obbligatoria. Se non vale più, annullalo: resterà nello storico come annullato.',
          OLD.tipo, OLD.stato);
      END IF;
      RAISE LOG 'documenti_fiscali: DELETE rifiutata su % (% %) da % / %',
        OLD.id, OLD.tipo, OLD.stato, coalesce(auth.uid()::text,'—'), current_user;
      RAISE EXCEPTION '%', v_motivo USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- L'esito dello SDI lo scrivono solo le funzioni del sistema (invia-sdi,
  -- sdi-stato-tick, sdi-webhook, con la chiave di servizio), mai un utente:
  -- è l'esito a dire se una fattura è stata scartata, e quindi se si può
  -- correggere. Senza questo, scrivere «NS» a mano bastava a riaprire una
  -- fattura consegnata.
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
     AND (NEW.sdi_stato IS DISTINCT FROM OLD.sdi_stato
          OR NEW.sdi_id_trasmissione IS DISTINCT FROM OLD.sdi_id_trasmissione
          OR NEW.sdi_identificativo IS DISTINCT FROM OLD.sdi_identificativo
          OR NEW.sdi_notifica_tipo IS DISTINCT FROM OLD.sdi_notifica_tipo
          OR NEW.sdi_data_consegna IS DISTINCT FROM OLD.sdi_data_consegna) THEN
    RAISE EXCEPTION 'Lo stato della fattura allo SDI lo aggiorna il sistema, non si scrive a mano.'
      USING ERRCODE = '42501';
  END IF;

  -- Bozza di un documento che va allo SDI (24/09/2026): stato e numero li
  -- cambia solo documento_emetti, che controlla date e numerazione. Eliminarla
  -- (annullata) resta possibile. Prima bastava una patch qualunque.
  IF OLD.stato = 'bozza'
     AND OLD.tipo IN ('fattura','fattura_pa','nota_credito','nota_debito','autofattura','fattura_riepilogativa')
     AND coalesce(current_setting('fatturazione.emissione', true), '') <> 'on' THEN
    IF NEW.stato NOT IN ('bozza', 'annullata') THEN
      RAISE EXCEPTION 'Per emettere il documento usa «Emetti»: il numero e i controlli sulla data si fanno lì. Se il pulsante non c''è, ricarica la pagina.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.numero IS DISTINCT FROM OLD.numero
       OR NEW.numero_progressivo IS DISTINCT FROM OLD.numero_progressivo
       OR NEW.anno IS DISTINCT FROM OLD.anno THEN
      RAISE EXCEPTION 'Il numero di una fattura lo assegna l''emissione, non si scrive a mano.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT public.documento_fiscale_e_immutabile(OLD.tipo, OLD.stato) THEN
    RETURN NEW;
  END IF;

  -- Scartata dallo SDI (NS): per l'Agenzia non è mai stata emessa, si corregge
  -- e si rimanda con lo stesso numero e la stessa data (circ. 13/E/2018).
  v_scartata := upper(coalesce(OLD.sdi_stato, '')) = 'NS'
                AND OLD.stato NOT IN ('annullata', 'stornata');

  v_prima := to_jsonb(OLD);
  v_dopo  := to_jsonb(NEW);

  FOR v_campo IN SELECT jsonb_object_keys(v_dopo) LOOP
    IF v_prima -> v_campo IS DISTINCT FROM v_dopo -> v_campo THEN
      v_toccati := v_toccati || v_campo;
      v_diff := v_diff || jsonb_build_object(v_campo, jsonb_build_object(
        'prima', left(coalesce(v_prima ->> v_campo, ''), 500),
        'dopo',  left(coalesce(v_dopo  ->> v_campo, ''), 500)
      ));
      IF NOT (v_campo = ANY(v_consentiti))
         AND NOT (v_scartata AND NOT (v_campo = ANY(v_fissi_scartata))) THEN
        v_violati := v_violati || v_campo;
      END IF;
    END IF;
  END LOOP;

  IF NEW.stato = 'bozza' AND OLD.stato IS DISTINCT FROM 'bozza' THEN
    -- ::text obbligatorio: `text[] || 'letterale'` viene risolto come
    -- concatenazione fra array, il letterale viene letto come array literal e
    -- salta fuori un 22P02 al posto del messaggio giusto.
    v_violati := v_violati || 'stato→bozza'::text;
  END IF;

  IF cardinality(v_violati) > 0 THEN
    IF v_scartata THEN
      v_motivo := format(
        'Fattura n. %s scartata dallo SDI: si corregge e si rimanda con lo stesso numero e la stessa data (circolare 13/E del 2018), quindi non si possono cambiare %s.',
        OLD.numero, array_to_string(v_violati, ', '));
    ELSE
      v_motivo := format(
        'Documento %s n. %s in stato "%s": non si possono modificare %s. Per correggerlo emetti una nota di credito.',
        OLD.tipo, OLD.numero, OLD.stato, array_to_string(v_violati, ', '));
    END IF;

    RAISE LOG 'documenti_fiscali: UPDATE rifiutata su % (% n.% %) campi=% da % / %',
      OLD.id, OLD.tipo, OLD.numero, OLD.stato,
      array_to_string(v_violati, ','), coalesce(auth.uid()::text,'—'), current_user;

    RAISE EXCEPTION '%', v_motivo USING ERRCODE = '42501';
  END IF;

  IF cardinality(v_toccati) > 0
     AND v_toccati <> ARRAY['updated_at']::text[] THEN
    INSERT INTO public.documenti_fiscali_storico (
      documento_id, company_id, operazione, esito,
      stato_prima, stato_dopo, campi, differenze
    ) VALUES (
      OLD.id, OLD.company_id, 'update', 'applicata',
      OLD.stato, NEW.stato, v_toccati, v_diff
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 3. Chi si può (ri)trasmettere ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_documento_per_invio(p_documento_id uuid)
 RETURNS TABLE(claimed boolean, previous_stato text, current_stato text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stato text;
  v_sdi_id text;
  v_sdi_stato text;
  v_mai_trasmessa boolean;
  v_scartata boolean;
BEGIN
  -- [audit sicurezza 2026-08-27] guardia anti cross-tenant
  IF (SELECT x.company_id FROM public.documenti_fiscali x WHERE x.id = p_documento_id) IS NOT NULL
     AND NOT public.user_can_access_company((SELECT x.company_id FROM public.documenti_fiscali x WHERE x.id = p_documento_id)) THEN
    RAISE EXCEPTION 'accesso negato: azienda non consentita' USING ERRCODE = '42501';
  END IF;

  SELECT d.stato, d.sdi_id_trasmissione, d.sdi_stato
    INTO v_stato, v_sdi_id, v_sdi_stato
    FROM public.documenti_fiscali d
   WHERE d.id = p_documento_id AND d.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text; RETURN;
  END IF;

  v_sdi_stato := upper(coalesce(v_sdi_stato, ''));
  -- In carico allo SDI, consegnata, messa a disposizione, accettata o
  -- rifiutata dall'ente: la trasmissione è chiusa, un nuovo invio sarebbe un
  -- doppione. Per correggerla c'è la nota di credito.
  IF v_sdi_stato IN ('AT', 'RC', 'MC', 'DT', 'EC', 'EC01', 'EC02') THEN
    RETURN QUERY SELECT false, v_stato, v_stato; RETURN;
  END IF;

  v_mai_trasmessa := coalesce(v_sdi_id, '') = '' AND v_sdi_stato = '';
  v_scartata := v_sdi_stato = 'NS';

  IF v_stato IN ('emessa', 'rifiutata', 'scartata')
     OR ((v_mai_trasmessa OR v_scartata) AND v_stato IN ('pagata', 'parzialmente_pagata')) THEN
    UPDATE public.documenti_fiscali SET stato = 'in_invio', updated_at = now() WHERE id = p_documento_id;
    RETURN QUERY SELECT true, v_stato, 'in_invio'::text;
  ELSE
    RETURN QUERY SELECT false, v_stato, v_stato;
  END IF;
END;
$function$;

-- ── 4. Tolto l'incasso, lo stato torna quello dell'invio ─────────────────
-- Lo stato di una fattura non incassata, secondo il suo invio allo SDI.
CREATE OR REPLACE FUNCTION public.stato_documento_da_sdi(p_sdi_stato text, p_sdi_id text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN upper(coalesce(p_sdi_stato, '')) = 'RC' THEN 'consegnata'
    WHEN upper(coalesce(p_sdi_stato, '')) IN ('EC01', 'DT') THEN 'accettata'
    WHEN upper(coalesce(p_sdi_stato, '')) IN ('NS', 'EC02') THEN 'rifiutata'
    WHEN coalesce(p_sdi_id, '') <> '' THEN 'inviata_sdi'
    ELSE 'emessa'
  END;
$function$;
-- Serve solo alle funzioni qui sotto, che girano come proprietario.
REVOKE ALL ON FUNCTION public.stato_documento_da_sdi(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.storna_incasso_atomico(p_company_id uuid, p_movimento_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_importo numeric; v_documento_id uuid; v_totale numeric; v_pagato numeric;
  v_nuovo_pagato numeric; v_nuovo_stato text; v_sdi_stato text; v_sdi_id text;
BEGIN
  IF public.get_my_company_id() IS DISTINCT FROM p_company_id THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Accesso negato: non autorizzato per questa azienda';
    END IF;
  END IF;

  DELETE FROM movimenti_cassa_native WHERE id=p_movimento_id AND company_id=p_company_id
  RETURNING importo, documento_id INTO v_importo, v_documento_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non trovato o accesso negato'; END IF;

  IF v_documento_id IS NOT NULL THEN
    SELECT totale_da_pagare, importo_pagato, sdi_stato, sdi_id_trasmissione
      INTO v_totale, v_pagato, v_sdi_stato, v_sdi_id
      FROM documenti_fiscali WHERE id=v_documento_id AND company_id=p_company_id FOR UPDATE;
    IF FOUND THEN
      v_nuovo_pagato := GREATEST(0, v_pagato - v_importo);
      v_nuovo_stato := CASE
        WHEN v_nuovo_pagato >= v_totale THEN 'pagata'
        WHEN v_nuovo_pagato > 0 THEN 'parzialmente_pagata'
        ELSE public.stato_documento_da_sdi(v_sdi_stato, v_sdi_id) END;
      UPDATE documenti_fiscali SET importo_pagato=v_nuovo_pagato, stato=v_nuovo_stato,
        pagato_at=CASE WHEN v_nuovo_stato='pagata' THEN pagato_at ELSE NULL END, updated_at=now()
      WHERE id=v_documento_id;
    END IF;
  END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.update_fattura_stato_on_movimento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_doc_id UUID; v_totale NUMERIC; v_incassato NUMERIC; v_nuovo TEXT;
  v_sdi_stato TEXT; v_sdi_id TEXT;
BEGIN
  v_doc_id := COALESCE(NEW.documento_id, OLD.documento_id);
  IF v_doc_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT totale_da_pagare, sdi_stato, sdi_id_trasmissione INTO v_totale, v_sdi_stato, v_sdi_id
    FROM public.documenti_fiscali WHERE id=v_doc_id;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE(SUM(importo),0) INTO v_incassato FROM public.movimenti_cassa_native
    WHERE documento_id=v_doc_id AND tipo='incasso';
  IF v_incassato >= v_totale THEN v_nuovo := 'pagata';
  ELSIF v_incassato > 0 THEN v_nuovo := 'parzialmente_pagata';
  -- Niente incassato: lo stato è quello dell'invio allo SDI, non «emessa».
  ELSE v_nuovo := public.stato_documento_da_sdi(v_sdi_stato, v_sdi_id); END IF;
  UPDATE public.documenti_fiscali SET stato=v_nuovo, importo_pagato=v_incassato,
    pagato_at=CASE WHEN v_incassato >= v_totale THEN NOW() ELSE NULL END, updated_at=NOW()
  -- in_invio: la trasmissione in corso lo rimette a posto da sola.
  WHERE id=v_doc_id AND stato NOT IN ('annullata','rifiutata','bozza','in_invio');
  RETURN COALESCE(NEW, OLD);
END; $function$;
