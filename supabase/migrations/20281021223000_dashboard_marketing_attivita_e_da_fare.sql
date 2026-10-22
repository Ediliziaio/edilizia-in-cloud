-- Dashboard marketing: il lavoro del team (scheda Attività) e le cose da fare
-- oggi (scheda Commerciale).
--
-- marketing_attivita_team: per persona, nel periodo, quanto ha lavorato —
-- chiamate (risposte, durata media), note, messaggi, cambi di fase, contatti
-- toccati, appuntamenti fissati da lei — e come sono andati gli appuntamenti a
-- lei assegnati (effettuati, no-show, da esitare, annullati, riprogrammati).
-- Prima la scheda aveva solo i totali di appuntamenti e chiamate, senza dire chi.
--
-- Più, per calendario: agenda del periodo, esiti, prenotati da soli e quanti
-- appuntamenti sono diventati una vendita.
--
-- marketing_da_fare: le quattro liste su cui agire adesso, al massimo 10 voci
-- ciascuna e il totale: opportunità ferme (regola di get_stalled_opportunities),
-- lead senza nessun contatto da oltre 2 ore, appuntamenti passati senza esito,
-- preventivi inviati senza risposta. Prima la scheda era fissa a 30 giorni e
-- ignorava persona e pipeline scelte nella pagina.
--
-- Stessi controlli di get_marketing_dashboard_stats: permesso della dashboard,
-- «solo i propri», pipeline nascoste. Solo lettura.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.marketing_attivita_team(
  p_company_id uuid,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_assigned_user_ids uuid[] default null
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_da timestamptz := coalesce(p_date_from, now() - interval '30 days');
  v_a timestamptz := coalesce(p_date_to, now());
  v_giorno_da date := (coalesce(p_date_from, now() - interval '30 days') at time zone 'Europe/Rome')::date;
  v_giorno_a date := (coalesce(p_date_to, now()) at time zone 'Europe/Rome')::date;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_risultato jsonb;
begin
  perform public.assert_company_access(p_company_id);
  if not public.puo_vedere_metrica(p_company_id, 'marketing') then
    raise exception 'Non hai il permesso di vedere la dashboard marketing' using errcode = '42501';
  end if;
  if public.solo_assegnati_attivo() then
    p_assigned_user_ids := array[auth.uid()];
  end if;

  with interventi as (
    select a.created_by as chi, a.activity_type as tipo, a.contact_id, a.created_at as quando
      from marketing_contact_activities a
     where a.company_id = p_company_id and a.created_by is not null
       and a.created_at >= v_da and a.created_at <= v_a
       and a.activity_type not in ('contact_created', 'opportunity_created', 'contact_assigned',
                                   'opportunity_assigned', 'opportunity_deleted', 'lead_form_submission')
  ), chiamate as (
    select cl.user_id as chi,
           count(*) as n,
           count(*) filter (where cl.outcome = 'answered') as risposte,
           round(avg(cl.duration_sec) filter (where cl.duration_sec > 0)) as durata_media,
           max(cl.started_at) as ultima,
           count(distinct cl.contact_id) as contatti
      from call_logs cl
     where cl.company_id = p_company_id and cl.started_at >= v_da and cl.started_at <= v_a
     group by cl.user_id
  ), attivita as (
    select i.chi,
           count(*) filter (where i.tipo = 'note_added') as note,
           count(*) filter (where i.tipo in ('message_sent', 'email_sent', 'whatsapp_sent')) as messaggi,
           count(*) filter (where i.tipo = 'stage_changed') as cambi_fase,
           count(*) as interventi,
           max(i.quando) as ultima
      from interventi i
     group by i.chi
  ), toccati as (
    select t.chi, count(distinct t.contact_id) as contatti
      from (select chi, contact_id from interventi
            union all
            select cl.user_id, cl.contact_id from call_logs cl
             where cl.company_id = p_company_id and cl.started_at >= v_da and cl.started_at <= v_a) t
     where t.contact_id is not null
     group by t.chi
  ), fissati as (
    -- appuntamenti FISSATI nel periodo da questa persona (anche per altri)
    select ap.created_by as chi, count(*) as n
      from appointments ap
     where ap.company_id = p_company_id and ap.calendar_id is not null and not coalesce(ap.is_blocked_slot, false)
       and ap.created_at >= v_da and ap.created_at <= v_a and ap.created_by is not null
     group by ap.created_by
  ), esiti as (
    -- appuntamenti del periodo ASSEGNATI a questa persona, per esito
    select ap.assigned_to as chi,
           count(*) filter (where coalesce(ap.status, '') not in ('annullato', 'riprogrammato')) as in_agenda,
           count(*) filter (where coalesce(ap.status, '') in ('presentato', 'da_preventivare', 'preventivo_inviato', 'venduto', 'perso', 'non_qualificato', 'completato')) as effettuati,
           count(*) filter (where ap.status = 'no_show') as no_show,
           count(*) filter (where coalesce(ap.status, 'confermato') = 'confermato' and ap.appointment_date < v_oggi) as da_esitare,
           count(*) filter (where ap.status = 'annullato') as annullati,
           count(*) filter (where ap.status = 'riprogrammato') as riprogrammati
      from appointments ap
     where ap.company_id = p_company_id and ap.calendar_id is not null and not coalesce(ap.is_blocked_slot, false)
       and ap.appointment_date between v_giorno_da and v_giorno_a and ap.assigned_to is not null
     group by ap.assigned_to
  ), calendari as (
    -- per calendario: com'è andata l'agenda del periodo, quanti si sono
    -- prenotati da soli (senza autore: link pubblico, bot) e quanti appuntamenti
    -- sono diventati una vendita (preventivo firmato o opportunità vinta del
    -- contatto, come vendite_appuntamenti)
    select c.id, c.name, c.calendar_type,
           count(*) filter (where coalesce(ap.status, '') not in ('annullato', 'riprogrammato')) as in_agenda,
           count(*) filter (where coalesce(ap.status, '') in ('presentato', 'da_preventivare', 'preventivo_inviato', 'venduto', 'perso', 'non_qualificato', 'completato')) as effettuati,
           count(*) filter (where ap.status = 'no_show') as no_show,
           count(*) filter (where coalesce(ap.status, 'confermato') = 'confermato' and ap.appointment_date < v_oggi) as da_esitare,
           count(*) filter (where ap.created_by is null and coalesce(ap.status, '') not in ('annullato', 'riprogrammato')) as prenotati_da_soli,
           count(*) filter (where coalesce(ap.status, '') not in ('annullato', 'riprogrammato') and ap.contact_id is not null and (
                 exists (select 1 from quotes q where q.company_id = p_company_id and q.contact_id = ap.contact_id
                           and q.deleted_at is null and q.status in ('accettata', 'convertita'))
              or exists (select 1 from marketing_opportunities o where o.company_id = p_company_id and o.contact_id = ap.contact_id
                           and o.deleted_at is null and o.status = 'won'))) as con_vendita
      from appointments ap
      join marketing_calendars c on c.id = ap.calendar_id
     where ap.company_id = p_company_id and not coalesce(ap.is_blocked_slot, false)
       and ap.appointment_date between v_giorno_da and v_giorno_a
       and (p_assigned_user_ids is null or ap.assigned_to = any (p_assigned_user_ids))
     group by c.id, c.name, c.calendar_type
  ), persone as (
    select chi from chiamate union select chi from attivita union select chi from fissati union select chi from esiti
  ), righe as (
    select p.chi as user_id,
           coalesce(nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''), 'Senza nome') as name,
           coalesce(c.n, 0) as chiamate,
           coalesce(c.risposte, 0) as risposte,
           c.durata_media,
           coalesce(a.note, 0) as note,
           coalesce(a.messaggi, 0) as messaggi,
           coalesce(a.cambi_fase, 0) as cambi_fase,
           coalesce(a.interventi, 0) + coalesce(c.n, 0) as interventi,
           coalesce(t.contatti, 0) as contatti,
           coalesce(f.n, 0) as appuntamenti_fissati,
           coalesce(e.in_agenda, 0) as appuntamenti,
           coalesce(e.effettuati, 0) as effettuati,
           coalesce(e.no_show, 0) as no_show,
           coalesce(e.da_esitare, 0) as da_esitare,
           coalesce(e.annullati, 0) as annullati,
           coalesce(e.riprogrammati, 0) as riprogrammati,
           greatest(a.ultima, c.ultima) as ultima_attivita
      from persone p
      join profiles pr on pr.id = p.chi
      left join chiamate c on c.chi = p.chi
      left join attivita a on a.chi = p.chi
      left join toccati t on t.chi = p.chi
      left join fissati f on f.chi = p.chi
      left join esiti e on e.chi = p.chi
     where (p_assigned_user_ids is null or p.chi = any (p_assigned_user_ids))
       -- solo persone dell'azienda (o che ci lavorano): non un super admin di passaggio
       and (pr.company_id = p_company_id
            or exists (select 1 from staff_permissions sp where sp.user_id = p.chi and sp.company_id = p_company_id))
  )
  select jsonb_build_object(
    'persone', coalesce((select jsonb_agg(to_jsonb(r) order by r.interventi desc, r.appuntamenti desc) from righe r), '[]'::jsonb),
    'calendari', coalesce((select jsonb_agg(to_jsonb(c) order by c.in_agenda desc) from calendari c where c.in_agenda + c.no_show > 0), '[]'::jsonb),
    'totale', (select jsonb_build_object(
                 'chiamate', coalesce(sum(chiamate), 0), 'risposte', coalesce(sum(risposte), 0),
                 'note', coalesce(sum(note), 0), 'messaggi', coalesce(sum(messaggi), 0),
                 'cambi_fase', coalesce(sum(cambi_fase), 0), 'interventi', coalesce(sum(interventi), 0),
                 'contatti', coalesce(sum(contatti), 0), 'appuntamenti_fissati', coalesce(sum(appuntamenti_fissati), 0),
                 'appuntamenti', coalesce(sum(appuntamenti), 0), 'effettuati', coalesce(sum(effettuati), 0),
                 'no_show', coalesce(sum(no_show), 0), 'da_esitare', coalesce(sum(da_esitare), 0),
                 'annullati', coalesce(sum(annullati), 0), 'riprogrammati', coalesce(sum(riprogrammati), 0))
               from righe)
  ) into v_risultato;

  return v_risultato;
end;
$function$;

revoke all on function public.marketing_attivita_team(uuid, timestamptz, timestamptz, uuid[]) from public, anon;
grant execute on function public.marketing_attivita_team(uuid, timestamptz, timestamptz, uuid[]) to authenticated, service_role;

create or replace function public.marketing_da_fare(
  p_company_id uuid,
  p_assigned_user_ids uuid[] default null,
  p_pipeline_id uuid default null
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_nascoste uuid[];
  v_risultato jsonb;
begin
  perform public.assert_company_access(p_company_id);
  if not public.puo_vedere_metrica(p_company_id, 'marketing') then
    raise exception 'Non hai il permesso di vedere la dashboard marketing' using errcode = '42501';
  end if;
  if public.solo_assegnati_attivo() then
    p_assigned_user_ids := array[auth.uid()];
  end if;
  v_nascoste := coalesce(public.pipeline_nascoste(), '{}'::uuid[]);

  with ferme as (
    -- la regola di get_stalled_opportunities: nessuna attività, cambio fase o
    -- nota da più giorni della soglia della fase (14 se non c'è)
    select mo.id, mo.name, mo.value, mo.assigned_to, mo.contact_id, s.name as fase,
           floor(extract(epoch from (now() - greatest(
             (select max(mca.created_at) from marketing_contact_activities mca
               where mca.company_id = mo.company_id and mca.contact_id = mo.contact_id),
             mo.last_activity_at, mo.stage_changed_at, mo.created_at))) / 86400)::integer as giorni,
           coalesce(s.stalled_threshold_days, 14) as soglia
      from marketing_opportunities mo
      join marketing_pipeline_stages s on s.id = mo.stage_id
     where mo.company_id = p_company_id and mo.deleted_at is null and mo.status = 'open'
       and not (mo.pipeline_id is not null and mo.pipeline_id = any (v_nascoste))
       and (p_pipeline_id is null or mo.pipeline_id = p_pipeline_id)
       and (p_assigned_user_ids is null or mo.assigned_to = any (p_assigned_user_ids))
  ), ferme_oltre as (
    select * from ferme where giorni >= soglia
  ), lead_fermi as (
    select mc.id, btrim(concat_ws(' ', mc.first_name, mc.last_name)) as nome, mc.source, mc.created_at, mc.assigned_to
      from marketing_contacts mc
     where mc.company_id = p_company_id and mc.deleted_at is null
       and mc.last_activity_at is null
       and mc.created_at < now() - interval '2 hours' and mc.created_at >= now() - interval '30 days'
       and (p_assigned_user_ids is null or mc.assigned_to = any (p_assigned_user_ids))
  ), app_da_esitare as (
    select ap.id, ap.title, ap.appointment_date, ap.assigned_to, ap.contact_id
      from appointments ap
     where ap.company_id = p_company_id and ap.calendar_id is not null and not coalesce(ap.is_blocked_slot, false)
       and coalesce(ap.status, 'confermato') = 'confermato'
       and ap.appointment_date < v_oggi and ap.appointment_date >= v_oggi - 60
       and (p_assigned_user_ids is null or ap.assigned_to = any (p_assigned_user_ids))
  ), prev_attesa as (
    select q.id, q.title, coalesce(q.total - q.vat_amount, q.subtotal, q.total, 0) as imponibile,
           coalesce(q.salesperson_id, q.assigned_to, q.created_by) as venditore, q.contact_id,
           coalesce(q.sent_at, q.updated_at, q.created_at) as inviato_il
      from quotes q
     where q.company_id = p_company_id and q.deleted_at is null and q.status = 'inviata'
       and (p_assigned_user_ids is null or coalesce(q.salesperson_id, q.assigned_to, q.created_by) = any (p_assigned_user_ids))
  ), nomi as (
    -- solo le persone dell'azienda: profiles intera è di tutta la piattaforma
    select id, coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), 'Senza nome') as nome
      from profiles
     where company_id = p_company_id
        or id in (select sp.user_id from staff_permissions sp where sp.company_id = p_company_id)
  )
  select jsonb_build_object(
    'opportunita_ferme', jsonb_build_object(
      'totale', (select count(*) from ferme_oltre),
      'valore', (select coalesce(sum(value), 0) from ferme_oltre),
      'voci', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.name, 'fase', f.fase, 'giorni', f.giorni,
                         'valore', f.value, 'contact_id', f.contact_id, 'commerciale', n.nome) order by f.value desc nulls last, f.giorni desc)
                  from (select * from ferme_oltre order by value desc nulls last, giorni desc limit 10) f
                  left join nomi n on n.id = f.assigned_to), '[]'::jsonb)),
    'lead_da_contattare', jsonb_build_object(
      'totale', (select count(*) from lead_fermi),
      'voci', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'nome', nullif(l.nome, ''), 'fonte', l.source,
                         'arrivato_il', l.created_at, 'commerciale', n.nome) order by l.created_at)
                  from (select * from lead_fermi order by created_at limit 10) l
                  left join nomi n on n.id = l.assigned_to), '[]'::jsonb)),
    'appuntamenti_da_esitare', jsonb_build_object(
      'totale', (select count(*) from app_da_esitare),
      'voci', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'titolo', a.title, 'data', a.appointment_date,
                         'contact_id', a.contact_id, 'commerciale', n.nome) order by a.appointment_date desc)
                  from (select * from app_da_esitare order by appointment_date desc limit 10) a
                  left join nomi n on n.id = a.assigned_to), '[]'::jsonb)),
    'preventivi_in_attesa', jsonb_build_object(
      'totale', (select count(*) from prev_attesa),
      'valore', (select coalesce(sum(imponibile), 0) from prev_attesa),
      'voci', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'titolo', q.title, 'imponibile', q.imponibile,
                         'inviato_il', q.inviato_il, 'contact_id', q.contact_id, 'commerciale', n.nome) order by q.imponibile desc)
                  from (select * from prev_attesa order by imponibile desc limit 10) q
                  left join nomi n on n.id = q.venditore), '[]'::jsonb))
  ) into v_risultato;

  return v_risultato;
end;
$function$;

revoke all on function public.marketing_da_fare(uuid, uuid[], uuid) from public, anon;
grant execute on function public.marketing_da_fare(uuid, uuid[], uuid) to authenticated, service_role;
