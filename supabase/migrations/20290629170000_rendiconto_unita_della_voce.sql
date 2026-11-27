-- Rendiconto giornaliero: l'unità della voce comanda la quantità
-- ──────────────────────────────────────────────────────────────
-- 27/11/2026. Simulazione di dicembre su Demo 2: un mezzo con la voce di listino a
-- GIORNATA (escavatore 80 q, 248 €/giornata) usciva dal rapportino come «8 ora × 248 €»,
-- cioè 1.984 € invece di 248 €. Le righe dal rapportino nascevano sempre a «ora» e salva
-- teneva l'unità scritta nella riga anche quando il prezzo veniva da una voce.
--  * le righe dal rapportino prendono l'unità della voce che le prezza e convertono le ore
--    (giornata: fino a 4 h mezza giornata, oltre una giornata), con la nota di quanto è stato
--    convertito;
--  * in salva, quando il prezzo viene da una voce, l'unità è quella della voce;
--  * la copia da un altro giorno non porta con sé il legame al rapportino di quel giorno.
-- Idempotente, non tocca le righe già scritte.

-- L'unità con cui una voce del listino prezza su questa commessa in questo giorno:
-- quella del listino del committente se c'è, altrimenti quella del listino generale.
create or replace function private.unita_della_voce(p_order uuid, p_voce uuid, p_data date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case when p_voce is null then null
         else private.prezzo_voce_commessa_raw(p_order, p_voce, p_data)->>'unita' end,
    'ora');
$$;
revoke all on function private.unita_della_voce(uuid, uuid, date) from public, anon, authenticated;

-- Le ore del rapportino nella quantità dell'unità della voce.
create or replace function private.quantita_per_unita(p_ore numeric, p_unita text)
returns numeric
language sql
immutable
as $$
  select case
    when p_ore is null or p_ore <= 0 then 1
    when p_unita in ('giornata', 'uomo_giorno') then case when p_ore <= 4 then 0.5 else 1 end
    when p_unita = 'ora' then p_ore
    -- Corpo, viaggio, mq…: le ore non si convertono, resta 1 da correggere a mano.
    else 1
  end;
$$;
revoke all on function private.quantita_per_unita(numeric, text) from public, anon;
grant execute on function private.quantita_per_unita(numeric, text) to authenticated;

-- Perché la quantità non è uguale alle ore scritte in cantiere.
create or replace function private.nota_conversione(p_ore numeric, p_unita text, p_qta numeric)
returns text
language sql
immutable
as $$
  select case
    when p_ore is null or p_ore <= 0 or p_unita = 'ora' then null
    when p_unita in ('giornata', 'uomo_giorno')
      then 'Nel listino è a ' || p_unita || ': ' || rtrim(trim(to_char(p_ore, 'FM999999990.99')), '.') || ' h = '
           || rtrim(trim(to_char(p_qta, 'FM999999990.99')), '.')
    else 'Nel listino è a ' || p_unita || ': le ' || rtrim(trim(to_char(p_ore, 'FM999999990.99')), '.')
         || ' h non si convertono, controlla la quantità'
  end;
$$;
revoke all on function private.nota_conversione(numeric, text, numeric) from public, anon;
grant execute on function private.nota_conversione(numeric, text, numeric) to authenticated;

create or replace function public.rendiconto_giornaliero_salva(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_order uuid := nullif(p->>'order_id', '')::uuid;
  v_data date := coalesce(nullif(p->>'data', '')::date, current_date);
  v_company uuid;
  v_rg record;
  v_r jsonb;
  v_i integer := 0;
  v_listino uuid;
  v_prezzo jsonb;
  v_a_mano boolean;
  v_pu numeric;
  v_fonte text;
  v_q numeric;
  v_unita text;
  v_descr text;
  v_costo_u numeric;
  v_emp uuid;
  v_mezzo uuid;
  v_sub uuid;
  v_atar uuid;
  v_altro integer;
  v_da_rap uuid;
begin
  if v_id is not null then
    select * into v_rg from public.rendiconti_giornalieri where id = v_id for update;
    if not found then raise exception 'Rendiconto inesistente' using errcode = '23514'; end if;
    v_order := v_rg.order_id;
    -- In modifica, senza data resta quella salvata (prima finiva a oggi).
    if nullif(p->>'data', '') is null then v_data := v_rg.data; end if;
  end if;
  if v_order is null then raise exception 'Manca la commessa' using errcode = '22023'; end if;
  v_company := private.rendiconto_giornaliero_puo_scrivere(v_order);
  -- Un solo scrittore per commessa: del_giorno, salva e copia si mettono in fila.
  perform pg_advisory_xact_lock(hashtextextended('rendiconto_giornaliero:' || v_order::text, 0));
  -- Un rendiconto per giorno: un altro giorno già occupato non si prende.
  select g.numero into v_altro from public.rendiconti_giornalieri g
   where g.order_id = v_order and g.data = v_data and g.stato <> 'annullato' and g.id is distinct from v_id
   order by g.numero limit 1;
  if v_altro is not null then
    raise exception 'Il % c''è già il rendiconto n. %: aprilo da lì', to_char(v_data, 'DD/MM/YYYY'), v_altro using errcode = '23505';
  end if;
  -- Con rapportini dentro la data non si sposta: resterebbero legati a un giorno che non è il loro.
  if v_id is not null then
    if v_data is distinct from v_rg.data and exists (
         select 1 from public.rendiconto_giornaliero_rapportini l where l.rendiconto_giornaliero_id = v_id) then
      raise exception 'Questo rendiconto contiene rapportini del %: la data non si cambia', to_char(v_rg.data, 'DD/MM/YYYY') using errcode = '23514';
    end if;
  end if;

  if v_id is not null then
    if v_rg.stato <> 'bozza' then
      raise exception 'Il rendiconto n. % è %: riaprilo per modificarlo', v_rg.numero, v_rg.stato using errcode = '23514';
    end if;
  end if;

  perform set_config('eic.rendiconto_giornaliero', '1', true);

  if v_id is null and nullif(p->>'rapportino_id', '') is not null and not exists (
    select 1 from public.campo_rapportini cr
     where cr.id = (p->>'rapportino_id')::uuid and cr.order_id = v_order) then
    raise exception 'Il rapportino non è di questa commessa' using errcode = '23514';
  end if;

  if v_id is null then
    insert into public.rendiconti_giornalieri (company_id, order_id, data, numero, descrizione_lavori, note, rapportino_id)
    values (v_company, v_order, v_data,
            (select coalesce(max(numero), 0) + 1 from public.rendiconti_giornalieri where order_id = v_order),
            nullif(btrim(p->>'descrizione_lavori'), ''), nullif(btrim(p->>'note'), ''),
            nullif(p->>'rapportino_id', '')::uuid)
    returning id into v_id;
  else
    update public.rendiconti_giornalieri
       set data = v_data,
           descrizione_lavori = case when p ? 'descrizione_lavori' then nullif(btrim(p->>'descrizione_lavori'), '') else descrizione_lavori end,
           note = case when p ? 'note' then nullif(btrim(p->>'note'), '') else note end,
           updated_at = now()
     where id = v_id;
  end if;

  delete from public.appalto_rendiconto_righe where rendiconto_giornaliero_id = v_id;

  for v_r in select value from jsonb_array_elements(coalesce(p->'righe', '[]'::jsonb)) loop
    v_i := v_i + 1;
    v_q := coalesce(nullif(replace(v_r->>'quantita', ',', '.'), '')::numeric, 0);
    if v_q <= 0 then
      raise exception 'La riga «%» ha quantità 0: scrivila o toglila', coalesce(nullif(btrim(v_r->>'descrizione'), ''), 'senza nome')
        using errcode = '22023';
    end if;
    v_listino := nullif(v_r->>'listino_voce_id', '')::uuid;
    v_atar := nullif(v_r->>'appalto_tariffa_id', '')::uuid;
    v_sub := nullif(v_r->>'subappaltatore_id', '')::uuid;
    v_da_rap := nullif(v_r->>'da_rapportino_id', '')::uuid;
    if v_da_rap is not null and not exists (select 1 from public.campo_rapportini cr where cr.id = v_da_rap and cr.order_id = v_order) then
      v_da_rap := null;
    end if;
    if v_sub is not null and not exists (select 1 from public.subappaltatori s where s.id = v_sub and s.company_id = v_company) then
      raise exception 'Ditta non trovata in azienda' using errcode = '23514';
    end if;
    -- Ditta senza voce scelta: vale la tariffa della ditta.
    if v_listino is null and v_atar is null and v_sub is not null
       and not coalesce((v_r->>'prezzo_a_mano')::boolean, false) then
      select s.tariffa_id into v_listino from public.subappaltatori s where s.id = v_sub;
    end if;
    -- Manodopera di una persona senza voce scelta: vale la voce «ore» della commessa.
    if v_listino is null and v_atar is null and not coalesce((v_r->>'prezzo_a_mano')::boolean, false)
       and nullif(v_r->>'employee_id', '') is not null
       and coalesce(v_r->>'categoria', 'manodopera') = 'manodopera' then
      select o.tariffa_manodopera_id into v_listino from public.orders o where o.id = v_order;
    end if;
    if v_listino is not null and not exists (
      select 1 from public.tariffe_aziendali t where t.id = v_listino and t.company_id = v_company) then
      raise exception 'Voce di listino non trovata' using errcode = '23514';
    end if;
    v_emp := nullif(v_r->>'employee_id', '')::uuid;
    if v_emp is not null and not exists (select 1 from public.employees e where e.id = v_emp and e.company_id = v_company) then
      raise exception 'Persona non trovata in azienda' using errcode = '23514';
    end if;
    v_mezzo := nullif(v_r->>'mezzo_id', '')::uuid;
    if v_mezzo is not null and not exists (select 1 from public.mezzi m where m.id = v_mezzo and m.company_id = v_company) then
      raise exception 'Mezzo non trovato in azienda' using errcode = '23514';
    end if;

    v_a_mano := coalesce((v_r->>'prezzo_a_mano')::boolean, false);
    v_pu := nullif(replace(v_r->>'prezzo_unitario', ',', '.'), '')::numeric;
    -- Voce del listino del committente scelta direttamente (anche se non è collegata al generale).
    if v_atar is not null then
      v_prezzo := private.prezzo_tariffa_committente(v_order, v_atar, v_data);
      if v_prezzo is null then
        raise exception 'La voce del listino del committente non vale per questa commessa o per questo giorno' using errcode = '23514';
      end if;
      v_listino := coalesce(v_listino, nullif(v_prezzo->>'tariffa_id', '')::uuid);
    else
      v_prezzo := private.rendiconto_giornaliero_prezzo(v_order, v_listino, v_data);
    end if;
    v_descr := coalesce(nullif(btrim(v_r->>'descrizione'), ''), v_prezzo->>'descrizione', 'Voce');
    v_costo_u := nullif(v_prezzo->>'costo_unitario', '')::numeric;

    if v_a_mano or (v_listino is null and v_atar is null) then
      v_fonte := case when v_pu is not null and (v_a_mano or v_pu > 0) then 'manuale' else 'mancante' end;
      v_pu := coalesce(v_pu, 0);
      v_a_mano := v_fonte = 'manuale';
      v_unita := coalesce(nullif(btrim(v_r->>'unita'), ''), v_prezzo->>'unita', 'cad');
    else
      v_fonte := coalesce(v_prezzo->>'fonte', 'mancante');
      v_pu := coalesce(nullif(v_prezzo->>'prezzo', '')::numeric, 0);
      -- L'unità è quella della voce, sempre: il prezzo è per QUELLA unità. Una riga a
      -- «ora» su una voce a giornata moltiplicava il prezzo del giorno per le ore
      -- (8 × 248 € invece di 248 €, visto nella simulazione di dicembre).
      v_unita := coalesce(v_prezzo->>'unita', nullif(btrim(v_r->>'unita'), ''), 'cad');
    end if;
    if v_pu < 0 then raise exception 'Il prezzo non può essere negativo' using errcode = '22023'; end if;

    insert into public.appalto_rendiconto_righe (
      order_id, data, tariffa_id, descrizione, unita_misura, prezzo_unitario, quantita,
      maggiorazione_pct, costo_interno, employee_id, fase_id, origine, stato, note,
      mezzo_id, extra_contratto, rendiconto_giornaliero_id, categoria, listino_voce_id,
      prezzo_fonte, prezzo_a_mano, ordine, subappaltatore_id, da_rapportino_id)
    values (
      v_order, v_data,
      coalesce(v_atar, case when not v_a_mano then nullif(v_prezzo->>'appalto_tariffa_id', '')::uuid end),
      v_descr, v_unita, v_pu, v_q,
      coalesce(nullif(v_r->>'maggiorazione_pct', '')::numeric, 0),
      -- Il costo orario della persona NON si scrive qui: la riga la legge chi ha solo gli importi.
      case when v_emp is null and v_costo_u is not null then round(v_q * v_costo_u, 2) end,
      v_emp, nullif(v_r->>'fase_id', '')::uuid, 'manuale', 'bozza', nullif(btrim(v_r->>'note'), ''),
      v_mezzo, false, v_id,
      case when v_r->>'categoria' in ('manodopera','mezzo','trasporto','materiale','voce') then v_r->>'categoria'
           when v_emp is not null or v_sub is not null then 'manodopera' when v_mezzo is not null then 'mezzo' else 'voce' end,
      v_listino, v_fonte, v_a_mano, v_i, v_sub, v_da_rap);
  end loop;

  return v_id;
end;
$function$;

create or replace function private.rendiconto_giornaliero_righe_da_rapportino(p_rapportino_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_r record; v_ord record; v_righe jsonb := '[]'::jsonb; v_p record; v_emp record; v_magg numeric;
  v_voce uuid; v_unita text; v_qta numeric;
begin
  select cr.* into v_r from public.campo_rapportini cr where cr.id = p_rapportino_id;
  if not found then return '[]'::jsonb; end if;
  select o.tariffa_manodopera_id, o.appalto_contratto_id, o.customer_id into v_ord from public.orders o where o.id = v_r.order_id;
  -- Maggiorazione degli straordinari: quella del contratto della commessa o del committente.
  select c.maggiorazione_straordinario_pct into v_magg
    from public.appalto_contratti c
   where c.company_id = v_r.company_id
     and (c.id = v_ord.appalto_contratto_id
          or (v_ord.appalto_contratto_id is null and c.committente_id = v_ord.customer_id and c.attivo
              and c.valido_dal <= v_r.data_lavoro and (c.valido_al is null or c.valido_al >= v_r.data_lavoro)))
   order by (c.id = v_ord.appalto_contratto_id) desc, c.valido_dal desc limit 1;
  v_magg := coalesce(v_magg, 0);

  -- Persone
  for v_p in
    select case when p->>'employee_id' ~* '^[0-9a-f-]{36}$' then (p->>'employee_id')::uuid end as emp,
           case when p->>'subappaltatore_id' ~* '^[0-9a-f-]{36}$' then (p->>'subappaltatore_id')::uuid end as sub,
           coalesce(nullif(btrim(p->>'nome'), ''), 'Senza nome') as nome,
           case when p->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' then replace(p->>'ore', ',', '.')::numeric else 0 end as ore
      from jsonb_array_elements(case when jsonb_typeof(v_r.presenze) = 'array' then v_r.presenze else '[]'::jsonb end) p
  loop
    if v_p.ore <= 0 then continue; end if;
    v_voce := case when v_p.sub is not null
                   then (select s.tariffa_id from public.subappaltatori s where s.id = v_p.sub)
                   else v_ord.tariffa_manodopera_id end;
    v_unita := private.unita_della_voce(v_r.order_id, v_voce, v_r.data_lavoro);
    v_qta := private.quantita_per_unita(v_p.ore, v_unita);
    v_righe := v_righe || jsonb_build_array(jsonb_build_object(
      'categoria', 'manodopera', 'descrizione', v_p.nome, 'unita', v_unita, 'quantita', v_qta,
      'employee_id', v_p.emp, 'subappaltatore_id', v_p.sub, 'listino_voce_id', v_voce,
      'note', private.nota_conversione(v_p.ore, v_unita, v_qta)));
  end loop;

  -- Operaio da solo, senza elenco presenze: le ore del rapportino sono le sue.
  if jsonb_array_length(v_righe) = 0 and coalesce(v_r.ore_lavorate, 0) + coalesce(v_r.ore_straordinario, 0) > 0 then
    select e.id, btrim(concat_ws(' ', e.first_name, e.last_name)) as nome into v_emp
      from public.employees e
     where e.user_id = v_r.user_id and e.company_id = v_r.company_id
     order by coalesce(e.is_active, true) desc, e.created_at limit 1;
    -- Con una maggiorazione nel contratto gli straordinari vanno su una riga a parte.
    v_unita := private.unita_della_voce(v_r.order_id, v_ord.tariffa_manodopera_id, v_r.data_lavoro);
    if v_unita <> 'ora' then
      -- Voce a giornata (o a corpo): gli straordinari non si staccano, le ore si convertono.
      v_qta := private.quantita_per_unita(coalesce(v_r.ore_lavorate, 0) + coalesce(v_r.ore_straordinario, 0), v_unita);
      v_righe := v_righe || jsonb_build_array(jsonb_build_object(
        'categoria', 'manodopera', 'descrizione', coalesce(nullif(v_emp.nome, ''), 'Autore del rapportino'),
        'unita', v_unita, 'quantita', v_qta, 'employee_id', v_emp.id,
        'listino_voce_id', v_ord.tariffa_manodopera_id,
        'note', private.nota_conversione(coalesce(v_r.ore_lavorate, 0) + coalesce(v_r.ore_straordinario, 0), v_unita, v_qta)));
    elsif v_magg > 0 and coalesce(v_r.ore_straordinario, 0) > 0 then
      if coalesce(v_r.ore_lavorate, 0) > 0 then
        v_righe := v_righe || jsonb_build_array(jsonb_build_object(
          'categoria', 'manodopera',
          'descrizione', coalesce(nullif(v_emp.nome, ''), 'Autore del rapportino'),
          'unita', 'ora', 'quantita', v_r.ore_lavorate,
          'employee_id', v_emp.id, 'listino_voce_id', v_ord.tariffa_manodopera_id));
      end if;
      v_righe := v_righe || jsonb_build_array(jsonb_build_object(
        'categoria', 'manodopera',
        'descrizione', coalesce(nullif(v_emp.nome, ''), 'Autore del rapportino') || ' · straordinario',
        'unita', 'ora', 'quantita', v_r.ore_straordinario, 'maggiorazione_pct', v_magg,
        'employee_id', v_emp.id, 'listino_voce_id', v_ord.tariffa_manodopera_id));
    else
      v_righe := v_righe || jsonb_build_array(jsonb_build_object(
        'categoria', 'manodopera',
        'descrizione', coalesce(nullif(v_emp.nome, ''), 'Autore del rapportino'),
        'unita', 'ora', 'quantita', coalesce(v_r.ore_lavorate, 0) + coalesce(v_r.ore_straordinario, 0),
        'employee_id', v_emp.id, 'listino_voce_id', v_ord.tariffa_manodopera_id));
    end if;
  end if;

  -- Mezzi (senza ore: 1 ora da correggere, la conferma lo fa vedere)
  v_righe := v_righe || coalesce((
    select jsonb_agg(jsonb_build_object(
             'categoria', 'mezzo', 'descrizione', x.nome, 'unita', x.unita,
             'quantita', private.quantita_per_unita(x.ore, x.unita),
             'mezzo_id', x.mezzo_id, 'listino_voce_id', x.voce,
             'note', case when x.ore is null then 'Ore del mezzo non scritte nel rapportino: 1 da correggere'
                          else private.nota_conversione(x.ore, x.unita, private.quantita_per_unita(x.ore, x.unita)) end))
      from (
        select coalesce(nullif(btrim(m->>'nome'), ''), mz.nome, 'Mezzo') as nome,
               mz.id as mezzo_id, mz.tariffa_id as voce,
               private.unita_della_voce(v_r.order_id, mz.tariffa_id, v_r.data_lavoro) as unita,
               case when m->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' and replace(m->>'ore', ',', '.')::numeric > 0
                    then replace(m->>'ore', ',', '.')::numeric end as ore
          from jsonb_array_elements(case when jsonb_typeof(v_r.mezzi_usati) = 'array' then v_r.mezzi_usati else '[]'::jsonb end) m
          left join public.mezzi mz on mz.id = case when m->>'mezzo_id' ~* '^[0-9a-f-]{36}$' then (m->>'mezzo_id')::uuid end
                                   and mz.company_id = v_r.company_id
      ) x), '[]'::jsonb);

  -- Voci libere: il prezzo scritto nel rapportino vale come prezzo a mano, se c'era.
  v_righe := v_righe || coalesce((
    select jsonb_agg(jsonb_build_object(
             'categoria', case when v.viaggio is not null then 'trasporto' else 'voce' end,
             'descrizione', v.descrizione, 'unita', v.unita, 'quantita', v.quantita,
             'listino_voce_id', v.tariffa_id,
             'prezzo_unitario', v.vendita_unitaria,
             'prezzo_a_mano', coalesce(v.prezzo_a_mano, false) or (v.tariffa_id is null and coalesce(v.vendita_unitaria, 0) > 0))
           order by v.created_at)
      from public.rapportino_voci_libere v where v.rapportino_id = p_rapportino_id), '[]'::jsonb);

  -- Materiali: senza prezzo, li valorizza l'ufficio.
  v_righe := v_righe || coalesce((
    select jsonb_agg(jsonb_build_object(
             'categoria', 'materiale',
             'descrizione', coalesce(nullif(btrim(m->>'nome'), ''), 'Materiale'),
             'unita', coalesce(nullif(btrim(m->>'unita'), ''), 'cad'),
             'quantita', case when m->>'quantita' ~ '^[0-9]+([.,][0-9]+)?$' then replace(m->>'quantita', ',', '.')::numeric else 1 end))
      from jsonb_array_elements(case when jsonb_typeof(v_r.materiali_usati) = 'array' then v_r.materiali_usati else '[]'::jsonb end) m
     where coalesce(nullif(btrim(m->>'nome'), ''), '') <> ''), '[]'::jsonb);

  -- Ogni riga sa da quale rapportino viene (serve se poi il rapportino viene rifiutato).
  select coalesce(jsonb_agg(x.v || jsonb_build_object('da_rapportino_id', p_rapportino_id) order by x.n), '[]'::jsonb) into v_righe
    from jsonb_array_elements(v_righe) with ordinality as x(v, n);
  return v_righe;
end;
$function$;

create or replace function public.rendiconto_giornaliero_copia(p_origine uuid, p_data date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare v_o record; v_esito jsonb; v_id uuid; v_n integer; v_righe jsonb;
begin
  select g.order_id into v_o from public.rendiconti_giornalieri g where g.id = p_origine;
  if not found then raise exception 'Rendiconto inesistente' using errcode = '23514'; end if;
  perform private.rendiconto_giornaliero_puo_scrivere(v_o.order_id);
  v_esito := public.rendiconto_giornaliero_del_giorno(v_o.order_id, p_data);
  v_id := (v_esito->>'id')::uuid;
  if v_id = p_origine then raise exception 'Scegli un giorno diverso' using errcode = '22023'; end if;
  if v_esito->>'stato' <> 'bozza' then
    raise exception 'Il rendiconto di quel giorno è già confermato' using errcode = '23514';
  end if;
  select count(*) into v_n from public.appalto_rendiconto_righe where rendiconto_giornaliero_id = v_id;
  if v_n > 0 then
    raise exception 'Il rendiconto di quel giorno ha già % righe: la copia serve per un giorno vuoto', v_n using errcode = '23514';
  end if;
  -- Le righe copiate NON portano il rapportino del giorno d'origine: quel legame è di
  -- un altro giorno, e un rifiuto là ripulirebbe la copia di qua.
  select coalesce(jsonb_agg(x.v - 'da_rapportino_id' order by x.n), '[]'::jsonb) into v_righe
    from jsonb_array_elements(private.rendiconto_giornaliero_righe_correnti(p_origine)) with ordinality as x(v, n);
  perform public.rendiconto_giornaliero_salva(jsonb_build_object('id', v_id, 'data', p_data, 'righe', v_righe));
  return v_esito || jsonb_build_object('copiate', jsonb_array_length(v_righe));
end;
$function$;

-- Un rendiconto per commessa e per giorno, garantito dallo schema: le funzioni lo
-- controllano già, questo lo rende vero anche per una scrittura che le aggirasse.
create unique index if not exists rendiconti_giornalieri_un_giorno
  on public.rendiconti_giornalieri (order_id, data) where stato <> 'annullato';
