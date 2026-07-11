-- Il motore (process-automation) scrive status 'waiting' (wait_for_event),
-- 'removed' (azione remove_from_automation) e 'failed' (fallimento permanente
-- dopo max retry), ma il CHECK ammetteva solo active/paused/completed/canceled:
-- l'UPDATE a 'waiting' falliva in silenzio e "Rimuovi da automazione" falliva
-- SEMPRE (violazione vincolo → retry → dead letter).
ALTER TABLE public.automation_enrollments
  DROP CONSTRAINT IF EXISTS automation_enrollments_status_check;

ALTER TABLE public.automation_enrollments
  ADD CONSTRAINT automation_enrollments_status_check
  CHECK (status = ANY (ARRAY[
    'active'::text, 'paused'::text, 'completed'::text, 'canceled'::text,
    'waiting'::text, 'removed'::text, 'failed'::text
  ]));
