-- Rendiconto giornaliero: si modifica sempre, e il viaggio ha i suoi campi
-- ────────────────────────────────────────────────────────────────────────
-- 28/11/2026. Due cose chieste dal titolare dopo la prova:
--
-- 1. «Il rendiconto può essere sempre modificato: non ha ancora completato il lavoro.» Finora un
--    rendiconto confermato si riapriva (torna bozza), si cambiava e si riconfermava: tre comandi per
--    correggere una quantità, e in mezzo un documento che dice «Bozza» al committente. Ora il
--    salvataggio accetta anche il confermato e lo lascia confermato: le righe tornano 'confermata'
--    subito dopo. Il limite vero resta uno solo — quando il giorno è dentro il rendiconto del periodo
--    (SAL) non si tocca più, perché quel documento è già partito.
--    Stesso motivo in `rendiconto_giornaliero_del_giorno`: i rapportini arrivati dopo entrano anche
--    in un rendiconto confermato, invece di chiedere prima la riapertura.
--
-- 2. «Vorrei avere anche il modello rendiconto trasporto.» Come il rapportino trasporti, una riga di
--    trasporto non è una descrizione libera: ha carico, scarico, mezzo o targa, DDT, km. Stanno in
--    `viaggio` (jsonb), gli stessi nomi dei campi del rapportino (`lib/campo/viaggiRapportino.ts`),
--    così il PDF li stampa e riaprendo il rendiconto si rileggono nei loro campi.
--
-- La vista `v_rendiconti_giornalieri` conta anche le righe per categoria: l'elenco filtra «Trasporti»
-- e scrive «2 persone · 1 mezzo» senza una seconda lettura per ogni rendiconto.
-- Idempotente.

-- 1. Il viaggio sulla riga ─────────────────────────────────────────────────────────────────────
alter table public.appalto_rendiconto_righe add column if not exists viaggio jsonb;

-- Su questa tabella i permessi sono per colonna: una colonna nuova senza GRANT non si legge.
grant select (viaggio), insert (viaggio), update (viaggio) on public.appalto_rendiconto_righe to authenticated;

create or replace view public.appalto_rendiconto_righe_visibili with (security_invoker = true) as
 select id, company_id, order_id, data, tariffa_id, descrizione, unita_misura, prezzo_unitario, quantita,
        maggiorazione_pct, importo,
        private.rendiconto_riga_costo(id) as costo_interno,
        private.rendiconto_riga_margine(id) as margine,
        employee_id, fase_id, origine, rapportino_id, extra_contratto, stato, confermata_da, confermata_at,
        note, created_by, created_at, updated_at, sal_id, voce_libera_id, mezzo_id, rendiconto_giornaliero_id,
        categoria, listino_voce_id, prezzo_fonte, prezzo_a_mano, ordine, subappaltatore_id, da_rapportino_id,
        viaggio
   from public.appalto_rendiconto_righe r;

-- 2. Quante righe per categoria: il filtro «Trasporti» e il riassunto dell'elenco ───────────────
create or replace view public.v_rendiconti_giornalieri as
 select g.id, g.company_id, g.order_id, g.data, g.numero, g.stato, g.descrizione_lavori, g.note,
        g.rapportino_id, g.created_at, g.updated_at, g.confermato_at, g.accettato_da_nome, g.accettato_il,
        coalesce(r.righe, 0) as righe,
        coalesce(r.totale, 0::numeric) as totale,
        coalesce(r.senza_prezzo, 0) as senza_prezzo,
        r.sal_id,
        (select count(*)::integer from public.rendiconto_giornaliero_rapportini l
          where l.rendiconto_giornaliero_id = g.id) as rapportini,
        case when g.stato = 'annullato' then 0 else (
          select count(*)::integer from public.campo_rapportini cr
           where cr.order_id = g.order_id and cr.data_lavoro = g.data and cr.annullato_at is null
             and cr.stato = any (array['inviato', 'approvato'])
             and not exists (select 1 from public.rendiconto_giornaliero_rapportini l where l.rapportino_id = cr.id)
             and not exists (select 1 from public.appalto_rendiconto_righe rr
                              where rr.rapportino_id = cr.id and rr.rendiconto_giornaliero_id is null)) end as rapportini_nuovi,
        (select count(*)::integer from public.rendiconto_giornaliero_rapportini l
           join public.campo_rapportini cr on cr.id = l.rapportino_id
          where l.rendiconto_giornaliero_id = g.id
            and (cr.stato = 'rifiutato' or cr.annullato_at is not null)) as rapportini_ritirati,
        -- In coda, perché `create or replace view` aggiunge colonne solo in fondo: metterle in mezzo
        -- è, per Postgres, rinominare quelle che già ci sono (42P16).
        coalesce(r.n_manodopera, 0) as n_manodopera,
        coalesce(r.n_mezzi, 0) as n_mezzi,
        coalesce(r.n_trasporti, 0) as n_trasporti,
        coalesce(r.n_materiali, 0) as n_materiali,
        coalesce(r.n_voci, 0) as n_voci
   from public.rendiconti_giornalieri g
   left join lateral (
     select count(*)::integer as righe,
            sum(x.importo) as totale,
            count(*) filter (where x.prezzo_unitario = 0::numeric and not x.prezzo_a_mano)::integer as senza_prezzo,
            min(x.sal_id::text)::uuid as sal_id,
            count(*) filter (where x.categoria = 'manodopera')::integer as n_manodopera,
            count(*) filter (where x.categoria = 'mezzo')::integer as n_mezzi,
            count(*) filter (where x.categoria = 'trasporto')::integer as n_trasporti,
            count(*) filter (where x.categoria = 'materiale')::integer as n_materiali,
            count(*) filter (where x.categoria = 'voce')::integer as n_voci
       from public.appalto_rendiconto_righe x
      where x.rendiconto_giornaliero_id = g.id) r on true;

-- 3. Il salvataggio accetta il confermato, e il viaggio ─────────────────────────────────────────
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

  -- Sempre modificabile (28/11/2026): il confermato si corregge e resta confermato. Il limite è il
  -- rendiconto del periodo: di là il documento è già partito.
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
      prezzo_fonte, prezzo_a_mano, ordine, subappaltatore_id, da_rapportino_id, viaggio)
    values (
      v_order, v_data,
      coalesce(v_atar, case when not v_a_mano then nullif(v_prezzo->>'appalto_tariffa_id', '')::uuid end),
      v_descr, v_unita, v_pu, v_q,
      coalesce(nullif(v_r->>'maggiorazione_pct', '')::numeric, 0),
      v_costo,
      v_emp, nullif(v_r->>'fase_id', '')::uuid, 'manuale', 'bozza', nullif(btrim(v_r->>'note'), ''),
      v_mezzo, false, v_id,
      case when v_r->>'categoria' in ('manodopera','mezzo','trasporto','materiale','voce') then v_r->>'categoria'
           when v_emp is not null or v_sub is not null then 'manodopera' when v_mezzo is not null then 'mezzo' else 'voce' end,
      v_listino, v_fonte, v_a_mano, v_i, v_sub, v_da_rap,
      case when jsonb_typeof(v_r->'viaggio') = 'object' and v_r->'viaggio' <> '{}'::jsonb then v_r->'viaggio' end);
  end loop;

  -- Era confermato: resta confermato. Le regole della conferma valgono lo stesso.
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

-- 4. I rapportini arrivati dopo entrano anche in un rendiconto confermato ───────────────────────
create or replace function public.rendiconto_giornaliero_del_giorno(p_order_id uuid, p_data date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_rg record;
  v_nuovi uuid[];
  v_righe jsonb := '[]'::jsonb;
  v_descr text;
  v_id uuid;
  v_aggiunti integer := 0;
  v_tot integer;
  v_r uuid;
  v_sal integer;
begin
  if p_order_id is null or p_data is null then
    raise exception 'Servono commessa e giorno' using errcode = '22023';
  end if;
  perform private.rendiconto_giornaliero_puo_scrivere(p_order_id);
  perform pg_advisory_xact_lock(hashtextextended('rendiconto_giornaliero:' || p_order_id::text, 0));

  select g.id, g.numero, g.stato, g.descrizione_lavori into v_rg
    from public.rendiconti_giornalieri g
   where g.order_id = p_order_id and g.data = p_data and g.stato <> 'annullato'
   order by (g.stato = 'bozza') desc, g.numero
   limit 1;

  select coalesce(array_agg(x), '{}') into v_nuovi from private.rapportini_del_giorno_liberi(p_order_id, p_data) x;

  -- Dentro il rendiconto del periodo non si aggiunge più niente: quel documento è già partito.
  if v_rg.id is not null then
    select min(s.numero) into v_sal
      from public.appalto_rendiconto_righe r join public.appalto_sal s on s.id = r.sal_id
     where r.rendiconto_giornaliero_id = v_rg.id;
    if v_sal is not null then
      select count(*) into v_tot from public.rendiconto_giornaliero_rapportini where rendiconto_giornaliero_id = v_rg.id;
      return jsonb_build_object('id', v_rg.id, 'numero', v_rg.numero, 'stato', v_rg.stato,
                                'aggiunti', 0, 'rapportini', v_tot, 'nuovi', coalesce(array_length(v_nuovi, 1), 0));
    end if;
  end if;

  foreach v_r in array v_nuovi loop
    v_righe := v_righe || private.rendiconto_giornaliero_righe_da_rapportino(v_r);
  end loop;
  v_aggiunti := jsonb_array_length(v_righe);

  select string_agg(btrim(cr.descrizione_lavori), E'\n' order by cr.created_at) into v_descr
    from public.campo_rapportini cr
   where cr.id = any(v_nuovi) and coalesce(btrim(cr.descrizione_lavori), '') <> '';

  if v_rg.id is null then
    v_id := public.rendiconto_giornaliero_salva(jsonb_build_object(
      'order_id', p_order_id, 'data', p_data, 'descrizione_lavori', v_descr, 'righe', v_righe));
  else
    v_id := v_rg.id;
    if v_aggiunti > 0 or array_length(v_nuovi, 1) > 0 then
      perform public.rendiconto_giornaliero_salva(
        jsonb_build_object('id', v_id, 'data', p_data,
                           'righe', private.rendiconto_giornaliero_righe_correnti(v_id) || v_righe)
        || case when coalesce(btrim(v_rg.descrizione_lavori), '') = '' and v_descr is not null
                then jsonb_build_object('descrizione_lavori', v_descr)
                when v_descr is not null
                then jsonb_build_object('descrizione_lavori', v_rg.descrizione_lavori || E'\n' || v_descr)
                else '{}'::jsonb end);
    end if;
  end if;

  insert into public.rendiconto_giornaliero_rapportini (rapportino_id, rendiconto_giornaliero_id)
  select x, v_id from unnest(v_nuovi) x
  on conflict (rapportino_id) do nothing;

  select g.numero, g.stato into v_rg from public.rendiconti_giornalieri g where g.id = v_id;
  select count(*) into v_tot from public.rendiconto_giornaliero_rapportini where rendiconto_giornaliero_id = v_id;
  return jsonb_build_object('id', v_id, 'numero', v_rg.numero, 'stato', v_rg.stato,
                            'aggiunti', v_aggiunti, 'rapportini', v_tot, 'nuovi', 0);
end;
$function$;

-- 5. Le righe correnti rimandano anche il viaggio, se no un salvataggio lo perde ────────────────
create or replace function private.rendiconto_giornaliero_righe_correnti(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'categoria', r.categoria, 'descrizione', r.descrizione, 'unita', r.unita_misura, 'quantita', r.quantita,
           'prezzo_unitario', case when r.prezzo_a_mano or (r.listino_voce_id is null and r.tariffa_id is null) then r.prezzo_unitario end,
           'prezzo_a_mano', r.prezzo_a_mano, 'listino_voce_id', r.listino_voce_id,
           'appalto_tariffa_id', r.tariffa_id, 'da_rapportino_id', r.da_rapportino_id,
           'employee_id', r.employee_id, 'subappaltatore_id', r.subappaltatore_id, 'mezzo_id', r.mezzo_id,
           'fase_id', r.fase_id, 'maggiorazione_pct', nullif(r.maggiorazione_pct, 0), 'note', r.note,
           'viaggio', r.viaggio))
           order by r.ordine, r.created_at), '[]'::jsonb)
    from public.appalto_rendiconto_righe r where r.rendiconto_giornaliero_id = p_id;
$function$;

-- 6. Le voci di viaggio del rapportino portano i loro dettagli nel rendiconto ───────────────────
-- Solo una riga cambia rispetto a prima: la voce di trasporto passa anche `viaggio`.
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
  select c.maggiorazione_straordinario_pct into v_magg
    from public.appalto_contratti c
   where c.company_id = v_r.company_id
     and (c.id = v_ord.appalto_contratto_id
          or (v_ord.appalto_contratto_id is null and c.committente_id = v_ord.customer_id and c.attivo
              and c.valido_dal <= v_r.data_lavoro and (c.valido_al is null or c.valido_al >= v_r.data_lavoro)))
   order by (c.id = v_ord.appalto_contratto_id) desc, c.valido_dal desc limit 1;
  v_magg := coalesce(v_magg, 0);

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

  if jsonb_array_length(v_righe) = 0 and coalesce(v_r.ore_lavorate, 0) + coalesce(v_r.ore_straordinario, 0) > 0 then
    select e.id, btrim(concat_ws(' ', e.first_name, e.last_name)) as nome into v_emp
      from public.employees e
     where e.user_id = v_r.user_id and e.company_id = v_r.company_id
     order by coalesce(e.is_active, true) desc, e.created_at limit 1;
    v_unita := private.unita_della_voce(v_r.order_id, v_ord.tariffa_manodopera_id, v_r.data_lavoro);
    if v_unita <> 'ora' then
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

  v_righe := v_righe || coalesce((
    select jsonb_agg(jsonb_build_object(
             'categoria', case when v.viaggio is not null then 'trasporto' else 'voce' end,
             'descrizione', v.descrizione, 'unita', v.unita, 'quantita', v.quantita,
             'listino_voce_id', v.tariffa_id,
             'viaggio', v.viaggio,
             'prezzo_unitario', v.vendita_unitaria,
             'prezzo_a_mano', coalesce(v.prezzo_a_mano, false) or (v.tariffa_id is null and coalesce(v.vendita_unitaria, 0) > 0))
           order by v.created_at)
      from public.rapportino_voci_libere v where v.rapportino_id = p_rapportino_id), '[]'::jsonb);

  v_righe := v_righe || coalesce((
    select jsonb_agg(jsonb_build_object(
             'categoria', 'materiale',
             'descrizione', coalesce(nullif(btrim(m->>'nome'), ''), 'Materiale'),
             'unita', coalesce(nullif(btrim(m->>'unita'), ''), 'cad'),
             'quantita', case when m->>'quantita' ~ '^[0-9]+([.,][0-9]+)?$' then replace(m->>'quantita', ',', '.')::numeric else 1 end))
      from jsonb_array_elements(case when jsonb_typeof(v_r.materiali_usati) = 'array' then v_r.materiali_usati else '[]'::jsonb end) m
     where coalesce(nullif(btrim(m->>'nome'), ''), '') <> ''), '[]'::jsonb);

  select coalesce(jsonb_agg(x.v || jsonb_build_object('da_rapportino_id', p_rapportino_id) order by x.n), '[]'::jsonb) into v_righe
    from jsonb_array_elements(v_righe) with ordinality as x(v, n);
  return v_righe;
end;
$function$;
