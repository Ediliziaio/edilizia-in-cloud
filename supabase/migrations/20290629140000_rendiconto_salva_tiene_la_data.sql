-- Rendiconto giornaliero: salvare senza data non lo sposta a oggi
-- ───────────────────────────────────────────────────────────────
-- 27/11/2026. Simulazione di un mese su Demo 2: salvando i prezzi con solo {id, righe} gli 8
-- rendiconti di ottobre sono passati al 27/11 (v_data aveva current_date come predefinito
-- anche in modifica). L'interfaccia manda sempre la data; la regola ora sta nel database.
-- Stessa funzione di 20290629120000 con il solo ramo nuovo su v_data.

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
    perform pg_advisory_xact_lock(hashtextextended('rendiconto_giornaliero:' || v_order::text, 0));
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
    -- Manodopera di una persona senza voce scelta: vale la voce «ore» della commessa.
    if v_listino is null and not coalesce((v_r->>'prezzo_a_mano')::boolean, false)
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
    v_prezzo := private.rendiconto_giornaliero_prezzo(v_order, v_listino, v_data);
    v_descr := coalesce(nullif(btrim(v_r->>'descrizione'), ''), v_prezzo->>'descrizione', 'Voce');
    v_unita := coalesce(nullif(btrim(v_r->>'unita'), ''), v_prezzo->>'unita', 'cad');
    v_costo_u := nullif(v_prezzo->>'costo_unitario', '')::numeric;

    if v_a_mano or v_listino is null then
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
      prezzo_fonte, prezzo_a_mano, ordine)
    values (
      v_order, v_data,
      case when not v_a_mano then nullif(v_prezzo->>'appalto_tariffa_id', '')::uuid end,
      v_descr, v_unita, v_pu, v_q,
      coalesce(nullif(v_r->>'maggiorazione_pct', '')::numeric, 0),
      -- Il costo orario della persona NON si scrive qui: la riga la legge chi ha solo gli importi.
      case when v_emp is null and v_costo_u is not null then round(v_q * v_costo_u, 2) end,
      v_emp, nullif(v_r->>'fase_id', '')::uuid, 'manuale', 'bozza', nullif(btrim(v_r->>'note'), ''),
      v_mezzo, false, v_id,
      case when v_r->>'categoria' in ('manodopera','mezzo','trasporto','materiale','voce') then v_r->>'categoria'
           when v_emp is not null then 'manodopera' when v_mezzo is not null then 'mezzo' else 'voce' end,
      v_listino, v_fonte, v_a_mano, v_i);
  end loop;

  return v_id;
end;
$function$;
