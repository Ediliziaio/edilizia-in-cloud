-- Molte aziende segnano l'appuntamento nella fase dell'opportunità, non nel calendario: BeMade ha zero
-- appuntamenti a calendario e 1.664 opportunità in una fase «appuntamento fissato». E tiene «aperte»
-- le fasi «Non lavorabile» e «Non interessato», che non vanno richiamate.
-- Le fasi non hanno un tipo, solo un nome libero: le riconosciamo dal nome. Se un'azienda usa nomi
-- diversi, l'errore è un contatto in più in coda o un appuntamento in meno, mai un dato perso.
-- La cronologia delle fasi non dice chi ha spostato l'opportunità: l'appuntamento va a chi ha chiamato
-- il contatto nei 7 giorni prima (o nel giorno dopo, se ha registrato la chiamata dopo).

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.callcenter_fase_appuntamento(p_nome text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p_nome ~* '(appunt|sopralluog|demo|meeting|visita).*fissat'
    and p_nome !~* '(rifissare|da fissare)', false)
$$;

create or replace function public.callcenter_fase_fuori_coda(p_nome text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(
    p_nome !~* '(rifissare|da fissare)'
    and p_nome ~* '(non interessat|non lavorabil|sbagliat|stranier|fuori zona|vendut|pers[oa]\y|stand.?by|nutriment|trattativa|appunt|sopralluog|preventiv|contratt|demo|meeting|non risponde 3)',
    false)
$$;

revoke all on function public.callcenter_fase_appuntamento(text) from public, anon;
revoke all on function public.callcenter_fase_fuori_coda(text) from public, anon;
grant execute on function public.callcenter_fase_appuntamento(text) to authenticated, service_role;
grant execute on function public.callcenter_fase_fuori_coda(text) to authenticated, service_role;

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
           bool_or(o.status = 'open' and not public.callcenter_fase_fuori_coda(s.name)) as in_coda,
           min(o.next_action_date) filter (where o.status = 'open' and o.next_action ilike '%chiam%') as richiamo_il,
           (array_agg(o.id order by o.updated_at desc) filter (where o.status = 'open'))[1] as opportunita_id,
           (array_agg(s.name order by o.updated_at desc) filter (where o.status = 'open'))[1] as fase
      from public.marketing_opportunities o
      left join public.marketing_pipeline_stages s on s.id = o.stage_id
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
    select l.*, coalesce(c.tentativi, 0) as tentativi, c.ultima_at, c.ultimo_esito, op.opportunita_id, op.fase,
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
       and (op.contact_id is null or op.in_coda)
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
               'fase', r.fase,
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
  app_calendario as (
    select a.id, a.status, coalesce(a.contact_id, o.contact_id) as contact_id
      from public.appointments a
      left join public.marketing_opportunities o on o.id = a.opportunity_id
     where a.company_id = p_company_id and a.created_by = any (v_ops)
       and coalesce(a.is_blocked_slot, false) = false
       and a.created_at >= v_inizio and a.created_at < v_fine
  ),
  app_fasi as (
    select distinct o.contact_id
      from public.marketing_opportunity_stage_history h
      join public.marketing_pipeline_stages s on s.id = h.stage_id
      join public.marketing_opportunities o on o.id = h.opportunity_id
     where h.company_id = p_company_id
       and h.entered_at >= v_inizio and h.entered_at < v_fine
       and o.deleted_at is null and o.contact_id is not null
       and public.callcenter_fase_appuntamento(s.name)
       and exists (
         select 1 from public.call_logs cl
          where cl.contact_id = o.contact_id and cl.user_id = any (v_ops)
            and cl.started_at >= h.entered_at - interval '7 days'
            and cl.started_at <= h.entered_at + interval '1 day'
       )
  ),
  app_unici as (
    select coalesce(contact_id, id) as chiave from app_calendario where status is distinct from 'annullato'
    union
    select contact_id from app_fasi
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
           (exists (
             select 1 from public.appointments a
               left join public.marketing_opportunities o on o.id = a.opportunity_id
              where a.company_id = p_company_id and coalesce(a.contact_id, o.contact_id) = l.id
                and coalesce(a.is_blocked_slot, false) = false and a.status is distinct from 'annullato'
           ) or exists (
             select 1 from public.marketing_opportunities o
               join public.marketing_opportunity_stage_history h on h.opportunity_id = o.id
               join public.marketing_pipeline_stages s on s.id = h.stage_id
              where o.contact_id = l.id and o.deleted_at is null
                and public.callcenter_fase_appuntamento(s.name)
           )) as con_appuntamento
      from lead l
  )
  select jsonb_build_object(
    'chiamate', (select count(*) from chiamate),
    'contatti_chiamati', (select count(distinct contact_id) from chiamate),
    'contatti_raggiunti', (select count(distinct contact_id) from chiamate where outcome = 'answered'),
    'giorni_attivi', (select count(distinct giorno) from chiamate),
    'appuntamenti_fissati', (select count(*) from app_unici),
    'appuntamenti_annullati', (select count(*) from app_calendario where status = 'annullato'),
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
