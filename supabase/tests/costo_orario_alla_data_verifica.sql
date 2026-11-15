-- Verifica: costo di operai e mezzi alla data del lavoro (migrazione 20290415100000).
-- Si lancia su un database vero e NON lascia niente dietro: l'ultima istruzione fa fallire
-- la transazione di proposito e stampa gli esiti.
--
--   supabase db query --remote --yes -f supabase/tests/costo_orario_alla_data_verifica.sql
--
-- Lavora su Demo Azienda 2 con un amministratore dell'azienda (i controlli del rapportino
-- vogliono un utente). Esiti attesi (verificati il 15/11/2026 su produzione):
--   1) aumento del costo dell'operaio oggi -> storico: -infinity = costo di prima, oggi = nuovo
--   2) costo al giorno del lavoro passato   -> quello di prima; oggi -> il nuovo
--   3) rapportino di agosto approvato oggi  -> ore x costo di agosto (8 x 24 = 192), non di oggi
--   4) il costo torna al valore di prima nello stesso giorno -> la riga di oggi sparisce
--   5) mezzo: costo manuale nuovo          -> vale da oggi; nel passato il costo di prima;
--      cancellato il manuale                 -> torna il calcolato

begin;

do $$
declare
  v_azienda constant uuid := 'd2000000-0000-4000-a000-000000000002';
  v_admin uuid; v_emp uuid; v_rapp uuid; v_data date; v_ore numeric; v_prima numeric;
  v text := ''; r record; c numeric; m uuid; mc numeric;
begin
  select p.id into v_admin from public.profiles p join public.user_roles ur on ur.user_id = p.id
   where p.company_id = v_azienda and ur.role::text = 'company_admin' limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  -- Un rapportino inviato, del passato, con una sola persona che ha un costo orario scritto.
  select x.id, x.data_lavoro, (public.campo_presenze_effettive(x)->0->>'employee_id')::uuid, (public.campo_presenze_effettive(x)->0->>'ore')::numeric
    into v_rapp, v_data, v_emp, v_ore
    from public.campo_rapportini x
    join public.employees e on e.id = (public.campo_presenze_effettive(x)->0->>'employee_id')::uuid and e.costo_orario > 0
   where x.company_id = v_azienda and x.stato = 'inviato' and x.annullato_at is null
     and x.data_lavoro < current_date and jsonb_array_length(public.campo_presenze_effettive(x)) = 1
   limit 1;
  if v_rapp is null then raise exception 'Nessun rapportino adatto su Demo 2'; end if;
  select costo_orario into v_prima from public.employees where id = v_emp;

  update public.employees set costo_orario = v_prima + 6 where id = v_emp;
  for r in select valido_dal, costo_orario from public.costi_orari_storico where risorsa_id = v_emp order by valido_dal loop
    v := v || format('[storico %s=%s] ', r.valido_dal, r.costo_orario);
  end loop;
  v := v || format('[al %s=%s (atteso %s), oggi=%s (atteso %s)] ', v_data,
    private.costo_orario_dipendente_al(v_emp, v_data), v_prima, private.costo_orario_dipendente_al(v_emp, current_date), v_prima + 6);

  update public.campo_rapportini set stato = 'approvato', approvato = true where id = v_rapp;
  select costo_manodopera into c from public.campo_rapportini where id = v_rapp;
  v := v || format('[rapportino del %s: %s, atteso %s] ', v_data, c, round(v_ore * v_prima, 2));

  update public.employees set costo_orario = v_prima where id = v_emp;
  v := v || format('[righe dopo il ritorno: %s, attese 1] ', (select count(*) from public.costi_orari_storico where risorsa_id = v_emp));

  select x.id into m from public.mezzi x where x.company_id = v_azienda and x.deleted_at is null and coalesce(x.possesso, '') not like 'noleggio%' limit 1;
  mc := public.mezzo_costo_orario_effettivo(m);
  insert into public.mezzi_costo_orario (mezzo_id, company_id, costo_orario_manuale) values (m, v_azienda, 99)
    on conflict (mezzo_id) do update set costo_orario_manuale = 99;
  v := v || format('[mezzo: prima=%s, nel passato=%s, oggi=%s (atteso 99)] ', mc, private.mezzo_costo_orario_al(m, v_data), private.mezzo_costo_orario_al(m, current_date));
  delete from public.mezzi_costo_orario where mezzo_id = m;
  v := v || format('[mezzo senza manuale oggi=%s] ', private.mezzo_costo_orario_al(m, current_date));

  raise exception 'ESITI (transazione annullata): %', v;
end $$;

rollback;
