-- Le attività CRM generiche e la creazione di task non sono contatti riusciti.
create or replace function public.outreach_risultati_coorte(p_company uuid,p_days integer)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  asof timestamptz := now();
  since timestamptz := asof - make_interval(days=>greatest(1,least(coalesce(p_days,30),365)));
begin
  if p_company is distinct from '00000000-0000-0000-0000-000000000001'::uuid or auth.uid() is null
     or not public.is_platform_staff(auth.uid()) or public.utente_bloccato() then
    raise exception 'Accesso alla console marketing negato' using errcode = '42501';
  end if;
  return (
    with lead as materialized (
      select c.id,c.created_at,public.outreach_telefono_csv(c.phone) telefono,
        coalesce(nullif(btrim(c.attr_source),''),nullif(btrim(c.source_channel),''),nullif(btrim(c.source),''),'Sorgente non indicata') sorgente,
        coalesce(nullif(btrim(c.attr_campaign),''),nullif(btrim(c.source_campaign_id),'')) campagna
      from public.marketing_contacts c where c.company_id=p_company and c.deleted_at is null
        and c.created_at between since and asof
    ), touch as (
      select c.id,q.sent_at data,case when q.enrollment_id is not null then 'automatico' else 'manuale' end tipo,
        e.sequence_id sequenza,0 ordine
      from lead c join public.outreach_send_queue q on q.contact_id=c.id and q.company_id=p_company
      left join public.outreach_enrollments e on e.id=q.enrollment_id and e.company_id=p_company
      where q.status='sent' and q.kind='send' and q.channel in ('email','sms','whatsapp') and q.sent_at>=c.created_at
      union all
      select c.id,h.started_at,'manuale',null,0
      from lead c join public.human_call_logs h on h.contact_id=c.id and h.company_id=p_company
      where h.direction='outbound' and h.status='completed' and h.duration_seconds>0 and h.started_at>=c.created_at
      union all
      select c.id,w.created_at,'non_tracciato',null,1
      from lead c join public.openwa_messages w on w.contact_id=c.id
      where w.direction='outbound' and w.status in ('sent','delivered','read') and w.created_at>=c.created_at
      union all
      select c.id,w.created_at,'non_tracciato',null,1
      from lead c join public.whatsapp_messages w on w.contact_id=c.id and w.company_id=p_company
      where w.direction='outbound' and w.delivery_status in ('sent','delivered','read') and w.created_at>=c.created_at
      union all
      select c.id,o.sent_at,'non_tracciato',null,1
      from lead c join public.email_inbox i on i.matched_contact_id=c.id and i.company_id=p_company
      join public.email_outbox o on o.in_reply_to_id=i.id and o.company_id=p_company
      where o.status='sent' and o.sent_at>=c.created_at
      union all
      select c.id,s.sent_at,case s.trigger_type when 'manual' then 'manuale' when 'automation' then 'automatico' else 'non_tracciato' end,null,1
      from public.sms_messages s
      join lead c on c.telefono=public.outreach_telefono_csv(s.to_number)
      where s.company_id=p_company and s.direction='outbound' and s.status in ('sent','delivered')
        and s.sent_at>=c.created_at and s.to_number is not null
        and not exists(select 1 from public.marketing_contacts x where x.company_id=p_company and x.deleted_at is null
          and x.phone is not null and x.id<>c.id and public.outreach_telefono_csv(x.phone)=c.telefono)
    ), primo as (
      select distinct on (id) id,data,tipo,sequenza
      from touch where data<=asof
      order by id,data,ordine,sequenza nulls last,tipo
    ), eventi as materialized (
      select c.*,p.tipo,p.sequenza,
        extract(epoch from p.data-c.created_at) secondi,
        exists(select 1 from public.outreach_replies r
          where r.company_id=p_company and r.contact_id=c.id and r.received_at between p.data and asof
            and coalesce(r.intent,'') not in ('auto_reply','bounce','unsubscribe')) risposta,
        exists(select 1 from public.appointments a
          left join public.marketing_opportunities o on o.id=a.opportunity_id and o.company_id=p_company
          where a.company_id=p_company and coalesce(a.contact_id,o.contact_id)=c.id
            and a.created_at between p.data and asof and a.cancelled_at is null
            and coalesce(a.status,'') not in ('cancelled','no_show')
            and not coalesce(a.is_blocked_slot,false)
            and (a.appointment_type='demo' or lower(btrim(a.title)) ~ '^demo([^a-z0-9]|$)')) demo,
        exists(select 1 from public.marketing_opportunities o
          where o.company_id=p_company and o.contact_id=c.id and o.status='won'
            and o.deleted_at is null and o.won_at between p.data and asof) vinto
      from lead c left join primo p on p.id=c.id
    ), gruppi as (
      select e.sorgente,e.campagna,s.name sequenza,
        count(*) lead,count(e.secondi) contattati,
        count(*) filter(where e.risposta) risposte,count(*) filter(where e.demo) demo,count(*) filter(where e.vinto) vinti
      from eventi e left join public.outreach_sequences s on s.id=e.sequenza and s.company_id=p_company
      group by e.sorgente,e.campagna,s.name
    )
    select jsonb_build_object(
      'totale',count(*),'contattati',count(secondi),
      'mediana_secondi',percentile_cont(0.5) within group(order by secondi),
      'entro_5',count(*) filter(where secondi<=300),
      'entro_ora',count(*) filter(where secondi>300 and secondi<=3600),
      'entro_giorno',count(*) filter(where secondi>3600 and secondi<=86400),
      'oltre',count(*) filter(where secondi>86400),
      'manuali',count(*) filter(where tipo='manuale'),
      'automatici',count(*) filter(where tipo='automatico'),
      'non_tracciati',count(*) filter(where tipo='non_tracciato'),
      'risposte',count(*) filter(where risposta),'demo',count(*) filter(where demo),'vinti',count(*) filter(where vinto),
      'gruppi',coalesce((select jsonb_agg(to_jsonb(g) order by g.lead desc,g.sorgente,g.campagna,g.sequenza) from gruppi g),'[]')
    )
    from eventi
  );
end
$$;

revoke all on function public.outreach_risultati_coorte(uuid,integer) from public,anon,service_role;
grant execute on function public.outreach_risultati_coorte(uuid,integer) to authenticated;
notify pgrst,'reload schema';
