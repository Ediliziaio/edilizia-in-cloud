-- Prova dell'annullamento e del piano di volo (revisione 1/11/2026), su Demo Azienda 2.
-- Si esegue DOPO le migrazioni Silvio 090000…142000, nella stessa transazione (BEGIN; SET LOCAL lock_timeout='3s';
-- SET LOCAL statement_timeout='60s'; <migrazioni>; <questo file>; ROLLBACK;). Ogni blocco finisce con un raise: niente resta.

-- ── 1. Annullamento (S1, S2, S3, S11, durata delle fasi senza date) ──
-- Prova dell'annullamento (revisione 1/11, S1 S2 S11), su Demo Azienda 2, dopo le migrazioni
-- Silvio 090000…142000 nella stessa transazione. Finisce SEMPRE con un raise: niente resta scritto.
do $prova$
declare
  v_az uuid := 'd2000000-0000-4000-a000-000000000002';
  v_tit uuid := 'e592255e-0c82-86cd-7f7b-d3046317f9cd';
  v_scr jsonb;
  b uuid;
  r jsonb;
  o uuid;
  v_out text := '';
  v_reg jsonb;
  v_n integer;
  v_resti text;
  x record;
  v_giro integer;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);
  v_scr := jsonb_build_object(
    'versione', 1, 'modo', 'crea',
    'ordine', jsonb_build_object('description', 'PROVA annullamento Silvio', 'total_amount', 10000, 'vat_rate', 10,
                                 'work_start_date', '2027-03-01', 'work_end_date', '2027-03-19'),
    'cliente', jsonb_build_object('customer_id', 'daf4209c-f9a4-185f-3944-d3c519eb7eb9', 'nome', null, 'email', null),
    'preventivo_id', null, 'righe', '[]'::jsonb,
    'rate', jsonb_build_array(jsonb_build_object('position', 0, 'label', 'Saldo', 'type', 'balance', 'amount', 11000, 'trigger_evento', 'fine_lavori', 'trigger_numero', null)),
    'fasi', jsonb_build_array(jsonb_build_object('nome', 'Demolizioni', 'inizio', '2027-03-01', 'fine', '2027-03-05', 'origine', null, 'sottofasi', '[]'::jsonb),
                              jsonb_build_object('nome', 'Collaudo', 'inizio', null, 'fine', null, 'origine', null, 'sottofasi', '[]'::jsonb, 'giorni', 2)),
    'date_fasi', '[]'::jsonb, 'venditore', null, 'condizioni', null,
    'squadra', jsonb_build_array(jsonb_build_object('employee_id', '622913c0-abf8-a6dd-613c-6d0afa4b851c', 'fase', 'Demolizioni')),
    'ditte', jsonb_build_array(jsonb_build_object('external_team_id', '663b6ccb-2432-4705-a8fb-18fdca8eb169', 'fase', 'Demolizioni', 'costo_previsto', 1500)),
    'mezzi', jsonb_build_array(jsonb_build_object('mezzo_id', 'da950d15-c24b-42b1-a939-7d0e3f43109b', 'fasi', jsonb_build_array('Demolizioni'), 'dal', '2027-03-01', 'al', '2027-03-05', 'quantita', 1)),
    'oda', '[]'::jsonb,
    'contratti', jsonb_build_array(jsonb_build_object('external_team_id', '663b6ccb-2432-4705-a8fb-18fdca8eb169', 'fasi', jsonb_build_array('Demolizioni'),
                                   'dal', '2027-03-01', 'al', '2027-03-05', 'importo', 1500, 'descrizione', 'Demolizioni', 'elenco', '[]'::jsonb)),
    'promemoria', jsonb_build_array(jsonb_build_object('tipo', 'pos', 'titolo', 'PROVA: chiedi il POS', 'testo', 'x', 'scadenza', '2027-02-24'),
                                    jsonb_build_object('tipo', 'cartello', 'titolo', 'PROVA: tipo inventato', 'testo', 'x', 'scadenza', null)),
    'adempimenti', '[]'::jsonb);
  insert into public.commessa_bozze (company_id, created_by, modo, piano, scrittura)
  values (v_az, v_tit, 'crea', '{}'::jsonb, v_scr) returning id into b;

  for v_giro in 1..2 loop
    r := public.commessa_crea_con_silvio(b);
    o := (r->>'order_id')::uuid;
    select jsonb_object_agg(tabella, n) into v_reg from (select tabella, count(*) n from public.commessa_bozze_scritture where bozza_id = b group by 1) q;
    select count(*) into v_n from public.commessa_bozze_scritture where bozza_id = b and azione = 'creata' and istantanea is null;
    v_out := v_out || format(E'\n[giro %s] crea: %s\n  registro: %s; senza istantanea: %s', v_giro, r - 'righe_registrate', v_reg, v_n);
    select count(*) into v_n from public.tasks where order_id = o and title = 'PROVA: tipo inventato';
    v_out := v_out || format(E'\n  S3 promemoria «cartello» scritto: %s', v_n);
    v_out := v_out || format(E'\n  giorni della fase senza date: %s', (select string_agg(s2.name || '=' || coalesce(s2.giorni::text, '-'), ', ')
      from public.order_work_subphases s2 join public.order_work_phases f2 on f2.id = s2.phase_id where f2.order_id = o and f2.name = 'Collaudo'));

    if v_giro = 1 then
      -- A. il contratto della ditta firmato
      begin
        update public.contratti_subappalto set stato = 'attivo', firmato_il = now() where order_id = o;
        get diagnostics v_n = row_count;
        perform public.commessa_annulla_silvio(b);
        v_out := v_out || format(E'\n  A (contratto firmato, %s righe): ANNULLATO — SBAGLIATO', v_n);
      exception when others then v_out := v_out || format(E'\n  A (contratto firmato, %s righe) rifiuto: %s', v_n, sqlerrm); end;
      -- B. una spesa al mezzo
      begin
        insert into public.mezzi_piani_spese (company_id, piano_id, costo_id, importo)
        select v_az, p.id, '4feec1d0-6fea-16b8-6f50-b6b082d3943d', 120 from public.mezzi_piani_cantiere p where p.order_id = o limit 1;
        get diagnostics v_n = row_count;
        perform public.commessa_annulla_silvio(b);
        v_out := v_out || format(E'\n  B (spesa del mezzo, %s righe): ANNULLATO — SBAGLIATO', v_n);
      exception when others then v_out := v_out || format(E'\n  B (spesa del mezzo, %s righe) rifiuto: %s', v_n, sqlerrm); end;
      -- C. le ore su order_employees
      begin
        update public.order_employees set hours_worked = 8 where order_id = o;
        get diagnostics v_n = row_count;
        perform public.commessa_annulla_silvio(b);
        v_out := v_out || format(E'\n  C (ore, %s righe): ANNULLATO — SBAGLIATO', v_n);
      exception when others then v_out := v_out || format(E'\n  C (ore, %s righe) rifiuto: %s', v_n, sqlerrm); end;
      -- D. un'etichetta su un'attività di Silvio (figlia senza created_at, se c'è la tabella)
      begin
        if to_regclass('public.task_tag_assignments') is not null and to_regclass('public.task_tags') is not null then
          execute 'insert into public.task_tag_assignments (task_id, tag_id)
                   select t.id, g.id from public.tasks t, (select id from public.task_tags where company_id = $1 limit 1) g
                    where t.order_id = $2 limit 1' using v_az, o;
          get diagnostics v_n = row_count;
        else v_n := -1; end if;
        perform public.commessa_annulla_silvio(b);
        v_out := v_out || format(E'\n  D (etichetta, %s righe): annullato', v_n);
      exception when others then v_out := v_out || format(E'\n  D (etichetta, %s righe) rifiuto: %s', v_n, sqlerrm); end;
    end if;

    -- E. niente toccato: l'annullamento passa e non resta niente.
    create temp table if not exists prova_registro (tabella text, riga_id uuid) on commit drop;
    delete from prova_registro;
    insert into prova_registro select tabella, riga_id from public.commessa_bozze_scritture where bozza_id = b and azione = 'creata';
    r := public.commessa_annulla_silvio(b);
    v_resti := '';
    for x in select tabella, array_agg(riga_id) ids from prova_registro group by 1 loop
      execute format('select count(*) from public.%I where id = any($1)', x.tabella) into v_n using x.ids;
      if v_n > 0 then v_resti := v_resti || format('%s=%s ', x.tabella, v_n); end if;
    end loop;
    for x in select k.figlia, k.unione from public._silvio_chiavi() k where k.madre = 'orders' loop
      begin
        execute format('select count(*) from public.%I t join (select $1::uuid id, $2::uuid company_id) m on %s', x.figlia, x.unione) into v_n using o, v_az;
      exception when undefined_column then v_n := 0; end;
      if v_n > 0 then v_resti := v_resti || format('%s(commessa)=%s ', x.figlia, v_n); end if;
    end loop;
    select count(*) into v_n from public.automation_trigger_events e
     where e.company_id = v_az and e.processed is not true and e.entity_id in (select riga_id::text from prova_registro);
    v_out := v_out || format(E'\n  E annulla senza toccare: %s; resti: «%s»; eventi automazioni rimasti: %s', r - 'file_da_togliere', v_resti, v_n);
  end loop;

  raise exception E'PROVA FINITA (nessuna scrittura resta):%', v_out;
end
$prova$;

-- ── 2. Piano di volo (S4, S5, S6), su una commessa esistente: transazione a parte ──
do $prova$
declare
  v_az uuid := 'd2000000-0000-4000-a000-000000000002';
  v_tit uuid := 'e592255e-0c82-86cd-7f7b-d3046317f9cd';
  o uuid := 'ec5bff4e-c812-4c77-b94a-940eb3a213b1';
  v_fase uuid := 'f84a7717-a878-43b0-926a-ede98690f77b';
  v_out text := '';
  r1 jsonb; r2 jsonb; r3 jsonb; v_id uuid; v_stato text; v_l jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);
  r1 := public.silvio_volo_registra(v_az, o, v_fase, 'controllo', '2027-02-24', 'prova', '[]', '[{"tipo":"attivita","titolo":"PROVA volo","testo":"x","scadenza":null}]');
  r2 := public.silvio_volo_registra(v_az, o, v_fase, 'controllo', '2027-02-25', 'prova', '[]', '[{"tipo":"attivita","titolo":"PROVA volo","testo":"x","scadenza":null}]');
  r3 := public.silvio_volo_registra(v_az, o, v_fase, 'controllo', '2027-02-26', 'prova', '[]', '[{"tipo":"attivita","titolo":"PROVA volo 2","testo":"x","scadenza":null}]');
  v_out := v_out || format(E'\nS6 registra: nuova %s/%s/%s, cambiata %s/%s/%s', r1->'nuova', r2->'nuova', r3->'nuova', r1->'cambiata', r2->'cambiata', r3->'cambiata');
  perform public.silvio_volo_registra(v_az, o, v_fase, 'sal', '2027-02-26', 'SAL', '[]', '[{"tipo":"sal_bozza","numero":9,"importo":1234.5,"pct_avanzamento_totale":50,"motivo":"x"}]');
  v_l := public.silvio_volo_della_commessa(o);
  v_out := v_out || format(E'\nS5 lettura: %s proposte, importo del SAL visto dal titolare: %s', jsonb_array_length(v_l),
    (select a->'importo' from jsonb_array_elements(v_l) p, jsonb_array_elements(p->'azioni') a where a->>'tipo' = 'sal_bozza'));
  v_id := (r1->>'id')::uuid;
  perform public.silvio_autonomia_salva(v_az, '[{"azione":"controllo_fase","livello":"vietata"}]'::jsonb, null);
  select stato into v_stato from public.silvio_piano_volo where id = v_id;
  v_out := v_out || format(E'\nS4 dopo «vietata»: stato del controllo %s; il SAL resta %s', v_stato,
    (select stato from public.silvio_piano_volo where fase_id = v_fase and tipo = 'sal'));
  begin
    update public.silvio_piano_volo set stato = 'aperta' where id = v_id;
    perform public.silvio_volo_conferma(v_id, null);
    v_out := v_out || E'\nS4 conferma con controllo vietato: ESEGUITA — SBAGLIATO';
  exception when others then v_out := v_out || format(E'\nS4 conferma rifiutata: %s', sqlerrm); end;
  raise exception E'PROVA FINITA (nessuna scrittura resta):%', v_out;
end
$prova$;

-- ── 3. «Completa» e allegati, su una commessa esistente: transazione a parte ──
do $prova$
declare
  v_az uuid := 'd2000000-0000-4000-a000-000000000002';
  v_tit uuid := 'e592255e-0c82-86cd-7f7b-d3046317f9cd';
  o uuid := 'ec5bff4e-c812-4c77-b94a-940eb3a213b1';
  v_dip uuid;
  b uuid; r jsonb; v_out text := ''; v_prima jsonb; v_dopo jsonb; v_conti_prima jsonb; v_conti_dopo jsonb; v_reg jsonb; v_n integer; v_task uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_tit, 'role', 'authenticated')::text, true);
  select e.id into v_dip from public.employees e where e.company_id = v_az and e.is_active is not false
     and not exists (select 1 from public.order_employees x where x.order_id = o and x.employee_id = e.id) limit 1;
  select to_jsonb(x) - 'updated_at' - 'version' into v_prima from public.orders x where x.id = o;
  v_conti_prima := jsonb_build_object(
    'fasi', (select count(*) from public.order_work_phases where order_id = o), 'persone', (select count(*) from public.order_employees where order_id = o),
    'attivita', (select count(*) from public.tasks where order_id = o), 'allegati', (select count(*) from public.order_attachments where order_id = o));
  insert into public.commessa_bozze (company_id, created_by, modo, piano, order_id, scrittura)
  values (v_az, v_tit, 'completa', '{}'::jsonb, o, jsonb_build_object('versione', 1, 'modo', 'completa',
    'ordine', jsonb_build_object('dl_notification_email', 'prova-dl@esempio.it'),
    'cliente', jsonb_build_object('customer_id', null, 'nome', null, 'email', null), 'preventivo_id', null, 'righe', '[]'::jsonb, 'rate', '[]'::jsonb,
    'fasi', jsonb_build_array(jsonb_build_object('nome', 'PROVA Collaudo', 'inizio', null, 'fine', null, 'origine', null, 'sottofasi', '[]'::jsonb, 'giorni', 2)),
    'date_fasi', '[]'::jsonb, 'venditore', null, 'condizioni', null,
    'squadra', jsonb_build_array(jsonb_build_object('employee_id', v_dip, 'fase', 'PROVA Collaudo')),
    'ditte', '[]'::jsonb, 'mezzi', '[]'::jsonb, 'oda', '[]'::jsonb, 'contratti', '[]'::jsonb,
    'promemoria', jsonb_build_array(jsonb_build_object('tipo', 'pos', 'titolo', 'PROVA completa: POS', 'testo', 'x', 'scadenza', '2027-02-24')),
    'adempimenti', '[]'::jsonb)) returning id into b;
  r := public.commessa_completa_con_silvio(b);
  v_n := public.commessa_bozza_allega(b, jsonb_build_array(jsonb_build_object('path', 'orders/' || o || '/prova.pdf', 'nome', 'prova.pdf', 'mime', 'application/pdf', 'dimensione', 10)));
  select jsonb_object_agg(tabella || ':' || azione, n) into v_reg from (select tabella, azione, count(*) n from public.commessa_bozze_scritture where bozza_id = b group by 1, 2) q;
  v_out := v_out || format(E'\ncompleta: %s; allegati %s\n registro: %s; senza istantanea: %s', r, v_n, v_reg,
    (select count(*) from public.commessa_bozze_scritture where bozza_id = b and azione = 'creata' and istantanea is null));
  begin
    update public.order_employees set hours_worked = 8 where order_id = o and employee_id = v_dip;
    perform public.commessa_annulla_silvio(b);
    v_out := v_out || E'\nC1 ore: ANNULLATO — SBAGLIATO';
  exception when others then v_out := v_out || format(E'\nC1 ore rifiuto: %s', sqlerrm); end;
  begin
    update public.orders set dl_notification_email = 'cambiata@esempio.it' where id = o;
    perform public.commessa_annulla_silvio(b);
    v_out := v_out || E'\nC2 colonna cambiata: ANNULLATO — SBAGLIATO';
  exception when others then v_out := v_out || format(E'\nC2 colonna cambiata rifiuto: %s', sqlerrm); end;
  -- Lavoro della persona sulla commessa (non su righe di Silvio): non ferma e non si cancella.
  insert into public.tasks (company_id, title, status, priority, order_id, created_by)
  values (v_az, 'PROVA attività della persona', 'da_fare', 'normale', o, v_tit) returning id into v_task;
  r := public.commessa_annulla_silvio(b);
  select to_jsonb(x) - 'updated_at' - 'version' into v_dopo from public.orders x where x.id = o;
  v_conti_dopo := jsonb_build_object(
    'fasi', (select count(*) from public.order_work_phases where order_id = o), 'persone', (select count(*) from public.order_employees where order_id = o),
    'attivita', (select count(*) from public.tasks where order_id = o), 'allegati', (select count(*) from public.order_attachments where order_id = o));
  v_out := v_out || format(E'\nC3 annulla: %s\n conti prima %s, dopo %s (attesa: una attività in più, della persona)\n commessa identica a prima: %s; attività della persona ancora lì: %s',
    r, v_conti_prima, v_conti_dopo, v_prima = v_dopo, exists (select 1 from public.tasks where id = v_task));
  if v_prima <> v_dopo then
    v_out := v_out || format(E'\n colonne diverse: %s', (select string_agg(k, ', ') from jsonb_object_keys(v_prima) k where (v_prima->k) is distinct from (v_dopo->k)));
  end if;
  raise exception E'PROVA FINITA (nessuna scrittura resta):%', v_out;
end
$prova$;
