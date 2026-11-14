-- Rapportini: prezzo dal listino e costi da completare (14/11/2026)
-- Piano: docs/piano-anomalie-rapportini-listini-20261114.md, Fasi 2 e 3.
--
-- Fase 2 — la regola del prezzo, una sola, nel database:
--   1. eccezione di cantiere   (appalto_tariffe_commessa, per quella commessa)
--   2. listino del committente (appalto_tariffe collegata per id alla voce del listino generale)
--   3. listino generale        (tariffe_aziendali.prezzo_vendita; 0 o vuoto = non c'è)
--   4. nessuno                 → «prezzo da definire», lo scrive a mano chi ha il permesso.
-- Il committente è quello della commessa (orders.customer_id) o del suo contratto: la regola vale per
-- tutte le commesse, non solo per gli appalti. Il collegamento è per id (appalto_tariffe.tariffa_id),
-- mai per descrizione somigliante.
--
-- Il rapportino fotografa il prezzo del giorno: provenienza, prezzo proposto, e se è stato cambiato a
-- mano. Cambiare un listino dopo non tocca le voci già salvate.
--
-- Fase 3 — un costo orario che manca non è 0 €: lo si dice («costo da completare») nel rapportino e
-- nella commessa, e la marginalità si dichiara incompleta.
--
-- Solo schema e funzioni: nessuna riga esistente viene riscritta.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Le colonne della fotografia ──────────────────────────────────────────────────────────────
alter table public.rapportino_voci_libere
  add column if not exists tariffa_id uuid references public.tariffe_aziendali(id) on delete set null,
  add column if not exists appalto_tariffa_id uuid references public.appalto_tariffe(id) on delete set null,
  add column if not exists codice text,
  add column if not exists prezzo_fonte text,
  add column if not exists vendita_proposta numeric,
  add column if not exists costo_proposto numeric;

alter table public.rapportino_voci_libere
  add column if not exists prezzo_a_mano boolean
  generated always as (vendita_unitaria is distinct from vendita_proposta) stored;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rapportino_voci_libere_prezzo_fonte_check') then
    alter table public.rapportino_voci_libere add constraint rapportino_voci_libere_prezzo_fonte_check
      check (prezzo_fonte is null or prezzo_fonte in ('cantiere', 'committente', 'generale', 'mancante'));
  end if;
end $$;

comment on column public.rapportino_voci_libere.prezzo_fonte is
  'Da dove veniva il prezzo il giorno del rapportino: cantiere, committente, generale, mancante. Null = voce scritta a mano, senza listino.';
comment on column public.rapportino_voci_libere.vendita_proposta is
  'Il prezzo che la regola proponeva il giorno del rapportino. Non cambia se poi cambia il listino.';
comment on column public.rapportino_voci_libere.prezzo_a_mano is
  'Vero se il prezzo salvato è diverso da quello proposto dal listino (modifica a mano).';

grant select (tariffa_id, appalto_tariffa_id, codice, prezzo_fonte, vendita_proposta, costo_proposto, prezzo_a_mano)
  on public.rapportino_voci_libere to authenticated;
grant insert (tariffa_id) on public.rapportino_voci_libere to authenticated;

-- ── 2. La regola, senza controlli di permesso (la usano trigger e funzioni sotto) ─────────────────
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
  select at.id, at.prezzo_unitario, at.unita_misura, at.contratto_id, tc.prezzo_unitario as prezzo_cantiere
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
    'prezzo', v_prezzo, 'fonte', v_fonte,
    'prezzo_generale', t.prezzo,
    'appalto_tariffa_id', a.id, 'contratto_id', a.contratto_id,
    'costo_unitario', t.costo, 'data', v_data);
end $$;

revoke all on function private.prezzo_voce_commessa_raw(uuid, uuid, date) from public, anon, authenticated;

-- ── 3. La regola per l'interfaccia: prezzo a chi vede gli importi, costo a chi vede i costi ───────
create or replace function public.prezzo_voce_commessa(p_order_id uuid, p_tariffa_id uuid, p_data date default null)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
declare v_rights jsonb; v jsonb;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(p_order_id) then
    raise exception 'Non hai il permesso di vedere questa commessa' using errcode = '42501';
  end if;
  v_rights := coalesce(private.office_order_rights(p_order_id), '{}'::jsonb);
  v := private.prezzo_voce_commessa_raw(p_order_id, p_tariffa_id, p_data);
  if v is null then return null; end if;
  if not coalesce((v_rights->>'amounts')::boolean, false) then v := v - 'prezzo' - 'prezzo_generale'; end if;
  if not coalesce((v_rights->>'costs')::boolean, false) then v := v - 'costo_unitario'; end if;
  return v;
end $$;

revoke all on function public.prezzo_voce_commessa(uuid, uuid, date) from public, anon;
grant execute on function public.prezzo_voce_commessa(uuid, uuid, date) to authenticated;

-- ── 4. «Aggiungi voce»: cerca nel listino generale, col prezzo già deciso dalla regola ────────────
create or replace function public.rapportino_listino_cerca(p_rapportino_id uuid, p_testo text default '', p_limite integer default 30)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
declare r record; v_rights jsonb; v_testo text := btrim(coalesce(p_testo, '')); v_out jsonb;
begin
  select cr.order_id, cr.company_id, cr.data_lavoro into r from public.campo_rapportini cr where cr.id = p_rapportino_id;
  if not found then return '[]'::jsonb; end if;
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(r.order_id) then
    raise exception 'Non hai il permesso di vedere questa commessa' using errcode = '42501';
  end if;
  v_rights := coalesce(private.office_order_rights(r.order_id), '{}'::jsonb);

  select coalesce(jsonb_agg(p order by ord, descr), '[]'::jsonb) into v_out
    from (
      select private.prezzo_voce_commessa_raw(r.order_id, t.id, r.data_lavoro)
               || jsonb_build_object('categoria', coalesce(nullif(t.categoria_prodotto, ''), t.custom_field_values->>'_gruppo_lavorazione', t.tipo),
                                     'dettaglio', t.descrizione) as p,
             case when v_testo <> '' and lower(coalesce(t.codice, '')) = lower(v_testo) then 0
                  when v_testo <> '' and lower(coalesce(t.codice, '')) like lower(v_testo) || '%' then 1 else 2 end as ord,
             lower(t.nome) as descr
        from public.tariffe_aziendali t
       where t.company_id = r.company_id
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

revoke all on function public.rapportino_listino_cerca(uuid, text, integer) from public, anon;
grant execute on function public.rapportino_listino_cerca(uuid, text, integer) to authenticated;

-- ── 5. La fotografia nel rapportino: la scrive il database, non il browser ────────────────────────
create or replace function public.rapportino_voce_prezzo_trg()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare r record; p jsonb;
begin
  -- In modifica la fotografia resta quella del giorno: cambia solo se cambia la voce del listino.
  if tg_op = 'UPDATE' and new.tariffa_id is not distinct from old.tariffa_id then
    new.appalto_tariffa_id := old.appalto_tariffa_id;
    new.codice := old.codice;
    new.prezzo_fonte := old.prezzo_fonte;
    new.vendita_proposta := old.vendita_proposta;
    new.costo_proposto := old.costo_proposto;
    return new;
  end if;

  if new.tariffa_id is null then
    new.appalto_tariffa_id := null; new.codice := null; new.prezzo_fonte := null;
    new.vendita_proposta := null; new.costo_proposto := null;
    return new;
  end if;

  select cr.order_id, cr.data_lavoro into r from public.campo_rapportini cr where cr.id = new.rapportino_id;
  if not found then raise exception 'Rapportino inesistente' using errcode = '23503'; end if;
  p := private.prezzo_voce_commessa_raw(r.order_id, new.tariffa_id, r.data_lavoro);
  if p is null then
    raise exception 'La voce scelta non è nel listino di questa azienda' using errcode = '23503';
  end if;

  new.appalto_tariffa_id := nullif(p->>'appalto_tariffa_id', '')::uuid;
  new.codice := p->>'codice';
  new.prezzo_fonte := p->>'fonte';
  new.vendita_proposta := nullif(p->>'prezzo', '')::numeric;
  new.costo_proposto := nullif(p->>'costo_unitario', '')::numeric;
  -- Chi non scrive un prezzo prende quello proposto; chi lo scrive diverso fa una modifica a mano.
  if new.vendita_unitaria is null then new.vendita_unitaria := new.vendita_proposta; end if;
  if new.costo_unitario is null then new.costo_unitario := new.costo_proposto; end if;
  if nullif(btrim(coalesce(new.descrizione, '')), '') is null then new.descrizione := p->>'descrizione'; end if;
  return new;
end $$;

revoke all on function public.rapportino_voce_prezzo_trg() from public, anon, authenticated;

drop trigger if exists trg_voci_libere_listino on public.rapportino_voci_libere;
create trigger trg_voci_libere_listino
  before insert or update on public.rapportino_voci_libere
  for each row execute function public.rapportino_voce_prezzo_trg();

-- ── 6. Il costo orario che manca non è 0 ──────────────────────────────────────────────────────────
create or replace function public.costo_orario_dipendente(p_employee_id uuid)
returns numeric
language sql
stable security definer
set search_path to 'public'
as $$
  -- Null se il costo non c'è: chi legge deve dire «costo da completare», non mostrare 0 €.
  SELECT public.costo_orario_calcolato(e.id)
  FROM public.employees e
  WHERE e.id=p_employee_id
    AND (
      coalesce(auth.role(),'')='service_role'
      OR (
        auth.uid() IS NOT NULL
        AND public.user_can_access_company(e.company_id)
        AND public.has_permission_for_company(auth.uid(),'can_view_costs',e.company_id)
        AND (public.has_permission_for_company(auth.uid(),'can_view_employees',e.company_id)
          OR public.has_permission_for_company(auth.uid(),'can_view_persone',e.company_id))
      )
    )
$$;

-- All'approvazione: il costo che manca resta 0 nei totali (le somme di order_employees sono numeri),
-- ma la fotografia lo dice con «costo_mancante», e chi legge non lo spaccia per un costo vero.
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
begin
  if new.stato = 'approvato' and old.stato is distinct from 'approvato'
     and new.costo_registrato_at is null then

    if jsonb_typeof(new.fasi_lavorate) = 'array'
       and jsonb_array_length(new.fasi_lavorate) = 1 then
      v_fase := (new.fasi_lavorate->0->>'phase_id')::uuid;
    end if;

    v_pres := public.campo_presenze_effettive(new);

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

      v_totale := v_totale + v_costo;
      v_snapshot := v_snapshot || jsonb_build_object(
        'employee_id', v_emp.id, 'ore', v_ore, 'costo', v_costo,
        'phase_id', v_fase, 'costo_mancante', v_mancante);
    end loop;

    new.costo_manodopera := v_totale;
    new.presenze_registrate := v_snapshot;
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
    new.costo_registrato_at := null;
    return new;
  end if;

  return new;
end $function$;

-- ── 7. Il quadro del rapportino: voci col listino, e cosa manca per un costo completo ─────────────
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
begin
  select * into v_r from public.campo_rapportini where id = p_rapportino_id;
  if not found then return null; end if;
  if public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(v_r.order_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_costs', v_r.company_id) then
    raise exception 'Non hai il permesso di vedere i costi' using errcode = '42501';
  end if;
  select o.order_type, o.valorizzazione into v_ord from public.orders o where o.id = v_r.order_id;

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
  ), vendita as (
    select c.employee_id as emp, min(t.unita_misura) as unita, sum(c.quantita) as quantita,
           max(coalesce(tc.prezzo_unitario, t.prezzo_unitario)) as prezzo,
           round(sum(c.quantita * coalesce(tc.prezzo_unitario, t.prezzo_unitario) * (1 + c.maggiorazione_pct / 100.0)), 2) as ricavo
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
           v.unita, v.quantita, v.prezzo, v.ricavo
      from persone p
      left join public.employees e on e.id = p.emp and e.company_id = v_r.company_id
      left join registrato r on r.emp = p.emp
      left join vendita v on v.emp is not distinct from p.emp and p.emp is not null
     where p.ore > 0
  )
  select coalesce(jsonb_agg(to_jsonb(righe) order by nome), '[]'::jsonb) into v_persone from righe;

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

  return jsonb_build_object(
    'persone', v_persone,
    'mezzi', v_mezzi,
    'voci', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'descrizione', x.descrizione, 'quantita', x.quantita, 'unita', x.unita,
              'costo_unitario', x.costo_unitario, 'vendita_unitaria', x.vendita_unitaria,
              'codice', x.codice, 'prezzo_fonte', x.prezzo_fonte,
              'vendita_proposta', x.vendita_proposta, 'prezzo_a_mano', x.prezzo_a_mano) order by x.created_at)
            from public.rapportino_voci_libere x where x.rapportino_id = p_rapportino_id), '[]'::jsonb),
    'costo_da_completare', v_manca,
    'appalto', v_ord.order_type is not distinct from 'appaltatore_lavoro',
    'a_corpo', v_ord.valorizzazione is not distinct from 'a_corpo',
    'registrato', v_r.costo_registrato_at is not null
  );
end;
$function$;

-- Le chiavi nuove del quadro: provenienza e modifica a mano seguono il permesso sugli importi.
insert into private.office_projection_fields (table_name, column_name, right_name)
select 'rapportino_voci_libere', c, 'amounts'
  from unnest(array['prezzo_fonte', 'vendita_proposta', 'prezzo_a_mano']) c
 where not exists (select 1 from private.office_projection_fields f where f.table_name = 'rapportino_voci_libere' and f.column_name = c);

-- ── 8. La commessa: cosa manca perché i costi di operai e mezzi siano completi ────────────────────
create or replace function public.commessa_costi_da_completare(p_order_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $$
declare v_company uuid; v_persone jsonb; v_mezzi jsonb;
begin
  select o.company_id into v_company from public.orders o where o.id = p_order_id and o.deleted_at is null;
  if v_company is null then return null; end if;
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(p_order_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_costs', v_company) then
    raise exception 'Non hai il permesso di vedere i costi' using errcode = '42501';
  end if;

  with r as (
    select cr.* from public.campo_rapportini cr
     where cr.order_id = p_order_id and cr.annullato_at is null and coalesce(cr.stato, '') <> 'rifiutato'
  ), pres as (
    select case when p->>'employee_id' ~* '^[0-9a-f-]{36}$' then (p->>'employee_id')::uuid end as emp,
           nullif(btrim(p->>'nome'), '') as nome,
           (p->>'subappaltatore_id') is not null as ditta,
           case when p->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' then replace(p->>'ore', ',', '.')::numeric else 0 end as ore,
           r.id as rapportino
      from r cross join lateral jsonb_array_elements(public.campo_presenze_effettive(r)) p
  ), persone as (
    select emp, min(nome) as nome, sum(ore) as ore, count(distinct rapportino) as rapportini
      from pres where not ditta and ore > 0
     group by emp, case when emp is null then nome end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'employee_id', p.emp,
           'nome', coalesce(nullif(btrim(concat_ws(' ', e.first_name, e.last_name)), ''), p.nome, 'Senza nome'),
           'ore', p.ore, 'rapportini', p.rapportini,
           'motivo', case when p.emp is null then 'senza scheda dipendente' else 'costo orario mancante' end) order by p.nome), '[]'::jsonb)
    into v_persone
    from persone p
    left join public.employees e on e.id = p.emp and e.company_id = v_company
   where p.emp is null or nullif(public.costo_orario_calcolato(p.emp), 0) is null;

  with u as (
    select (e->>'mezzo_id')::uuid as mezzo, min(e->>'nome') as nome, count(distinct cr.id) as rapportini
      from public.campo_rapportini cr
      cross join lateral jsonb_array_elements(case when jsonb_typeof(cr.mezzi_usati) = 'array' then cr.mezzi_usati else '[]'::jsonb end) e
     where cr.order_id = p_order_id and cr.annullato_at is null and coalesce(cr.stato, '') <> 'rifiutato'
       and e->>'mezzo_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('mezzo_id', u.mezzo, 'nome', coalesce(m.nome, u.nome, 'Mezzo'), 'rapportini', u.rapportini) order by coalesce(m.nome, u.nome)), '[]'::jsonb)
    into v_mezzi
    from u
    join public.mezzi m on m.id = u.mezzo and m.company_id = v_company and m.deleted_at is null
   where coalesce(m.possesso, '') not like 'noleggio%'
     and public.mezzo_costo_orario_effettivo(u.mezzo) is null;

  return jsonb_build_object('persone', v_persone, 'mezzi', v_mezzi,
                            'completo', jsonb_array_length(v_persone) = 0 and jsonb_array_length(v_mezzi) = 0);
end $$;

revoke all on function public.commessa_costi_da_completare(uuid) from public, anon;
grant execute on function public.commessa_costi_da_completare(uuid) to authenticated;
