-- Preventivatori dei mestieri: chi ha creato il preventivo, e il massimale nei tetti.
--
-- 1. Nessuna delle otto tabelle *_progetti riceveva created_by: gli insert non
--    lo mandano, la colonna non aveva un valore predefinito e nessun trigger lo
--    scriveva. «Riprendi bozza» cerca le bozze dell'utente (created_by = utente)
--    e quindi non compariva mai, e nell'elenco unificato mancava il
--    commerciale. Le due bozze di ristrutturazione esistenti restano senza
--    autore: non c'è modo di ricostruirlo.
-- 2. tet_progetti non aveva massimale_detrazione, che le altre sette tabelle
--    hanno: nei tetti la detrazione non poteva rispettare il massimale.
--
-- Solo valori predefiniti e una colonna facoltativa: nessuna riga riscritta.

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.rst_progetti ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.bgn_progetti ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.tet_progetti ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.clm_progetti ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.ele_progetti ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.idr_progetti ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.pav_progetti ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.pis_progetti ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE public.tet_progetti ADD COLUMN IF NOT EXISTS massimale_detrazione numeric;
