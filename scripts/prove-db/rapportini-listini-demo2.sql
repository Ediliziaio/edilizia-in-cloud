-- Le 8 prove del capitolato (Fasi 2 e 3 del piano rapportini/listini), su Demo Azienda 2.
-- Si lancia DOPO la migrazione 20290318120000, in un'unica richiesta: il blocco finisce con
-- RAISE EXCEPTION, quindi tutto quello che scrive viene annullato. Il messaggio d'errore È il risultato.
-- Mai su un'azienda vera.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
do $$
declare
  c   constant uuid := 'd2000000-0000-4000-a000-000000000002';
  adm constant uuid := 'e592255e-0c82-86cd-7f7b-d3046317f9cd';   -- company_admin di Demo 2
  r1  constant uuid := 'af10f047-d036-c94d-ff81-47d94dfcf497';   -- rapportino inviato, non approvato, della commessa O1 (committente C1)
  o1  constant uuid := '15b8cc36-54bc-b928-bde7-d95779e5c7b1';
  c1  constant uuid := '97bd270c-d2c6-083c-793a-6acdc88fd1c9';
  o2  constant uuid := '14754e59-25f6-4ea7-aa7c-ac57b1df7fb1';   -- committente senza listino
  emp constant uuid := '06cfbe38-161e-2882-caad-837603c6b35a';   -- Marco Operaio, presente in r1
  o3  constant uuid := 'ad943f7c-cd42-441c-ae6d-23a264f847fa';   -- commessa in appalto, a misura
  k3  constant uuid := '1356a79b-c3ab-4ae7-bdf7-d26b0bddf33e';   -- il suo contratto
  t1 uuid; t2 uuid; t3 uuid; k uuid; at1 uuid; at3 uuid; v1 uuid; v2 uuid;
  esito jsonb := '{}'; x jsonb; y jsonb; riga record;
begin
  insert into public.tariffe_aziendali (company_id, tipo, nome, codice, unita, prezzo_vendita, costo_interno, attivo, attiva)
    values (c, 'posa', 'PROVA Posa serramento', 'PRV-001', 'pz', 50, 30, true, true) returning id into t1;
  insert into public.tariffe_aziendali (company_id, tipo, nome, codice, unita, prezzo_vendita, costo_interno, attivo, attiva)
    values (c, 'trasporto', 'PROVA Trasporto', 'PRV-002', 'fisso', 60, 40, true, true) returning id into t2;
  insert into public.tariffe_aziendali (company_id, tipo, nome, codice, unita, prezzo_vendita, costo_interno, attivo, attiva)
    values (c, 'smaltimento', 'PROVA Smaltimento', 'PRV-003', 'pz', null, 10, true, true) returning id into t3;
  -- Il cliente della commessa diventa un committente (anche la commessa non è un appalto: la regola vale per tutte).
  update public.profiles set customer_type = 'appaltatore' where id = c1;
  insert into public.appalto_contratti (company_id, committente_id, nome, valido_dal, attivo)
    values (c, c1, 'PROVA contratto C1', '2020-01-01', true) returning id into k;
  insert into public.appalto_tariffe (company_id, contratto_id, tipo, descrizione, unita_misura, prezzo_unitario, tariffa_id, attivo, ordine)
    values (c, k, 'lavorazione', 'Posa serramento (accordo)', 'cad', 45, t1, true, 1) returning id into at1;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 1. committente senza listino → generale
  x := public.prezzo_voce_commessa(o2, t1, null);
  esito := esito || jsonb_build_object('1_generale', x->>'fonte' = 'generale' and (x->>'prezzo')::numeric = 50);
  -- 2. committente con la voce → committente
  x := public.prezzo_voce_commessa(o1, t1, null);
  esito := esito || jsonb_build_object('2_committente', x->>'fonte' = 'committente' and (x->>'prezzo')::numeric = 45);
  -- 3. listino del committente senza quella voce → generale
  x := public.prezzo_voce_commessa(o1, t2, null);
  esito := esito || jsonb_build_object('3_particolare_senza_voce', x->>'fonte' = 'generale' and (x->>'prezzo')::numeric = 60);
  -- 4. voce in nessun listino → da definire
  x := public.prezzo_voce_commessa(o1, t3, null);
  esito := esito || jsonb_build_object('4_da_definire', x->>'fonte' = 'mancante' and x->'prezzo' = 'null'::jsonb);
  -- ricerca nel listino generale per codice, col prezzo già dalla regola
  y := public.rapportino_listino_cerca(r1, 'PRV-00', 10);
  esito := esito || jsonb_build_object('ricerca', jsonb_array_length(y) = 3 and y->0->>'codice' like 'PRV-00%'
    and exists (select 1 from jsonb_array_elements(y) e where e->>'codice' = 'PRV-001' and e->>'fonte' = 'committente'));

  -- 5. modifica a mano → cambia il rapportino, non il listino
  insert into public.rapportino_voci_libere (rapportino_id, descrizione, quantita, unita, tariffa_id, vendita_unitaria)
    values (r1, '', 2, 'cad', t1, 55) returning id into v1;
  select * into riga from public.rapportino_voci_libere where id = v1;
  esito := esito || jsonb_build_object('5_modifica_a_mano', riga.vendita_unitaria = 55 and riga.vendita_proposta = 45
    and riga.prezzo_a_mano and riga.prezzo_fonte = 'committente'
    and (select prezzo_unitario from public.appalto_tariffe where id = at1) = 45
    and (select prezzo_vendita from public.tariffe_aziendali where id = t1) = 50);
  -- voce senza prezzo scritto: prende il proposto, non è a mano
  insert into public.rapportino_voci_libere (rapportino_id, descrizione, quantita, unita, tariffa_id)
    values (r1, '', 1, 'viaggio', t2) returning id into v2;

  -- 6. listini aggiornati dopo → il rapportino tiene il prezzo del giorno
  perform set_config('role', 'postgres', true);
  update public.appalto_tariffe set prezzo_unitario = 48 where id = at1;
  update public.tariffe_aziendali set prezzo_vendita = 70 where id = t2;
  perform set_config('role', 'authenticated', true);
  update public.rapportino_voci_libere set quantita = 3 where id = v2;   -- una modifica qualsiasi non rifà la fotografia
  select jsonb_agg(v order by v->>'descrizione') into y from jsonb_array_elements(public.rapportino_quadro_economico(r1)->'voci') v;
  x := public.prezzo_voce_commessa(o1, t1, null);
  esito := esito || jsonb_build_object('6_storico',
    (select (v->>'vendita_unitaria')::numeric = 55 and (v->>'vendita_proposta')::numeric = 45 from jsonb_array_elements(y) v where v->>'codice' = 'PRV-001')
    and (select (v->>'vendita_unitaria')::numeric = 60 and not (v->>'prezzo_a_mano')::boolean and (v->>'quantita')::numeric = 3 from jsonb_array_elements(y) v where v->>'codice' = 'PRV-002')
    and (x->>'prezzo')::numeric = 48);

  -- 8. prezzo al committente e costo interno distinti
  esito := esito || jsonb_build_object('8_prezzo_diverso_da_costo',
    (select (v->>'costo_unitario')::numeric = 30 and (v->>'vendita_unitaria')::numeric = 55 from jsonb_array_elements(y) v where v->>'codice' = 'PRV-001'));

  -- 7. operaio senza costo → «costo da completare», non 0
  perform set_config('role', 'postgres', true);
  update public.employees set costo_orario = null, gross_salary = 0 where id = emp;
  perform set_config('role', 'authenticated', true);
  x := public.rapportino_quadro_economico(r1);
  y := public.commessa_costi_da_completare(o1);
  esito := esito || jsonb_build_object('7_costo_mancante',
    jsonb_array_length(x->'costo_da_completare') > 0
    and exists (select 1 from jsonb_array_elements(x->'persone') p where p->>'emp' = emp::text and p->'costo' = 'null'::jsonb)
    and not (y->>'completo')::boolean
    and exists (select 1 from jsonb_array_elements(y->'persone') p where p->>'employee_id' = emp::text),
    'costo_orario_dipendente_null', public.costo_orario_dipendente(emp) is null);

  -- contratto legato alla commessa in appalto, poi eccezione di cantiere sopra tutto (solo sulle commesse in appalto)
  perform set_config('role', 'postgres', true);
  insert into public.appalto_tariffe (company_id, contratto_id, tipo, descrizione, unita_misura, prezzo_unitario, tariffa_id, attivo, ordine)
    values (c, k3, 'lavorazione', 'Posa serramento (accordo appalto)', 'cad', 44, t1, true, 99) returning id into at3;
  perform set_config('role', 'authenticated', true);
  x := public.prezzo_voce_commessa(o3, t1, null);
  esito := esito || jsonb_build_object('contratto_della_commessa', x->>'fonte' = 'committente' and (x->>'prezzo')::numeric = 44);
  perform set_config('role', 'postgres', true);
  insert into public.appalto_tariffe_commessa (company_id, order_id, tariffa_id, prezzo_unitario) values (c, o3, at3, 47);
  perform set_config('role', 'authenticated', true);
  x := public.prezzo_voce_commessa(o3, t1, null);
  esito := esito || jsonb_build_object('cantiere', x->>'fonte' = 'cantiere' and (x->>'prezzo')::numeric = 47);

  raise exception 'ESITO %', esito;
end $$;
