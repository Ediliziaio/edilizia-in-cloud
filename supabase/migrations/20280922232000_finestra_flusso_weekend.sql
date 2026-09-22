-- Finestra oraria dei flussi: sabato e domenica con una regola propria
-- (22/09/2026).
--
-- Prima la finestra era una sola fascia, uguale per tutti i giorni: il
-- «Flusso Appuntamenti» vuole i messaggi 2, 3 e 4 dal lunedì al venerdì
-- 8:30-19:30, il sabato 9-13 e mai la domenica, e non si poteva dire.
--
--   NULL            come gli altri giorni (il comportamento di prima: nessun
--                   flusso esistente cambia);
--   'chiuso'        nessun invio quel giorno;
--   '09:00-13:00'   una fascia propria.
--
-- La regola la legge process-automation (_shared/finestraFlusso.ts); un valore
-- illeggibile vale «come gli altri giorni».

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.automation_flows
  ADD COLUMN IF NOT EXISTS time_window_sabato text,
  ADD COLUMN IF NOT EXISTS time_window_domenica text;

COMMENT ON COLUMN public.automation_flows.time_window_sabato IS
  'Finestra del sabato: NULL = come gli altri giorni, ''chiuso'', oppure ''HH:MM-HH:MM''.';
COMMENT ON COLUMN public.automation_flows.time_window_domenica IS
  'Finestra della domenica: NULL = come gli altri giorni, ''chiuso'', oppure ''HH:MM-HH:MM''.';
