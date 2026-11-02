-- Il capo agisce dalla «Squadra di oggi»: chiama e sollecita il rapportino.
-- campo_squadra_oggi aggiunge il telefono di lavoro (mai quello privato): cambia il tipo restituito, quindi va ricreata.
drop function if exists public.campo_squadra_oggi(uuid);

create function public.campo_squadra_oggi(p_order_id uuid)
 returns table(user_id uuid, nome text, ruolo text, is_capocantiere boolean, entrata timestamp with time zone, uscita timestamp with time zone, in_cantiere boolean, ore numeric, rapportino_inviato boolean, squadra text, telefono text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_company uuid;
  v_me uuid := auth.uid();
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_tutto boolean;
  v_mie uuid[];
begin
  select o.company_id into v_company from public.orders o where o.id = p_order_id;
  if v_company is null then return; end if;
  v_tutto := public.campo_e_ufficio(v_company)
             or exists (select 1 from public.order_campo_assignments a
                         where a.order_id = p_order_id and a.user_id = v_me and a.is_capocantiere);
  v_mie := array(select sc.squadra_id from public.squadre_commesse sc
                  where sc.order_id = p_order_id and sc.squadra_id in (select public.campo_mie_squadre_capo()));
  if not v_tutto and cardinality(v_mie) = 0 then
    raise exception 'Solo il capocantiere, il caposquadra o l''ufficio possono vedere la squadra' using errcode = '42501';
  end if;

  return query
  select x.user_id, x.nome, x.ruolo, x.is_capocantiere, x.entrata, x.uscita, x.in_cantiere, x.ore, x.rapportino_inviato, x.squadra, x.telefono
  from (
    with squadre_oggi as (
      select sc.squadra_id, t.name as nome_squadra, t.responsabile_hr_profilo_id
        from public.squadre_commesse sc
        join public.external_teams t on t.id = sc.squadra_id and t.is_active
       where sc.order_id = p_order_id
         and (v_tutto or sc.squadra_id = any(v_mie))
         and (sc.dal is null or sc.dal <= v_oggi) and (sc.al is null or sc.al >= v_oggi)
    ),
    membri as (
      select distinct on (h.id) h.id as profilo_id, h.user_id, so.nome_squadra, h.telefono,
             trim(coalesce(h.nome, '') || ' ' || coalesce(h.cognome, '')) as nome
        from squadre_oggi so
        join public.hr_profili h
          on coalesce(h.attivo, true)
         and (h.id = so.responsabile_hr_profilo_id
              or exists (select 1 from public.squadre_componenti c where c.squadra_id = so.squadra_id and c.hr_profilo_id = h.id))
       order by h.id, so.nome_squadra
    ),
    squadra as (
      -- con l'app: chi ha l'accesso in questo giorno (il capocantiere tutti,
      -- il caposquadra solo i suoi)
      select a.user_id, bool_or(a.is_capocantiere) as capo, max(a.role_type) as role_type
        from public.order_campo_assignments a
       where a.order_id = p_order_id and a.user_id is not null
         and (a.data_inizio is null or a.data_inizio <= v_oggi)
         and (a.data_fine_prevista is null or a.data_fine_prevista >= v_oggi)
         and (v_tutto or a.user_id in (select m.user_id from membri m where m.user_id is not null))
       group by a.user_id
    ),
    eventi as (
      select t.user_id, t.tipo, t.timestamp_evento
        from public.campo_timbrature t
       where t.company_id = v_company and (t.timestamp_evento at time zone 'Europe/Rome')::date = v_oggi
         and (t.order_id = p_order_id or t.order_id is null)
    ),
    agg as (
      select e.user_id,
             min(e.timestamp_evento) filter (where e.tipo = 'entrata') as entrata,
             max(e.timestamp_evento) filter (where e.tipo = 'uscita')  as uscita,
             (array_agg(e.tipo order by e.timestamp_evento desc))[1] = 'entrata' as dentro
        from eventi e group by e.user_id
    ),
    ore as (
      select y.user_id, round((sum(extract(epoch from (coalesce(y.fine, now()) - y.inizio))) / 3600)::numeric, 1) as ore
        from (
          select e.user_id, e.timestamp_evento as inizio,
                 lead(e.timestamp_evento) over (partition by e.user_id order by e.timestamp_evento) as fine,
                 e.tipo
            from eventi e
        ) y where y.tipo = 'entrata' group by y.user_id
    ),
    senza_app as (
      select m.profilo_id, m.nome, m.nome_squadra, m.telefono
        from membri m
       where m.user_id is null
    ),
    timbri_hr as (
      select s.profilo_id,
             min(ht.timestamp) filter (where ht.tipo = 'entrata') as entrata,
             max(ht.timestamp) filter (where ht.tipo = 'uscita') as uscita,
             (array_agg(ht.tipo order by ht.timestamp desc))[1] in ('entrata', 'pausa_fine') as dentro
        from senza_app s
        join public.hr_timbrature ht on ht.profilo_id = s.profilo_id and ht.data_evento = v_oggi
       group by s.profilo_id
    )
    select s.user_id,
           trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as nome,
           case when ur.role = 'subcontractor' then 'sub' else 'dipendente' end as ruolo,
           s.capo as is_capocantiere,
           a.entrata, a.uscita, coalesce(a.dentro, false) as in_cantiere, coalesce(o.ore, 0) as ore,
           exists (select 1 from public.campo_rapportini cr
                    where cr.user_id = s.user_id and cr.order_id = p_order_id and cr.data_lavoro = v_oggi) as rapportino_inviato,
           (select m.nome_squadra from membri m where m.user_id = s.user_id limit 1) as squadra,
           coalesce(
             (select nullif(h2.telefono, '') from public.hr_profili h2
               where h2.user_id = s.user_id and h2.company_id = v_company limit 1),
             nullif(p.phone, '')
           ) as telefono
      from squadra s
      join public.profiles p on p.id = s.user_id
      left join lateral (select ur2.role from public.user_roles ur2 where ur2.user_id = s.user_id
                          order by (ur2.role = 'subcontractor') desc limit 1) ur on true
      left join agg a on a.user_id = s.user_id
      left join ore o on o.user_id = s.user_id
    union all
    select null::uuid, s.nome, 'dipendente', false,
           th.entrata, th.uscita, coalesce(th.dentro, false),
           coalesce(round(public.manodopera_ore_timbrate(s.profilo_id, v_oggi), 1), 0),
           false, s.nome_squadra, nullif(s.telefono, '')
      from senza_app s
      left join timbri_hr th on th.profilo_id = s.profilo_id
  ) x
  order by x.is_capocantiere desc, x.squadra nulls last, x.nome;
end $function$;

revoke all on function public.campo_squadra_oggi(uuid) from public, anon;
grant execute on function public.campo_squadra_oggi(uuid) to authenticated, service_role;

-- Sollecito: arriva come avviso (campanella e push). Solo a chi il capo può già vedere nella squadra,
-- una volta al giorno per persona e cantiere, e non a chi il rapportino l'ha già mandato.
create or replace function public.campo_sollecita_rapportino(p_order_id uuid, p_user_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_company uuid;
  v_codice text;
  v_me uuid := auth.uid();
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_nome text;
begin
  if v_me is null then
    raise exception 'Sessione scaduta: accedi di nuovo.' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = v_me then
    raise exception 'Non si può sollecitare questa persona.' using errcode = 'P0001';
  end if;
  select o.company_id, o.order_code into v_company, v_codice from public.orders o where o.id = p_order_id;
  if v_company is null then
    raise exception 'Cantiere non disponibile.' using errcode = 'P0001';
  end if;
  -- campo_squadra_oggi controlla il ruolo di chi chiama e restituisce solo chi può vedere.
  if not exists (select 1 from public.campo_squadra_oggi(p_order_id) s where s.user_id = p_user_id) then
    raise exception 'Questa persona non è nella tua squadra di oggi.' using errcode = '42501';
  end if;
  if exists (select 1 from public.campo_rapportini cr
              where cr.user_id = p_user_id and cr.order_id = p_order_id and cr.data_lavoro = v_oggi) then
    return jsonb_build_object('ok', true, 'esito', 'gia_inviato');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('campo_sollecito:' || p_order_id::text || ':' || p_user_id::text, 0));
  if exists (select 1 from public.notifications n
              where n.user_id = p_user_id and n.type = 'campo_promemoria'
                and n.entity_type = 'sollecito_rapportino' and n.entity_id = p_order_id
                and (n.created_at at time zone 'Europe/Rome')::date = v_oggi) then
    return jsonb_build_object('ok', true, 'esito', 'gia_sollecitato');
  end if;

  select nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '') into v_nome
    from public.profiles where id = v_me;
  insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  values (v_company, p_user_id, 'campo_promemoria', 'Manda il rapportino',
          coalesce(v_nome, 'Il tuo capo') || ' aspetta il rapportino di oggi' || coalesce(' · ' || v_codice, ''),
          'sollecito_rapportino', p_order_id, '/campo/lavoro/' || p_order_id::text || '/rapportino');
  return jsonb_build_object('ok', true, 'esito', 'inviato');
end $function$;

revoke all on function public.campo_sollecita_rapportino(uuid, uuid) from public, anon;
grant execute on function public.campo_sollecita_rapportino(uuid, uuid) to authenticated;
