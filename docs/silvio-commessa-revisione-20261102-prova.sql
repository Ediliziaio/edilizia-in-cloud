-- Prova della seconda revisione (2/11/2026, D1–D9, D11, D12, P2), su Demo Azienda 2, con le funzioni vere.
-- Si esegue DOPO le migrazioni Silvio 090000, 100000, 130000, 140000, 141000, nella stessa transazione:
--   BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='60s'; <migrazioni>; <questo file>; ROLLBACK;
-- Ogni scenario si annulla da solo col raise finale del suo blocco, e il blocco esterno finisce con un
-- raise che porta il rapporto: niente resta scritto. Nessun messaggio parte: pg_net scrive nella coda, annullata con tutto il resto.

-- ATTENZIONE, guasto fuori da Silvio trovato con questa prova (2/11/2026): crea_commessa_preventivo_atomic, in produzione da
-- 20281031170000, ha una variabile `c record` e un alias `c` nella CTE: risponde sempre «record "c" is not assigned yet»,
-- quindi NESSUNA commessa nasce da un preventivo, dalla pagina né da Silvio. Finché non è corretta con una sua migrazione,
-- la prova del D2 la corregge qui, solo dentro questa transazione. Tolta la correzione, questo blocco si cancella.
do $correzione$
declare d text;
begin
  d := pg_get_functiondef('public.crea_commessa_preventivo_atomic(uuid,jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure);
  if d ~ 'from public\.quotes c join giu' then
    d := regexp_replace(d, 'select c\.id, giu\.percorso \|\| c\.id from public\.quotes c join giu on c\.parent_quote_id = giu\.id\s+where not c\.id = any\(giu\.percorso\)',
                        'select figlio.id, giu.percorso || figlio.id from public.quotes figlio join giu on figlio.parent_quote_id = giu.id where not figlio.id = any(giu.percorso)');
    execute d;
  end if;
end
$correzione$;
do $prova$
declare
  v_az uuid := 'd2000000-0000-4000-a000-000000000002';
  v_tit uuid := 'e592255e-0c82-86cd-7f7b-d3046317f9cd';
  v_staff uuid := '74dde6aa-9a58-c0a0-6d6c-0c96f70f77ec';
  v_cliente uuid := 'daf4209c-f9a4-185f-3944-d3c519eb7eb9';
  v_dip uuid := '622913c0-abf8-a6dd-613c-6d0afa4b851c';
  v_ditta uuid := '663b6ccb-2432-4705-a8fb-18fdca8eb169';
  v_mezzo uuid := 'da950d15-c24b-42b1-a939-7d0e3f43109b';
  v_stock uuid := '08063e1b-c1f7-4841-ab1a-9f1dfe705eec';
  v_quote uuid := '07d06105-056f-4a48-9ac3-61b65dc26b08';
  v_vuota jsonb := jsonb_build_object('versione', 1, 'cliente', jsonb_build_object('customer_id', null, 'nome', null, 'email', null),
    'preventivo_id', null, 'righe', '[]'::jsonb, 'rate', '[]'::jsonb, 'fasi', '[]'::jsonb, 'date_fasi', '[]'::jsonb, 'venditore', null, 'condizioni', null,
    'squadra', '[]'::jsonb, 'ditte', '[]'::jsonb, 'mezzi', '[]'::jsonb, 'oda', '[]'::jsonb, 'contratti', '[]'::jsonb, 'promemoria', '[]'::jsonb, 'adempimenti', '[]'::jsonb);
  v_scr jsonb; v_out text := ''; b uuid; b2 uuid; o uuid; r jsonb; v_n numeric; v_m numeric; v_t text; v_id uuid; v_fase uuid;
  v_reg jsonb; v_prima jsonb; v_dopo jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);
  v_scr := v_vuota || jsonb_build_object('modo', 'crea',
    'ordine', jsonb_build_object('description', 'PROVA seconda revisione', 'total_amount', 10000, 'vat_rate', 10, 'indirizzo_lavori', 'Via di Prova 1, Milano',
                                 'work_start_date', '2027-03-01', 'work_end_date', '2027-03-19'),
    'cliente', jsonb_build_object('customer_id', v_cliente, 'nome', null, 'email', null),
    'righe', jsonb_build_array(jsonb_build_object('name', 'PROVA materiale di magazzino', 'quantity', 3, 'position', 0, 'stock_item_id', v_stock, 'unit_price', 10)),
    'rate', jsonb_build_array(jsonb_build_object('position', 0, 'label', 'Saldo', 'type', 'balance', 'amount', 11000, 'trigger_evento', 'fine_lavori', 'trigger_numero', null)),
    'fasi', jsonb_build_array(jsonb_build_object('nome', 'Demolizioni', 'inizio', '2027-03-01', 'fine', '2027-03-05', 'origine', null, 'sottofasi', '[]'::jsonb)),
    'squadra', jsonb_build_array(jsonb_build_object('employee_id', v_dip, 'fase', 'Demolizioni')),
    'ditte', jsonb_build_array(jsonb_build_object('external_team_id', v_ditta, 'fase', 'Demolizioni', 'costo_previsto', 1500)),
    'mezzi', jsonb_build_array(jsonb_build_object('mezzo_id', v_mezzo, 'fasi', jsonb_build_array('Demolizioni'), 'dal', '2027-03-01', 'al', '2027-03-05', 'quantita', 1)),
    'promemoria', jsonb_build_array(jsonb_build_object('tipo', 'pos', 'titolo', 'PROVA: chiedi il POS', 'testo', 'x', 'scadenza', '2027-02-24')));

  -- ── D1, D9, D12: crea → risposta persa → geolocalizzazione simulata → annulla ──
  begin
    select quantity into v_n from public.warehouse_stock where id = v_stock;
    insert into public.commessa_bozze (company_id, created_by, modo, piano, scrittura) values (v_az, v_tit, 'crea', '{}', v_scr) returning id into b;
    r := public.commessa_crea_con_silvio(b); o := (r->>'order_id')::uuid;
    select quantity into v_m from public.warehouse_stock where id = v_stock;
    v_out := v_out || format(E'\nD12 giacenza: prima %s, dopo crea %s', v_n, v_m);
    select jsonb_object_agg(tabella, c) into v_reg from (select tabella, count(*) c from public.commessa_bozze_scritture where bozza_id = b group by 1) q;
    v_out := v_out || format(E'\nregistro di crea: %s', v_reg);
    r := public.commessa_crea_con_silvio(b);
    v_out := v_out || format(E'\nD9 crea ripetuto: stessa commessa %s, gia_creata %s', (r->>'order_id')::uuid = o, r->'gia_creata');
    -- Il cron geocodifica-cantieri, senza utente; poi chi apre la commessa salva la distanza.
    perform set_config('request.jwt.claims', '', true);
    update public.orders set work_lat = 45.46, work_lng = 9.19, work_geocoded_at = now() where id = o;
    perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);
    perform public.salva_distanza_cantiere(o, 12.3, 20);
    update public.order_work_subphases s set ritardo_avvisato_il = now() from public.order_work_phases f where f.id = s.phase_id and f.order_id = o;
    r := public.commessa_annulla_silvio(b);
    v_out := v_out || format(E'\nD1 annulla dopo geocodifica e distanza: %s', r - 'file_da_togliere');
    select quantity into v_m from public.warehouse_stock where id = v_stock;
    v_out := v_out || format(E'\nD12 giacenza dopo annulla: %s (attesa %s); movimenti rimasti: %s', v_m, v_n, (select count(*) from public.warehouse_movements where notes like '%PROVA%' or order_id = o));
    v_out := v_out || format(E'\n   commessa rimasta: %s; stato bozza: %s', (select count(*) from public.orders where id = o), (select stato from public.commessa_bozze where id = b));

    -- Il lavoro vero si rifiuta ancora, anche sulle coordinate che Silvio aveva scritto.
    v_scr := jsonb_set(v_scr, '{ordine,work_lat}', '45.1') ;
    update public.commessa_bozze set scrittura = v_scr where id = b;
    r := public.commessa_crea_con_silvio(b); o := (r->>'order_id')::uuid;
    begin
      update public.orders set work_lat = 46 where id = o;
      perform public.commessa_annulla_silvio(b);
      v_out := v_out || E'\nD1 coordinata scritta da Silvio e cambiata: ANNULLATO, SBAGLIATO';
    exception when others then v_out := v_out || format(E'\nD1 coordinata cambiata rifiuto: %s', sqlerrm); end;
    begin
      update public.orders set description = 'cambiata a mano' where id = o;
      perform public.commessa_annulla_silvio(b);
      v_out := v_out || E'\nD1 descrizione cambiata: ANNULLATO, SBAGLIATO';
    exception when others then v_out := v_out || format(E'\nD1 descrizione rifiuto: %s', sqlerrm); end;
    begin
      update public.order_employees set hours_worked = 8 where order_id = o;
      perform public.commessa_annulla_silvio(b);
      v_out := v_out || E'\nD1 ore scritte: ANNULLATO, SBAGLIATO';
    exception when others then v_out := v_out || format(E'\nD1 ore rifiuto: %s', sqlerrm); end;
    begin
      insert into public.tasks (company_id, title, status, priority, order_id, created_by) values (v_az, 'PROVA attività a mano', 'da_fare', 'normale', o, v_tit);
      perform public.commessa_annulla_silvio(b);
      v_out := v_out || E'\nD1 attività aggiunta: annullata, ma è sulla commessa nata da Silvio: DA GUARDARE';
    exception when others then v_out := v_out || format(E'\nD1 attività aggiunta rifiuto: %s', sqlerrm); end;
    raise exception 'FINE';
  exception when others then
    if sqlerrm <> 'FINE' then v_out := v_out || format(E'\n!! scenario 1 ERRORE: %s', sqlerrm); end if;
  end;

  -- ── D2: preventivo → crea → annulla → ricrea ──
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);
    select status into v_t from public.quotes where id = v_quote;
    v_out := v_out || format(E'\nD2 preventivo all''inizio: %s', v_t);
    insert into public.commessa_bozze (company_id, created_by, modo, piano, scrittura)
    values (v_az, v_tit, 'crea', '{}', v_vuota || jsonb_build_object('modo', 'crea', 'preventivo_id', v_quote,
      'ordine', jsonb_build_object('description', 'PROVA da preventivo'), 'cliente', jsonb_build_object('customer_id', v_cliente, 'nome', null, 'email', null))) returning id into b;
    r := public.commessa_crea_con_silvio(b); o := (r->>'order_id')::uuid;
    v_out := v_out || format(E'\nD2 dopo crea: %s, commessa col preventivo: %s', (select status from public.quotes where id = v_quote), (select count(*) from public.orders where quote_id = v_quote));
    r := public.commessa_annulla_silvio(b);
    v_out := v_out || format(E'\nD2 dopo annulla: %s, commesse col preventivo: %s, eventi automazione non elaborati sul preventivo da questo giro: %s', (select status from public.quotes where id = v_quote), (select count(*) from public.orders where quote_id = v_quote),
      (select count(*) from public.automation_trigger_events e where e.entity_id = v_quote::text and e.processed is not true and e.created_at = now()));
    r := public.commessa_crea_con_silvio(b);
    v_out := v_out || format(E'\nD2 ricrea dalla stessa bozza: nuova commessa %s, preventivo %s', (r->>'order_id')::uuid is distinct from o, (select status from public.quotes where id = v_quote));
    o := (r->>'order_id')::uuid;
    begin
      update public.quotes set status = 'accettata' where id = v_quote;
      perform public.commessa_annulla_silvio(b);
      v_out := v_out || E'\nD2 preventivo toccato dopo: ANNULLATO, SBAGLIATO';
    exception when others then v_out := v_out || format(E'\nD2 preventivo toccato dopo, rifiuto: %s', sqlerrm); end;
    r := public.commessa_annulla_silvio(b);
    -- Il flusso normale, dopo l'annullamento, senza Silvio.
    r := public.crea_commessa_preventivo_atomic(v_quote, jsonb_build_object('company_id', v_az, 'customer_id', v_cliente, 'description', 'PROVA flusso normale', 'order_code', 'PROVA-NORMALE'), '[]'::jsonb, '[]'::jsonb, null, null);
    v_out := v_out || format(E'\nD2 flusso normale dopo annulla: commessa %s, preventivo %s', r->>'order_id' is not null, (select status from public.quotes where id = v_quote));
    raise exception 'FINE';
  exception when others then
    if sqlerrm <> 'FINE' then v_out := v_out || format(E'\n!! scenario 2 ERRORE: %s', sqlerrm); end if;
  end;

  -- ── D3, D6, P2, D4, D5: completa con importo 0, chi non vede, cancellare la commessa ──
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);
    insert into public.commessa_bozze (company_id, created_by, modo, piano, scrittura)
    values (v_az, v_tit, 'crea', '{}', v_vuota || jsonb_build_object('modo', 'crea', 'ordine', jsonb_build_object('description', 'PROVA senza importo'),
      'cliente', jsonb_build_object('customer_id', v_cliente, 'nome', null, 'email', null))) returning id into b;
    r := public.commessa_crea_con_silvio(b); o := (r->>'order_id')::uuid;
    v_out := v_out || format(E'\nD3 importo della commessa nuda: %s', (select total_amount from public.orders where id = o));
    insert into public.commessa_bozze (company_id, created_by, modo, piano, order_id, scrittura)
    values (v_az, v_tit, 'completa', '{}', o, v_vuota || jsonb_build_object('modo', 'completa', 'ordine', jsonb_build_object('total_amount', 12345))) returning id into b2;
    r := public.commessa_completa_con_silvio(b2);
    v_out := v_out || format(E'\nD3 dopo Completa: %s; colonne %s', (select total_amount from public.orders where id = o), r->'colonne');
    r := public.commessa_completa_con_silvio(b2);
    v_out := v_out || format(E'\nD9 completa ripetuto: gia_completata %s', r->'gia_completata');
    perform public.commessa_annulla_silvio(b2);
    v_out := v_out || format(E'\nD3 dopo annulla: %s', (select total_amount from public.orders where id = o));
    update public.commessa_bozze set scrittura = v_vuota || jsonb_build_object('modo', 'completa', 'ordine', jsonb_build_object('total_amount', 777)) where id = b2;
    update public.orders set total_amount = 500 where id = o;
    r := public.commessa_completa_con_silvio(b2);
    v_out := v_out || format(E'\nD3 un importo vero non si tocca: %s', (select total_amount from public.orders where id = o));
    perform public.commessa_annulla_silvio(b2);
    update public.orders set total_amount = 0 where id = o;

    -- P2 e D4: lo staff senza importi, senza costi, senza amministrazione subappaltatori e sicurezza.
    update public.staff_permissions set can_edit_orders = true, can_view_orders = true, can_view_order_amounts = false, can_view_costs = false,
           can_view_subappaltatori_amministrazione = false, can_view_sicurezza_cantiere = false, only_assigned = false, only_my_warehouse = false, sola_lettura = false
     where user_id = v_staff and company_id = v_az;
    if not found then raise exception 'lo staff di prova non ha permessi in Demo 2'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
    insert into public.commessa_bozze (company_id, created_by, modo, piano, order_id, scrittura)
    values (v_az, v_staff, 'completa', '{}', o, v_vuota || jsonb_build_object('modo', 'completa', 'ordine', jsonb_build_object('total_amount', 999, 'next_action', 'PROVA'),
      'rate', jsonb_build_array(jsonb_build_object('position', 0, 'label', 'Saldo', 'type', 'balance', 'amount', 100, 'trigger_evento', 'fine_lavori', 'trigger_numero', null)),
      'fasi', jsonb_build_array(jsonb_build_object('nome', 'PROVA staff', 'inizio', null, 'fine', null, 'origine', null, 'sottofasi', '[]'::jsonb)),
      'squadra', jsonb_build_array(jsonb_build_object('employee_id', v_dip, 'fase', 'PROVA staff')),
      'ditte', jsonb_build_array(jsonb_build_object('external_team_id', v_ditta, 'fase', 'PROVA staff', 'costo_previsto', 1500)),
      'contratti', jsonb_build_array(jsonb_build_object('external_team_id', v_ditta, 'fasi', jsonb_build_array('PROVA staff'), 'dal', '2027-03-01', 'al', '2027-03-05', 'importo', 1500, 'descrizione', 'x', 'elenco', '[]'::jsonb)),
      'adempimenti', jsonb_build_array(jsonb_build_object('titolo', 'PROVA cartello', 'tipo', 'altro', 'scadenza', '2027-02-24')))) returning id into b;
    r := public.commessa_completa_con_silvio(b);
    v_out := v_out || format(E'\nP2/D4 staff: tolte %s; importo %s; rate %s; contratti %s; squadra %s; adempimenti %s; costo ditta %s; next_action %s',
      r->'tolte_permessi', (select total_amount from public.orders where id = o), (select count(*) from public.order_installments where order_id = o),
      (select count(*) from public.contratti_subappalto where order_id = o), (select count(*) from public.order_employees where order_id = o and notes = 'Proposto da Silvio'),
      (select count(*) from public.adempimenti_sicurezza where order_id = o and titolo = 'PROVA cartello'),
      (select max(cost_preventivo) from public.order_external_teams where order_id = o), (select next_action from public.orders where id = o));
    perform public.commessa_annulla_silvio(b);

    -- D5: letture di silvio_correzioni, col ruolo vero del browser.
    perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);
    insert into public.silvio_correzioni (company_id, order_id, bozza_id, area, chiave, valore_proposto, valore_tenuto, user_id) values
      (v_az, o, null, 'economia', 'economia.total_amount', '1', '2', v_tit),
      (v_az, o, null, 'identita', 'identita.description', '"a"', '"b"', v_tit),
      (v_az, null, b2, 'identita', 'identita.description', '"c"', '"d"', v_tit);
    perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    execute 'select count(*), string_agg(area, '','') from public.silvio_correzioni where order_id = $1 or bozza_id = $2' into v_n, v_t using o, b2;
    execute 'reset role';
    v_out := v_out || format(E'\nD5 staff senza importi: righe %s (%s), attesa 1 (identita)', v_n, v_t);
    update public.staff_permissions set only_assigned = true where user_id = v_staff and company_id = v_az;
    execute 'set local role authenticated';
    execute 'select count(*) from public.silvio_correzioni where order_id = $1' into v_n using o;
    execute 'reset role';
    v_out := v_out || format(E'\nD5 staff che vede solo le assegnate: righe %s, attese 0', v_n);
    perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);

    -- D6: una bozza «completata» e la commessa cancellata per davvero.
    update public.commessa_bozze set scrittura = v_vuota || jsonb_build_object('modo', 'completa', 'ordine', jsonb_build_object('next_action', 'PROVA D6')) where id = b2;
    perform public.commessa_completa_con_silvio(b2);
    delete from public.orders where id = o;
    select stato || '/' || coalesce(order_id::text, 'senza commessa') into v_t from public.commessa_bozze where id = b2;
    v_out := v_out || format(E'\nD6 commessa cancellata, bozza completata resta: %s; annulla: ', v_t);
    begin
      perform public.commessa_annulla_silvio(b2);
    exception when others then v_out := v_out || sqlerrm; end;
    raise exception 'FINE';
  exception when others then
    if sqlerrm <> 'FINE' then v_out := v_out || format(E'\n!! scenario 3 ERRORE: %s', sqlerrm); end if;
  end;

  -- ── D7, D11: conferma parziale, poi con un'azione che non va, poi il cron, poi tutta ──
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);
    insert into public.commessa_bozze (company_id, created_by, modo, piano, scrittura)
    values (v_az, v_tit, 'crea', '{}', v_vuota || jsonb_build_object('modo', 'crea', 'ordine', jsonb_build_object('description', 'PROVA volo', 'total_amount', 10000),
      'cliente', jsonb_build_object('customer_id', v_cliente, 'nome', null, 'email', null),
      'fasi', jsonb_build_array(jsonb_build_object('nome', 'Fase volo', 'inizio', '2027-03-01', 'fine', '2027-03-05', 'origine', null, 'sottofasi', '[]'::jsonb)))) returning id into b;
    r := public.commessa_crea_con_silvio(b); o := (r->>'order_id')::uuid;
    select id into v_fase from public.order_work_phases where order_id = o;
    r := public.silvio_volo_registra(v_az, o, v_fase, 'controllo', '2027-02-24', 'prova', '[]', jsonb_build_array(
      jsonb_build_object('tipo', 'sal_bozza', 'numero', 1, 'importo', 1000, 'pct_avanzamento_totale', 10, 'motivo', 'prova'),
      jsonb_build_object('tipo', 'attivita', 'titolo', 'PROVA volo', 'testo', 'x', 'scadenza', null),
      jsonb_build_object('tipo', 'prenota_mezzo', 'mezzo_id', '00000000-0000-4000-a000-000000000000', 'nome', 'Inesistente', 'fase_id', v_fase, 'dal', '2027-03-01', 'al', '2027-03-05', 'motivo', 'prova')));
    v_id := (r->>'id')::uuid;
    r := public.silvio_volo_conferma(v_id, array[0]);
    v_out := v_out || format(E'\nD7 conferma della sola 0: %s; stato %s; SAL %s', r, (select stato from public.silvio_piano_volo where id = v_id), (select count(*) from public.sal where order_id = o));
    r := public.silvio_volo_conferma(v_id, null);
    v_out := v_out || format(E'\nD7 conferma di tutte: fatte %s, già %s, saltate %s; stato %s; SAL %s (atteso 1); attività %s',
      r->'fatte', r->'gia_fatte', r->'saltate', r->>'stato', (select count(*) from public.sal where order_id = o), (select count(*) from public.tasks where order_id = o and title = 'PROVA volo'));
    v_out := v_out || format(E'\nD7 lettura: gia_fatte %s, saltate %s', (public.silvio_volo_della_commessa(o)->0)->'gia_fatte', jsonb_array_length((public.silvio_volo_della_commessa(o)->0)->'saltate'));
    -- Il cron riscrive la riga: quello già fatto non torna, il resto sì; poi riesce e si chiude.
    r := public.silvio_volo_registra(v_az, o, v_fase, 'controllo', '2027-02-25', 'prova', '[]', jsonb_build_array(
      jsonb_build_object('tipo', 'attivita', 'titolo', 'PROVA volo', 'testo', 'x', 'scadenza', null),
      jsonb_build_object('tipo', 'attivita', 'titolo', 'PROVA volo 2', 'testo', 'x', 'scadenza', null)));
    v_out := v_out || format(E'\nD7 cron riscrive: azioni rimaste %s', (select jsonb_agg(a->>'titolo') from public.silvio_piano_volo v, jsonb_array_elements(v.azioni) a where v.id = v_id));
    r := public.silvio_volo_conferma(v_id, null);
    v_out := v_out || format(E'\nD7 ultima conferma: stato %s; risolta il presente %s', r->>'stato', (select risolta_il is not null from public.silvio_piano_volo where id = v_id));
    begin
      perform public.silvio_volo_conferma(v_id, null);
      v_out := v_out || E'\nD7 conferma su chiusa: PASSATA, SBAGLIATO';
    exception when others then v_out := v_out || format(E'\nD7 conferma su chiusa: %s', sqlerrm); end;
    -- D11: promemoria vietati dopo la proposta.
    r := public.silvio_volo_registra(v_az, o, v_fase, 'sal', '2027-03-08', 'prova', '[]', jsonb_build_array(jsonb_build_object('tipo', 'attivita', 'titolo', 'PROVA vietata', 'testo', 'x', 'scadenza', null)));
    perform public.silvio_autonomia_salva(v_az, '[{"azione":"promemoria","livello":"vietata"}]'::jsonb, null);
    r := public.silvio_volo_conferma((r->>'id')::uuid, null);
    v_out := v_out || format(E'\nD11 attività con promemoria vietati: saltate %s; stato %s', r->'saltate', r->>'stato');
    raise exception 'FINE';
  exception when others then
    if sqlerrm <> 'FINE' then v_out := v_out || format(E'\n!! scenario 4 ERRORE: %s', sqlerrm); end if;
  end;

  -- ── D11: un cliente non è un capomastro ──
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);
    perform public._silvio_colonne(v_az, jsonb_build_object('capomastro_user_id', v_cliente));
    v_out := v_out || E'\nD11 cliente come capomastro: ACCETTATO, SBAGLIATO';
  exception when others then v_out := v_out || format(E'\nD11 cliente come capomastro: %s', sqlerrm);
  end;

  raise exception E'PROVA FINITA (nessuna scrittura resta):%', v_out;
end
$prova$;
