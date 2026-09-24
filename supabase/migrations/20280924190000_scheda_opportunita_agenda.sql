-- Scheda opportunità: il calendario dice cosa c'è in agenda (24/09/2026).
--
-- Florin: come per gli Appunti, passando col mouse sull'icona del calendario
-- della scheda si vuole vedere la data dell'appuntamento e le attività da fare
-- di quel contatto in quell'opportunità. Il riquadro si carica solo quando si
-- apre; qui si aggiunge il conteggio che accende il numerino sull'icona:
--   · appuntamenti: in programma da oggi (ora di Roma), non annullati — come
--     'next_appointment', per contatto;
--   · attivita: da fare, cioè non «completata», dell'opportunità o del contatto
--     senza un'altra opportunità;
--   · scadute: quelle con la scadenza già passata (il numerino diventa rosso).
--
-- Costo: appointments e tasks sono piccole (531 e 98 righe al 24/09) e hanno
-- gli indici su contatto e opportunità. Il resto della funzione è identico.

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
                where n.opportunity_id = o.id and n.company_id = o.company_id),
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
