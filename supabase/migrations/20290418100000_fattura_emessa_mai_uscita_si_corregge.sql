-- Una fattura emessa che non è mai uscita si corregge (16/11/2026)
--
-- Finora il blocco guardava solo lo stato: fuori da «bozza», il documento era di pietra. Lo SDI
-- non entrava nella regola. Così una fattura emessa e mai trasmessa — che per l'Agenzia non
-- esiste ancora — era già immodificabile, e per correggerla serviva un intervento sul database.
-- Non è come si comporta il mercato: Fatture in Cloud e gli altri lasciano correggere finché la
-- fattura non è stata inviata, mantenendo numero e data; il blocco vero scatta sull'invio
-- accettato, e da lì serve una nota di variazione.
--
-- Il meccanismo giusto c'era già, per le fatture scartate dallo SDI (esito «NS»): si apre tutto
-- tranne tipo, numero, progressivo, anno, serie e data. Qui quella stessa strada si estende al
-- documento emesso e mai uscito. Numero e data restano fissi anche in questo caso: la
-- numerazione non si tocca (è quello che dice anche la circolare 13/E del 2018 per gli scarti).
--
-- «Mai uscita» vuol dire tutte queste insieme:
--   * è un documento che va allo SDI (i DDT no: non ci vanno mai, resterebbero sempre aperti);
--   * lo stato è «emessa», non pagata, consegnata, inviata, annullata o stornata;
--   * nessuna traccia di trasmissione allo SDI;
--   * nessun incasso registrato;
--   * nessuna nota di credito viva che la cita;
--   * nessuna email al cliente partita da qui (billing_sync_log).
--
-- Ogni modifica resta registrata in documenti_fiscali_storico, come già accade: il trigger
-- scrive la riga in fondo, con i campi toccati e il prima/dopo.

do $$
declare
  v_def  text;
  v_dopo text;
  v_n    integer;
begin
  v_def := pg_get_functiondef('public.documenti_fiscali_proteggi_emessi()'::regprocedure);

  -- Già applicata: le sostituzioni sotto non sono ripetibili (dichiarerebbero due volte le
  -- stesse variabili), quindi qui ci si ferma invece di rompere la funzione.
  if position('v_mai_uscita' in v_def) > 0 then
    raise notice 'documenti_fiscali_proteggi_emessi: correzione già presente, niente da fare.';
    return;
  end if;

  v_dopo := v_def;

  -- 1) Le variabili nuove.
  v_dopo := replace(
    v_dopo,
    '  v_scartata   boolean := false;',
    '  v_scartata   boolean := false;'                                            || chr(10) ||
    '  -- Emessa ma mai uscita: si corregge come una scartata (16/11/2026).'      || chr(10) ||
    '  v_mai_uscita boolean := false;'                                            || chr(10) ||
    '  v_correggibile boolean := false;'                                          || chr(10) ||
    '  c_sdi constant text[] := array[''fattura'',''fattura_pa'',''nota_credito'',''nota_debito'',' ||
    '''autofattura'',''fattura_riepilogativa'',''reverse_charge_interno'',' ||
    '''integrazione_servizi_estero'',''integrazione_beni_ue'',''integrazione_beni_extra_ue''];');

  -- 2) Il calcolo, subito dopo quello dello scarto.
  v_dopo := replace(
    v_dopo,
    '  v_scartata := upper(coalesce(OLD.sdi_stato, '''')) = ''NS''' || chr(10) ||
    '                AND OLD.stato NOT IN (''annullata'', ''stornata'');',
    '  v_scartata := upper(coalesce(OLD.sdi_stato, '''')) = ''NS''' || chr(10) ||
    '                AND OLD.stato NOT IN (''annullata'', ''stornata'');' || chr(10) ||
    chr(10) ||
    '  -- Emessa e mai uscita di qui: niente SDI, niente incassi, nessuna nota che la cita,' || chr(10) ||
    '  -- nessuna email al cliente. Si corregge tenendo numero e data (16/11/2026).' || chr(10) ||
    '  v_mai_uscita := OLD.tipo = any (c_sdi)' || chr(10) ||
    '    AND OLD.stato = ''emessa''' || chr(10) ||
    '    AND OLD.sdi_id_trasmissione IS NULL' || chr(10) ||
    '    AND coalesce(OLD.sdi_stato, '''') = ''''' || chr(10) ||
    '    AND OLD.sdi_identificativo IS NULL' || chr(10) ||
    '    AND coalesce(OLD.importo_pagato, 0) = 0' || chr(10) ||
    '    AND OLD.pagato_at IS NULL' || chr(10) ||
    '    AND NOT EXISTS (SELECT 1 FROM public.documenti_fiscali n' || chr(10) ||
    '                     WHERE n.documento_correlato_id = OLD.id AND n.deleted_at IS NULL' || chr(10) ||
    '                       AND n.stato <> ''annullata'')' || chr(10) ||
    '    AND NOT EXISTS (SELECT 1 FROM public.billing_sync_log l' || chr(10) ||
    '                     WHERE l.invoice_id = OLD.id AND l.provider = ''email''' || chr(10) ||
    '                       AND l.status = ''success'');' || chr(10) ||
    chr(10) ||
    '  v_correggibile := v_scartata OR v_mai_uscita;');

  -- 3) L'eccezione sui campi: vale per tutte e due le strade.
  v_dopo := replace(
    v_dopo,
    '         AND NOT (v_scartata AND NOT (v_campo = ANY(v_fissi_scartata))) THEN',
    '         AND NOT (v_correggibile AND NOT (v_campo = ANY(v_fissi_scartata))) THEN');

  -- 4) Il messaggio: tre casi, non più due.
  v_dopo := replace(
    v_dopo,
    '    IF v_scartata THEN',
    '    IF v_mai_uscita THEN' || chr(10) ||
    '      v_motivo := format(' || chr(10) ||
    '        ''Fattura n. %s: non è ancora uscita, quindi il contenuto si corregge — ma numero e data restano quelli (%s).'',' || chr(10) ||
    '        OLD.numero, array_to_string(v_violati, '', ''));' || chr(10) ||
    '    ELSIF v_scartata THEN');

  if v_dopo = v_def then
    raise exception 'Nessuna sostituzione applicata: il corpo di documenti_fiscali_proteggi_emessi non è quello atteso.';
  end if;

  -- Ogni ancora deve essere stata trovata: una sola volta, nessuna saltata.
  select count(*) into v_n from (values
    ('v_mai_uscita boolean := false;'),
    ('v_correggibile := v_scartata OR v_mai_uscita;'),
    ('AND NOT (v_correggibile AND NOT (v_campo = ANY(v_fissi_scartata))) THEN'),
    ('IF v_mai_uscita THEN'),
    ('ELSIF v_scartata THEN')
  ) t(frammento) where position(t.frammento in v_dopo) > 0;
  if v_n <> 5 then
    raise exception 'Sostituzioni incomplete: trovate % su 5.', v_n;
  end if;
  if position('AND NOT (v_scartata AND NOT (v_campo' in v_dopo) > 0 then
    raise exception 'La vecchia condizione sullo scarto è ancora nel corpo.';
  end if;

  execute v_dopo;
end $$;

comment on function public.documenti_fiscali_proteggi_emessi() is
  'Protegge i documenti fiscali non più in bozza. Due eccezioni, con gli stessi campi fissi '
  '(tipo, numero, progressivo, anno, serie, data, id): la fattura scartata dallo SDI (circ. 13/E/2018) '
  'e, dal 16/11/2026, quella emessa e mai uscita — senza trasmissione allo SDI, senza incassi, '
  'senza note di credito che la citano e senza email al cliente. Ogni modifica va in '
  'documenti_fiscali_storico.';
