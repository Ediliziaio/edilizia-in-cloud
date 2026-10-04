-- ============================================================================
-- La lista del capo include chi ha timbrato quel giorno e chi ha l'accesso
-- ============================================================================
-- Provando il flusso come operaio e come capocantiere sulla Demo: Marco Verdi
-- timbra 7,5 ore su ORD-DEM-RIS01, ma nel «Chi ha lavorato oggi?» del capo non
-- compariva, perché la lista contava solo squadre, fasi attive del giorno e ditte.
-- Con «le ore dalle timbrature» la lista deve partire da chi ha timbrato:
--   · chi ha timbrato su questo cantiere in questo giorno;
--   · chi ha l'accesso al cantiere in quei giorni (con o senza scheda del
--     Personale), capocantiere compreso: «se hai lavorato anche tu, seleziona
--     anche il tuo nome» valeva solo per chi era già su una fase.
-- Una persona compare una volta sola: l'identità si decide dal LOGIN (employees.user_id
-- = hr_profili.user_id), che è la prova più forte, e solo dopo dal collegamento della
-- scheda (hr_profili.employee_id). Sulla Demo la scheda di Marco Verdi punta
-- all'anagrafica del capocantiere: col solo collegamento le sue ore sarebbero finite
-- sul costo di un altro.
-- Solo per il capocantiere e l'ufficio; il caposquadra vede la sua squadra.
-- Idempotente. Nessuna scrittura.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

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
      select coalesce('emp-' || x.emp_id::text, 'hr-' || h.id::text) as key,
             x.emp_id as employee_id, null::uuid as subappaltatore_id, h.user_id,
             trim(coalesce(h.nome, '') || ' ' || coalesce(h.cognome, '')) as nome,
             t.name as squadra, 1 as prio, h.id as profilo_id
        from public.squadre_commesse sc
        join public.external_teams t on t.id = sc.squadra_id and t.is_active
        join public.hr_profili h
          on h.company_id = sc.company_id and coalesce(h.attivo, true)
         and (h.id = t.responsabile_hr_profilo_id
              or exists (select 1 from public.squadre_componenti c where c.squadra_id = t.id and c.hr_profilo_id = h.id))
        cross join lateral (select coalesce(
                 (select e.id from public.employees e where e.user_id = h.user_id and e.company_id = v_company limit 1),
                 h.employee_id) as emp_id) x
       where sc.order_id = p_order_id
         and (v_tutto or sc.squadra_id = any(v_mie))
         and (sc.dal is null or sc.dal <= v_giorno) and (sc.al is null or sc.al >= v_giorno)
      -- persone messe sulle fasi di quel giorno (o su tutta la commessa)
      union all
      select 'emp-' || e.id::text, e.id, null, e.user_id,
             trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), null, 2,
             (select hp.id from public.hr_profili hp
               where hp.employee_id = e.id and hp.company_id = v_company
               order by coalesce(hp.attivo, true) desc limit 1)
        from public.order_employees oe
        join public.employees e on e.id = oe.employee_id and coalesce(e.is_active, true)
        left join public.order_work_phases ph on ph.id = oe.phase_id
       where v_tutto and oe.order_id = p_order_id
         and (ph.id is null or ((ph.start_date is null or ph.start_date <= v_giorno)
                                and (ph.end_date is null or ph.end_date >= v_giorno)))
      -- ditte in subappalto
      union all
      select 'sub-' || ss.id::text, null, ss.id, s.user_id, ss.ragione_sociale, 'Ditta', 3, null::uuid
        from public.subappaltatori_sicurezza ss
        left join public.subappaltatori s on s.id = ss.campo_subappaltatore_id
       where v_tutto and ss.order_id = p_order_id
      -- chi ha l'accesso senza scheda del Personale
      union all
      select 'usr-' || a.user_id::text, null, null, a.user_id,
             trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), null, 4,
             public.hr_profilo_da_user(a.user_id, v_company)
        from public.order_campo_assignments a
        join public.profiles p on p.id = a.user_id
       where v_tutto and a.order_id = p_order_id and a.role_type = 'employee'
         and not exists (select 1 from public.employees e where e.user_id = a.user_id and e.company_id = v_company)
      -- chi ha timbrato su QUESTO cantiere quel giorno, anche se non è in una squadra
      -- né su una fase: è esattamente «chi c'era», e con le ore dalle timbrature è
      -- la lista che serve al capo
      union all
      select coalesce('emp-' || x.emp_id::text, 'hr-' || h.id::text), x.emp_id, null::uuid, h.user_id,
             trim(coalesce(h.nome, '') || ' ' || coalesce(h.cognome, '')), null, 5, h.id
        from public.hr_profili h
        cross join lateral (select coalesce(
                 (select e.id from public.employees e where e.user_id = h.user_id and e.company_id = v_company limit 1),
                 h.employee_id) as emp_id) x
       where v_tutto and h.company_id = v_company
         and exists (select 1 from public.hr_timbrature t
                      where t.profilo_id = h.id and t.order_id = p_order_id and t.data_evento = v_giorno)
      -- chi ha l'accesso al cantiere in quei giorni, anche con la scheda del
      -- Personale (e il capocantiere stesso, che altrimenti non può segnarsi)
      union all
      select 'emp-' || e.id::text, e.id, null, e.user_id,
             trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), null, 6,
             (select hp.id from public.hr_profili hp
               where hp.employee_id = e.id and hp.company_id = v_company
               order by coalesce(hp.attivo, true) desc limit 1)
        from public.order_campo_assignments a
        join public.employees e on e.user_id = a.user_id and e.company_id = v_company and coalesce(e.is_active, true)
       where v_tutto and a.order_id = p_order_id and a.role_type = 'employee'
         and (a.data_inizio is null or a.data_inizio <= v_giorno)
         and (a.data_fine_prevista is null or a.data_fine_prevista >= v_giorno)
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
                                                  and cr.data_lavoro = v_giorno),
             'ore_timbrate', (x.t->>'ore')::numeric,
             'timbratura_aperta', coalesce((x.t->>'aperta')::boolean, false),
             'gia_registrato_da_altri', u.employee_id is not null
                                   and exists (select 1
                                                 from public.campo_rapportini cr2
                                                 cross join lateral jsonb_array_elements(
                                                   case when jsonb_typeof(cr2.presenze) = 'array'
                                                        then cr2.presenze else '[]'::jsonb end) pz
                                                where cr2.order_id = p_order_id
                                                  and cr2.data_lavoro = v_giorno
                                                  and cr2.user_id <> v_uid
                                                  and cr2.stato in ('inviato', 'approvato')
                                                  and pz->>'employee_id' = u.employee_id::text))
           order by (u.squadra is null), u.squadra, u.nome)
      from uniche u
      left join lateral (select public.campo_ore_timbrate_cantiere(u.profilo_id, p_order_id, v_giorno) as t) x on true
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.campo_squadra_rapportino(uuid, date) from public, anon;
grant execute on function public.campo_squadra_rapportino(uuid, date) to authenticated;
