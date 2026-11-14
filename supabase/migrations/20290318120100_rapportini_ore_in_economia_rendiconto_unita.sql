-- Rapportini: ore vendute in economia, rendiconto del committente, unità diverse (14/11/2026)
-- Piano: docs/piano-rapportino-economico-20261114.md, lotti B, C, D. Segue 20290318120000.
--
-- B. Le ore degli operai hanno un prezzo su TUTTE le commesse che le vendono in economia, non solo
--    sugli appalti con contratto. La commessa lo dice scegliendo la voce di manodopera del listino
--    generale (orders.tariffa_manodopera_id); il prezzo segue la regola unica (cantiere → committente →
--    generale → da definire). Una commessa senza quella voce (il privato col preventivo firmato, un
--    appalto a corpo) non vende le ore a parte: il quadro lo dice, non scrive «vendita da impostare».
--    Gli appalti a misura col contratto continuano a prezzare per qualifica come prima; la voce della
--    commessa serve dove la qualifica non trova tariffa.
-- C. Rendiconto del committente: la voce del rapportino presa dal suo listino porta la tariffa e non è
--    più segnata «extra contratto».
-- D. Unità diverse fra listino generale e listino del committente (ora / giornata, pz / mq…): la regola
--    lo dice (`unita_diverse`), l'interfaccia avvisa; la quantità si scrive nell'unità del committente.
-- E. Il popup «Scrivi rapportini» dell'ufficio passa la voce del listino (tariffa_id) come «Aggiungi voce».
--
-- Solo schema e funzioni: nessuna riga esistente viene riscritta.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── B.1 La voce di manodopera con cui la commessa vende le ore ──────────────────────────────────
alter table public.orders
  add column if not exists tariffa_manodopera_id uuid references public.tariffe_aziendali(id) on delete set null;
comment on column public.orders.tariffa_manodopera_id is
  'Voce del listino generale con cui questa commessa vende le ore in economia. Vuota = le ore non si vendono a parte.';
grant select (tariffa_manodopera_id) on public.orders to authenticated;

create or replace function public.commessa_imposta_ore_in_economia(p_order_id uuid, p_tariffa_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_company uuid;
begin
  select o.company_id into v_company from public.orders o where o.id = p_order_id and o.deleted_at is null;
  if v_company is null then raise exception 'Commessa non trovata' using errcode = 'P0002'; end if;
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(p_order_id)
     or public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company) is not true
     or public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_company) is not true then
    raise exception 'Serve il permesso «Modifica commesse» e «Importi delle commesse» per decidere come si vendono le ore'
      using errcode = '42501';
  end if;
  if p_tariffa_id is not null and not exists (
    select 1 from public.tariffe_aziendali t where t.id = p_tariffa_id and t.company_id = v_company
  ) then
    raise exception 'La voce scelta non è nel listino di questa azienda' using errcode = '23503';
  end if;
  update public.orders set tariffa_manodopera_id = p_tariffa_id where id = p_order_id;
end $$;

revoke all on function public.commessa_imposta_ore_in_economia(uuid, uuid) from public, anon;
grant execute on function public.commessa_imposta_ore_in_economia(uuid, uuid) to authenticated;

-- ── B.1b Il prezzo delle ore fotografato all'approvazione, in una colonna che il browser non legge ──
-- (presenze_registrate la restituiscono altre funzioni a chi vede i costi: i prezzi non ci vanno.)
alter table public.campo_rapportini add column if not exists prezzi_registrati jsonb;
comment on column public.campo_rapportini.prezzi_registrati is
  'Prezzo delle ore per persona fissato all''approvazione (prezzo, ricavo, unità, quantità, provenienza). Si legge solo dal quadro economico.';

-- ── D. La regola dice anche se le unità dei due listini non coincidono ──────────────────────────
create or replace function private.unita_normale(p text)
returns text
language sql
immutable
set search_path to ''
as $$
  select case lower(btrim(coalesce(p, '')))
    when 'h' then 'ora' when 'ora' then 'ora' when 'ore' then 'ora'
    when 'pz' then 'cad' when 'cad' then 'cad'
    when 'uomo_giorno' then 'giornata' when 'giornata' then 'giornata'
    when 'fisso' then 'corpo' when 'corpo' then 'corpo'
    else lower(btrim(coalesce(p, ''))) end
$$;
revoke all on function private.unita_normale(text) from public, anon, authenticated;

create or replace function private.prezzo_voce_commessa_raw(p_order uuid, p_tariffa uuid, p_data date)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
declare
  o record; t record; a record;
  v_data date := coalesce(p_data, current_date);
  v_fonte text; v_prezzo numeric;
begin
  select x.id, x.company_id, x.customer_id, x.appalto_contratto_id into o
    from public.orders x where x.id = p_order and x.deleted_at is null;
  if not found then return null; end if;

  select x.id, x.codice, x.nome, x.unita, nullif(x.prezzo_vendita, 0) as prezzo,
         coalesce(nullif(x.costo_interno, 0), nullif(x.prezzo_costo, 0)) as costo
    into t
    from public.tariffe_aziendali x
   where x.id = p_tariffa and x.company_id = o.company_id;
  if not found then return null; end if;

  -- Il contratto legato alla commessa vince; altrimenti quello in vigore del committente della commessa.
  select at.id, at.prezzo_unitario, at.unita_misura, at.contratto_id, tc.prezzo_unitario as prezzo_cantiere,
         coalesce(at.maggiorazione_straordinario_pct, c.maggiorazione_straordinario_pct, 0) as magg
    into a
    from public.appalto_tariffe at
    join public.appalto_contratti c on c.id = at.contratto_id and c.company_id = o.company_id
    left join public.appalto_tariffe_commessa tc on tc.order_id = o.id and tc.tariffa_id = at.id
   where at.tariffa_id = t.id
     and at.attivo
     and (at.valido_dal is null or at.valido_dal <= v_data)
     and (at.valido_al is null or at.valido_al >= v_data)
     and (c.id = o.appalto_contratto_id
          or (o.customer_id is not null and c.committente_id = o.customer_id and c.attivo
              and (c.valido_dal is null or c.valido_dal <= v_data)
              and (c.valido_al is null or c.valido_al >= v_data)))
   order by coalesce(c.id = o.appalto_contratto_id, false) desc, c.valido_dal desc nulls last, at.ordine, at.id
   limit 1;

  if a.id is not null and a.prezzo_cantiere is not null then
    v_fonte := 'cantiere'; v_prezzo := a.prezzo_cantiere;
  elsif a.id is not null then
    v_fonte := 'committente'; v_prezzo := a.prezzo_unitario;
  elsif t.prezzo is not null then
    v_fonte := 'generale'; v_prezzo := t.prezzo;
  else
    v_fonte := 'mancante'; v_prezzo := null;
  end if;

  return jsonb_build_object(
    'tariffa_id', t.id, 'codice', t.codice, 'descrizione', t.nome,
    'unita', case when a.id is not null then a.unita_misura else coalesce(nullif(btrim(t.unita), ''), 'cad') end,
    'unita_generale', coalesce(nullif(btrim(t.unita), ''), 'cad'),
    'unita_diverse', a.id is not null and private.unita_normale(a.unita_misura) <> private.unita_normale(t.unita),
    'prezzo', v_prezzo, 'fonte', v_fonte,
    'prezzo_generale', t.prezzo,
    'appalto_tariffa_id', a.id, 'contratto_id', a.contratto_id,
    'maggiorazione_straordinario_pct', case when a.id is not null then a.magg else 0 end,
    'costo_unitario', t.costo, 'data', v_data);
end $$;

revoke all on function private.prezzo_voce_commessa_raw(uuid, uuid, date) from public, anon, authenticated;

-- ── B.2 Il prezzo delle ore di una persona, dalla voce di manodopera della commessa ─────────────
create or replace function private.prezzo_ore_commessa(p_order uuid, p_data date, p_ore numeric)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
declare v_voce uuid; p jsonb; v_u text; v_q numeric; v_prezzo numeric;
begin
  select o.tariffa_manodopera_id into v_voce from public.orders o where o.id = p_order and o.deleted_at is null;
  if v_voce is null or coalesce(p_ore, 0) <= 0 then return null; end if;
  p := private.prezzo_voce_commessa_raw(p_order, v_voce, p_data);
  if p is null then return null; end if;
  v_prezzo := nullif(p->>'prezzo', '')::numeric;
  v_u := private.unita_normale(p->>'unita');
  if v_u = 'ora' then
    v_q := p_ore;
  elsif v_u = 'giornata' then
    v_q := case when p_ore <= 4 then 0.5 else 1 end;
  else
    -- Una voce a corpo, a mq… non converte le ore da sola: si dice, non si inventa.
    return jsonb_build_object('fonte', p->>'fonte', 'unita', p->>'unita', 'prezzo', null, 'ricavo', null,
                              'quantita', null, 'motivo', 'La voce delle ore non è a ora né a giornata');
  end if;
  return jsonb_build_object(
    'tariffa_id', v_voce, 'descrizione', p->>'descrizione', 'fonte', p->>'fonte', 'unita', p->>'unita',
    'quantita', v_q, 'prezzo', v_prezzo,
    'ricavo', case when v_prezzo is null then null else round(v_q * v_prezzo, 2) end);
end $$;

revoke all on function private.prezzo_ore_commessa(uuid, date, numeric) from public, anon, authenticated;

-- ── B.3 Il quadro del rapportino: prezzo e provenienza anche per le ore ──────────────────────────
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
begin
  select * into v_r from public.campo_rapportini where id = p_rapportino_id;
  if not found then return null; end if;
  if public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(v_r.order_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_costs', v_r.company_id) then
    raise exception 'Non hai il permesso di vedere i costi' using errcode = '42501';
  end if;
  select o.order_type, o.valorizzazione, o.tariffa_manodopera_id into v_ord from public.orders o where o.id = v_r.order_id;

  with pres as (
    select case when p->>'employee_id' ~* '^[0-9a-f-]{36}$' then (p->>'employee_id')::uuid end as emp,
           nullif(btrim(p->>'nome'), '') as nome,
           (p->>'subappaltatore_id') is not null as ditta,
           case when p->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' then replace(p->>'ore', ',', '.')::numeric else 0 end as ore
      from jsonb_array_elements(public.campo_presenze_effettive(v_r)) p
  ), persone as (
    select emp, min(nome) as nome, bool_or(ditta) as ditta, sum(ore) as ore
      from pres group by emp, case when emp is null then nome end
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
    -- Il prezzo fotografato all'approvazione: un listino cambiato dopo non lo tocca.
    select (s->>'employee_id')::uuid as emp, true as con_prezzo, s->>'prezzo_fonte' as prezzo_fonte, s->>'unita' as unita,
           nullif(s->>'quantita', '')::numeric as quantita, nullif(s->>'prezzo', '')::numeric as prezzo,
           nullif(s->>'ricavo', '')::numeric as ricavo
      from jsonb_array_elements(case when v_r.costo_registrato_at is not null and jsonb_typeof(v_r.prezzi_registrati) = 'array'
                                     then v_r.prezzi_registrati else '[]'::jsonb end) s
     where s->>'employee_id' is not null
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
    select p.emp, coalesce(nullif(btrim(concat_ws(' ', e.first_name, e.last_name)), ''), p.nome, 'Senza nome') as nome,
           p.ditta, p.ore,
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
      left join registrato r on r.emp = p.emp
      left join fissati f on f.emp = p.emp
      left join vendita v on v.emp is not distinct from p.emp and p.emp is not null
      -- Ore in economia dalla voce della commessa, dove il contratto per qualifica non ha già un prezzo.
      left join lateral (select case when v.emp is null and not p.ditta and not coalesce(f.con_prezzo, false)
                                     then private.prezzo_ore_commessa(v_r.order_id, v_r.data_lavoro, p.ore) end as n) x on true
     where p.ore > 0
  )
  select coalesce(jsonb_agg((to_jsonb(righe) - 'n') order by nome), '[]'::jsonb) into v_persone from righe;

  select coalesce(jsonb_agg(jsonb_build_object('mezzo_id', u.mezzo, 'nome', coalesce(m.nome, u.nome), 'noleggio', coalesce(m.possesso, '') like 'noleggio%',
          'ore', coalesce(s.ore, u.ore), 'ore_stimate', coalesce(s.ore_stimate, u.stimate),
          'costo_orario', coalesce(s.costo_orario, case when s.rapportino_id is null then public.mezzo_costo_orario_effettivo(u.mezzo) end),
          'importo', coalesce(s.importo, case when s.rapportino_id is null then round(u.ore * public.mezzo_costo_orario_effettivo(u.mezzo), 2) end)) order by coalesce(m.nome, u.nome)), '[]'::jsonb)
    into v_mezzi
    from (select (e->>'mezzo_id')::uuid as mezzo, min(e->>'nome') as nome,
                 sum(case when replace(e->>'ore', ',', '.') ~ '^[0-9]+([.][0-9]+)?$' and replace(e->>'ore', ',', '.')::numeric > 0 then replace(e->>'ore', ',', '.')::numeric else 8 end) as ore,
                 bool_or(not coalesce(replace(e->>'ore', ',', '.') ~ '^[0-9]+([.][0-9]+)?$' and replace(e->>'ore', ',', '.')::numeric > 0, false)) as stimate
            from jsonb_array_elements(case when jsonb_typeof(v_r.mezzi_usati) = 'array' then v_r.mezzi_usati else '[]'::jsonb end) e
           where e->>'mezzo_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' group by 1) u
    left join public.mezzi m on m.id = u.mezzo and m.company_id = v_r.company_id
    left join public.rapportino_mezzi_costi s on s.rapportino_id = p_rapportino_id and s.mezzo_id = u.mezzo;

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

-- La voce delle ore è un dato sugli importi: chi non li vede non la riceve.
insert into private.office_projection_fields (table_name, column_name, right_name)
select 'rapportino_voci_libere', c, 'amounts'
  from unnest(array['ore_in_economia']) c
 where not exists (select 1 from private.office_projection_fields f where f.table_name = 'rapportino_voci_libere' and f.column_name = c);

-- ── B.4 All'approvazione si fotografa anche il prezzo delle ore, non solo il costo ───────────────
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

-- ── C. Rendiconto: la voce del listino del committente porta la sua tariffa ─────────────────────
create or replace function public.rapportino_voce_applica(p_voce_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v public.rapportino_voci_libere%rowtype; v_r record; v_ord record; v_costo numeric; v_cost_id uuid; v_ric numeric;
begin
  select * into v from public.rapportino_voci_libere where id = p_voce_id;
  if not found then return; end if;
  select cr.approvato, cr.data_lavoro into v_r from public.campo_rapportini cr where cr.id = v.rapportino_id;
  if not coalesce(v_r.approvato, false) then
    perform public.rapportino_voce_ritira(v);
    update public.rapportino_voci_libere set company_cost_id = null where id = v.id and company_cost_id is not null;
    return;
  end if;

  v_costo := round(v.quantita * coalesce(v.costo_unitario, 0), 2);
  if v_costo > 0 then
    if v.company_cost_id is not null then
      update public.company_costs set name = v.descrizione, amount = v_costo, due_date = v_r.data_lavoro where id = v.company_cost_id;
    else
      insert into public.company_costs (company_id, name, cost_type, amount, recurrence, due_date, is_paid, paid_date, category, notes, order_id, senza_fattura)
      values (v.company_id, v.descrizione, 'variable', v_costo, 'once', v_r.data_lavoro, true, v_r.data_lavoro, 'Rapportino', 'Voce libera del rapportino', v.order_id, true)
      returning id into v_cost_id;
      update public.rapportino_voci_libere set company_cost_id = v_cost_id where id = v.id;
    end if;
  elsif v.company_cost_id is not null then
    delete from public.company_costs where id = v.company_cost_id;
    update public.rapportino_voci_libere set company_cost_id = null where id = v.id;
  end if;

  select o.order_type into v_ord from public.orders o where o.id = v.order_id;
  v_ric := coalesce(v.vendita_unitaria, 0);
  if v_ord.order_type is distinct from 'appaltatore_lavoro' or v_ric <= 0 then
    delete from public.appalto_rendiconto_righe where voce_libera_id = v.id and stato = 'bozza';
    return;
  end if;
  if exists (select 1 from public.appalto_rendiconto_righe r where r.voce_libera_id = v.id and r.stato <> 'bozza') then
    raise exception 'La voce «%» e'' gia'' in un rendiconto confermato', v.descrizione using errcode = '23514';
  end if;
  delete from public.appalto_rendiconto_righe where voce_libera_id = v.id;
  -- Presa dal listino del committente: è una tariffa del contratto, non un extra.
  insert into public.appalto_rendiconto_righe (order_id, data, tariffa_id, quantita, employee_id, fase_id, origine, rapportino_id, stato, descrizione, unita_misura, prezzo_unitario, costo_interno, note, voce_libera_id, extra_contratto)
  values (v.order_id, v_r.data_lavoro, v.appalto_tariffa_id, v.quantita, null, null, 'manuale', null, 'bozza', v.descrizione, v.unita, v_ric, nullif(v_costo, 0),
          case when v.appalto_tariffa_id is not null then 'Voce del rapportino, dal listino concordato' else 'Voce del rapportino' end,
          v.id, v.appalto_tariffa_id is null);
end; $function$;

-- ── E.1 Ricerca nel listino per commessa e giorno: il popup dell'ufficio non ha ancora il rapportino ──
create or replace function public.commessa_listino_cerca(p_order_id uuid, p_data date default null, p_testo text default '', p_limite integer default 30)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
declare v_company uuid; v_rights jsonb; v_testo text := btrim(coalesce(p_testo, '')); v_out jsonb;
begin
  select o.company_id into v_company from public.orders o where o.id = p_order_id and o.deleted_at is null;
  if v_company is null then return '[]'::jsonb; end if;
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(p_order_id) then
    raise exception 'Non hai il permesso di vedere questa commessa' using errcode = '42501';
  end if;
  v_rights := coalesce(private.office_order_rights(p_order_id), '{}'::jsonb);

  select coalesce(jsonb_agg(p order by ord, descr), '[]'::jsonb) into v_out
    from (
      select private.prezzo_voce_commessa_raw(p_order_id, t.id, p_data)
               || jsonb_build_object('categoria', coalesce(nullif(t.categoria_prodotto, ''), t.custom_field_values->>'_gruppo_lavorazione', t.tipo),
                                     'dettaglio', t.descrizione) as p,
             case when v_testo <> '' and lower(coalesce(t.codice, '')) = lower(v_testo) then 0
                  when v_testo <> '' and lower(coalesce(t.codice, '')) like lower(v_testo) || '%' then 1 else 2 end as ord,
             lower(t.nome) as descr
        from public.tariffe_aziendali t
       where t.company_id = v_company
         and coalesce(t.attivo, true)
         and (v_testo = ''
              or t.codice ilike '%' || v_testo || '%'
              or t.nome ilike '%' || v_testo || '%'
              or t.descrizione ilike '%' || v_testo || '%'
              or t.tipo ilike '%' || v_testo || '%'
              or t.categoria_prodotto ilike '%' || v_testo || '%'
              or (t.custom_field_values->>'_gruppo_lavorazione') ilike '%' || v_testo || '%'
              or t.unita ilike v_testo)
       order by ord, lower(t.nome)
       limit greatest(1, least(coalesce(p_limite, 30), 100))
    ) s;

  if not coalesce((v_rights->>'amounts')::boolean, false) then
    select coalesce(jsonb_agg(x - 'prezzo' - 'prezzo_generale'), '[]'::jsonb) into v_out from jsonb_array_elements(v_out) x;
  end if;
  if not coalesce((v_rights->>'costs')::boolean, false) then
    select coalesce(jsonb_agg(x - 'costo_unitario'), '[]'::jsonb) into v_out from jsonb_array_elements(v_out) x;
  end if;
  return v_out;
end $$;

revoke all on function public.commessa_listino_cerca(uuid, date, text, integer) from public, anon;
grant execute on function public.commessa_listino_cerca(uuid, date, text, integer) to authenticated;

-- ── E. Il popup «Scrivi rapportini» passa la voce del listino ───────────────────────────────────
-- Ritocco mirato: la funzione è lunga e altrove invariata. Se il testo atteso non c'è più, la
-- migrazione si ferma invece di indovinare.
do $$
declare d text; vecchio text; nuovo text;
begin
  d := pg_get_functiondef('public.ufficio_crea_rapportini'::regproc);
  if position('tariffa_id' in d) > 0 then return; end if;  -- già fatto
  vecchio := $v$insert into public.rapportino_voci_libere (rapportino_id, descrizione, quantita, unita, costo_unitario, vendita_unitaria)
      select v_id, left(btrim(e->>'descrizione'), 500), (e->>'quantita')::numeric, coalesce(nullif(btrim(e->>'unita'), ''), 'cad'),
             nullif(e->>'costo_unitario', '')::numeric, nullif(e->>'vendita_unitaria', '')::numeric
        from jsonb_array_elements(v_voci) e;$v$;
  nuovo := $v$insert into public.rapportino_voci_libere (rapportino_id, descrizione, quantita, unita, costo_unitario, vendita_unitaria, tariffa_id)
      select v_id, left(btrim(e->>'descrizione'), 500), (e->>'quantita')::numeric, coalesce(nullif(btrim(e->>'unita'), ''), 'cad'),
             nullif(e->>'costo_unitario', '')::numeric, nullif(e->>'vendita_unitaria', '')::numeric,
             case when e->>'tariffa_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (e->>'tariffa_id')::uuid end
        from jsonb_array_elements(v_voci) e;$v$;
  if position(vecchio in d) = 0 then
    raise exception 'ufficio_crea_rapportini è cambiata: il ritocco delle voci va riscritto a mano';
  end if;
  execute replace(d, vecchio, nuovo);
end $$;
