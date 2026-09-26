-- Formazione: avanzamenti gonfiati dal Portale riportati ai moduli davvero completati.
--
-- Fino al 26/09/2026 la vista dipendente del Portale (PortalePage) contava i
-- moduli NON fatti con il loro `completed_rate`, che è un dato del corso
-- (quanti lo completano in azienda), non della persona. Completare il primo
-- modulo su tre di «Sicurezza base in cantiere» (completed_rate 82/71/64)
-- salvava (100 + 71 + 64) / 3 = 78% invece di 33%. E siccome
-- savePortalCourseEnrollment non fa mai scendere l'avanzamento, il 78% sarebbe
-- rimasto per sempre.
--
-- Il codice ora usa un'unica regola (src/lib/formazione/avanzamentoCorsi.ts).
-- Qui si correggono le iscrizioni già scritte: SOLO quelle che il Portale ha
-- toccato (esiste un evento `module_completed` della persona), non completate,
-- e solo verso il basso. Il nuovo valore è il massimo tra:
--   - i moduli distinti che il registro `portal_course_activity` dà per
--     completati, sul totale dei moduli del corso nella stessa azienda;
--   - l'avanzamento salvato da «La mia formazione» (eventi module_progress /
--     course_completed, che usavano già la formula giusta).
-- Le iscrizioni il cui corso non esiste nell'azienda (totale 0) restano come
-- sono. Idempotente: una seconda esecuzione non trova più nulla da abbassare.
--
-- Il 26/09/2026 in tutto il database c'erano due iscrizioni: una sola
-- corrisponde (Demo Azienda, sicurezza-base, 78% → 33%, un modulo su tre).

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

with fatti as (
  select
    e.id,
    (select count(*)
       from public.portal_course_modules m
      where m.course_id = e.course_id and m.company_id = e.company_id) as totale,
    (select count(distinct a.metadata->>'moduleId')
       from public.portal_course_activity a
       join public.portal_course_modules m
         on m.id = a.metadata->>'moduleId' and m.course_id = a.course_id and m.company_id = a.company_id
      where a.company_id = e.company_id and a.course_id = e.course_id and a.actor_id = e.user_id
        and a.event_type = 'module_completed') as completati,
    (select max((a.metadata->>'progress')::int)
       from public.portal_course_activity a
      where a.company_id = e.company_id and a.course_id = e.course_id and a.actor_id = e.user_id
        and a.event_type in ('module_progress', 'course_completed')
        and a.metadata ? 'progress') as da_formazione
  from public.portal_course_enrollments e
  where e.status <> 'completato'
    and e.completed_at is null
    and exists (
      select 1 from public.portal_course_activity a
       where a.company_id = e.company_id and a.course_id = e.course_id and a.actor_id = e.user_id
         and a.event_type = 'module_completed'
    )
),
nuovi as (
  select id, greatest(round(100.0 * completati / totale)::int, coalesce(da_formazione, 0)) as avanzamento
    from fatti
   where totale > 0
)
update public.portal_course_enrollments e
   set progress_percent = n.avanzamento,
       status = case when n.avanzamento > 0 then 'in_corso' else 'assegnato' end,
       updated_at = now()
  from nuovi n
 where e.id = n.id
   and e.progress_percent > n.avanzamento;
