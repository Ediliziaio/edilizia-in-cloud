-- Rapportini: mezzi e ditte col prezzo dal listino (14/11/2026)
-- Piano: docs/piano-rapportino-economico-20261114.md, lotto G. Segue 20290318120100.
--
-- Nato su Impresa Vulcano: il listino generale ha 17 noli a ora per categoria (escavatore 16/40/60…
-- qli, camion 2/3/4 assi, camion gru…) e le ore in economia dei subappaltatori, ma nel rapportino le
-- ore dei mezzi e delle ditte uscivano «da definire».
--
-- - Ogni mezzo e ogni ditta si collega alla SUA voce del listino generale (mezzi.tariffa_id,
--   subappaltatori.tariffa_id): per id, scelta da una persona, mai per nome somigliante.
-- - Il prezzo segue la regola unica (cantiere → committente → generale → da definire), ore × prezzo,
--   a giornata 8 ore = 1 giornata come per le persone.
-- - All'approvazione anche questi prezzi si fotografano in prezzi_registrati (con mezzo_id o
--   subappaltatore_id): cambiare listino o collegamento dopo non tocca i rapportini approvati.
-- - Il costo resta quello di prima (mezzo: costo orario effettivo; ditta: da contratto).
--
-- Solo schema e funzioni: nessuna riga esistente viene riscritta.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Il collegamento ───────────────────────────────────────────────────────────────────────────
alter table public.mezzi
  add column if not exists tariffa_id uuid references public.tariffe_aziendali(id) on delete set null;
comment on column public.mezzi.tariffa_id is
  'Voce del listino generale con cui si vendono le ore di questo mezzo (nolo). Vuota = ore del mezzo non vendute a parte.';
alter table public.subappaltatori
  add column if not exists tariffa_id uuid references public.tariffe_aziendali(id) on delete set null;
comment on column public.subappaltatori.tariffa_id is
  'Voce del listino generale con cui si vendono le ore in economia di questa ditta.';
grant select (tariffa_id) on public.mezzi to authenticated;
grant select (tariffa_id) on public.subappaltatori to authenticated;

create or replace function public.voce_listino_imposta(p_tipo text, p_id uuid, p_tariffa_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_company uuid;
begin
  if p_tipo = 'mezzo' then
    select m.company_id into v_company from public.mezzi m where m.id = p_id and m.deleted_at is null;
  elsif p_tipo = 'ditta' then
    select s.company_id into v_company from public.subappaltatori s where s.id = p_id;
  else
    raise exception 'Tipo non valido: mezzo o ditta' using errcode = '22023';
  end if;
  if v_company is null then raise exception 'Non trovato' using errcode = 'P0002'; end if;
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or public.user_can_access_company(v_company) is not true
     or public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company) is not true
     or public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_company) is not true then
    raise exception 'Serve il permesso «Modifica commesse» e «Importi delle commesse» per collegare la voce del listino'
      using errcode = '42501';
  end if;
  if p_tariffa_id is not null and not exists (
    select 1 from public.tariffe_aziendali t where t.id = p_tariffa_id and t.company_id = v_company
  ) then
    raise exception 'La voce scelta non è nel listino di questa azienda' using errcode = '23503';
  end if;
  if p_tipo = 'mezzo' then
    update public.mezzi set tariffa_id = p_tariffa_id where id = p_id;
  else
    update public.subappaltatori set tariffa_id = p_tariffa_id where id = p_id;
  end if;
end $$;

revoke all on function public.voce_listino_imposta(text, uuid, uuid) from public, anon;
grant execute on function public.voce_listino_imposta(text, uuid, uuid) to authenticated;

-- ── 2. Il prezzo delle ore da una voce qualsiasi (persone, ditte, mezzi) ─────────────────────────
create or replace function private.prezzo_ore_voce(p_order uuid, p_voce uuid, p_data date, p_ore numeric)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
declare p jsonb; v_u text; v_q numeric; v_prezzo numeric;
begin
  if p_voce is null or coalesce(p_ore, 0) <= 0 then return null; end if;
  p := private.prezzo_voce_commessa_raw(p_order, p_voce, p_data);
  if p is null then return null; end if;
  v_prezzo := nullif(p->>'prezzo', '')::numeric;
  v_u := private.unita_normale(p->>'unita');
  if v_u = 'ora' then
    v_q := p_ore;
  elsif v_u = 'giornata' then
    v_q := case when p_ore <= 4 then 0.5 else 1 end;
  else
    return jsonb_build_object('fonte', p->>'fonte', 'unita', p->>'unita', 'prezzo', null, 'ricavo', null,
                              'quantita', null, 'motivo', 'La voce non è a ora né a giornata');
  end if;
  return jsonb_build_object(
    'tariffa_id', p_voce, 'descrizione', p->>'descrizione', 'fonte', p->>'fonte', 'unita', p->>'unita',
    'quantita', v_q, 'prezzo', v_prezzo,
    'ricavo', case when v_prezzo is null then null else round(v_q * v_prezzo, 2) end);
end $$;

revoke all on function private.prezzo_ore_voce(uuid, uuid, date, numeric) from public, anon, authenticated;

create or replace function private.prezzo_ore_commessa(p_order uuid, p_data date, p_ore numeric)
returns jsonb
language sql
stable security definer
set search_path to ''
as $$
  select private.prezzo_ore_voce(p_order, o.tariffa_manodopera_id, p_data, p_ore)
    from public.orders o where o.id = p_order and o.deleted_at is null
$$;

revoke all on function private.prezzo_ore_commessa(uuid, date, numeric) from public, anon, authenticated;

-- ── 3. Il quadro: prezzo anche per ditte e mezzi ─────────────────────────────────────────────────
create or replace function private.office_rapportino_economia_raw(p_rapportino_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_r public.campo_rapportini%rowtype;
  v_ord record;
  v_persone jsonb;
  v_mezzi jsonb;
  v_manca jsonb;
  v_economia jsonb;
  v_fissati jsonb;
begin
  select * into v_r from public.campo_rapportini where id = p_rapportino_id;
  if not found then return null; end if;
  if public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(v_r.order_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_costs', v_r.company_id) then
    raise exception 'Non hai il permesso di vedere i costi' using errcode = '42501';
  end if;
  select o.order_type, o.valorizzazione, o.tariffa_manodopera_id into v_ord from public.orders o where o.id = v_r.order_id;
  -- Il prezzo fotografato all'approvazione (persone, ditte, mezzi): un listino cambiato dopo non lo tocca.
  v_fissati := case when v_r.costo_registrato_at is not null and jsonb_typeof(v_r.prezzi_registrati) = 'array'
                    then v_r.prezzi_registrati else '[]'::jsonb end;

  with pres as (
    select case when p->>'employee_id' ~* '^[0-9a-f-]{36}$' then (p->>'employee_id')::uuid end as emp,
           case when p->>'subappaltatore_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (p->>'subappaltatore_id')::uuid end as sub,
           nullif(btrim(p->>'nome'), '') as nome,
           (p->>'subappaltatore_id') is not null as ditta,
           case when p->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' then replace(p->>'ore', ',', '.')::numeric else 0 end as ore
      from jsonb_array_elements(public.campo_presenze_effettive(v_r)) p
  ), persone as (
    select emp, min(sub::text)::uuid as sub, min(nome) as nome, bool_or(ditta) as ditta, sum(ore) as ore
      from pres group by emp, case when emp is null then coalesce(sub::text, nome) end
  ), registrato as (
    -- Un costo registrato a 0 su ore vere, o segnato mancante, non è un costo: torna null.
    select (s->>'employee_id')::uuid as emp,
           case when bool_or(coalesce((s->>'costo_mancante')::boolean, false)
                             or (coalesce((s->>'costo')::numeric, 0) = 0 and coalesce((s->>'ore')::numeric, 0) > 0))
                then null else sum((s->>'costo')::numeric) end as costo
      from jsonb_array_elements(case when v_r.costo_registrato_at is not null and jsonb_typeof(v_r.presenze_registrate) = 'array'
                                     then v_r.presenze_registrate else '[]'::jsonb end) s
     where s->>'employee_id' is not null
     group by 1
  ), fissati as (
    select nullif(s->>'employee_id', '')::uuid as emp, nullif(s->>'subappaltatore_id', '')::uuid as sub,
           true as con_prezzo, s->>'prezzo_fonte' as prezzo_fonte, s->>'unita' as unita,
           nullif(s->>'quantita', '')::numeric as quantita, nullif(s->>'prezzo', '')::numeric as prezzo,
           nullif(s->>'ricavo', '')::numeric as ricavo
      from jsonb_array_elements(v_fissati) s
     where s->>'employee_id' is not null or s->>'subappaltatore_id' is not null
  ), vendita as (
    select c.employee_id as emp, min(t.unita_misura) as unita, sum(c.quantita) as quantita,
           max(coalesce(tc.prezzo_unitario, t.prezzo_unitario)) as prezzo,
           round(sum(c.quantita * coalesce(tc.prezzo_unitario, t.prezzo_unitario) * (1 + c.maggiorazione_pct / 100.0)), 2) as ricavo,
           case when bool_or(tc.prezzo_unitario is not null) then 'cantiere' else 'committente' end as fonte
      from public.appalto_righe_da_rapportino_calcola(p_rapportino_id) c
      join public.appalto_tariffe t on t.id = c.tariffa_id
      left join public.appalto_tariffe_commessa tc on tc.order_id = v_r.order_id and tc.tariffa_id = c.tariffa_id
     where c.motivo is null
     group by c.employee_id
  ), righe as (
    select p.emp, p.sub, coalesce(nullif(btrim(concat_ws(' ', e.first_name, e.last_name)), ''), s.ragione_sociale, p.nome, 'Senza nome') as nome,
           p.ditta, p.ore,
           case when p.ditta then s.tariffa_id end as voce_ditta,
           case when p.emp is not null then nullif(public.costo_orario_calcolato(p.emp), 0) end as costo_orario,
           case when r.emp is not null then r.costo
                when p.emp is not null then round(p.ore * nullif(public.costo_orario_calcolato(p.emp), 0), 2) end as costo,
           case when f.con_prezzo then f.unita else coalesce(v.unita, n->>'unita') end as unita,
           case when f.con_prezzo then f.quantita else coalesce(v.quantita, (n->>'quantita')::numeric) end as quantita,
           case when f.con_prezzo then f.prezzo else coalesce(v.prezzo, (n->>'prezzo')::numeric) end as prezzo,
           case when f.con_prezzo then f.ricavo else coalesce(v.ricavo, (n->>'ricavo')::numeric) end as ricavo,
           case when f.con_prezzo then f.prezzo_fonte else coalesce(v.fonte, n->>'fonte') end as prezzo_fonte
      from persone p
      left join public.employees e on e.id = p.emp and e.company_id = v_r.company_id
      left join public.subappaltatori s on s.id = p.sub and s.company_id = v_r.company_id
      left join registrato r on r.emp = p.emp
      left join fissati f on (p.emp is not null and f.emp = p.emp) or (p.emp is null and p.sub is not null and f.sub = p.sub)
      left join vendita v on v.emp is not distinct from p.emp and p.emp is not null
      -- Persone: la voce delle ore della commessa; ditte: la voce della ditta.
      left join lateral (select case when coalesce(f.con_prezzo, false) or v.emp is not null then null
                                     when p.ditta then private.prezzo_ore_voce(v_r.order_id, s.tariffa_id, v_r.data_lavoro, p.ore)
                                     else private.prezzo_ore_commessa(v_r.order_id, v_r.data_lavoro, p.ore) end as n) x on true
     where p.ore > 0
  )
  select coalesce(jsonb_agg((to_jsonb(righe) - 'n') order by nome), '[]'::jsonb) into v_persone from righe;

  select coalesce(jsonb_agg(jsonb_build_object('mezzo_id', u.mezzo, 'nome', coalesce(m.nome, u.nome), 'noleggio', coalesce(m.possesso, '') like 'noleggio%',
          'ore', coalesce(s.ore, u.ore), 'ore_stimate', coalesce(s.ore_stimate, u.stimate),
          'costo_orario', coalesce(s.costo_orario, case when s.rapportino_id is null then public.mezzo_costo_orario_effettivo(u.mezzo) end),
          'importo', coalesce(s.importo, case when s.rapportino_id is null then round(u.ore * public.mezzo_costo_orario_effettivo(u.mezzo), 2) end),
          'voce_mezzo', m.tariffa_id,
          'prezzo', coalesce(f->'prezzo', n->'prezzo'), 'ricavo', coalesce(f->'ricavo', n->'ricavo'),
          'unita', coalesce(f->'unita', n->'unita'), 'quantita', coalesce(f->'quantita', n->'quantita'),
          'prezzo_fonte', coalesce(f->'prezzo_fonte', n->'fonte')) order by coalesce(m.nome, u.nome)), '[]'::jsonb)
    into v_mezzi
    from (select (e->>'mezzo_id')::uuid as mezzo, min(e->>'nome') as nome,
                 sum(case when replace(e->>'ore', ',', '.') ~ '^[0-9]+([.][0-9]+)?$' and replace(e->>'ore', ',', '.')::numeric > 0 then replace(e->>'ore', ',', '.')::numeric else 8 end) as ore,
                 bool_or(not coalesce(replace(e->>'ore', ',', '.') ~ '^[0-9]+([.][0-9]+)?$' and replace(e->>'ore', ',', '.')::numeric > 0, false)) as stimate
            from jsonb_array_elements(case when jsonb_typeof(v_r.mezzi_usati) = 'array' then v_r.mezzi_usati else '[]'::jsonb end) e
           where e->>'mezzo_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' group by 1) u
    left join public.mezzi m on m.id = u.mezzo and m.company_id = v_r.company_id
    left join public.rapportino_mezzi_costi s on s.rapportino_id = p_rapportino_id and s.mezzo_id = u.mezzo
    left join lateral (select x as f from jsonb_array_elements(v_fissati) x where x->>'mezzo_id' = u.mezzo::text limit 1) fx on true
    left join lateral (select case when fx.f is null then private.prezzo_ore_voce(v_r.order_id, m.tariffa_id, v_r.data_lavoro, u.ore) end as n) nx on true;

  -- Cosa manca perché il costo del giorno sia completo: persone senza costo orario (o senza scheda) e
  -- mezzi di proprietà senza costo orario. Le ditte esterne e i noleggi hanno il costo altrove.
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_manca from (
    select jsonb_build_object('tipo', 'persona', 'nome', v->>'nome',
             'motivo', case when v->>'emp' is null then 'senza scheda dipendente' else 'costo orario mancante' end) as x
      from jsonb_array_elements(v_persone) v
     where not coalesce((v->>'ditta')::boolean, false) and v->'costo' = 'null'::jsonb
    union all
    select jsonb_build_object('tipo', 'mezzo', 'nome', coalesce(v->>'nome', 'Mezzo'), 'motivo', 'costo orario mancante')
      from jsonb_array_elements(v_mezzi) v
     where not coalesce((v->>'noleggio')::boolean, false) and (v->'importo' is null or v->'importo' = 'null'::jsonb)
  ) z;

  -- Come la commessa vende le ore: voce di manodopera scelta, contratto per qualifica, o non a parte.
  v_economia := case
    when v_ord.tariffa_manodopera_id is not null then
      (select jsonb_build_object('modo', 'voce', 'tariffa_id', t.id, 'codice', t.codice, 'descrizione', t.nome, 'unita', t.unita)
         from public.tariffe_aziendali t where t.id = v_ord.tariffa_manodopera_id)
    when v_ord.order_type is not distinct from 'appaltatore_lavoro' and v_ord.valorizzazione is distinct from 'a_corpo' then
      jsonb_build_object('modo', 'contratto')
    else jsonb_build_object('modo', 'no') end;

  return jsonb_build_object(
    'persone', v_persone,
    'mezzi', v_mezzi,
    'voci', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'descrizione', x.descrizione, 'quantita', x.quantita, 'unita', x.unita,
              'costo_unitario', x.costo_unitario, 'vendita_unitaria', x.vendita_unitaria,
              'codice', x.codice, 'prezzo_fonte', x.prezzo_fonte,
              'vendita_proposta', x.vendita_proposta, 'prezzo_a_mano', x.prezzo_a_mano) order by x.created_at)
            from public.rapportino_voci_libere x where x.rapportino_id = p_rapportino_id), '[]'::jsonb),
    'costo_da_completare', v_manca,
    'ore_in_economia', v_economia,
    'order_id', v_r.order_id,
    'appalto', v_ord.order_type is not distinct from 'appaltatore_lavoro',
    'a_corpo', v_ord.valorizzazione is not distinct from 'a_corpo',
    'registrato', v_r.costo_registrato_at is not null
  );
end;
$function$;

-- Il collegamento al listino di mezzi e ditte è un dato sugli importi.
insert into private.office_projection_fields (table_name, column_name, right_name)
select 'rapportino_voci_libere', c, 'amounts'
  from unnest(array['voce_mezzo', 'voce_ditta']) c
 where not exists (select 1 from private.office_projection_fields f where f.table_name = 'rapportino_voci_libere' and f.column_name = c);

-- ── 4. All'approvazione si fotografano anche i prezzi di ditte e mezzi ───────────────────────────
create or replace function public.fn_rapportino_costo_manodopera()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fase uuid;
  v_pres jsonb;
  v_item jsonb;
  v_emp record;
  v_tariffa numeric;
  v_mancante boolean;
  v_ore numeric;
  v_costo numeric;
  v_totale numeric := 0;
  v_snapshot jsonb := '[]'::jsonb;
  v_row_id uuid;
  v_vendita jsonb;
  v_appalto jsonb := '{}'::jsonb;
  v_prezzi jsonb := '[]'::jsonb;
  v_altro record;
begin
  if new.stato = 'approvato' and old.stato is distinct from 'approvato'
     and new.costo_registrato_at is null then

    if jsonb_typeof(new.fasi_lavorate) = 'array'
       and jsonb_array_length(new.fasi_lavorate) = 1 then
      v_fase := (new.fasi_lavorate->0->>'phase_id')::uuid;
    end if;

    v_pres := public.campo_presenze_effettive(new);

    -- Prezzo delle ore dal contratto per qualifica (appalti a misura), persona per persona.
    select coalesce(jsonb_object_agg(z.emp, jsonb_build_object('unita', z.unita, 'quantita', z.quantita, 'prezzo', z.prezzo,
                                                               'ricavo', z.ricavo, 'prezzo_fonte', z.fonte)), '{}'::jsonb)
      into v_appalto
      from (select c.employee_id::text as emp, min(t.unita_misura) as unita, sum(c.quantita) as quantita,
                   max(coalesce(tc.prezzo_unitario, t.prezzo_unitario)) as prezzo,
                   round(sum(c.quantita * coalesce(tc.prezzo_unitario, t.prezzo_unitario) * (1 + c.maggiorazione_pct / 100.0)), 2) as ricavo,
                   case when bool_or(tc.prezzo_unitario is not null) then 'cantiere' else 'committente' end as fonte
              from public.appalto_righe_da_rapportino_calcola(new.id) c
              join public.appalto_tariffe t on t.id = c.tariffa_id
              left join public.appalto_tariffe_commessa tc on tc.order_id = new.order_id and tc.tariffa_id = c.tariffa_id
             where c.motivo is null and c.employee_id is not null
             group by c.employee_id) z;

    for v_item in select * from jsonb_array_elements(v_pres) loop
      if v_item->>'employee_id' is null then continue; end if;

      select id into v_emp
        from employees
       where id = (v_item->>'employee_id')::uuid and company_id = new.company_id;
      if v_emp.id is null then continue; end if;

      v_ore := coalesce((v_item->>'ore')::numeric, 0);
      if v_ore <= 0 then continue; end if;

      perform public.campo_controlla_ore_persona(new.company_id, new.order_id, v_emp.id, new.data_lavoro, v_ore, new.id);

      v_tariffa := public.costo_orario_calcolato(v_emp.id);
      v_mancante := v_tariffa is null or v_tariffa <= 0;
      v_tariffa := coalesce(v_tariffa, 0);
      v_costo := round(v_ore * v_tariffa, 2);

      select id into v_row_id
        from order_employees
       where order_id = new.order_id and employee_id = v_emp.id
         and phase_id is not distinct from v_fase
       limit 1;
      if v_row_id is not null then
        update order_employees
           set hours_worked = hours_worked + v_ore,
               total_cost   = total_cost + v_costo,
               hourly_rate  = case when (hours_worked + v_ore) > 0
                                   then round((total_cost + v_costo) / (hours_worked + v_ore), 2)
                                   else v_tariffa end
         where id = v_row_id;
      else
        insert into order_employees (order_id, employee_id, phase_id, hourly_rate, hours_worked, total_cost)
        values (new.order_id, v_emp.id, v_fase, v_tariffa, v_ore, v_costo);
      end if;

      -- Prezzo delle ore: contratto per qualifica, altrimenti la voce di manodopera della commessa.
      v_vendita := coalesce(v_appalto->(v_emp.id::text), private.prezzo_ore_commessa(new.order_id, new.data_lavoro, v_ore));

      v_totale := v_totale + v_costo;
      v_snapshot := v_snapshot || jsonb_build_object(
        'employee_id', v_emp.id, 'ore', v_ore, 'costo', v_costo,
        'phase_id', v_fase, 'costo_mancante', v_mancante);
      if v_vendita is not null then
        v_prezzi := v_prezzi || jsonb_build_object('employee_id', v_emp.id, 'prezzo', v_vendita->'prezzo', 'ricavo', v_vendita->'ricavo',
          'unita', v_vendita->'unita', 'quantita', v_vendita->'quantita',
          'prezzo_fonte', coalesce(v_vendita->>'prezzo_fonte', v_vendita->>'fonte'));
      end if;
    end loop;

    -- Ditte: ore × la voce della ditta.
    for v_altro in
      select (p->>'subappaltatore_id')::uuid as sub,
             sum(case when p->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' then replace(p->>'ore', ',', '.')::numeric else 0 end) as ore
        from jsonb_array_elements(v_pres) p
       where p->>'subappaltatore_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       group by 1
    loop
      v_vendita := private.prezzo_ore_voce(new.order_id,
        (select s.tariffa_id from subappaltatori s where s.id = v_altro.sub and s.company_id = new.company_id),
        new.data_lavoro, v_altro.ore);
      if v_vendita is not null then
        v_prezzi := v_prezzi || jsonb_build_object('subappaltatore_id', v_altro.sub, 'prezzo', v_vendita->'prezzo', 'ricavo', v_vendita->'ricavo',
          'unita', v_vendita->'unita', 'quantita', v_vendita->'quantita', 'prezzo_fonte', v_vendita->>'fonte');
      end if;
    end loop;

    -- Mezzi: ore × il nolo del mezzo (ore mancanti = 8, come nel quadro).
    for v_altro in
      select (e->>'mezzo_id')::uuid as mezzo,
             sum(case when replace(e->>'ore', ',', '.') ~ '^[0-9]+([.][0-9]+)?$' and replace(e->>'ore', ',', '.')::numeric > 0
                      then replace(e->>'ore', ',', '.')::numeric else 8 end) as ore
        from jsonb_array_elements(case when jsonb_typeof(new.mezzi_usati) = 'array' then new.mezzi_usati else '[]'::jsonb end) e
       where e->>'mezzo_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       group by 1
    loop
      v_vendita := private.prezzo_ore_voce(new.order_id,
        (select m.tariffa_id from mezzi m where m.id = v_altro.mezzo and m.company_id = new.company_id),
        new.data_lavoro, v_altro.ore);
      if v_vendita is not null then
        v_prezzi := v_prezzi || jsonb_build_object('mezzo_id', v_altro.mezzo, 'prezzo', v_vendita->'prezzo', 'ricavo', v_vendita->'ricavo',
          'unita', v_vendita->'unita', 'quantita', v_vendita->'quantita', 'prezzo_fonte', v_vendita->>'fonte');
      end if;
    end loop;

    new.costo_manodopera := v_totale;
    new.presenze_registrate := v_snapshot;
    new.prezzi_registrati := v_prezzi;
    new.costo_registrato_at := now();
    return new;
  end if;

  if old.stato = 'approvato' and new.stato is distinct from 'approvato'
     and old.costo_registrato_at is not null then

    if jsonb_typeof(old.presenze_registrate) = 'array' then
      for v_item in select * from jsonb_array_elements(old.presenze_registrate) loop
        update order_employees
           set hours_worked = greatest(0, hours_worked - coalesce((v_item->>'ore')::numeric, 0)),
               total_cost   = greatest(0, total_cost - coalesce((v_item->>'costo')::numeric, 0)),
               hourly_rate = case
                 when greatest(0, hours_worked - coalesce((v_item->>'ore')::numeric, 0)) > 0
                 then round(
                   greatest(0, total_cost - coalesce((v_item->>'costo')::numeric, 0)) /
                   greatest(0, hours_worked - coalesce((v_item->>'ore')::numeric, 0)), 2)
                 else 0
               end
         where id = (
           select id from order_employees
            where order_id = new.order_id
              and employee_id = (v_item->>'employee_id')::uuid
              and phase_id is not distinct from nullif(v_item->>'phase_id','')::uuid
            limit 1
         );
      end loop;
    end if;

    new.costo_manodopera := null;
    new.presenze_registrate := null;
    new.prezzi_registrati := null;
    new.costo_registrato_at := null;
    return new;
  end if;

  return new;
end $function$;
