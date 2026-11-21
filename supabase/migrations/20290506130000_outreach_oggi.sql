set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Entrambi i riepiloghi leggono le stesse righe accessibili dalla console.
-- Le attività di Oggi sono una vista del lavoro esistente.
create or replace function public.outreach_oggi(
  p_company uuid, p_filtro text default 'tutte', p_offset integer default 0
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  adesso timestamptz := now();
  oggi date := (adesso at time zone 'Europe/Rome')::date;
  fine_oggi timestamptz := ((oggi + 1)::timestamp at time zone 'Europe/Rome');
begin
  if p_company is distinct from '00000000-0000-0000-0000-000000000001'::uuid or auth.uid() is null
     or not public.is_platform_staff(auth.uid()) or public.utente_bloccato() then
    raise exception 'Accesso alla console marketing negato' using errcode = '42501';
  end if;
  if p_filtro is null or p_filtro not in ('tutte','risposte','chiamate','followup','assegnare')
     or p_offset is null or p_offset < 0 then
    raise exception 'Filtro non valido' using errcode = '22023';
  end if;
  return (
    with email as (
      select distinct on (r.brand_id, coalesce(r.contact_id::text, lower(r.from_email), r.id::text))
        'email'::text tipo, r.id::text id, r.contact_id,
        coalesce(nullif(trim(concat_ws(' ',c.first_name,c.last_name)),''),c.company_name,r.from_email,'Contatto') titolo,
        coalesce(nullif(r.subject,''),'Risposta email') descrizione, r.received_at data,
        c.assigned_to responsabile, false senza_data,
        case when r.intent in ('interested','question') then 0 else 2 end priorita
      from public.outreach_replies r
      left join public.marketing_contacts c on c.id=r.contact_id and c.company_id=p_company and c.deleted_at is null
      where r.company_id=p_company and r.channel='email' and r.status='unread'
        and coalesce(r.intent,'') not in ('auto_reply','bounce','unsubscribe')
      order by r.brand_id,coalesce(r.contact_id::text,lower(r.from_email),r.id::text),r.received_at desc,r.id
    ), whatsapp as (
      select distinct on (m.wa_chat_id)
        'whatsapp'::text tipo, m.wa_chat_id id, c.id contact_id,
        coalesce(nullif(trim(concat_ws(' ',c.first_name,c.last_name)),''),c.company_name,m.contact_name,m.contact_phone,'Contatto') titolo,
        'Risposta WhatsApp'::text descrizione, m.created_at data, c.assigned_to responsabile, false senza_data, 1 priorita
      from public.openwa_messages m
      left join public.marketing_contacts c on c.id=m.contact_id and c.company_id=p_company and c.deleted_at is null
      where m.direction='inbound' and m.read_at is null and nullif(m.wa_chat_id,'') is not null
      order by m.wa_chat_id,m.created_at desc,m.id
    ), chiamate as (
      select 'chiamata'::text tipo, t.id::text id, t.contact_id,
        coalesce(nullif(t.contact_name,''),nullif(t.company_name,''),'Contatto') titolo,
        coalesce(nullif(t.note,''),'Chiamata da fare') descrizione, t.due_at data,
        coalesce(t.assigned_to,c.assigned_to) responsabile, false senza_data,
        case when t.due_at<adesso then 1 else 3 end priorita
      from public.outreach_call_tasks t
      left join public.marketing_contacts c on c.id=t.contact_id and c.company_id=p_company and c.deleted_at is null
      where t.company_id=p_company and t.status='pending' and t.due_at<fine_oggi
    ), trattative as (
      select case when o.next_action_date<=oggi then 'followup' else 'trattativa' end tipo,
        o.id::text id,o.contact_id,o.name titolo,
        coalesce(nullif(o.next_action,''),'Pianifica la prossima azione') descrizione,
        (o.next_action_date::timestamp at time zone 'Europe/Rome') data,
        o.assigned_to responsabile,o.next_action_date is null senza_data,
        case when o.next_action_date<oggi then 1 when o.next_action_date=oggi then 3 else 4 end priorita
      from public.marketing_opportunities o
      where o.company_id=p_company and o.status='open' and o.deleted_at is null
        and (o.next_action_date<=oggi or o.next_action_date is null or o.assigned_to is null)
    ), voci as materialized (
      select * from email union all select * from whatsapp
      union all select * from chiamate union all select * from trattative
    ), filtrate as (
      select v.* from voci v where
        case p_filtro when 'risposte' then v.tipo in ('email','whatsapp')
          when 'chiamate' then v.tipo='chiamata'
          when 'followup' then v.tipo='followup'
          when 'assegnare' then v.responsabile is null or v.senza_data
          else true end
    ), pagina as (
      select f.*,nullif(trim(concat_ws(' ',p.first_name,p.last_name)),'') nome_responsabile
      from filtrate f left join public.profiles p on p.id=f.responsabile
      order by f.priorita,f.data nulls last,f.tipo,f.id limit 10 offset p_offset
    )
    select jsonb_build_object(
      'conteggi',jsonb_build_object(
        'tutte',(select count(*) from voci),
        'risposte',(select count(*) from voci where tipo in ('email','whatsapp')),
        'chiamate',(select count(*) from voci where tipo='chiamata'),
        'followup',(select count(*) from voci where tipo='followup'),
        'assegnare',(select count(*) from voci where responsabile is null or senza_data)),
      'totale',(select count(*) from filtrate),
      'righe',coalesce((select jsonb_agg(to_jsonb(p) order by priorita,data nulls last,tipo,id) from pagina p),'[]')
    )
  );
end
$$;

create or replace function public.outreach_stato_coda(p_company uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  adesso timestamptz := now();
  inizio_oggi timestamptz := (date_trunc('day',adesso at time zone 'Europe/Rome') at time zone 'Europe/Rome');
begin
  if p_company is distinct from '00000000-0000-0000-0000-000000000001'::uuid or auth.uid() is null
     or not public.is_platform_staff(auth.uid()) or public.utente_bloccato() then
    raise exception 'Accesso alla console marketing negato' using errcode = '42501';
  end if;
  return (
    with brand_pronti as materialized (
      select distinct v.brand_id from public.v_outreach_infrastruttura v
      join public.outreach_brands b on b.id=v.brand_id and b.company_id=p_company
      where v.pronta
    ), coda as (
      select q.scheduled_for,s.id sequenza_id,s.name sequenza,b.name brand,
        case
          when s.status='paused' then 'Sequenza in pausa'
          when e.status='paused' then 'Iscrizione in pausa'
          when b.status='paused' then 'Brand in pausa'
          when q.enrollment_id is not null and
               (e.status is distinct from 'active' or s.status is distinct from 'active')
               then 'Sequenza o iscrizione inattiva'
          when coalesce(q.brand_id,s.brand_id) is not null and b.status is distinct from 'active'
               then 'Brand inattivo o mancante'
          when q.channel='email' and b.id is not null and bp.brand_id is null
               then 'Nessuna casella pronta'
          when q.scheduled_for is null then 'Data assente'
        end motivo
      from public.outreach_send_queue q
      left join public.outreach_enrollments e on e.id=q.enrollment_id and e.company_id=p_company
      left join public.outreach_sequences s on s.id=e.sequence_id and s.company_id=p_company
      left join public.outreach_brands b on b.id=coalesce(q.brand_id,s.brand_id) and b.company_id=p_company
      left join brand_pronti bp on bp.brand_id=b.id
      where q.company_id=p_company and q.status='queued' and coalesce(q.kind,'send')='send'
        and q.channel is distinct from 'call'
    ), per_campagna as materialized (
      select sequenza_id, sequenza, brand, motivo,
        count(*) n,
        count(*) filter(where motivo is null and scheduled_for<=adesso) pronti,
        min(scheduled_for) filter(where motivo is null and scheduled_for>adesso) prima_data
      from coda group by sequenza_id,sequenza,brand,motivo
    ), totali as (
      select count(*) filter(where motivo is null and scheduled_for<=adesso) pronti,
        count(*) filter(where motivo is null and scheduled_for>adesso) programmati,
        count(*) filter(where motivo like '%in pausa') in_pausa,
        count(*) filter(where motivo is not null and motivo not like '%in pausa') da_verificare,
        min(scheduled_for) filter(where motivo is null and scheduled_for>adesso) prossimo
      from coda
    )
    select to_jsonb(t) || jsonb_build_object(
      'inviati_oggi',(select count(*) from public.outreach_send_queue
        where company_id=p_company and status='sent' and sent_at>=inizio_oggi
          and coalesce(kind,'send')='send' and channel is distinct from 'call'),
      'falliti_oggi',(select count(*) from public.outreach_send_queue
        where company_id=p_company and status='failed' and updated_at>=inizio_oggi
          and coalesce(kind,'send')='send' and channel is distinct from 'call'),
      'campagne',coalesce((select jsonb_agg(to_jsonb(c) order by n desc, sequenza)
        from per_campagna c),'[]')
    ) from totali t
  );
end
$$;

revoke all on function public.outreach_oggi(uuid,text,integer),public.outreach_stato_coda(uuid) from public,anon,service_role;
grant execute on function public.outreach_oggi(uuid,text,integer),public.outreach_stato_coda(uuid) to authenticated;
notify pgrst,'reload schema';
