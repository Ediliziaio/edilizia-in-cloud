-- Il numero della fattura si assegna all'emissione, e le date seguono i numeri
-- (24/09/2026).
--
-- Art. 21 c. 2 lett. b DPR 633/72: la fattura porta un «numero progressivo che
-- la identifichi in modo univoco». Fino a oggi il numero nasceva con la BOZZA:
-- bastava aprire «Nuova fattura» per consumarne uno. Eliminare la bozza lasciava
-- un buco nella serie trasmessa allo SDI (FT-0037, FT-0039: dov'è la 38?), ed
-- emettere le bozze in un ordine diverso da quello di creazione dava fatture con
-- numero più alto e data più vecchia. Nessun controllo impediva neppure una data
-- futura, che lo SDI scarta.
--
-- Ora:
--   1. genera_numero_documento_native: nota di debito e fattura differita
--      (fattura_riepilogativa) stanno nella serie delle fatture. Prima cadevano
--      nel ramo di riserva: prefisso «DOC» sul contatore delle fatture, quindi un
--      buco nella serie FT a ogni nota di debito.
--   2. documento_crea: le bozze di documenti fiscali nascono con un segnaposto
--      («Bozza 1A2B3C4D») e sempre in bozza; preventivi, proforma e DDT come prima.
--   3. documento_emetti: l'unica strada da bozza a emessa. Assegna il numero
--      (l'ultimo della serie + 1, anche per una fattura dell'anno prima emessa a
--      gennaio), rifiuta la data futura e la data fuori ordine rispetto alle
--      fatture già emesse della stessa serie. Se qualcosa non va, il contatore
--      torna indietro con tutto il resto: nessun numero bruciato.
--   4. documenti_fiscali_proteggi_emessi: una bozza fiscale non cambia stato né
--      numero se non passando da documento_emetti (documento_fiscale_aggiorna
--      accetta qualunque colonna).
--
-- Idempotente.

set local lock_timeout = '5s';

-- 1 ──────────────────────────────────────────────────────────────────────────
create or replace function public.genera_numero_documento_native(p_company_id uuid, p_tipo text, p_anno integer default (extract(year from now()))::integer)
 returns text
 language plpgsql
 set search_path to 'public'
as $function$
DECLARE
  v_prefisso TEXT;
  v_contatore INTEGER;
  v_ana public.anagrafica_azienda%ROWTYPE;
  v_anno_corrente INTEGER;
BEGIN
  SELECT * INTO v_ana FROM public.anagrafica_azienda
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anagrafica azienda non trovata per company_id: %', p_company_id;
  END IF;

  CASE p_tipo
    -- Fatture (tutte le varianti usano lo stesso contatore). Dal 24/09/2026
    -- anche nota di debito e fattura differita: prima finivano nel ramo di
    -- riserva («DOC» sul contatore delle fatture) e bucavano la serie FT.
    WHEN 'fattura', 'fattura_pa', 'autofattura', 'nota_debito', 'fattura_riepilogativa',
         'integrazione_servizi_estero', 'integrazione_beni_ue', 'integrazione_beni_extra_ue' THEN
      v_prefisso := COALESCE(v_ana.prefisso_fattura, 'FT');
      -- Reset annuale
      IF COALESCE(v_ana.anno_corrente_fattura, 0) < p_anno THEN
        UPDATE public.anagrafica_azienda
        SET ultimo_numero_fattura = 1,
            anno_corrente_fattura = p_anno
        WHERE company_id = p_company_id
        RETURNING ultimo_numero_fattura INTO v_contatore;
      ELSE
        UPDATE public.anagrafica_azienda
        SET ultimo_numero_fattura = ultimo_numero_fattura + 1
        WHERE company_id = p_company_id
        RETURNING ultimo_numero_fattura INTO v_contatore;
      END IF;

    WHEN 'nota_credito' THEN
      v_prefisso := COALESCE(v_ana.prefisso_nc, 'NC');
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_nc = ultimo_numero_nc + 1
      WHERE company_id = p_company_id
      RETURNING ultimo_numero_nc INTO v_contatore;

    WHEN 'ddt' THEN
      v_prefisso := COALESCE(v_ana.prefisso_ddt, 'DDT');
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_ddt = ultimo_numero_ddt + 1
      WHERE company_id = p_company_id
      RETURNING ultimo_numero_ddt INTO v_contatore;

    WHEN 'preventivo' THEN
      v_prefisso := COALESCE(v_ana.prefisso_preventivo, 'PRV');
      -- Reset annuale preventivo
      IF COALESCE(v_ana.anno_corrente_preventivo, 0) < p_anno THEN
        UPDATE public.anagrafica_azienda
        SET ultimo_numero_preventivo = 1,
            anno_corrente_preventivo = p_anno
        WHERE company_id = p_company_id
        RETURNING ultimo_numero_preventivo INTO v_contatore;
      ELSE
        UPDATE public.anagrafica_azienda
        SET ultimo_numero_preventivo = ultimo_numero_preventivo + 1
        WHERE company_id = p_company_id
        RETURNING ultimo_numero_preventivo INTO v_contatore;
      END IF;

    WHEN 'proforma' THEN
      -- Fix P2-01: proforma usa il proprio contatore separato, non quello dei preventivi
      v_prefisso := COALESCE(v_ana.prefisso_proforma, 'PF');
      -- Reset annuale proforma
      IF COALESCE(v_ana.anno_corrente_proforma, 0) < p_anno THEN
        UPDATE public.anagrafica_azienda
        SET ultimo_numero_proforma = 1,
            anno_corrente_proforma = p_anno
        WHERE company_id = p_company_id
        RETURNING ultimo_numero_proforma INTO v_contatore;
      ELSE
        UPDATE public.anagrafica_azienda
        SET ultimo_numero_proforma = ultimo_numero_proforma + 1
        WHERE company_id = p_company_id
        RETURNING ultimo_numero_proforma INTO v_contatore;
      END IF;

    ELSE
      -- Fallback: usa contatore fattura
      v_prefisso := 'DOC';
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_fattura = ultimo_numero_fattura + 1
      WHERE company_id = p_company_id
      RETURNING ultimo_numero_fattura INTO v_contatore;
  END CASE;

  RETURN v_prefisso || '-' || p_anno || '-' || LPAD(v_contatore::TEXT, 4, '0');
END;
$function$;

-- 2 ──────────────────────────────────────────────────────────────────────────
create or replace function public.documento_crea(p_company_id uuid, p_dati jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_tipo    text;
  v_anno    integer := extract(year from (now() at time zone 'Europe/Rome'))::integer;
  v_numero  text;
  v_prog    integer;
  v_riga    public.documenti_fiscali%rowtype;
  v_id      uuid := gen_random_uuid();
  v_stato   text;
  c_ammessi text[] := array['fattura','fattura_pa','nota_credito','nota_debito',
                            'autofattura','fattura_riepilogativa','proforma',
                            'preventivo','ddt'];
  -- Documenti che vanno allo SDI: il numero lo assegna documento_emetti.
  c_fiscali text[] := array['fattura','fattura_pa','nota_credito','nota_debito',
                            'autofattura','fattura_riepilogativa'];
begin
  if public.user_can_access_company(p_company_id) is not true then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  if auth.uid() is null then
    raise exception 'documento_crea: serve un utente autenticato' using errcode = '42501';
  end if;

  v_tipo := nullif(btrim(p_dati->>'tipo'), '');
  if v_tipo is null then
    raise exception 'Manca il tipo di documento' using errcode = '22023';
  end if;

  -- Prima di tutto, e soprattutto prima del contatore.
  if not (v_tipo = any (c_ammessi)) then
    raise exception 'Il tipo di documento "%" non e'' ancora gestito. Tipi disponibili: %.',
      v_tipo, array_to_string(c_ammessi, ', ')
      using errcode = '22023';
  end if;

  if v_tipo = any (c_fiscali) then
    -- Nessun numero consumato per una bozza: un segnaposto unico e leggibile.
    -- E sempre in bozza: l'emissione passa da documento_emetti.
    v_numero := 'Bozza ' || upper(substr(replace(v_id::text, '-', ''), 1, 8));
    v_prog := 0;
    v_stato := 'bozza';
  else
    -- Da qui in poi siamo dentro la stessa transazione: se qualcosa fallisce,
    -- anche l'incremento del contatore torna indietro.
    v_numero := public.genera_numero_documento_native(p_company_id, v_tipo, v_anno);
    v_prog := coalesce(nullif(regexp_replace(v_numero, '^.*-', ''), '')::integer, 1);
    v_stato := coalesce(nullif(p_dati->>'stato',''), 'bozza');
  end if;

  v_riga := jsonb_populate_record(
    null::public.documenti_fiscali,
    p_dati
      || jsonb_build_object(
           'company_id', p_company_id,
           'numero', v_numero,
           'numero_progressivo', v_prog,
           'anno', v_anno,
           'tipo', v_tipo,
           'stato', v_stato)
      - 'id' - 'created_at' - 'updated_at' - 'version' - 'deleted_at'
  );

  v_riga.id            := v_id;
  v_riga.created_at    := now();
  v_riga.updated_at    := now();
  v_riga.version       := 1;
  v_riga.deleted_at    := null;
  v_riga.data_emissione := coalesce(v_riga.data_emissione, (now() at time zone 'Europe/Rome')::date);
  v_riga.cliente_snapshot := coalesce(v_riga.cliente_snapshot, '{}'::jsonb);
  v_riga.righe            := coalesce(v_riga.righe, '[]'::jsonb);
  v_riga.riepilogo_iva    := coalesce(v_riga.riepilogo_iva, '[]'::jsonb);
  v_riga.subtotale          := coalesce(v_riga.subtotale, 0);
  v_riga.imponibile_totale  := coalesce(v_riga.imponibile_totale, 0);
  v_riga.iva_totale         := coalesce(v_riga.iva_totale, 0);
  v_riga.totale_documento   := coalesce(v_riga.totale_documento, 0);
  v_riga.totale_da_pagare   := coalesce(v_riga.totale_da_pagare, 0);

  insert into public.documenti_fiscali select v_riga.* returning id into v_id;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'numero_progressivo', v_prog);
end;
$function$;

-- 3 ──────────────────────────────────────────────────────────────────────────
create or replace function public.documento_emetti(p_documento_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  c_fiscali  constant text[] := array['fattura','fattura_pa','nota_credito','nota_debito',
                                      'autofattura','fattura_riepilogativa'];
  -- La serie delle fatture: stesso contatore (genera_numero_documento_native).
  c_serie_ft constant text[] := array['fattura','fattura_pa','nota_debito','autofattura',
                                      'fattura_riepilogativa'];
  v_doc      public.documenti_fiscali%rowtype;
  v_ana      public.anagrafica_azienda%rowtype;
  v_oggi     date := (now() at time zone 'Europe/Rome')::date;
  v_data     date;
  v_anno     integer;
  v_serie    text[];
  v_numero   text;
  v_prog     integer;
  v_prefisso text;
  v_altra    record;
begin
  if auth.uid() is null then
    raise exception 'documento_emetti: serve un utente autenticato' using errcode = '42501';
  end if;

  select * into v_doc from public.documenti_fiscali
   where id = p_documento_id and deleted_at is null
   for update;
  if not found then
    raise exception 'Documento non trovato' using errcode = 'P0002';
  end if;
  if public.user_can_access_company(v_doc.company_id) is not true then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  if v_doc.stato <> 'bozza' then
    raise exception 'Solo i documenti in bozza possono essere emessi (questo è «%»).', v_doc.stato
      using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(v_doc.righe, '[]'::jsonb)) = 0 and v_doc.tipo <> 'nota_credito' then
    raise exception 'Il documento deve avere almeno una riga' using errcode = '22023';
  end if;
  if coalesce(btrim(v_doc.cliente_snapshot->>'ragione_sociale'), '') = '' then
    raise exception 'Il cliente è obbligatorio per emettere il documento' using errcode = '22023';
  end if;

  v_data := coalesce(v_doc.data_emissione, v_oggi);
  if v_data > v_oggi then
    raise exception 'La data del documento (%) è nel futuro: una fattura porta la data in cui la emetti, e lo SDI scarta quelle con data successiva all''invio.',
      to_char(v_data, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  -- Preventivi, proforma e DDT: il numero l'hanno già, si emettono come prima.
  if not (v_doc.tipo = any (c_fiscali)) then
    perform set_config('fatturazione.emissione', 'on', true);
    update public.documenti_fiscali
       set stato = 'emessa', data_emissione = v_data, updated_at = now()
     where id = v_doc.id;
    perform set_config('fatturazione.emissione', 'off', true);
    return jsonb_build_object('id', v_doc.id, 'numero', v_doc.numero);
  end if;

  v_serie := case when v_doc.tipo = 'nota_credito' then array['nota_credito'] else c_serie_ft end;
  v_anno := extract(year from v_data)::integer;

  -- Un'emissione alla volta per azienda: lo stesso lucchetto della numerazione.
  select * into v_ana from public.anagrafica_azienda
   where company_id = v_doc.company_id
   for update;
  if not found then
    raise exception 'Anagrafica azienda non configurata: completala in Impostazioni → Fatturazione.'
      using errcode = 'P0002';
  end if;

  if v_doc.numero like 'Bozza %' then
    if v_doc.tipo <> 'nota_credito' and v_anno < coalesce(v_ana.anno_corrente_fattura, v_anno) then
      -- Fattura con la data dell'anno prima, emessa dopo il cambio d'anno
      -- (le operazioni di dicembre fatturate a gennaio): continua la serie di
      -- quell'anno, senza toccare il contatore dell'anno nuovo.
      v_prefisso := coalesce(v_ana.prefisso_fattura, 'FT');
      select coalesce(max(numero_progressivo), 0) + 1 into v_prog
        from public.documenti_fiscali
       where company_id = v_doc.company_id and tipo = any (v_serie) and anno = v_anno
         and numero not like 'Bozza %';
      v_numero := v_prefisso || '-' || v_anno || '-' || lpad(v_prog::text, 4, '0');
    else
      v_numero := public.genera_numero_documento_native(v_doc.company_id, v_doc.tipo, v_anno);
      v_prog := coalesce(nullif(regexp_replace(v_numero, '^.*-', ''), '')::integer, 1);
    end if;
  else
    -- Bozza nata prima del 24/09/2026: il numero l'aveva già.
    v_numero := v_doc.numero;
    v_prog := v_doc.numero_progressivo;
    if v_doc.anno is not null and v_doc.anno <> v_anno then
      raise exception 'Il numero % è della serie % ma la data è del %: elimina questa bozza e creane una nuova, prenderà il numero giusto.',
        v_doc.numero, v_doc.anno, v_anno using errcode = '22023';
    end if;
  end if;

  -- La numerazione segue le date: nessuna fattura già emessa della stessa serie
  -- con numero più basso e data più recente, né con numero più alto e data più
  -- vecchia. (Un'eccezione qui annulla anche l'incremento del contatore.)
  select numero, data_emissione into v_altra
    from public.documenti_fiscali
   where company_id = v_doc.company_id and tipo = any (v_serie) and anno = v_anno
     and id <> v_doc.id and deleted_at is null and stato not in ('bozza', 'annullata')
     and numero_progressivo < v_prog and data_emissione > v_data
   order by data_emissione desc
   limit 1;
  if found then
    raise exception 'La % è del %: una fattura con numero successivo non può avere una data precedente. Usa una data dal % in poi.',
      v_altra.numero, to_char(v_altra.data_emissione, 'DD/MM/YYYY'), to_char(v_altra.data_emissione, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;
  select numero, data_emissione into v_altra
    from public.documenti_fiscali
   where company_id = v_doc.company_id and tipo = any (v_serie) and anno = v_anno
     and id <> v_doc.id and deleted_at is null and stato not in ('bozza', 'annullata')
     and numero_progressivo > v_prog and data_emissione < v_data
   order by data_emissione asc
   limit 1;
  if found then
    raise exception 'La % è del %: questa bozza ha un numero più basso e non può avere una data successiva. Usa una data fino al %, oppure elimina la bozza e creane una nuova.',
      v_altra.numero, to_char(v_altra.data_emissione, 'DD/MM/YYYY'), to_char(v_altra.data_emissione, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  perform set_config('fatturazione.emissione', 'on', true);
  update public.documenti_fiscali
     set numero = v_numero,
         numero_progressivo = v_prog,
         anno = v_anno,
         data_emissione = v_data,
         stato = 'emessa',
         updated_at = now()
   where id = v_doc.id;
  perform set_config('fatturazione.emissione', 'off', true);

  return jsonb_build_object('id', v_doc.id, 'numero', v_numero, 'numero_progressivo', v_prog, 'anno', v_anno);
end;
$function$;

revoke all on function public.documento_emetti(uuid) from public, anon;
grant execute on function public.documento_emetti(uuid) to authenticated;

-- 4 ──────────────────────────────────────────────────────────────────────────
create or replace function public.documenti_fiscali_proteggi_emessi()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_consentiti text[] := public.documento_fiscale_campi_modificabili();
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

  v_prima := to_jsonb(OLD);
  v_dopo  := to_jsonb(NEW);

  FOR v_campo IN SELECT jsonb_object_keys(v_dopo) LOOP
    IF v_prima -> v_campo IS DISTINCT FROM v_dopo -> v_campo THEN
      v_toccati := v_toccati || v_campo;
      v_diff := v_diff || jsonb_build_object(v_campo, jsonb_build_object(
        'prima', left(coalesce(v_prima ->> v_campo, ''), 500),
        'dopo',  left(coalesce(v_dopo  ->> v_campo, ''), 500)
      ));
      IF NOT (v_campo = ANY(v_consentiti)) THEN
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
    v_motivo := format(
      'Documento %s n. %s in stato "%s": non si possono modificare %s. Per correggerlo emetti una nota di credito.',
      OLD.tipo, OLD.numero, OLD.stato, array_to_string(v_violati, ', '));

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
