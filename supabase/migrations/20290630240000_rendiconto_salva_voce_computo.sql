-- Il salvataggio del rendiconto porta dentro «voce del computo» e «lavoro extra»
-- ─────────────────────────────────────────────────────────────────────────────
-- 28/11/2026, dalle prove del caos sulla 20290630220000.
--
-- La regola nuova («su una commessa a computo ogni voce a prezzo deve dire se è del computo o un
-- extra») sarebbe stata una regressione secca: `rendiconto_giornaliero_salva` scrive le righe con
-- `extra_contratto = false` fisso e non conosce `voce_computo_id`, quindi sulle commesse a computo
-- **il rendiconto non si sarebbe più salvato**. Le righe di un rendiconto giornaliero, del resto,
-- non si inseriscono da fuori: `rendiconto_giornaliero_righe_guardia` obbliga a passare da qui
-- («Questa riga fa parte del rendiconto del giorno n. X: si modifica da lì»), ed è giusto.
--
-- Qui la funzione legge dal JSON di ogni riga due campi in più e li scrive:
--   * `voce_computo_id` — la voce del computo che la riga misura;
--   * `extra_contratto` — la riga è un lavoro fuori contratto.
-- Il resto è identico, riga per riga, alla versione del 28/11/2026.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.rendiconto_giornaliero_salva(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_costo numeric;
  v_ore numeric;
  v_emp uuid;
  v_mezzo uuid;
  v_sub uuid;
  v_atar uuid;
  v_altro integer;
  v_da_rap uuid;
  v_era_confermato boolean := false;
  v_sal integer;
  v_senza integer;
  -- 28/11/2026: il legame col computo e il lavoro extra arrivano dall'editor.
  v_voce uuid;
  v_extra boolean;
begin
  if v_id is not null then
    select * into v_rg from public.rendiconti_giornalieri where id = v_id for update;
    if not found then raise exception 'Rendiconto inesistente' using errcode = '23514'; end if;
    v_order := v_rg.order_id;
    if nullif(p->>'data', '') is null then v_data := v_rg.data; end if;
  end if;
  if v_order is null then raise exception 'Manca la commessa' using errcode = '22023'; end if;
  v_company := private.rendiconto_giornaliero_puo_scrivere(v_order);
  perform pg_advisory_xact_lock(hashtextextended('rendiconto_giornaliero:' || v_order::text, 0));
  select g.numero into v_altro from public.rendiconti_giornalieri g
   where g.order_id = v_order and g.data = v_data and g.stato <> 'annullato' and g.id is distinct from v_id
   order by g.numero limit 1;
  if v_altro is not null then
    raise exception 'Il % c''è già il rendiconto n. %: aprilo da lì', to_char(v_data, 'DD/MM/YYYY'), v_altro using errcode = '23505';
  end if;
  if v_id is not null then
    if v_data is distinct from v_rg.data and exists (
         select 1 from public.rendiconto_giornaliero_rapportini l where l.rendiconto_giornaliero_id = v_id) then
      raise exception 'Questo rendiconto contiene rapportini del %: la data non si cambia', to_char(v_rg.data, 'DD/MM/YYYY') using errcode = '23514';
    end if;
  end if;

  if v_id is not null then
    if v_rg.stato = 'annullato' then
      raise exception 'Il rendiconto n. % è annullato: non si modifica', v_rg.numero using errcode = '23514';
    end if;
    if v_rg.stato = 'confermato' then
      select min(s.numero) into v_sal
        from public.appalto_rendiconto_righe r join public.appalto_sal s on s.id = r.sal_id
       where r.rendiconto_giornaliero_id = v_id;
      if v_sal is not null then
        raise exception 'Il giorno è già nel rendiconto del periodo n. %: annulla quello per modificarlo', v_sal
          using errcode = '23514';
      end if;
      v_era_confermato := true;
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
    v_voce := nullif(v_r->>'voce_computo_id', '')::uuid;
    v_extra := coalesce((v_r->>'extra_contratto')::boolean, false);
    if v_da_rap is not null and not exists (select 1 from public.campo_rapportini cr where cr.id = v_da_rap and cr.order_id = v_order) then
      v_da_rap := null;
    end if;
    if v_sub is not null and not exists (select 1 from public.subappaltatori s where s.id = v_sub and s.company_id = v_company) then
      raise exception 'Ditta non trovata in azienda' using errcode = '23514';
    end if;
    if v_listino is null and v_atar is null and v_sub is not null
       and not coalesce((v_r->>'prezzo_a_mano')::boolean, false) then
      select s.tariffa_id into v_listino from public.subappaltatori s where s.id = v_sub;
    end if;
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
      v_unita := coalesce(v_prezzo->>'unita', nullif(btrim(v_r->>'unita'), ''), 'cad');
    end if;
    if v_pu < 0 then raise exception 'Il prezzo non può essere negativo' using errcode = '22023'; end if;

    v_ore := coalesce(nullif(replace(v_r->>'ore', ',', '.'), '')::numeric,
                      private.ore_equivalenti(v_q, v_unita));
    v_costo := case
      when v_emp is not null and v_ore is not null
        then round(v_ore * nullif(public.costo_orario_calcolato(v_emp), 0), 2)
    end;
    if v_costo is null and v_costo_u is not null then
      v_costo := round(v_q * v_costo_u, 2);
    end if;

    insert into public.appalto_rendiconto_righe (
      order_id, data, tariffa_id, descrizione, unita_misura, prezzo_unitario, quantita,
      maggiorazione_pct, costo_interno, employee_id, fase_id, origine, stato, note,
      mezzo_id, extra_contratto, rendiconto_giornaliero_id, categoria, listino_voce_id,
      prezzo_fonte, prezzo_a_mano, ordine, subappaltatore_id, da_rapportino_id, viaggio,
      voce_computo_id)
    values (
      v_order, v_data,
      coalesce(v_atar, case when not v_a_mano then nullif(v_prezzo->>'appalto_tariffa_id', '')::uuid end),
      v_descr, v_unita, v_pu, v_q,
      coalesce(nullif(v_r->>'maggiorazione_pct', '')::numeric, 0),
      v_costo,
      v_emp, nullif(v_r->>'fase_id', '')::uuid, 'manuale', 'bozza', nullif(btrim(v_r->>'note'), ''),
      v_mezzo, v_extra, v_id,
      case when v_r->>'categoria' in ('manodopera','mezzo','trasporto','materiale','voce') then v_r->>'categoria'
           when v_emp is not null or v_sub is not null then 'manodopera' when v_mezzo is not null then 'mezzo' else 'voce' end,
      v_listino, v_fonte, v_a_mano, v_i, v_sub, v_da_rap,
      case when jsonb_typeof(v_r->'viaggio') = 'object' and v_r->'viaggio' <> '{}'::jsonb then v_r->'viaggio' end,
      v_voce);
  end loop;

  if v_era_confermato then
    if v_i = 0 then raise exception 'Il rendiconto non ha righe' using errcode = '23514'; end if;
    select count(*) filter (where prezzo_unitario = 0 and not prezzo_a_mano) into v_senza
      from public.appalto_rendiconto_righe where rendiconto_giornaliero_id = v_id;
    if v_senza > 0 then
      raise exception 'Ci sono % righe senza prezzo: scrivilo, o scrivi 0 a mano se non si fanno pagare', v_senza
        using errcode = '23514';
    end if;
    update public.appalto_rendiconto_righe set stato = 'confermata'
     where rendiconto_giornaliero_id = v_id and stato = 'bozza';
  end if;

  return v_id;
end;
$function$;
