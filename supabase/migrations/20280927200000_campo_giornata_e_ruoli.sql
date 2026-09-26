-- App di cantiere: chi vede cosa (26/09/2026, deciso col founder).
--
-- Regola: ognuno vede quello che gli serve per lavorare oggi e per fare il suo
-- rapportino; soldi e dati personali degli altri restano in ufficio.
--
--   Operaio      → dove va oggi e nei prossimi giorni (le SUE date, non quelle
--                  della commessa), le sue fasi, la sua squadra coi nomi dei
--                  colleghi, caposquadra e capocantiere con il telefono.
--   Caposquadra  → in più: chi della sua squadra c'è oggi, chi ha mandato il
--                  rapportino; fa il rapportino di squadra per la sua squadra.
--   Capocantiere → tutto il cantiere (squadre, persone, ditte).
--   Ditta        → il capocantiere come referente e le note «per tutti».
--
-- Funzioni nuove, tutte lette dall'app con i diritti di chi chiama:
--   campo_mia_giornata(dal, giorni)   i miei giorni: dove, fasi, squadra, chi chiamare
--   campo_chi_lavora(ordine, giorno)  «Con chi lavori» nella pagina del cantiere
--   campo_mio_ruolo(ordine)           capocantiere / caposquadra su questa commessa
--   campo_squadra_rapportino(ordine, giorno)  chi mettere nel rapportino di squadra
-- Cambiate:
--   campo_squadra_oggi  anche il caposquadra (solo la sua squadra); conta solo chi
--                       ha l'accesso in quel giorno; dice la squadra di ognuno
--   note_cantiere_destinatari  le ditte col contratto sulla commessa ricevono
--                              le note «per tutti»

-- ── Aiuti ───────────────────────────────────────────────────────────────────
-- Le squadre di cui faccio parte (componente o responsabile).
create or replace function public.campo_mie_squadre()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
    from public.external_teams t
   where t.is_active and t.kind = 'interna'
     and (t.responsabile_hr_profilo_id in (select public.miei_hr_profili())
          or exists (select 1 from public.squadre_componenti c
                      where c.squadra_id = t.id and c.hr_profilo_id in (select public.miei_hr_profili())))
$$;
revoke all on function public.campo_mie_squadre() from public, anon, authenticated;

-- Le squadre di cui sono il caposquadra.
create or replace function public.campo_mie_squadre_capo()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id
    from public.external_teams t
   where t.is_active and t.kind = 'interna'
     and t.responsabile_hr_profilo_id in (select public.miei_hr_profili())
$$;
revoke all on function public.campo_mie_squadre_capo() from public, anon, authenticated;

-- Nome e telefono di lavoro: dalla scheda del Personale, altrimenti dal profilo.
-- Mai il telefono privato.
create or replace function public.campo_contatto_utente(p_user_id uuid, p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when p_user_id is null then null else jsonb_build_object(
           'nome', coalesce(nullif(trim(coalesce(h.nome, '') || ' ' || coalesce(h.cognome, '')), ''),
                            nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
                            'Senza nome'),
           'telefono', coalesce(nullif(trim(h.telefono), ''), nullif(trim(p.phone), '')))
         end
    from (select 1) x
    left join public.profiles p on p.id = p_user_id
    left join lateral (select h2.nome, h2.cognome, h2.telefono
                         from public.hr_profili h2
                        where h2.user_id = p_user_id and h2.company_id = p_company_id
                        order by h2.attivo desc nulls last
                        limit 1) h on true
$$;
revoke all on function public.campo_contatto_utente(uuid, uuid) from public, anon, authenticated;

create or replace function public.campo_contatto_profilo(p_hr_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'nome', coalesce(nullif(trim(coalesce(h.nome, '') || ' ' || coalesce(h.cognome, '')), ''), 'Senza nome'),
           'telefono', coalesce(nullif(trim(h.telefono), ''), nullif(trim(p.phone), '')))
    from public.hr_profili h
    left join public.profiles p on p.id = h.user_id
   where h.id = p_hr_id
$$;
revoke all on function public.campo_contatto_profilo(uuid) from public, anon, authenticated;

-- Lavoro su questa commessa? (accesso, riga di lavoro, squadra, contratto ditta)
create or replace function public.campo_lavoro_su_commessa(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_assigned_to_order(p_order_id)
      or exists (select 1 from public.order_employees oe
                   join public.employees e on e.id = oe.employee_id
                  where oe.order_id = p_order_id and e.user_id = auth.uid())
      or exists (select 1 from public.squadre_commesse sc
                  where sc.order_id = p_order_id and sc.squadra_id in (select public.campo_mie_squadre()))
      or exists (select 1 from public.subappaltatori_sicurezza ss
                   join public.subappaltatori s on s.id = ss.campo_subappaltatore_id
                  where ss.order_id = p_order_id and s.user_id = auth.uid())
$$;
revoke all on function public.campo_lavoro_su_commessa(uuid) from public, anon, authenticated;

-- L'ufficio della commessa (titolare, staff, super admin).
create or replace function public.campo_e_ufficio(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p
                   join public.user_roles ur on ur.user_id = p.id
                  where p.id = auth.uid() and p.company_id = p_company_id
                    and ur.role in ('company_admin', 'company_staff', 'super_admin'))
      or public.has_role(auth.uid(), 'super_admin')
$$;
revoke all on function public.campo_e_ufficio(uuid) from public, anon, authenticated;

-- ── Il mio ruolo su una commessa ────────────────────────────────────────────
create or replace function public.campo_mio_ruolo(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'capocantiere', exists (select 1 from public.order_campo_assignments a
                                    where a.order_id = p_order_id and a.user_id = auth.uid() and a.is_capocantiere),
           'esiste_capo', exists (select 1 from public.order_campo_assignments a
                                   where a.order_id = p_order_id and a.is_capocantiere),
           'caposquadra', exists (select 1 from public.squadre_commesse sc
                                   where sc.order_id = p_order_id
                                     and sc.squadra_id in (select public.campo_mie_squadre_capo())))
$$;
revoke all on function public.campo_mio_ruolo(uuid) from public, anon;
grant execute on function public.campo_mio_ruolo(uuid) to authenticated;

-- ── «Con chi lavori» ────────────────────────────────────────────────────────
create or replace function public.campo_chi_lavora(p_order_id uuid, p_giorno date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_giorno date := coalesce(p_giorno, (now() at time zone 'Europe/Rome')::date);
  v_ditta boolean;
  v_capo uuid;
begin
  select company_id into v_company from public.orders where id = p_order_id and deleted_at is null;
  if v_uid is null or v_company is null then
    return null;
  end if;
  if not (public.campo_lavoro_su_commessa(p_order_id)
          or public.has_permission_for_company(v_uid, 'can_view_orders', v_company)) then
    return null;
  end if;

  -- La ditta vede solo il suo referente, non le squadre dell'impresa.
  v_ditta := not exists (select 1 from public.miei_hr_profili())
             and exists (select 1 from public.subappaltatori s where s.user_id = v_uid and s.company_id = v_company);
  select a.user_id into v_capo
    from public.order_campo_assignments a
   where a.order_id = p_order_id and a.is_capocantiere
   limit 1;

  return jsonb_build_object(
    'giorno', v_giorno,
    'sono_capocantiere', v_capo is not null and v_capo = v_uid,
    'capocantiere', public.campo_contatto_utente(v_capo, v_company),
    'mie_squadre', case when v_ditta then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id,
               'nome', t.name,
               'colore', t.color,
               'sono_caposquadra', t.responsabile_hr_profilo_id in (select public.miei_hr_profili()),
               'caposquadra', case when t.responsabile_hr_profilo_id is null then null
                                   else public.campo_contatto_profilo(t.responsabile_hr_profilo_id) end,
               'oggi_qui', exists (select 1 from public.squadre_commesse sc
                                    where sc.squadra_id = t.id and sc.order_id = p_order_id
                                      and (sc.dal is null or sc.dal <= v_giorno)
                                      and (sc.al is null or sc.al >= v_giorno)),
               'compagni', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'nome', trim(coalesce(h.nome, '') || ' ' || coalesce(h.cognome, '')),
                          'sei_tu', h.id in (select public.miei_hr_profili()))
                        order by h.cognome, h.nome)
                   from public.squadre_componenti c
                   join public.hr_profili h on h.id = c.hr_profilo_id and coalesce(h.attivo, true)
                  where c.squadra_id = t.id
                    and h.id is distinct from t.responsabile_hr_profilo_id), '[]'::jsonb))
             order by t.name)
        from public.external_teams t
       where t.id in (select public.campo_mie_squadre())
         and exists (select 1 from public.squadre_commesse sc where sc.squadra_id = t.id and sc.order_id = p_order_id)
    ), '[]'::jsonb) end,
    -- Chi altro c'è sul cantiere quel giorno: solo i nomi di squadre e ditte.
    'anche_oggi', case when v_ditta then '[]'::jsonb else coalesce((
      select jsonb_agg(distinct x.nome)
        from (
          select t.name as nome
            from public.squadre_commesse sc
            join public.external_teams t on t.id = sc.squadra_id and t.is_active
           where sc.order_id = p_order_id
             and sc.squadra_id not in (select public.campo_mie_squadre())
             and (sc.dal is null or sc.dal <= v_giorno) and (sc.al is null or sc.al >= v_giorno)
          union
          select t.name
            from public.order_external_teams ot
            join public.external_teams t on t.id = ot.external_team_id and t.is_active and t.kind is distinct from 'interna'
            left join public.order_work_phases ph on ph.id = ot.phase_id
           where ot.order_id = p_order_id
             and (ph.id is null or ((ph.start_date is null or ph.start_date <= v_giorno)
                                    and (ph.end_date is null or ph.end_date >= v_giorno)))
          union
          select ss.ragione_sociale
            from public.subappaltatori_sicurezza ss
           where ss.order_id = p_order_id
             and (ss.data_inizio is null or ss.data_inizio <= v_giorno)
             and (ss.data_fine is null or ss.data_fine >= v_giorno)
        ) x
       where nullif(trim(x.nome), '') is not null
    ), '[]'::jsonb) end
  );
end;
$$;
revoke all on function public.campo_chi_lavora(uuid, date) from public, anon;
grant execute on function public.campo_chi_lavora(uuid, date) to authenticated;

-- ── I miei giorni ───────────────────────────────────────────────────────────
-- Per ogni giorno: i cantieri dove sono atteso, con le mie fasi di quel giorno,
-- la mia squadra, caposquadra e capocantiere. Le date sono le mie (accesso
-- all'app, che segue fasi e squadre; per la ditta il contratto); se non ne ho,
-- quelle della commessa; se non ci sono nemmeno quelle il cantiere va in
-- «senza date».
create or replace function public.campo_mia_giornata(p_dal date default null, p_giorni integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_dal date := coalesce(p_dal, (now() at time zone 'Europe/Rome')::date);
  v_n integer := least(greatest(coalesce(p_giorni, 7), 1), 42);
begin
  if v_uid is null then
    return jsonb_build_object('giorni', '[]'::jsonb, 'senza_date', '[]'::jsonb);
  end if;

  return (
    with periodi as (
      select a.order_id, a.company_id, a.data_inizio as dal, a.data_fine_prevista as al, a.is_capocantiere as capo
        from public.order_campo_assignments a
       where a.user_id = v_uid
      union all
      select ss.order_id, ss.company_id,
             coalesce(cs.data_inizio, ss.data_inizio), coalesce(cs.data_fine_prevista, ss.data_fine), false
        from public.subappaltatori_sicurezza ss
        join public.subappaltatori s on s.id = ss.campo_subappaltatore_id and s.user_id = v_uid and coalesce(s.is_active, true)
        left join public.contratti_subappalto cs on cs.subappaltatore_id = ss.id and cs.order_id = ss.order_id and cs.stato = 'attivo'
    ),
    per_ordine as (
      select p.order_id,
             (array_agg(p.company_id))[1] as company_id,
             case when bool_or(p.dal is null) then null else min(p.dal) end as dal,
             case when bool_or(p.al is null) then null else max(p.al) end as al,
             bool_or(p.capo) as capo
        from periodi p
       group by p.order_id
    ),
    cantieri as (
      select po.order_id, po.company_id, po.capo,
             o.order_code, o.description, o.indirizzo_lavori,
             case when po.dal is null and po.al is null then o.work_start_date else po.dal end as dal,
             case when po.dal is null and po.al is null then o.work_end_date else po.al end as al
        from per_ordine po
        join public.orders o on o.id = po.order_id
       where o.deleted_at is null
         and coalesce(lower(o.status), '') not in ('annullato', 'chiuso')
    ),
    giorni as (
      select d::date as giorno
        from generate_series(v_dal::timestamp, (v_dal + (v_n - 1))::timestamp, interval '1 day') d
    ),
    nel_giorno as (
      select g.giorno, c.*
        from giorni g
        join cantieri c
          on (c.dal is not null or c.al is not null)
         and (c.dal is null or c.dal <= g.giorno)
         and (c.al is null or c.al >= g.giorno)
    ),
    schede as (
      select n.giorno, jsonb_build_object(
               'order_id', n.order_id,
               'codice', n.order_code,
               'titolo', n.description,
               'indirizzo', n.indirizzo_lavori,
               'sono_capocantiere', n.capo,
               'fasi', coalesce((
                 select jsonb_agg(f.name order by f.position, f.created_at)
                   from public.order_work_phases f
                  where f.order_id = n.order_id
                    and (f.start_date is null or f.start_date <= n.giorno)
                    and (f.end_date is null or f.end_date >= n.giorno)
                    and (f.start_date is not null or f.end_date is not null)
                    and (exists (select 1 from public.order_employees oe
                                   join public.employees e on e.id = oe.employee_id
                                  where oe.phase_id = f.id and e.user_id = v_uid)
                         or exists (select 1 from public.squadre_commesse sc
                                     where sc.phase_id = f.id and sc.squadra_id in (select public.campo_mie_squadre()))
                         or exists (select 1 from public.order_external_teams ot
                                      join public.external_teams t on t.id = ot.external_team_id
                                      left join public.subappaltatori s on s.id = t.subappaltatore_id
                                     where ot.phase_id = f.id and v_uid in (t.leader_user_id, s.user_id)))
               ), '[]'::jsonb),
               'squadra', (
                 select jsonb_build_object(
                          'nome', t.name,
                          'colore', t.color,
                          'sono_caposquadra', t.responsabile_hr_profilo_id in (select public.miei_hr_profili()),
                          'caposquadra', case when t.responsabile_hr_profilo_id is null
                                                or t.responsabile_hr_profilo_id in (select public.miei_hr_profili()) then null
                                              else public.campo_contatto_profilo(t.responsabile_hr_profilo_id) end)
                   from public.squadre_commesse sc
                   join public.external_teams t on t.id = sc.squadra_id and t.is_active
                  where sc.order_id = n.order_id
                    and sc.squadra_id in (select public.campo_mie_squadre())
                    and (sc.dal is null or sc.dal <= n.giorno) and (sc.al is null or sc.al >= n.giorno)
                  order by t.name
                  limit 1),
               'capocantiere', (
                 select public.campo_contatto_utente(a.user_id, a.company_id)
                   from public.order_campo_assignments a
                  where a.order_id = n.order_id and a.is_capocantiere and a.user_id <> v_uid
                  limit 1)
             ) as scheda,
             n.order_code
        from nel_giorno n
    )
    select jsonb_build_object(
             'giorni', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'giorno', g.giorno,
                        'cantieri', coalesce((select jsonb_agg(s.scheda order by s.order_code)
                                                from schede s where s.giorno = g.giorno), '[]'::jsonb))
                      order by g.giorno)
                 from giorni g), '[]'::jsonb),
             'senza_date', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'order_id', c.order_id, 'codice', c.order_code,
                        'titolo', c.description, 'indirizzo', c.indirizzo_lavori)
                      order by c.order_code)
                 from cantieri c
                where c.dal is null and c.al is null), '[]'::jsonb))
  );
end;
$$;
revoke all on function public.campo_mia_giornata(date, integer) from public, anon;
grant execute on function public.campo_mia_giornata(date, integer) to authenticated;

-- ── Chi mettere nel rapportino di squadra ───────────────────────────────────
-- Capocantiere (e ufficio): tutto il cantiere di quel giorno — squadre,
-- persone sulle fasi, ditte, chi ha l'accesso. Caposquadra: la sua squadra.
-- «rapportino_inviato»: ha già mandato il suo, non va contato due volte.
create or replace function public.campo_squadra_rapportino(p_order_id uuid, p_giorno date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_giorno date := coalesce(p_giorno, (now() at time zone 'Europe/Rome')::date);
  v_tutto boolean;
  v_mie uuid[];
begin
  select company_id into v_company from public.orders where id = p_order_id and deleted_at is null;
  if v_uid is null or v_company is null then
    return '[]'::jsonb;
  end if;
  v_tutto := public.campo_e_ufficio(v_company)
             or exists (select 1 from public.order_campo_assignments a
                         where a.order_id = p_order_id and a.user_id = v_uid and a.is_capocantiere);
  v_mie := array(select sc.squadra_id from public.squadre_commesse sc
                  where sc.order_id = p_order_id and sc.squadra_id in (select public.campo_mie_squadre_capo()));
  if not v_tutto and cardinality(v_mie) = 0 then
    return '[]'::jsonb;
  end if;

  return coalesce((
    with righe as (
      -- le squadre del giorno
      select coalesce('emp-' || h.employee_id::text, 'hr-' || h.id::text) as key,
             h.employee_id, null::uuid as subappaltatore_id, h.user_id,
             trim(coalesce(h.nome, '') || ' ' || coalesce(h.cognome, '')) as nome,
             t.name as squadra, 1 as prio
        from public.squadre_commesse sc
        join public.external_teams t on t.id = sc.squadra_id and t.is_active
        join public.hr_profili h
          on h.company_id = sc.company_id and coalesce(h.attivo, true)
         and (h.id = t.responsabile_hr_profilo_id
              or exists (select 1 from public.squadre_componenti c where c.squadra_id = t.id and c.hr_profilo_id = h.id))
       where sc.order_id = p_order_id
         and (v_tutto or sc.squadra_id = any(v_mie))
         and (sc.dal is null or sc.dal <= v_giorno) and (sc.al is null or sc.al >= v_giorno)
      -- persone messe sulle fasi di quel giorno (o su tutta la commessa)
      union all
      select 'emp-' || e.id::text, e.id, null, e.user_id,
             trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), null, 2
        from public.order_employees oe
        join public.employees e on e.id = oe.employee_id and coalesce(e.is_active, true)
        left join public.order_work_phases ph on ph.id = oe.phase_id
       where v_tutto and oe.order_id = p_order_id
         and (ph.id is null or ((ph.start_date is null or ph.start_date <= v_giorno)
                                and (ph.end_date is null or ph.end_date >= v_giorno)))
      -- ditte in subappalto
      union all
      select 'sub-' || ss.id::text, null, ss.id, s.user_id, ss.ragione_sociale, 'Ditta', 3
        from public.subappaltatori_sicurezza ss
        left join public.subappaltatori s on s.id = ss.campo_subappaltatore_id
       where v_tutto and ss.order_id = p_order_id
      -- chi ha l'accesso senza scheda del Personale
      union all
      select 'usr-' || a.user_id::text, null, null, a.user_id,
             trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), null, 4
        from public.order_campo_assignments a
        join public.profiles p on p.id = a.user_id
       where v_tutto and a.order_id = p_order_id and a.role_type = 'employee'
         and not exists (select 1 from public.employees e where e.user_id = a.user_id and e.company_id = v_company)
    ),
    uniche as (
      select distinct on (r.key) r.*
        from righe r
       where nullif(r.nome, '') is not null
       order by r.key, r.prio
    )
    select jsonb_agg(jsonb_build_object(
             'key', u.key,
             'employee_id', u.employee_id,
             'subappaltatore_id', u.subappaltatore_id,
             'nome', u.nome,
             'squadra', u.squadra,
             'sono_io', u.user_id is not null and u.user_id = v_uid,
             'rapportino_inviato', u.user_id is not null and u.user_id <> v_uid
                                   and exists (select 1 from public.campo_rapportini cr
                                                where cr.user_id = u.user_id and cr.order_id = p_order_id
                                                  and cr.data_lavoro = v_giorno))
           order by (u.squadra is null), u.squadra, u.nome)
      from uniche u
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.campo_squadra_rapportino(uuid, date) from public, anon;
grant execute on function public.campo_squadra_rapportino(uuid, date) to authenticated;

-- ── «Squadra di oggi»: anche il caposquadra, solo la sua squadra ────────────
drop function if exists public.campo_squadra_oggi(uuid);
create function public.campo_squadra_oggi(p_order_id uuid)
returns table(user_id uuid, nome text, ruolo text, is_capocantiere boolean, entrata timestamp with time zone,
              uscita timestamp with time zone, in_cantiere boolean, ore numeric, rapportino_inviato boolean, squadra text)
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
  select x.user_id, x.nome, x.ruolo, x.is_capocantiere, x.entrata, x.uscita, x.in_cantiere, x.ore, x.rapportino_inviato, x.squadra
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
      select distinct on (h.id) h.id as profilo_id, h.user_id, so.nome_squadra,
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
      select m.profilo_id, m.nome, m.nome_squadra
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
           (select m.nome_squadra from membri m where m.user_id = s.user_id limit 1) as squadra
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
           false, s.nome_squadra
      from senza_app s
      left join timbri_hr th on th.profilo_id = s.profilo_id
  ) x
  order by x.is_capocantiere desc, x.squadra nulls last, x.nome;
end $function$;
revoke all on function public.campo_squadra_oggi(uuid) from public, anon;
grant execute on function public.campo_squadra_oggi(uuid) to authenticated;

-- ── Note «per tutti» anche alle ditte col contratto sulla commessa ──────────
create or replace function public.note_cantiere_destinatari(p_nota_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with n as (select * from public.note_cantiere where id = p_nota_id),
  sul_cantiere as (
    -- chi ha l'accesso al cantiere…
    select a.user_id from public.order_campo_assignments a, n where a.order_id = n.order_id
    union
    -- …o è in una squadra che ci lavora
    select h.user_id
      from n
      join public.squadre_commesse sc on sc.order_id = n.order_id
      join public.squadre_componenti c on c.squadra_id = sc.squadra_id
      join public.hr_profili h on h.id = c.hr_profilo_id and h.user_id is not null
    union
    -- …o è la ditta col contratto su questa commessa
    select s.user_id
      from n
      join public.subappaltatori_sicurezza ss on ss.order_id = n.order_id
      join public.subappaltatori s on s.id = ss.campo_subappaltatore_id and s.user_id is not null and coalesce(s.is_active, true)
  )
  select distinct s.user_id
    from sul_cantiere s, n
   where s.user_id is not null
     and public.account_della_azienda(s.user_id, n.company_id)
     and (n.per = 'tutti'
          or (n.per = 'squadra' and exists (
                select 1 from public.squadre_componenti c
                  join public.hr_profili h on h.id = c.hr_profilo_id
                 where c.squadra_id = n.squadra_id and h.user_id = s.user_id))
          or (n.per = 'persona' and exists (
                select 1 from public.hr_profili h where h.id = n.hr_profilo_id and h.user_id = s.user_id)))
  union
  -- la persona a cui è scritta, anche se non ha ancora l'accesso
  select h.user_id
    from n join public.hr_profili h on h.id = n.hr_profilo_id
   where n.per = 'persona' and h.user_id is not null and public.account_della_azienda(h.user_id, n.company_id)
$$;
revoke all on function public.note_cantiere_destinatari(uuid) from public, anon, authenticated;
