-- Il CHECK su automation_enrollments.entity_type e' ESATTAMENTE il vizio che
-- il codice ricorda a proposito del fix 20271127 ("il CHECK entity_type ha
-- nascosto per mesi il fatto che i trigger operativi non arruolavano MAI"):
-- i nuovi eventi candidati (candidate_created/stage_changed/hired,
-- interview_scheduled) matchavano il flusso ma l'iscrizione moriva sul
-- vincolo, con l'evento marcato processed. Ammessi 'candidato' e 'colloquio'.
ALTER TABLE public.automation_enrollments
  DROP CONSTRAINT IF EXISTS automation_enrollments_entity_type_check;

ALTER TABLE public.automation_enrollments
  ADD CONSTRAINT automation_enrollments_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'contact', 'opportunity', 'appointment', 'order', 'invoice', 'payment',
    'cost', 'quote', 'ticket', 'stock', 'task', 'employee', 'leave_request',
    'company', 'cron', 'manual', 'candidato', 'colloquio'
  ]));
