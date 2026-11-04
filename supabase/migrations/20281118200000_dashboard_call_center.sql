-- Dashboard Call Center: la pagina da cui l'operatore lavora (04/11/2026).
--
-- Non riusa la vista callcenter_lead_journey del report per la direzione, che ha tre difetti:
--   - moltiplica le chiamate per gli appuntamenti dello stesso contatto;
--   - conta come «presentati» gli appuntamenti solo confermati;
--   - attribuisce il lead al solo assigned_to, ignorando call_center_id.
-- Qui il lead è dell'operatore se call_center_id è suo, oppure se è vuoto e assigned_to è suo.
--
-- L'operatore vede solo i suoi numeri. Il caposquadra anche quelli della squadra, l'amministratore
-- tutti: la regola sta sul database, non nella pagina.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.staff_permissions
  add column if not exists can_view_callcenter_dashboard boolean not null default false;

-- La data del richiamo finiva solo nel testo delle note: senza opportunità non era leggibile.
alter table public.call_logs add column if not exists richiamo_il date;

create index if not exists idx_call_logs_contatto_data
  on public.call_logs (contact_id, started_at desc);
create index if not exists idx_marketing_contacts_call_center
  on public.marketing_contacts (company_id, call_center_id)
  where deleted_at is null and call_center_id is not null;
create index if not exists idx_marketing_contacts_assegnato
  on public.marketing_contacts (company_id, assigned_to)
  where deleted_at is null and assigned_to is not null;

-- Gli operatori di un'azienda: chi ha il ruolo call_center e una riga di permessi lì.
create or replace function public.callcenter_operatori_azienda(p_company_id uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct s.user_id), '{}'::uuid[])
    from public.staff_permissions s
    join public.user_roles r on r.user_id = s.user_id and r.role::text = 'call_center'
   where s.company_id = p_company_id
$$;
revoke all on function public.callcenter_operatori_azienda(uuid) from public, anon, authenticated;
grant execute on function public.callcenter_operatori_azienda(uuid) to service_role;

-- Chi può vedere cosa. Restituisce gli operatori da leggere, o solleva 42501.
-- p_operatore_id vuoto: l'amministratore legge tutto il team, gli altri solo se stessi.
create or replace function public.callcenter_operatori_ammessi(p_company_id uuid, p_operatore_id uuid)
returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_admin boolean;
begin
  perform public.assert_company_access(p_company_id);
  if not public.has_permission_for_company(v_me, 'can_view_callcenter_dashboard', p_company_id) then
    raise exception 'Dashboard Call Center non abilitata' using errcode = '42501';
  end if;
  v_admin := public.utente_super_admin() or public.e_amministratore_di(p_company_id);
  if p_operatore_id is null then
    return case when v_admin then public.callcenter_operatori_azienda(p_company_id) else array[v_me] end;
  end if;
  if v_admin or p_operatore_id = v_me or p_operatore_id = any (public.membri_mie_squadre()) then
    return array[p_operatore_id];
  end if;
  raise exception 'Puoi vedere solo i tuoi numeri' using errcode = '42501';
end $$;
revoke all on function public.callcenter_operatori_ammessi(uuid, uuid) from public, anon, authenticated;
grant execute on function public.callcenter_operatori_ammessi(uuid, uuid) to service_role;

-- Chi compare nel selettore operatore.
create or replace function public.get_callcenter_operatori(p_company_id uuid)
returns table (operatore_id uuid, nome text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_ids uuid[];
begin
  perform public.callcenter_operatori_ammessi(p_company_id, null);
  if public.utente_super_admin() or public.e_amministratore_di(p_company_id) then
    v_ids := public.callcenter_operatori_azienda(p_company_id);
  else
    v_ids := array[v_me] || public.membri_mie_squadre();
  end if;
  return query
    select p.id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
      from public.profiles p
     where p.id = any (v_ids)
     order by 2;
end $$;

-- La coda: chi chiamare adesso, in ordine di urgenza.
--   richiamo : richiamo scaduto o di oggi, o «da richiamare» senza data
--   nuovo    : mai chiamato, arrivato negli ultimi 30 giorni, dal più vecchio
--   ritentare: non ha risposto o era occupato, meno di 5 tentativi, ultimo da almeno 4 ore
--   arretrato: mai chiamato, più vecchio di 30 giorni, dal più recente. Sta in fondo: da solo, in
--              ordine di età, seppellirebbe i lead nuovi sotto le liste importate.
-- Fuori: chi ha un appuntamento valido, chi ha solo opportunità chiuse, numero errato, chi ha
-- risposto senza chiedere un richiamo, chi ha chiesto di non essere chiamato.
create or replace function public.get_callcenter_coda(
  p_company_id uuid, p_operatore_id uuid default null, p_limite integer default 50
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ops uuid[] := public.callcenter_operatori_ammessi(p_company_id, p_operatore_id);
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_ris jsonb;
begin
  with lead as (
    select mc.id, mc.first_name, mc.last_name, mc.company_name, mc.phone, mc.source, mc.created_at,
           coalesce(mc.call_center_id, mc.assigned_to) as operatore_id
      from public.marketing_contacts mc
     where mc.company_id = p_company_id
       and mc.deleted_at is null
       and coalesce(mc.call_center_id, mc.assigned_to) = any (v_ops)
       and nullif(trim(coalesce(mc.phone, '')), '') is not null
       and not coalesce(mc.opt_out, false)
       and not coalesce(mc.optout_call, false)
       and (mc.ricontatta_dopo is null or mc.ricontatta_dopo <= now())
  ),
  chiamate as (
    select cl.contact_id,
           count(*) as tentativi,
           max(cl.started_at) as ultima_at,
           (array_agg(cl.outcome order by cl.started_at desc))[1] as ultimo_esito,
           (array_agg(cl.richiamo_il order by cl.started_at desc))[1] as richiamo_il
      from public.call_logs cl
     where cl.company_id = p_company_id and cl.contact_id is not null
     group by cl.contact_id
  ),
  opportunita as (
    select o.contact_id,
           bool_or(o.status = 'open') as aperta,
           min(o.next_action_date) filter (where o.status = 'open' and o.next_action ilike '%chiam%') as richiamo_il,
           (array_agg(o.id order by o.updated_at desc) filter (where o.status = 'open'))[1] as opportunita_id
      from public.marketing_opportunities o
     where o.company_id = p_company_id and o.deleted_at is null and o.contact_id is not null
     group by o.contact_id
  ),
  appuntati as (
    select distinct coalesce(a.contact_id, o.contact_id) as contact_id
      from public.appointments a
      left join public.marketing_opportunities o on o.id = a.opportunity_id
     where a.company_id = p_company_id
       and coalesce(a.is_blocked_slot, false) = false
       and a.status is distinct from 'annullato'
       and coalesce(a.contact_id, o.contact_id) is not null
  ),
  stato as (
    select l.*, coalesce(c.tentativi, 0) as tentativi, c.ultima_at, c.ultimo_esito, op.opportunita_id,
           least(c.richiamo_il, op.richiamo_il) as richiamo_il,
           case
             when (c.ultimo_esito = 'callback' and c.richiamo_il is null)
               or least(c.richiamo_il, op.richiamo_il) <= v_oggi then 'richiamo'
             when c.ultimo_esito in ('answered', 'wrong_number', 'callback') then null
             when coalesce(c.tentativi, 0) = 0 and l.created_at >= now() - interval '30 days' then 'nuovo'
             when coalesce(c.tentativi, 0) = 0 then 'arretrato'
             when c.ultimo_esito in ('no_answer', 'busy') and c.tentativi < 5
                  and c.ultima_at <= now() - interval '4 hours' then 'ritentare'
           end as categoria
      from lead l
      left join chiamate c on c.contact_id = l.id
      left join opportunita op on op.contact_id = l.id
     where not exists (select 1 from appuntati a where a.contact_id = l.id)
       and (op.contact_id is null or op.aperta)
  ),
  ordinati as (
    select s.*, row_number() over (
             partition by s.categoria
             order by case s.categoria
                        when 'richiamo' then extract(epoch from coalesce(s.richiamo_il, v_oggi)::timestamp)
                        when 'nuovo' then extract(epoch from s.created_at)
                        when 'ritentare' then extract(epoch from s.ultima_at)
                        else -extract(epoch from s.created_at)
                      end
           ) as pos
      from stato s
     where s.categoria is not null
  )
  select jsonb_build_object(
    'conteggi', coalesce((select jsonb_object_agg(categoria, n)
                            from (select categoria, count(*) n from ordinati group by 1) t), '{}'::jsonb),
    'righe', coalesce((
      select jsonb_agg(jsonb_build_object(
               'contact_id', r.id,
               'nome', nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
               'azienda', r.company_name,
               'telefono', r.phone,
               'fonte', r.source,
               'arrivato_il', r.created_at,
               'operatore_id', r.operatore_id,
               'categoria', r.categoria,
               'tentativi', r.tentativi,
               'ultima_chiamata_at', r.ultima_at,
               'ultimo_esito', r.ultimo_esito,
               'richiamo_il', r.richiamo_il,
               'opportunita_id', r.opportunita_id
             ) order by case r.categoria when 'richiamo' then 1 when 'nuovo' then 2 when 'ritentare' then 3 else 4 end, r.pos)
        from ordinati r where r.pos <= v_limite), '[]'::jsonb)
  ) into v_ris;
  return v_ris;
end $$;

-- I numeri di un periodo. Le attività (chiamate, appuntamenti) contano per quando sono avvenute,
-- velocità e conversione sui lead assegnati per quando sono arrivati.
create or replace function public.get_callcenter_numeri(
  p_company_id uuid, p_operatore_id uuid, p_da date, p_a date
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ops uuid[] := public.callcenter_operatori_ammessi(p_company_id, p_operatore_id);
  v_inizio timestamptz := p_da::timestamp at time zone 'Europe/Rome';
  v_fine timestamptz := (p_a + 1)::timestamp at time zone 'Europe/Rome';
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_ris jsonb;
begin
  with chiamate as (
    select cl.contact_id, cl.outcome, (cl.started_at at time zone 'Europe/Rome')::date as giorno
      from public.call_logs cl
     where cl.company_id = p_company_id and cl.user_id = any (v_ops)
       and cl.started_at >= v_inizio and cl.started_at < v_fine
  ),
  app_fissati as (
    select a.status
      from public.appointments a
     where a.company_id = p_company_id and a.created_by = any (v_ops)
       and coalesce(a.is_blocked_slot, false) = false
       and a.created_at >= v_inizio and a.created_at < v_fine
  ),
  app_svolti as (
    select a.status
      from public.appointments a
     where a.company_id = p_company_id and a.created_by = any (v_ops)
       and coalesce(a.is_blocked_slot, false) = false
       and a.appointment_date between p_da and least(p_a, v_oggi - 1)
       and a.status is distinct from 'annullato'
  ),
  lead as (
    select mc.id, mc.created_at,
           (select min(cl.started_at) from public.call_logs cl
             where cl.contact_id = mc.id and cl.started_at >= mc.created_at) as prima_chiamata
      from public.marketing_contacts mc
     where mc.company_id = p_company_id and mc.deleted_at is null
       and coalesce(mc.call_center_id, mc.assigned_to) = any (v_ops)
       and mc.created_at >= v_inizio and mc.created_at < v_fine
  ),
  lead_tempi as (
    select l.id, extract(epoch from l.prima_chiamata - l.created_at) / 60.0 as minuti,
           exists (
             select 1 from public.appointments a
               left join public.marketing_opportunities o on o.id = a.opportunity_id
              where a.company_id = p_company_id and coalesce(a.contact_id, o.contact_id) = l.id
                and coalesce(a.is_blocked_slot, false) = false and a.status is distinct from 'annullato'
           ) as con_appuntamento
      from lead l
  )
  select jsonb_build_object(
    'chiamate', (select count(*) from chiamate),
    'contatti_chiamati', (select count(distinct contact_id) from chiamate),
    'contatti_raggiunti', (select count(distinct contact_id) from chiamate where outcome = 'answered'),
    'giorni_attivi', (select count(distinct giorno) from chiamate),
    'appuntamenti_fissati', (select count(*) from app_fissati where status is distinct from 'annullato'),
    'appuntamenti_annullati', (select count(*) from app_fissati where status = 'annullato'),
    'svolti_totale', (select count(*) from app_svolti),
    'svolti_presentati', (select count(*) from app_svolti where status in ('presentato', 'da_preventivare', 'preventivo_inviato', 'venduto', 'perso', 'non_qualificato', 'completato')),
    'svolti_assenti', (select count(*) from app_svolti where status = 'no_show'),
    'lead_assegnati', (select count(*) from lead_tempi),
    'lead_chiamati', (select count(*) from lead_tempi where minuti is not null),
    'lead_con_appuntamento', (select count(*) from lead_tempi where con_appuntamento),
    'mediana_minuti', (select round((percentile_cont(0.5) within group (order by minuti))::numeric, 1) from lead_tempi where minuti is not null),
    'entro_5_min', (select count(*) from lead_tempi where minuti <= 5)
  ) into v_ris;
  return v_ris;
end $$;

-- Gli appuntamenti in arrivo fissati dall'operatore.
create or replace function public.get_callcenter_appuntamenti(
  p_company_id uuid, p_operatore_id uuid default null, p_limite integer default 20
)
returns table (
  id uuid, titolo text, data date, ora text, stato text, contact_id uuid, contatto text, assegnato_a text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_ops uuid[] := public.callcenter_operatori_ammessi(p_company_id, p_operatore_id);
begin
  return query
    select a.id, a.title::text, a.appointment_date::date, a.appointment_time::text, a.status::text,
           mc.id, nullif(trim(coalesce(mc.first_name, '') || ' ' || coalesce(mc.last_name, '')), ''),
           nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
      from public.appointments a
      left join public.marketing_opportunities o on o.id = a.opportunity_id
      left join public.marketing_contacts mc on mc.id = coalesce(a.contact_id, o.contact_id)
      left join public.profiles p on p.id = a.assigned_to
     where a.company_id = p_company_id and a.created_by = any (v_ops)
       and coalesce(a.is_blocked_slot, false) = false
       and a.status is distinct from 'annullato'
       and a.appointment_date >= (now() at time zone 'Europe/Rome')::date
     order by a.appointment_date, a.appointment_time nulls last
     limit least(greatest(coalesce(p_limite, 20), 1), 100);
end $$;

revoke all on function public.get_callcenter_operatori(uuid) from public, anon;
revoke all on function public.get_callcenter_coda(uuid, uuid, integer) from public, anon;
revoke all on function public.get_callcenter_numeri(uuid, uuid, date, date) from public, anon;
revoke all on function public.get_callcenter_appuntamenti(uuid, uuid, integer) from public, anon;
grant execute on function public.get_callcenter_operatori(uuid) to authenticated, service_role;
grant execute on function public.get_callcenter_coda(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.get_callcenter_numeri(uuid, uuid, date, date) to authenticated, service_role;
grant execute on function public.get_callcenter_appuntamenti(uuid, uuid, integer) to authenticated, service_role;
