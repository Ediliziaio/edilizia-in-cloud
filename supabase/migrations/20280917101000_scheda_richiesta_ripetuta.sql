-- Scheda opportunità: il contatto ha già fatto richiesta?
--
-- Un lead Meta che compila di nuovo il modulo rientra nello stesso flusso e
-- torna in «Da Chiamare» come fosse nuovo: chi chiama non lo sapeva (BeMade,
-- 15/09; 7 delle 199 schede aperte in «Da Chiamare» erano di contatti già
-- passati). opportunita_schede aggiunge `richiesta_ripetuta`:
--   richieste          quante volte ha compilato di nuovo il modulo
--                      (registro «lead_form_submission»)
--   ultima             quando, l'ultima volta
--   altre_opportunita  altre opportunità dello stesso contatto, non eliminate
-- null quando non c'è niente da segnalare, per non gonfiare ogni scheda.
-- Il resto della funzione è identico a 20280914000014.

CREATE OR REPLACE FUNCTION public.opportunita_schede(p_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
