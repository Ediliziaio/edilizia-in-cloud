-- Appunti = solo quello che scrivono le persone; il Registro attività = tutto.
--
-- Negli Appunti finivano anche le righe scritte dal sistema («L'automazione …
-- ha ritrovato questa opportunità aperta», «Richiesta recuperata dallo storico
-- di Facebook»). Ora ogni nota dice se è automatica: gli Appunti mostrano solo
-- le manuali, il Registro attività le mostra tutte, con l'origine.
--   · trigger nota_scheda_nel_registro: automatica quando non c'è un utente
--     (auth.uid() nullo = edge function / flusso / import);
--   · le righe già esistenti si marcano per testo, solo quelle senza autore.
-- Il resto di opportunita_schede è identico a 20280924190000 (notes_count conta
-- solo gli appunti manuali).

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.marketing_contact_notes
  add column if not exists automatica boolean not null default false;

comment on column public.marketing_contact_notes.automatica is
  'true = scritta dal sistema (automazioni, import, recupero lead): compare nel Registro attività, non negli Appunti.';

create or replace function public.nota_scheda_nel_registro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_testo text := btrim(new.notes);
begin
  if new.contact_id is null then
    return null;
  end if;

  if not exists (
    select 1
      from public.marketing_contact_notes n
     where n.opportunity_id = new.id
       and btrim(n.content) = v_testo
  ) then
    insert into public.marketing_contact_notes (contact_id, company_id, content, created_by, opportunity_id, automatica)
    values (new.contact_id, new.company_id, v_testo, auth.uid(), new.id, auth.uid() is null);
  end if;

  update public.marketing_opportunities set notes = null where id = new.id;
  return null;
end;
$$;

-- Note già presenti: solo senza autore e con i testi che il sistema scrive.
update public.marketing_contact_notes
   set automatica = true
 where created_by is null
   and not automatica
   and (content ilike 'L''automazione%'
     or content ilike 'Richiesta compilata il %recuperata dallo storico%'
     or content ilike 'Richiesta recuperata dallo storico%'
     or content ilike '--- Lead Ads Import ---%'
     or content ilike 'Follower CRM:%');

create or replace function public.opportunita_schede(p_ids uuid[])
returns jsonb
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(
           to_jsonb(o) || jsonb_build_object(
             'marketing_contacts', (
               select jsonb_build_object(
                        'id', c.id, 'first_name', c.first_name, 'last_name', c.last_name,
                        'email', c.email, 'phone', c.phone, 'city', c.city, 'address', c.address,
                        'province', c.province, 'region', c.region, 'postal_code', c.postal_code,
                        'source', c.source, 'company_name', c.company_name, 'tags', c.tags,
                        'last_activity_at', c.last_activity_at, 'created_at', c.created_at)
                 from public.marketing_contacts c
                where c.id = o.contact_id),
             'assigned_profile', (
               select jsonb_build_object('id', p.id, 'first_name', p.first_name,
                                         'last_name', p.last_name, 'avatar_url', p.avatar_url)
                 from public.profiles p
                where p.id = o.assigned_to),
             'call_center_profile', (
               select jsonb_build_object('id', p.id, 'first_name', p.first_name,
                                         'last_name', p.last_name, 'avatar_url', p.avatar_url)
                 from public.profiles p
                where p.id = o.call_center_id),
             'notes_count', (
               select count(*)
                 from public.marketing_contact_notes n
                where n.opportunity_id = o.id and n.company_id = o.company_id and not n.automatica),
             'documents_count', (
               select count(*)
                 from public.marketing_documents d
                where d.opportunity_id = o.id and d.company_id = o.company_id),
             'next_appointment', (
               select jsonb_build_object('date', a.appointment_date, 'time', a.appointment_time)
                 from public.appointments a
                where a.company_id = o.company_id
                  and a.contact_id = o.contact_id
                  and a.appointment_date >= (now() at time zone 'Europe/Rome')::date
                  and a.status <> 'annullato'
                order by a.appointment_date, a.appointment_time nulls last
                limit 1),
             'agenda', (
               select jsonb_build_object(
                        'appuntamenti', (
                          select count(*)
                            from public.appointments a
                           where a.company_id = o.company_id
                             and a.contact_id = o.contact_id
                             and a.appointment_date >= (now() at time zone 'Europe/Rome')::date
                             and a.status <> 'annullato'),
                        'attivita', count(*),
                        'scadute', count(*) filter (where t.due_date < (now() at time zone 'Europe/Rome')::date))
                 from public.tasks t
                where t.company_id = o.company_id
                  and t.status <> 'completata'
                  and (t.opportunity_id = o.id
                       or (t.opportunity_id is null and t.contact_id = o.contact_id))),
             'richiesta_ripetuta', (
               select case when r.richieste > 0 or r.altre > 0
                           then jsonb_build_object('richieste', r.richieste, 'ultima', r.ultima, 'altre_opportunita', r.altre)
                      end
                 from (select
                         (select count(*) from public.marketing_contact_activities a
                           where a.contact_id = o.contact_id and a.activity_type = 'lead_form_submission') as richieste,
                         (select max(a.created_at) from public.marketing_contact_activities a
                           where a.contact_id = o.contact_id and a.activity_type = 'lead_form_submission') as ultima,
                         (select count(*) from public.marketing_opportunities o2
                           where o2.contact_id = o.contact_id and o2.id <> o.id and o2.deleted_at is null) as altre
                      ) r)
           )
           order by array_position(p_ids, o.id)), '[]'::jsonb)
    from public.marketing_opportunities o
   where o.id = any (p_ids)
$function$;

-- Richiesta ripetuta dal modulo Meta: nel registro ora ci sono anche inserzione,
-- gruppo di inserzioni, piattaforma e data vera di compilazione del modulo
-- (meta-process-leads le mette nel payload dell'evento). Il resto è identico a
-- 20280916980000.
create or replace function public.fb_repeat_lead_reentry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.entity_type = 'contact' and new.entity_id is not null then
    begin
      insert into public.marketing_contact_activities (contact_id, company_id, activity_type, description, metadata, created_at)
      values (
        new.entity_id::uuid, new.company_id, 'lead_form_submission',
        'Ha compilato di nuovo il modulo Meta'
          || coalesce(' — campagna «' || nullif(btrim(new.payload->>'campaign_name'), '') || '»', ''),
        jsonb_build_object('source', 'meta_lead_ads', 'repeat', true,
          'leadgen_id', new.payload->>'leadgen_id',
          'form_id', new.payload->>'form_id',
          'page_id', new.payload->>'page_id',
          'campaign_name', new.payload->>'campaign_name',
          'adset_name', new.payload->>'adset_name',
          'ad_name', new.payload->>'ad_name',
          'platform', new.payload->>'platform',
          'form_created_at', new.payload->>'lead_created_time',
          'arretrato', coalesce((new.payload->>'arretrato')::boolean, false)),
        new.created_at
      );
    exception when others then
      raise log 'fb_repeat_lead_reentry: attività non registrata per %: %', new.entity_id, sqlerrm;
    end;
    begin
      insert into public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload, processed)
      values (new.company_id, 'facebook_lead_received', new.entity_id, 'contact',
        coalesce(new.payload, '{}'::jsonb) || jsonb_build_object('is_new_contact', false, 'repeat_submission', true),
        false);
    exception when others then
      raise log 'fb_repeat_lead_reentry: evento non riemesso per %: %', new.entity_id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.fb_repeat_lead_reentry() from public, anon;
