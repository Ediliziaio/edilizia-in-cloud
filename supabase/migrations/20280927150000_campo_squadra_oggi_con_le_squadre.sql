-- App di cantiere, «Chi c'è oggi»: anche chi della squadra non ha l'app
-- (26/09/2026, Manodopera e Mezzi).
--
-- campo_squadra_oggi() elencava solo chi ha un accesso al cantiere
-- (order_campo_assignments), cioè solo chi ha l'app. Con le squadre sulla
-- commessa il capocantiere deve vedere tutta la squadra: gli operai senza app
-- (che timbrano col badge o che l'ufficio segna a mano) compaiono con
-- user_id vuoto, entrata/uscita e ore dalle timbrature del Personale.
-- Le righe di prima non cambiano: stesse colonne, stesso ordine.

create or replace function public.campo_squadra_oggi(p_order_id uuid)
returns table(user_id uuid, nome text, ruolo text, is_capocantiere boolean, entrata timestamp with time zone, uscita timestamp with time zone, in_cantiere boolean, ore numeric, rapportino_inviato boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_company uuid;
  v_me uuid := auth.uid();
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  select o.company_id into v_company from public.orders o where o.id = p_order_id;
  if v_company is null then return; end if;
  -- Chi può guardare: ufficio della stessa azienda, o capocantiere di QUESTO cantiere.
  if not (
    exists (select 1 from public.profiles p join public.user_roles ur on ur.user_id = p.id
            where p.id = v_me and p.company_id = v_company and ur.role in ('company_admin', 'company_staff', 'super_admin'))
    or exists (select 1 from public.order_campo_assignments a where a.order_id = p_order_id and a.user_id = v_me and a.is_capocantiere)
  ) then
    raise exception 'Solo il capocantiere o l''ufficio possono vedere la squadra' using errcode = '42501';
  end if;

  return query
  select x.user_id, x.nome, x.ruolo, x.is_capocantiere, x.entrata, x.uscita, x.in_cantiere, x.ore, x.rapportino_inviato
  from (
    with squadra as (
      select distinct a.user_id, bool_or(a.is_capocantiere) as capo, max(a.role_type) as role_type
      from public.order_campo_assignments a where a.order_id = p_order_id and a.user_id is not null
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
      -- coppie entrata→uscita in ordine; l'ultima entrata aperta conta fino ad adesso
      select y.user_id, round((sum(extract(epoch from (coalesce(y.fine, now()) - y.inizio))) / 3600)::numeric, 1) as ore
      from (
        select e.user_id, e.timestamp_evento as inizio,
               lead(e.timestamp_evento) over (partition by e.user_id order by e.timestamp_evento) as fine,
               e.tipo
        from eventi e
      ) y where y.tipo = 'entrata' group by y.user_id
    ),
    -- Chi della squadra sul cantiere oggi non ha l'app: si legge dal Personale.
    senza_app as (
      select h.id as profilo_id, trim(coalesce(h.nome, '') || ' ' || coalesce(h.cognome, '')) as nome
      from public.squadre_commesse sc
      join public.external_teams t on t.id = sc.squadra_id and t.is_active
      join public.squadre_componenti c on c.squadra_id = sc.squadra_id
      join public.hr_profili h on h.id = c.hr_profilo_id and h.user_id is null and coalesce(h.attivo, true)
      where sc.order_id = p_order_id
        and (sc.dal is null or sc.dal <= v_oggi)
        and (sc.al is null or sc.al >= v_oggi)
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
           exists (select 1 from public.campo_rapportini cr where cr.user_id = s.user_id and cr.order_id = p_order_id and cr.data_lavoro = v_oggi) as rapportino_inviato
    from squadra s
    join public.profiles p on p.id = s.user_id
    left join lateral (select ur2.role from public.user_roles ur2 where ur2.user_id = s.user_id order by (ur2.role = 'subcontractor') desc limit 1) ur on true
    left join agg a on a.user_id = s.user_id
    left join ore o on o.user_id = s.user_id
    union all
    select null::uuid, s.nome, 'dipendente', false,
           th.entrata, th.uscita, coalesce(th.dentro, false),
           coalesce(round(public.manodopera_ore_timbrate(s.profilo_id, v_oggi), 1), 0),
           false
    from senza_app s
    left join timbri_hr th on th.profilo_id = s.profilo_id
  ) x
  order by x.is_capocantiere desc, x.nome;
end $function$;
