-- Stesso JSON e RLS invoker: una sola aggregazione delle richieste per scheda.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
DO $migration$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.opportunita_schede(uuid[])'::regprocedure);
 IF strpos(definition,$after$a.richieste, a.ultima,
                         (select count(*) from public.marketing_opportunities o2
                           where o2.contact_id = o.contact_id and o2.id <> o.id and o2.deleted_at is null) as altre
                       from (select count(*) as richieste, max(a.created_at) as ultima
                               from public.marketing_contact_activities a
                              where a.contact_id = o.contact_id and a.activity_type = 'lead_form_submission') a
                       offset 0
                      ) r$after$)>0 THEN RETURN; END IF;
 IF strpos(definition,$before$(select count(*) from public.marketing_contact_activities a
                           where a.contact_id = o.contact_id and a.activity_type = 'lead_form_submission') as richieste,
                         (select max(a.created_at) from public.marketing_contact_activities a
                           where a.contact_id = o.contact_id and a.activity_type = 'lead_form_submission') as ultima,
                         (select count(*) from public.marketing_opportunities o2
                           where o2.contact_id = o.contact_id and o2.id <> o.id and o2.deleted_at is null) as altre
                      ) r$before$)=0 THEN RAISE EXCEPTION 'Definizione schede diversa da quella verificata'; END IF;
 definition:=replace(definition,$before$(select count(*) from public.marketing_contact_activities a
                           where a.contact_id = o.contact_id and a.activity_type = 'lead_form_submission') as richieste,
                         (select max(a.created_at) from public.marketing_contact_activities a
                           where a.contact_id = o.contact_id and a.activity_type = 'lead_form_submission') as ultima,
                         (select count(*) from public.marketing_opportunities o2
                           where o2.contact_id = o.contact_id and o2.id <> o.id and o2.deleted_at is null) as altre
                      ) r$before$,$after$a.richieste, a.ultima,
                         (select count(*) from public.marketing_opportunities o2
                           where o2.contact_id = o.contact_id and o2.id <> o.id and o2.deleted_at is null) as altre
                       from (select count(*) as richieste, max(a.created_at) as ultima
                               from public.marketing_contact_activities a
                              where a.contact_id = o.contact_id and a.activity_type = 'lead_form_submission') a
                       offset 0
                      ) r$after$);
 EXECUTE definition;
END;
$migration$;
