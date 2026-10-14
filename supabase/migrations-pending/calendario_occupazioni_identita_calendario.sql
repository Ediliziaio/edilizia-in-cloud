-- Applicare dopo il deploy di google-calendar-sync con gcal_busy_batch.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';
DROP INDEX IF EXISTS public.uq_gcal_busy_slots_event;
COMMIT;
