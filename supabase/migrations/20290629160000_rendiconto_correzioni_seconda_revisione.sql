-- Rendiconto giornaliero: le correzioni della seconda revisione indipendente
-- ───────────────────────────────────────────────────────────────────────────
-- 27/11/2026.
--  1. Un rendiconto per giorno davvero: salva rifiuta un giorno già occupato da un altro
--     rendiconto vivo, e non sposta la data di un rendiconto che contiene rapportini.
--  2. Rapportino rifiutato o annullato dopo essere entrato: le sue righe (da_rapportino_id)
--     escono dalla bozza e il legame si toglie; se il rendiconto è confermato restano e la vista
--     lo dice (rapportini_ritirati).
--  3. Scritture concorrenti: anche salva prende il lucchetto della commessa, come del_giorno.
--  4. Prezzo a mano su una voce del committente: il legame (tariffa_id) resta.
--  5. «Salva prezzo» con un cliente che non è committente: messaggio chiaro.
--  6. Voce del committente: solo contratti attivi e in vigore, come nella ricerca; il limite
--     della ricerca viene dopo l'ordinamento; il costo solo a chi vede i costi.
--  7. «Salva prezzo» in fila per committente.
-- Non tocca i dati esistenti, salvo nulla: la colonna nuova parte vuota.

alter table public.appalto_rendiconto_righe
  add column if not exists da_rapportino_id uuid references public.campo_rapportini(id) on delete set null;
create index if not exists appalto_rendiconto_da_rapportino_idx
  on public.appalto_rendiconto_righe (da_rapportino_id) where da_rapportino_id is not null;

create or replace function private.prezzo_tariffa_committente(p_order uuid, p_tariffa uuid, p_data date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'appalto_tariffa_id', at.id, 'tariffa_id', at.tariffa_id, 'codice', at.codice,
           'descrizione', at.descrizione, 'unita', at.unita_misura,
           'prezzo', coalesce(tc.prezzo_unitario, at.prezzo_unitario),
           'fonte', case when tc.prezzo_unitario is not null then 'cantiere' else 'committente' end,
           'maggiorazione_straordinario_pct', coalesce(at.maggiorazione_straordinario_pct, c.maggiorazione_straordinario_pct, 0),
           'costo_unitario', (select coalesce(nullif(ta.costo_interno, 0), nullif(ta.prezzo_costo, 0))
                                from public.tariffe_aziendali ta where ta.id = at.tariffa_id))
    from public.orders o
    join public.appalto_tariffe at on at.id = p_tariffa and at.company_id = o.company_id and at.attivo
    join public.appalto_contratti c on c.id = at.contratto_id
    left join public.appalto_tariffe_commessa tc on tc.order_id = o.id and tc.tariffa_id = at.id
   where o.id = p_order and o.deleted_at is null
     and (c.id = o.appalto_contratto_id
          or (o.customer_id is not null and c.committente_id = o.customer_id and c.attivo
              and c.valido_dal <= coalesce(p_data, current_date)
              and (c.valido_al is null or c.valido_al >= coalesce(p_data, current_date))))
     and (at.valido_dal is null or at.valido_dal <= coalesce(p_data, current_date))
     and (at.valido_al is null or at.valido_al >= coalesce(p_data, current_date));
$$;
revoke all on function private.prezzo_tariffa_committente(uuid, uuid, date) from public, anon, authenticated;

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
    v_unita := coalesce(nullif(btrim(v_r->>'unita'), ''), v_prezzo->>'unita', 'cad');
    v_costo_u := nullif(v_prezzo->>'costo_unitario', '')::numeric;

    if v_a_mano or (v_listino is null and v_atar is null) then
      v_fonte := case when v_pu is not null and (v_a_mano or v_pu > 0) then 'manuale' else 'mancante' end;
      v_pu := coalesce(v_pu, 0);
      v_a_mano := v_fonte = 'manuale';
    else
      v_fonte := coalesce(v_prezzo->>'fonte', 'mancante');
      v_pu := coalesce(nullif(v_prezzo->>'prezzo', '')::numeric, 0);
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
    v_righe := v_righe || jsonb_build_array(jsonb_build_object(
      'categoria', 'manodopera',
      'descrizione', v_p.nome,
      'unita', 'ora', 'quantita', v_p.ore,
      'employee_id', v_p.emp,
      'subappaltatore_id', v_p.sub,
      'listino_voce_id', case when v_p.sub is not null
                              then (select s.tariffa_id from public.subappaltatori s where s.id = v_p.sub)
                              else v_ord.tariffa_manodopera_id end));
  end loop;

  -- Operaio da solo, senza elenco presenze: le ore del rapportino sono le sue.
  if jsonb_array_length(v_righe) = 0 and coalesce(v_r.ore_lavorate, 0) + coalesce(v_r.ore_straordinario, 0) > 0 then
    select e.id, btrim(concat_ws(' ', e.first_name, e.last_name)) as nome into v_emp
      from public.employees e
     where e.user_id = v_r.user_id and e.company_id = v_r.company_id
     order by coalesce(e.is_active, true) desc, e.created_at limit 1;
    -- Con una maggiorazione nel contratto gli straordinari vanno su una riga a parte.
    if v_magg > 0 and coalesce(v_r.ore_straordinario, 0) > 0 then
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
             'categoria', 'mezzo',
             'descrizione', coalesce(nullif(btrim(m->>'nome'), ''), mz.nome, 'Mezzo'),
             'unita', 'ora',
             'quantita', case when m->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' and replace(m->>'ore', ',', '.')::numeric > 0
                              then replace(m->>'ore', ',', '.')::numeric else 1 end,
             'mezzo_id', mz.id, 'listino_voce_id', mz.tariffa_id,
             'note', case when not (m->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' and replace(m->>'ore', ',', '.')::numeric > 0)
                          then 'Ore del mezzo non scritte nel rapportino: 1 da correggere' end))
      from jsonb_array_elements(case when jsonb_typeof(v_r.mezzi_usati) = 'array' then v_r.mezzi_usati else '[]'::jsonb end) m
      left join public.mezzi mz on mz.id = case when m->>'mezzo_id' ~* '^[0-9a-f-]{36}$' then (m->>'mezzo_id')::uuid end
                               and mz.company_id = v_r.company_id), '[]'::jsonb);

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

create or replace function private.rendiconto_giornaliero_righe_correnti(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'categoria', r.categoria,
           'descrizione', r.descrizione,
           'unita', r.unita_misura,
           'quantita', r.quantita,
           'prezzo_unitario', case when r.prezzo_a_mano or (r.listino_voce_id is null and r.tariffa_id is null) then r.prezzo_unitario end,
           'prezzo_a_mano', r.prezzo_a_mano,
           'listino_voce_id', r.listino_voce_id,
           'appalto_tariffa_id', r.tariffa_id,
           'da_rapportino_id', r.da_rapportino_id,
           'employee_id', r.employee_id,
           'subappaltatore_id', r.subappaltatore_id,
           'mezzo_id', r.mezzo_id,
           'fase_id', r.fase_id,
           'maggiorazione_pct', nullif(r.maggiorazione_pct, 0),
           'note', r.note)) order by r.ordine, r.created_at), '[]'::jsonb)
    from public.appalto_rendiconto_righe r
   where r.rendiconto_giornaliero_id = p_id;
$$;
revoke all on function private.rendiconto_giornaliero_righe_correnti(uuid) from public, anon, authenticated;

create or replace function public.rendiconto_listino_committente(p_order_id uuid, p_data date, p_testo text default '', p_limite integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare v_testo text := btrim(coalesce(p_testo, '')); v_out jsonb; v_costi boolean;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(p_order_id) then
    raise exception 'Non hai il permesso di vedere questa commessa' using errcode = '42501';
  end if;
  if not coalesce((private.office_order_rights(p_order_id)->>'amounts')::boolean, false) then
    return '[]'::jsonb;
  end if;
  v_costi := coalesce((private.office_order_rights(p_order_id)->>'costs')::boolean, false);
  select coalesce(jsonb_agg(case when v_costi then y.p else y.p - 'costo_unitario' end order by y.ord, y.descr), '[]'::jsonb) into v_out
    from (select x.* from (
      select private.prezzo_tariffa_committente(p_order_id, at.id, p_data)
               || jsonb_build_object('tipo', at.tipo, 'collegata', at.tariffa_id is not null) as p,
             case when v_testo <> '' and lower(coalesce(at.codice, '')) = lower(v_testo) then 0 else 1 end as ord,
             lower(at.descrizione) as descr
        from public.orders o
        join public.appalto_contratti c on c.company_id = o.company_id
         and (c.id = o.appalto_contratto_id
              or (o.appalto_contratto_id is null and o.customer_id is not null and c.committente_id = o.customer_id and c.attivo
                  and c.valido_dal <= coalesce(p_data, current_date)
                  and (c.valido_al is null or c.valido_al >= coalesce(p_data, current_date))))
        join public.appalto_tariffe at on at.contratto_id = c.id and at.attivo
       where o.id = p_order_id
         and (v_testo = '' or at.descrizione ilike '%' || v_testo || '%' or coalesce(at.codice, '') ilike '%' || v_testo || '%')
    ) x
   where x.p is not null
   order by x.ord, x.descr
   limit greatest(1, least(coalesce(p_limite, 30), 100))) y;
  return v_out;
end;
$function$;

create or replace function public.listino_committente_salva_prezzo(
  p_order_id uuid, p_listino_voce_id uuid, p_prezzo numeric, p_unita text default null, p_descrizione text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_o record; v_t record; v_contratto uuid; v_creato boolean := false; v_id uuid; v_unita text; v_tipo text;
begin
  select o.id, o.company_id, o.customer_id, o.appalto_contratto_id into v_o
    from public.orders o where o.id = p_order_id and o.deleted_at is null;
  if not found then raise exception 'Commessa inesistente' using errcode = '23514'; end if;
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or public.utente_sola_lettura(v_o.company_id)
     or not public.puo_vedere_commessa(p_order_id)
     or not public.has_permission_for_company(auth.uid(), 'can_edit_customers', v_o.company_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_o.company_id) then
    raise exception 'Per cambiare il listino del committente serve il permesso «Clienti → modifica» e «Importi»' using errcode = '42501';
  end if;
  if p_prezzo is null or p_prezzo < 0 then raise exception 'Prezzo non valido' using errcode = '22023'; end if;
  select t.id, t.codice, t.nome, t.unita, t.tipo into v_t
    from public.tariffe_aziendali t where t.id = p_listino_voce_id and t.company_id = v_o.company_id;
  if not found then raise exception 'Voce di listino non trovata' using errcode = '23514'; end if;

  perform pg_advisory_xact_lock(hashtextextended('listino_committente:' || coalesce(v_o.customer_id, v_o.id)::text, 0));
  v_contratto := v_o.appalto_contratto_id;
  if v_contratto is null then
    if v_o.customer_id is null then
      raise exception 'La commessa non ha un committente: il prezzo si può salvare solo per questo cantiere' using errcode = '23514';
    end if;
    select c.id into v_contratto from public.appalto_contratti c
     where c.company_id = v_o.company_id and c.committente_id = v_o.customer_id and c.attivo
       and c.valido_dal <= current_date and (c.valido_al is null or c.valido_al >= current_date)
     order by c.valido_dal desc, c.created_at desc limit 1;
    if v_contratto is null then
      begin
        insert into public.appalto_contratti (company_id, committente_id, nome, valido_dal)
        values (v_o.company_id, v_o.customer_id, 'Accordo ' || extract(year from current_date)::int, date_trunc('year', current_date)::date)
        returning id into v_contratto;
      exception when others then
        raise exception 'Il cliente di questa commessa non è segnato come committente: il listino del committente non si può creare. Salva il prezzo solo per questo cantiere, oppure cambia il tipo del contatto.'
          using errcode = '23514';
      end;
      v_creato := true;
    end if;
  end if;

  v_unita := case private.unita_normale(coalesce(nullif(p_unita, ''), v_t.unita))
               when 'ora' then 'ora' when 'giornata' then 'giornata' when 'viaggio' then 'viaggio' when 'km' then 'km'
               when 'mq' then 'mq' when 'ml' then 'ml' when 'mc' then 'mc' when 'kg' then 'kg' when 'corpo' then 'corpo'
               else 'cad' end;
  v_tipo := case when v_t.tipo in ('manodopera', 'trasporto', 'nolo') then v_t.tipo
                 when v_t.tipo in ('posa', 'smaltimento', 'tiro_piano', 'sigillatura') then 'lavorazione'
                 else 'materiale' end;

  select at.id into v_id from public.appalto_tariffe at
   where at.contratto_id = v_contratto and at.tariffa_id = v_t.id and at.attivo
   order by at.created_at limit 1;
  if v_id is not null then
    update public.appalto_tariffe set prezzo_unitario = p_prezzo, updated_at = now() where id = v_id;
  else
    insert into public.appalto_tariffe (company_id, contratto_id, tipo, codice, descrizione, unita_misura, prezzo_unitario, tariffa_id, ordine)
    values (v_o.company_id, v_contratto, v_tipo,
            case when v_t.codice is not null and not exists (
                   select 1 from public.appalto_tariffe x where x.contratto_id = v_contratto and x.codice = v_t.codice)
                 then v_t.codice end,
            coalesce(nullif(btrim(p_descrizione), ''), v_t.nome), v_unita, p_prezzo, v_t.id,
            (select coalesce(max(ordine), 0) + 1 from public.appalto_tariffe where contratto_id = v_contratto))
    returning id into v_id;
  end if;
  return jsonb_build_object('appalto_tariffa_id', v_id, 'contratto_id', v_contratto, 'contratto_creato', v_creato);
end;
$function$;


-- Rapportino rifiutato o annullato dopo essere entrato in un rendiconto.
create or replace function private.rendiconto_rapportino_ritirato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_rg record;
begin
  if not ((new.stato = 'rifiutato' and old.stato is distinct from 'rifiutato')
          or (new.annullato_at is not null and old.annullato_at is null)) then
    return new;
  end if;
  select g.id, g.stato into v_rg
    from public.rendiconto_giornaliero_rapportini l
    join public.rendiconti_giornalieri g on g.id = l.rendiconto_giornaliero_id
   where l.rapportino_id = new.id;
  if v_rg.id is null or v_rg.stato <> 'bozza' then
    return new;
  end if;
  perform set_config('eic.rendiconto_giornaliero', '1', true);
  delete from public.appalto_rendiconto_righe where rendiconto_giornaliero_id = v_rg.id and da_rapportino_id = new.id;
  delete from public.rendiconto_giornaliero_rapportini where rapportino_id = new.id;
  update public.rendiconti_giornalieri set updated_at = now() where id = v_rg.id;
  return new;
end;
$function$;
revoke all on function private.rendiconto_rapportino_ritirato() from public, anon, authenticated;

drop trigger if exists trg_rendiconto_rapportino_ritirato on public.campo_rapportini;
create trigger trg_rendiconto_rapportino_ritirato
  after update of stato, annullato_at on public.campo_rapportini
  for each row execute function private.rendiconto_rapportino_ritirato();

-- La vista dice anche quanti rapportini dentro sono stati rifiutati o annullati dopo.
create or replace view public.v_rendiconti_giornalieri
with (security_invoker = true) as
select g.id, g.company_id, g.order_id, g.data, g.numero, g.stato, g.descrizione_lavori, g.note,
       g.rapportino_id, g.created_at, g.updated_at, g.confermato_at, g.accettato_da_nome, g.accettato_il,
       coalesce(r.righe, 0) as righe,
       coalesce(r.totale, 0) as totale,
       coalesce(r.senza_prezzo, 0) as senza_prezzo,
       r.sal_id,
       (select count(*)::integer from public.rendiconto_giornaliero_rapportini l
         where l.rendiconto_giornaliero_id = g.id) as rapportini,
       case when g.stato = 'annullato' then 0
            else (select count(*)::integer from public.campo_rapportini cr
                   where cr.order_id = g.order_id and cr.data_lavoro = g.data
                     and cr.annullato_at is null and cr.stato in ('inviato', 'approvato')
                     and not exists (select 1 from public.rendiconto_giornaliero_rapportini l where l.rapportino_id = cr.id)
                     and not exists (select 1 from public.appalto_rendiconto_righe rr
                                      where rr.rapportino_id = cr.id and rr.rendiconto_giornaliero_id is null))
       end as rapportini_nuovi,
       (select count(*)::integer from public.rendiconto_giornaliero_rapportini l
          join public.campo_rapportini cr on cr.id = l.rapportino_id
         where l.rendiconto_giornaliero_id = g.id
           and (cr.stato = 'rifiutato' or cr.annullato_at is not null)) as rapportini_ritirati
  from public.rendiconti_giornalieri g
  left join lateral (
    select count(*)::integer as righe, sum(x.importo) as totale,
           (count(*) filter (where x.prezzo_unitario = 0 and not x.prezzo_a_mano))::integer as senza_prezzo,
           min(x.sal_id::text)::uuid as sal_id
      from public.appalto_rendiconto_righe x where x.rendiconto_giornaliero_id = g.id
  ) r on true;
revoke all on public.v_rendiconti_giornalieri from anon;
grant select on public.v_rendiconti_giornalieri to authenticated;
